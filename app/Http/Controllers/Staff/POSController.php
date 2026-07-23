<?php

namespace App\Http\Controllers\Staff;

use App\Events\IngredientStockUpdated;
use App\Events\OrderSentToKitchen;
use App\Events\TableStatusUpdated;
use App\Events\TableTransferred;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;

class POSController extends Controller
{
    public function index(Request $request)
    {
        $tables = Table::with(['mergedIntoTable', 'activeOrders.items' => function ($query) {
            $query->where('status', '!=', 'cancelled')->with('menuItem');
        }])->where('status', '!=', 'maintenance')->orderBy('area', 'asc')->orderBy('table_number', 'asc')->get();
        $categories = MenuCategory::orderBy('sort_order', 'asc')->get();
        $products = MenuItem::with(['category', 'recipes.ingredient'])->where('is_available', true)->get();

        // Calculate max_servings for each product based on ingredient inventory
        $products->transform(function ($product) {
            if ($product->recipes && $product->recipes->count() > 0) {
                $possibleServings = [];
                foreach ($product->recipes as $recipe) {
                    if ($recipe->ingredient && (float) $recipe->amount > 0) {
                        $stock = (float) $recipe->ingredient->stock_quantity;
                        $possible = (int) floor($stock / (float) $recipe->amount);
                        $possibleServings[] = max(0, $possible);
                    }
                }
                $product->max_servings = count($possibleServings) > 0 ? min($possibleServings) : 999;
            } else {
                $product->max_servings = 999; // Unlimited if no recipe defined
            }

            return $product;
        });

        // Consolidate group orders so every table in a merged group shares the exact same active orders list
        $tables->each(function ($table) use ($tables) {
            if ($table->merged_into_table_id || $tables->contains('merged_into_table_id', $table->id)) {
                $groupId = $table->merged_into_table_id ?? $table->id;
                $allGroupTableIds = $tables->filter(fn ($t) => $t->id == $groupId || $t->merged_into_table_id == $groupId)->pluck('id');
                $allGroupOrders = Order::with(['items' => function ($query) {
                    $query->where('status', '!=', 'cancelled')->with('menuItem');
                }])->whereIn('table_id', $allGroupTableIds)->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->get();
                $table->setRelation('activeOrders', $allGroupOrders);
                $table->setRelation('activeOrder', $allGroupOrders->first());
            }
        });

        return Inertia::render('staff/pos/POSManager', [
            'tables' => $tables,
            'categories' => $categories,
            'products' => $products,
        ]);
    }

    public function sendToKitchen(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'required|exists:tables,id',
            'items' => 'required|array|min:1',
            'items.*.menu_item_id' => 'required|exists:menu_items,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.note' => 'nullable|string|max:255',
            'subtotal' => 'required|numeric|min:0',
            'vat_amount' => 'required|numeric|min:0',
            'total' => 'required|numeric|min:0',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:send_to_kitchen:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                Log::info("Duplicate sendToKitchen request suppressed: {$request->input('idempotency_key')}");

                return back()->with('success', 'Đơn hàng đã được gửi xuống Bếp!');
            }
        }

        try {
            $createdOrder = DB::transaction(function () use ($validated, $request) {
                $table = Table::findOrFail($validated['table_id']);

                // Check if table already has previous orders in this session
                $hasPreviousOrders = Order::where('table_id', $table->id)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->exists();

                // Create a fresh Kitchen Ticket order for the newly added items
                $orderCode = 'ORD-'.strtoupper(Str::random(6));
                $employeeId = DB::table('employees')->where('id', $request->user()->id)->exists() ? $request->user()->id : null;

                $order = Order::create([
                    'order_code' => $orderCode,
                    'table_id' => $table->id,
                    'employee_id' => $employeeId,
                    'subtotal' => $validated['subtotal'],
                    'vat_amount' => $validated['vat_amount'],
                    'total' => $validated['total'],
                    'status' => 'pending',
                    'has_additional_items' => $hasPreviousOrders, // Flag alert for kitchen if table calls for extra items!
                ]);

                // Update table status to occupied
                $table->update(['status' => 'occupied']);

                // Insert new order ticket items
                foreach ($validated['items'] as $item) {
                    OrderItem::create([
                        'order_id' => $order->id,
                        'menu_item_id' => $item['menu_item_id'],
                        'quantity' => $item['quantity'],
                        'unit_price' => $item['unit_price'],
                        'subtotal' => $item['quantity'] * $item['unit_price'],
                        'note' => $item['note'] ?? null,
                    ]);
                }

                return $order;
            });

            $this->safeDispatch(fn () => OrderSentToKitchen::dispatch($createdOrder));

            return back()->with('success', 'Đã gửi đơn order chế biến xuống bếp thành công!');
        } catch (\Throwable $e) {
            Log::error('POS sendToKitchen DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Gửi đơn thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
        }
    }

    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'required|exists:tables,id',
            'payment_method' => 'required|in:cash,bank_transfer',
            'amount_received' => 'required|numeric|min:0',
            'change_amount' => 'required|numeric|min:0',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:checkout:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                Log::info("Duplicate checkout request suppressed: {$request->input('idempotency_key')}");

                return back()->with('success', 'Thanh toán đã được ghi nhận thành công!');
            }
        }

        try {
            $targetTable = DB::transaction(function () use ($validated, $request) {
                $targetTable = Table::findOrFail($validated['table_id']);

                // Determine primary group table ID and all tables in this merged group
                $primaryId = $targetTable->merged_into_table_id ?? $targetTable->id;
                $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
                $allGroupTableIds = $allGroupTables->pluck('id');

                // Find all active orders for all tables in this merged group
                $activeOrders = Order::with('items')->whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->lockForUpdate()
                    ->get();

                if ($activeOrders->isEmpty()) {
                    throw new \Exception('Đơn hàng của bàn này đã được thanh toán bởi nhân viên khác hoặc không còn tồn tại.');
                }

                // Check if any order is still pending/processing in kitchen
                $hasUncompletedOrders = $activeOrders->contains(function ($order) {
                    return in_array($order->status, ['draft', 'pending', 'confirmed', 'processing']);
                });

                if ($hasUncompletedOrders && ! $request->user()->hasPermission('pos.bypass_kitchen_lock')) {
                    throw new \Exception('Bạn không có quyền duyệt khẩn cấp thanh toán khi món chưa được Bếp hoàn tất.');
                }

                // Mark all orders in this group as paid
                foreach ($activeOrders as $order) {
                    $order->update(['status' => 'paid']);
                }

                // Primary order for invoice association
                $primaryOrder = $activeOrders->first();

                // Compute total amount and table name string for invoice record
                $primaryTableObj = $allGroupTables->firstWhere('id', $primaryId);
                $subTableNumbers = $allGroupTables->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
                $tableNameStr = $subTableNumbers ? "{$primaryTableObj->table_number} (Gộp {$subTableNumbers})" : $primaryTableObj->table_number;

                $totalAmount = $activeOrders->sum(function ($order) {
                    return $order->items->sum(function ($item) {
                        return (float) $item->quantity * (float) $item->unit_price;
                    });
                });

                // Create Invoice record
                $invoiceCode = 'INV-'.date('Ymd').strtoupper(Str::random(4));
                Invoice::create([
                    'order_id' => $primaryOrder->id,
                    'invoice_code' => $invoiceCode,
                    'table_name' => $tableNameStr,
                    'total_amount' => $totalAmount,
                    'payment_method' => $validated['payment_method'],
                    'amount_received' => $validated['amount_received'],
                    'change_amount' => $validated['change_amount'],
                    'issued_at' => now(),
                ]);

                // Release all tables in the group to available
                foreach ($allGroupTables as $grpTable) {
                    $grpTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);
                    $this->safeDispatch(fn () => TableStatusUpdated::dispatch($grpTable));
                }

                return $targetTable;
            });

            $this->safeDispatch(fn () => TableStatusUpdated::dispatch($targetTable));
            $this->safeDispatch(fn () => IngredientStockUpdated::dispatch(['source' => 'checkout']));

            return back()->with('success', 'Thanh toán hoàn tất thành công!');
        } catch (\Throwable $e) {
            Log::error('POS checkout DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Thanh toán thất bại: '.$e->getMessage()]);
        }
    }

    public function transferTable(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'target_table_id' => 'required|exists:tables,id|different:source_table_id',
        ]);

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $targetTable = Table::lockForUpdate()->findOrFail($validated['target_table_id']);

                if ($targetTable->status !== 'available' && ! $targetTable->merged_into_table_id) {
                    throw new \Exception('Bàn đích phải ở trạng thái bàn trống.');
                }

                if ($sourceTable->merged_into_table_id) {
                    // Case 1: Source table is a sub-table in a merged group
                    // Target table takes over the merge link to primary table
                    $primaryId = $sourceTable->merged_into_table_id;
                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => $primaryId,
                    ]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                    $primaryTable = Table::find($primaryId);
                    if ($primaryTable) {
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($primaryTable));
                    }
                } elseif (Table::where('merged_into_table_id', $sourceTable->id)->exists()) {
                    // Case 2: Source table is the primary table of a merged group
                    // Move all active orders to target table
                    Order::where('table_id', $sourceTable->id)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                        ->update(['table_id' => $targetTable->id]);

                    // Update all sub-tables to point to target table as their new primary table
                    $subTables = Table::where('merged_into_table_id', $sourceTable->id)->get();
                    foreach ($subTables as $subTable) {
                        $subTable->update(['merged_into_table_id' => $targetTable->id]);
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($subTable));
                    }

                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => null,
                    ]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);
                } else {
                    // Case 3: Standard independent table transfer
                    Order::where('table_id', $sourceTable->id)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                        ->update(['table_id' => $targetTable->id]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => null,
                    ]);
                }

                $this->safeDispatch(function () use ($sourceTable, $targetTable) {
                    TableTransferred::dispatch($sourceTable, $targetTable, 'transfer');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($targetTable);
                });
            });

            return back()->with('success', 'Chuyển bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Chuyển bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function mergeTables(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'target_table_id' => 'required|exists:tables,id|different:source_table_id',
        ]);

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $targetTable = Table::lockForUpdate()->findOrFail($validated['target_table_id']);

                $primaryTargetId = $targetTable->merged_into_table_id ?? $targetTable->id;

                // Move all active orders from source table and any sub-tables of source to primaryTargetId
                $sourceGroupIds = Table::where('id', $sourceTable->id)
                    ->orWhere('merged_into_table_id', $sourceTable->id)
                    ->pluck('id');

                Order::whereIn('table_id', $sourceGroupIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->update(['table_id' => $primaryTargetId]);

                // Mark source table and any former sub-tables as merged into primaryTargetId
                Table::whereIn('id', $sourceGroupIds)->update([
                    'status' => 'occupied',
                    'merged_into_table_id' => $primaryTargetId,
                ]);

                // Ensure primary target table is occupied
                Table::where('id', $primaryTargetId)->update(['status' => 'occupied']);

                $primaryTargetTable = Table::find($primaryTargetId);
                $this->safeDispatch(function () use ($sourceTable, $primaryTargetTable) {
                    TableTransferred::dispatch($sourceTable, $primaryTargetTable, 'merge');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($primaryTargetTable);
                });
            });

            return back()->with('success', 'Gộp bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Gộp bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function unmergeTable(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'keep_table_id' => 'required|exists:tables,id',
        ]);

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $keepTable = Table::lockForUpdate()->findOrFail($validated['keep_table_id']);

                $groupId = $sourceTable->merged_into_table_id ?? $sourceTable->id;
                $allGroupTableIds = Table::where('id', $groupId)
                    ->orWhere('merged_into_table_id', $groupId)
                    ->pluck('id');

                // Move all active orders in group to keep_table_id
                Order::whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->update(['table_id' => $keepTable->id]);

                // Dynamic calculation: set status based on whether keepTable has active uncompleted orders
                $hasActiveOrders = Order::where('table_id', $keepTable->id)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->whereHas('items', function ($query) {
                        $query->where('status', '!=', 'cancelled');
                    })
                    ->exists();

                $keepTableStatus = $hasActiveOrders ? 'occupied' : 'available';

                $keepTable->update([
                    'status' => $keepTableStatus,
                    'merged_into_table_id' => null,
                ]);

                // For all other tables in group: reset merged_into_table_id = null, status = available
                Table::whereIn('id', $allGroupTableIds)
                    ->where('id', '!=', $keepTable->id)
                    ->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                $this->safeDispatch(function () use ($sourceTable, $keepTable) {
                    TableTransferred::dispatch($sourceTable, $keepTable, 'unmerge');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($keepTable);
                });
            });

            return back()->with('success', 'Tách / Hủy gộp bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Tách / Hủy gộp bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function cancelOrder(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'required|exists:tables,id',
            'cancellation_reason' => 'required|string|max:255',
            'note' => 'nullable|string|max:255',
        ]);

        try {
            DB::transaction(function () use ($validated, $request) {
                $table = Table::findOrFail($validated['table_id']);
                $primaryId = $table->merged_into_table_id ?? $table->id;
                $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
                $allGroupTableIds = $allGroupTables->pluck('id');

                $activeOrders = Order::with('items')->whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->lockForUpdate()
                    ->get();

                if ($activeOrders->isEmpty()) {
                    throw new \InvalidArgumentException('Không tìm thấy đơn hàng cần hủy!');
                }

                foreach ($activeOrders as $order) {
                    if ($order->status === 'completed') {
                        throw new \InvalidArgumentException('Đơn hàng đã hoàn thành chế biến, không thể hủy!');
                    }

                    $uncompletedItems = $order->items->filter(fn ($i) => $i->status !== 'completed' && $i->status !== 'cancelled');
                    if ($uncompletedItems->isEmpty() && $order->items->where('status', '!=', 'cancelled')->count() > 0) {
                        throw new \InvalidArgumentException('Tất cả món trong đơn đã hoàn thành chế biến, không thể hủy!');
                    }
                }

                $reasonStr = $validated['cancellation_reason'].($validated['note'] ? ': '.$validated['note'] : '');

                foreach ($activeOrders as $order) {
                    foreach ($order->items as $item) {
                        if ($item->status !== 'completed' && $item->status !== 'cancelled') {
                            $item->update([
                                'status' => 'cancelled',
                                'cancellation_reason' => $reasonStr,
                                'cancelled_by_user_id' => $request->user()->id,
                                'cancelled_at' => now(),
                            ]);
                        }
                    }
                    $order->update(['status' => 'cancelled']);
                }

                // Release all group tables to available
                Table::whereIn('id', $allGroupTableIds)->update([
                    'status' => 'available',
                    'merged_into_table_id' => null,
                ]);
            });

            $this->safeDispatch(function () use ($allGroupTables, $activeOrders) {
                $primaryOrder = $activeOrders->first() ?? Order::first() ?? new Order;
                OrderSentToKitchen::dispatch($primaryOrder);
                foreach ($allGroupTables as $grpTable) {
                    TableStatusUpdated::dispatch($grpTable);
                }
            });

            return back()->with('success', 'Đã hủy toàn bộ đơn hàng thành công!');
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            Log::error('POS cancelOrder DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Hủy đơn hàng thất bại: '.$e->getMessage()]);
        }
    }

    private function safeDispatch(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            Log::warning('Reverb Broadcast skipped due to socket connection issue: '.$e->getMessage());
        }
    }
}

<?php

namespace App\Http\Controllers\Staff;

use App\Events\OrderSentToKitchen;
use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Http\Controllers\Staff\Concerns\GeneratesOrderCode;
use App\Models\Employee;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Promotion;
use App\Models\Table;
use App\Services\IdempotencyGuard;
use App\Services\OrderActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class POSController extends Controller
{
    use DispatchesSafely, GeneratesOrderCode;

    public function index(Request $request)
    {
        $isLocal = app()->environment('local');

        $tables = $this->cachedPayload($isLocal, 'pos_tables', 'pos_tables_list', 1800, fn () => $this->loadTablesPayload());

        $categories = $this->cachedPayload($isLocal, 'pos_products_and_categories', 'pos_categories', 86400, fn () => $this->loadCategoriesPayload());
        $products = $this->cachedPayload($isLocal, 'pos_products_and_categories', 'pos_products', 86400, fn () => $this->loadProductsPayload());

        $promotions = $this->cachedPayload($isLocal, 'pos_promotions', 'pos_promotions_list', 300, fn () => $this->loadPromotionsPayload());

        return Inertia::render('staff/pos/POSManager', [
            'tables' => $tables,
            'categories' => $categories,
            'products' => $products,
            'promotions' => $promotions,
        ]);
    }

    private function loadTablesPayload(): array
    {
        $tables = Table::with(['mergedIntoTable', 'orders' => function ($query) {
            $query->whereIn('status', Order::OPERATIONAL_STATUSES)
                ->with(['items' => function ($q) {
                    $q->where('status', '!=', 'cancelled')->with('menuItem');
                }, 'deposits' => function ($q) {
                    $q->where('status', 'held');
                }]);
        }])->where('status', '!=', 'maintenance')->orderBy('area', 'asc')->orderBy('table_number', 'asc')->get();

        $tables->each(function ($table) use ($tables) {
            if ($table->merged_into_table_id || $tables->contains('merged_into_table_id', $table->id)) {
                $groupId = $table->merged_into_table_id ?? $table->id;
                $allGroupTableIds = $tables->filter(fn ($t) => $t->id == $groupId || $t->merged_into_table_id == $groupId)->pluck('id');
                $allGroupOrders = Order::with(['items' => function ($query) {
                    $query->where('status', '!=', 'cancelled')->with('menuItem');
                }, 'deposits' => function ($q) {
                    $q->where('status', 'held');
                }])->whereIn('table_id', $allGroupTableIds)->whereIn('status', Order::OPERATIONAL_STATUSES)->get();
                $allGroupOrders->each(function ($order) {
                    $order->deposit_total = (float) $order->deposits->sum('amount');
                });
                $table->setRelation('activeOrders', $allGroupOrders);
                $table->setRelation('activeOrder', $allGroupOrders->first());
            } else {
                $table->setRelation('activeOrders', $table->orders);
                $table->activeOrders->each(function ($order) {
                    $order->deposit_total = (float) $order->deposits->sum('amount');
                });
            }
        });

        $result = $tables->values()->toArray();

        // Inject virtual "Mang đi" table with takeaway orders (table_id IS NULL)
        $takeawayOrders = Order::with(['items' => function ($query) {
            $query->where('status', '!=', 'cancelled')->with('menuItem');
        }, 'deposits' => function ($q) {
            $q->where('status', 'held');
        }])->whereNull('table_id')
            ->whereIn('status', Order::OPERATIONAL_STATUSES)
            ->get();
        $takeawayOrders->each(function ($order) {
            $order->deposit_total = (float) $order->deposits->sum('amount');
        });

        array_unshift($result, [
            'id' => 0,
            'table_number' => 'Mang đi',
            'area' => 'Mang đi',
            'capacity' => 0,
            'status' => $takeawayOrders->isNotEmpty() ? 'occupied' : 'available',
            'merged_into_table_id' => null,
            'merged_into_table' => null,
            'reservation_time' => null,
            'reservation_name' => null,
            'reservation_phone' => null,
            'reservation_note' => null,
            'active_orders' => $takeawayOrders->toArray(),
            'active_order' => $takeawayOrders->first()?->toArray(),
        ]);

        return $result;
    }

    private function loadCategoriesPayload(): array
    {
        return MenuCategory::orderBy('sort_order', 'asc')->get()->toArray();
    }

    private function loadProductsPayload(): array
    {
        $prods = MenuItem::with(['category', 'recipes.ingredient'])->where('is_available', true)->get();

        $prods->transform(function (MenuItem $product) {
            if ($product->recipes->count() > 0) {
                $possibleServings = [];
                foreach ($product->recipes as $recipe) {
                    if ((float) $recipe->amount > 0) {
                        $stock = (float) ($recipe->ingredient->stock_quantity ?? 0);
                        $possible = (int) floor($stock / (float) $recipe->amount);
                        $possibleServings[] = max(0, $possible);
                    }
                }
                $product->max_servings = count($possibleServings) > 0 ? min($possibleServings) : 999;
            } else {
                $product->max_servings = 999;
            }

            return $product;
        });

        return $prods->toArray();
    }

    private function loadPromotionsPayload(): array
    {
        return Promotion::with(['conditions', 'actions'])
            ->where('type', 'promotion')
            ->where('status', true)
            ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', now()))
            ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', now()))
            ->get()
            ->toArray();
    }

    private function cachedPayload(bool $isLocal, string $tag, string $key, int $ttl, callable $loader): mixed
    {
        if ($isLocal) {
            return $loader();
        }

        try {
            return Cache::tags([$tag])->remember($key, $ttl, $loader);
        } catch (\Exception $e) {
            Log::error("Redis connection failed in POSController {$key} loading: ".$e->getMessage());

            return $loader();
        }
    }

    public function sendToKitchen(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'nullable|exists:tables,id',
            'order_id' => 'nullable|exists:orders,id',
            'items' => 'nullable|array',
            'items.*.menu_item_id' => ['required_with:items', Rule::exists('menu_items', 'id')->whereNull('deleted_at')],
            'items.*.quantity' => 'required_with:items|integer|min:1',
            'items.*.note' => 'nullable|string|max:255',
            'reduced_items' => 'nullable|array',
            'reduced_items.*.order_item_id' => 'required_with:reduced_items|exists:order_items,id',
            'reduced_items.*.reduce_quantity' => 'required_with:reduced_items|integer|min:1',
            'reduced_items.*.cancellation_reason' => 'required_with:reduced_items|string|max:255',
            'reduced_items.*.note' => 'nullable|string|max:255',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'send_to_kitchen', [
            'order_id' => $validated['order_id'] ?? null,
            'table_id' => $validated['table_id'] ?? null,
            'items_qty' => collect($validated['items'] ?? [])->sum('quantity'),
        ])) {
            Log::info("Duplicate sendToKitchen request suppressed: {$request->input('idempotency_key')}");

            return back()->with('success', 'Đơn hàng đã được gửi xuống Bếp!');
        }

        try {
            $primaryOrder = DB::transaction(function () use ($validated, $request) {
                $table = ! empty($validated['table_id']) ? Table::findOrFail($validated['table_id']) : null;

                $menuPrices = MenuItem::whereIn('id', collect($validated['items'] ?? [])->pluck('menu_item_id'))->pluck('price', 'id');
                $computedSubtotal = collect($validated['items'] ?? [])->sum(
                    fn ($i) => (float) $i['quantity'] * (float) ($menuPrices[$i['menu_item_id']] ?? 0)
                );

                // 1. Handle staged reductions
                if (! empty($validated['reduced_items'])) {
                    foreach ($validated['reduced_items'] as $red) {
                        $orderItem = OrderItem::lockForUpdate()->find($red['order_item_id']);
                        if (! $orderItem || $orderItem->status === 'completed' || in_array($orderItem->order->status, ['paid', 'cancelled', 'completed'], true)) {
                            continue;
                        }

                        $reduceQty = min($orderItem->quantity, (int) $red['reduce_quantity']);
                        $newQty = $orderItem->quantity - $reduceQty;
                        $reasonStr = $red['cancellation_reason'].(! empty($red['note']) ? ': '.$red['note'] : '');

                        if ($newQty <= 0) {
                            $orderItem->update([
                                'quantity' => 0,
                                'subtotal' => 0,
                                'status' => 'cancelled',
                                'cancellation_reason' => $reasonStr,
                                'cancelled_by_user_id' => $request->user()?->id,
                                'cancelled_at' => now(),
                            ]);
                        } else {
                            $orderItem->update([
                                'quantity' => $newQty,
                                'subtotal' => $newQty * $orderItem->unit_price,
                                'note' => ($orderItem->note ? $orderItem->note.' | ' : '')."[Giảm {$reduceQty} phần: {$reasonStr}]",
                            ]);
                        }

                        $parentOrder = $orderItem->order;
                        // ponytail: subtotal/vat/total giữ snapshot ban đầu khi pending — preview JIT từ order_items (OrderTotals::preview)
                        if ($parentOrder->items()->where('status', '!=', 'cancelled')->count() === 0) {
                            $parentOrder->update(['status' => 'cancelled']);
                        }

                        // Audit log: item_cancel
                        OrderActivityLogger::log($parentOrder, 'item_cancel', $request->user()?->id, [
                            'items' => [[
                                'name' => $orderItem->menuItem->name ?? 'Món',
                                'qty_reduced' => $reduceQty,
                                'reason' => $reasonStr,
                            ]],
                        ]);
                    }
                }

                // 2. Handle new items ticket creation
                $createdOrder = null;
                $wasDraft = false;
                if (! empty($validated['items'])) {
                    if (! empty($validated['order_id'])) {
                        $createdOrder = Order::lockForUpdate()->findOrFail($validated['order_id']);
                        if (in_array($createdOrder->status, ['paid', 'cancelled'], true)) {
                            throw new \Exception('Đơn đã thanh toán hoặc đã hủy, không thể gửi bếp.', 422);
                        }
                        $wasDraft = $createdOrder->status === 'draft';

                        if ($wasDraft) {
                            $createdOrder->items()->delete();
                            $createdOrder->update([
                                'subtotal' => $computedSubtotal,
                                'vat_amount' => 0,
                                'total' => $computedSubtotal,
                                'status' => 'pending',
                            ]);
                        } else {
                            $createdOrder->update([
                                'subtotal' => $createdOrder->subtotal + $computedSubtotal,
                                'vat_amount' => $createdOrder->vat_amount,
                                'total' => $createdOrder->subtotal + $computedSubtotal,
                                'status' => 'pending',
                                'has_additional_items' => true,
                            ]);
                        }
                    } else {
                        $hasPreviousOrders = $table
                            ? Order::where('table_id', $table->id)
                                ->whereIn('status', Order::ACTIVE_STATUSES)
                                ->exists()
                            : false;

                        $orderCode = $this->generateOrderCode($table);
                        $employeeId = Employee::idForUser($request->user()?->id);

                        $createdOrder = Order::create([
                            'order_code' => $orderCode,
                            'table_id' => $table?->id,
                            'employee_id' => $employeeId,
                            'subtotal' => $computedSubtotal,
                            'vat_amount' => 0,
                            'total' => $computedSubtotal,
                            'status' => 'pending',
                            'has_additional_items' => $hasPreviousOrders,
                        ]);
                    }

                    if ($table) {
                        $table->update(['status' => 'occupied']);
                    }

                    foreach ($validated['items'] as $item) {
                        OrderItem::create([
                            'order_id' => $createdOrder->id,
                            'menu_item_id' => $item['menu_item_id'],
                            'quantity' => $item['quantity'],
                            'unit_price' => $menuPrices[$item['menu_item_id']] ?? 0,
                            'subtotal' => $item['quantity'] * ($menuPrices[$item['menu_item_id']] ?? 0),
                            'note' => $item['note'] ?? null,
                        ]);
                    }

                    // Audit log
                    $userId = $request->user()?->id;
                    $itemMeta = collect($validated['items'])->map(fn ($i) => [
                        'name' => MenuItem::find($i['menu_item_id'])->name ?? 'Món',
                        'qty' => $i['quantity'],
                        'price' => $menuPrices[$i['menu_item_id']] ?? 0,
                    ])->toArray();

                    if (empty($validated['order_id']) || $wasDraft) {
                        if (empty($validated['order_id'])) {
                            OrderActivityLogger::log($createdOrder, 'created', $userId, [
                                'items' => $itemMeta,
                                'total' => $computedSubtotal,
                                'item_count' => count($validated['items']),
                            ]);
                        }
                        OrderActivityLogger::log($createdOrder, 'sent_kitchen', $userId, [
                            'items' => collect($validated['items'])->map(fn ($i) => ['name' => MenuItem::find($i['menu_item_id'])->name ?? 'Món', 'qty' => $i['quantity']])->toArray(),
                            'is_additional' => false,
                        ]);
                    } else {
                        OrderActivityLogger::log($createdOrder, 'additional', $userId, [
                            'items' => $itemMeta,
                            'total_added' => $computedSubtotal,
                        ]);
                    }
                }

                return $createdOrder ?? ($table ? Order::where('table_id', $table->id)->latest()->first() : null) ?? new Order;
            });

            $this->safeDispatch(fn () => OrderSentToKitchen::dispatch($primaryOrder));

            return back()->with('success', 'Đã cập nhật đơn order và gửi xuống bếp chế biến thành công!');
        } catch (\Throwable $e) {
            Log::error('POS sendToKitchen DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Gửi đơn thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
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
            $table = Table::findOrFail($validated['table_id']);
            $primaryId = $table->merged_into_table_id ?? $table->id;
            $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();

            $activeOrders = DB::transaction(function () use ($validated, $request, $allGroupTables) {
                $allGroupTableIds = $allGroupTables->pluck('id');

                $orders = Order::with('items')->whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', Order::ACTIVE_STATUSES)
                    ->lockForUpdate()
                    ->get();

                if ($orders->isEmpty()) {
                    throw new \InvalidArgumentException('Không tìm thấy đơn hàng cần hủy!');
                }

                $reasonStr = $validated['cancellation_reason'].(! empty($validated['note']) ? ': '.$validated['note'] : '');

                foreach ($orders as $order) {
                    foreach ($order->items as $item) {
                        OrderItem::where('id', $item->id)
                            ->where('status', '<>', 'cancelled')
                            ->update([
                                'status' => 'cancelled',
                                'cancellation_reason' => $reasonStr,
                                'cancelled_by_user_id' => $request->user()->id,
                                'cancelled_at' => now(),
                            ]);
                    }
                    $order->update(['status' => 'cancelled']);

                    // Audit log: order_cancelled
                    OrderActivityLogger::log($order, 'order_cancelled', $request->user()?->id, [
                        'reason' => $reasonStr,
                        'item_count' => $order->items->count(),
                    ]);
                }

                // Release all group tables to available
                Table::whereIn('id', $allGroupTableIds)->update([
                    'status' => 'available',
                    'merged_into_table_id' => null,
                ]);

                return $orders;
            });

            $this->safeDispatch(function () use ($allGroupTables, $activeOrders, $validated) {
                $primaryOrder = $activeOrders->first() ?? Order::first() ?? new Order;
                $cancelMsg = 'Hủy toàn bộ đơn hàng (Lý do: '.$validated['cancellation_reason'].')';
                OrderSentToKitchen::dispatch($primaryOrder, 'cancel_order', $cancelMsg);
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
}

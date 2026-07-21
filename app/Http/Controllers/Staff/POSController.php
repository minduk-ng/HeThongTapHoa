<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductRecipe;
use App\Models\Table;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class POSController extends Controller
{
    public function index(Request $request)
    {
        $tables = Table::with(['activeOrders.items.menuItem'])->orderBy('area', 'asc')->orderBy('table_number', 'asc')->get();
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
        ]);

        DB::transaction(function () use ($validated, $request) {
            $table = Table::findOrFail($validated['table_id']);

            // Check if table already has previous orders in this session
            $hasPreviousOrders = Order::where('table_id', $table->id)
                ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                ->exists();

            // Create a fresh Kitchen Ticket order for the newly added items
            $orderCode = 'ORD-' . strtoupper(\Illuminate\Support\Str::random(6));
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
        });

        return back()->with('success', 'Đã gửi đơn order chế biến xuống bếp thành công!');
    }

    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'required|exists:tables,id',
            'payment_method' => 'required|in:cash,bank_transfer',
            'amount_received' => 'required|numeric|min:0',
            'change_amount' => 'required|numeric|min:0',
        ]);

        DB::transaction(function () use ($validated) {
            $table = Table::findOrFail($validated['table_id']);

            // Find all active orders for this table session
            $activeOrders = Order::where('table_id', $table->id)
                ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                ->get();

            if ($activeOrders->isEmpty()) {
                throw new \Exception('Không tìm thấy đơn hàng đang hoạt động của bàn này.');
            }

            // Mark all orders in this session as paid
            foreach ($activeOrders as $order) {
                $order->update(['status' => 'paid']);
            }

            // Primary order for invoice association
            $primaryOrder = $activeOrders->first();

            // Create Invoice record
            $invoiceCode = 'INV-' . date('Ymd') . strtoupper(\Illuminate\Support\Str::random(4));
            Invoice::create([
                'order_id' => $primaryOrder->id,
                'invoice_code' => $invoiceCode,
                'payment_method' => $validated['payment_method'],
                'amount_received' => $validated['amount_received'],
                'change_amount' => $validated['change_amount'],
                'issued_at' => now(),
            ]);

            // Release table to available
            $table->update(['status' => 'available']);
        });

        return back()->with('success', 'Thanh toán hoàn tất thành công!');
    }
}

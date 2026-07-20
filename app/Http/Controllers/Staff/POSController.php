<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class POSController extends Controller
{
    public function index(Request $request)
    {
        $tables = Table::with(['activeOrder.items.menuItem'])->orderBy('area', 'asc')->orderBy('table_number', 'asc')->get();
        $categories = MenuCategory::orderBy('sort_order', 'asc')->get();
        $products = MenuItem::with('category')->where('is_available', true)->get();

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

            // Find existing active order or create new order
            $order = Order::where('table_id', $table->id)
                ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing'])
                ->first();

            $isAdditional = false;

            if ($order) {
                $isAdditional = true;
                $order->update([
                    'subtotal' => $validated['subtotal'],
                    'vat_amount' => $validated['vat_amount'],
                    'total' => $validated['total'],
                    'status' => 'pending',
                    'has_additional_items' => true, // Flag alert for kitchen!
                ]);

                // Delete old items and insert updated items list
                OrderItem::where('order_id', $order->id)->delete();
            } else {
                $orderCode = 'ORD-' . strtoupper(\Illuminate\Support\Str::random(6));
                $order = Order::create([
                    'order_code' => $orderCode,
                    'table_id' => $table->id,
                    'employee_id' => $request->user()->id,
                    'subtotal' => $validated['subtotal'],
                    'vat_amount' => $validated['vat_amount'],
                    'total' => $validated['total'],
                    'status' => 'pending',
                    'has_additional_items' => false,
                ]);
            }

            // Update table status to occupied
            $table->update(['status' => 'occupied']);

            // Insert order items
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

        return back()->with('success', 'Đã gửi order xuống bếp chế biến thành công!');
    }
}

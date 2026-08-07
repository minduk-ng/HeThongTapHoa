<?php

use App\Models\Order;
use App\Models\Promotion;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $orders = Order::with(['items.menuItem'])
            ->where('status', 'paid')
            ->where('discount_amount', '>', 0)
            ->get();

        foreach ($orders as $order) {
            $promotion = $order->promotion_id
                ? Promotion::find($order->promotion_id)
                : null;

            if (! $promotion) {
                $promotion = new Promotion([
                    'target_type' => 'order',
                    'target_value' => null,
                ]);
            }

            $activeItems = $order->items->where('status', '!=', 'cancelled');
            $lines = $activeItems->map(fn ($item) => [
                'order_item_id' => (int) $item->id,
                'menu_item_id' => (int) $item->menu_item_id,
                'subtotal' => (float) $item->subtotal,
                'category_id' => $item->menuItem?->category_id,
            ])->values();

            $alloc = Promotion::allocateLineDiscounts(
                $promotion,
                $lines,
                (float) $order->discount_amount,
            );

            foreach ($alloc as $orderItemId => $discount) {
                DB::table('order_items')
                    ->where('id', $orderItemId)
                    ->update(['discount_amount' => $discount]);
            }
        }
    }

    public function down(): void
    {
        // Không rollback dữ liệu — để trống.
    }
};

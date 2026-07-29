<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderActivity;

class OrderActivityLogger
{
    public static function log(Order $order, string $action, ?int $userId = null, array $meta = []): void
    {
        OrderActivity::create([
            'order_id' => $order->id,
            'action' => $action,
            'user_id' => $userId,
            'meta' => $meta ?: null,
        ]);
    }
}

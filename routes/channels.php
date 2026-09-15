<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('kitchen-channel', function ($user) {
    return $user !== null;
});

Broadcast::channel('pos-channel', function ($user) {
    return $user !== null;
});

Broadcast::channel('pos-room', function ($user) {
    if ($user === null) {
        return false;
    }

    return [
        'id' => $user->id,
        'name' => $user->name ?? 'Nhân viên',
    ];
});

Broadcast::channel('inventory-channel', function ($user) {
    return $user !== null;
});

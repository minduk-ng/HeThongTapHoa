<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('kitchen-channel', function ($user) {
    return $user !== null && $user->hasPermission('kitchen.view');
});

Broadcast::channel('pos-channel', function ($user) {
    return $user !== null && $user->hasPermission('pos.view');
});

Broadcast::channel('pos-room', function ($user) {
    if ($user === null) {
        return false;
    }

    if (! $user->hasPermission('pos.view') && ! $user->hasPermission('pos.create')) {
        return false;
    }

    return [
        'id' => $user->id,
        'name' => $user->name ?? 'Nhân viên',
    ];
});

Broadcast::channel('inventory-channel', function ($user) {
    return $user !== null
        && ($user->hasPermission('ingredients.view') || $user->hasPermission('inventory.history.view'));
});

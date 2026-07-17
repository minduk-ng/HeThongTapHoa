<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Support\Facades\Cache;

class RolePermission extends Pivot
{
    protected static function booted()
    {
        static::saved(function ($pivot) {
            $userIds = \DB::table('user_roles')->where('role_id', $pivot->role_id)->pluck('user_id');
            foreach ($userIds as $id) {
                Cache::forget("user_permissions:{$id}");
            }
        });

        static::deleted(function ($pivot) {
            $userIds = \DB::table('user_roles')->where('role_id', $pivot->role_id)->pluck('user_id');
            foreach ($userIds as $id) {
                Cache::forget("user_permissions:{$id}");
            }
        });
    }
}

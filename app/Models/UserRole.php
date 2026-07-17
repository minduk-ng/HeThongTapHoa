<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Support\Facades\Cache;

class UserRole extends Pivot
{
    protected static function booted()
    {
        static::saved(function ($pivot) {
            Cache::forget("user_permissions:{$pivot->user_id}");
        });

        static::deleted(function ($pivot) {
            Cache::forget("user_permissions:{$pivot->user_id}");
        });
    }
}

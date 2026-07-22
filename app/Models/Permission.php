<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Cache;

class Permission extends Model
{
    protected static function booted()
    {
        static::updated(function ($permission) {
            $userIds = User::pluck('id');
            foreach ($userIds as $id) {
                Cache::forget("user_permissions:{$id}");
            }
        });

        static::deleted(function ($permission) {
            $userIds = User::pluck('id');
            foreach ($userIds as $id) {
                Cache::forget("user_permissions:{$id}");
            }
        });
    }

    protected $fillable = [
        'name',
        'description',
    ];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_permissions');
    }
}

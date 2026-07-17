<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Permission extends Model
{
    protected static function booted()
    {
        static::updated(function ($permission) {
            $userIds = \App\Models\User::pluck('id');
            foreach ($userIds as $id) {
                \Illuminate\Support\Facades\Cache::forget("user_permissions:{$id}");
            }
        });

        static::deleted(function ($permission) {
            $userIds = \App\Models\User::pluck('id');
            foreach ($userIds as $id) {
                \Illuminate\Support\Facades\Cache::forget("user_permissions:{$id}");
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

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Cache;

/**
 * @property int $id
 * @property string $name
 * @property string|null $description
 * @property bool $is_system
 * @property-read Collection<int, Permission> $permissions
 * @property-read Collection<int, Page> $pages
 * @property-read Collection<int, User> $users
 */
class Role extends Model
{
    protected $fillable = [
        'name',
        'description',
        'is_system',
    ];

    protected $casts = [
        'is_system' => 'boolean',
    ];

    protected static function booted()
    {
        static::updated(function ($role) {
            $userIds = \DB::table('user_roles')->where('role_id', $role->id)->pluck('user_id');
            foreach ($userIds as $id) {
                Cache::forget("user_permissions:{$id}");
            }
        });

        static::deleted(function ($role) {
            $userIds = \DB::table('user_roles')->where('role_id', $role->id)->pluck('user_id');
            foreach ($userIds as $id) {
                Cache::forget("user_permissions:{$id}");
            }
        });
    }

    /** @return BelongsToMany<Permission, $this, RolePermission> */
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions')->using(RolePermission::class);
    }

    /** @return BelongsToMany<Page, $this> */
    public function pages(): BelongsToMany
    {
        return $this->belongsToMany(Page::class, 'role_pages');
    }

    /** @return BelongsToMany<User, $this, UserRole> */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_roles')->using(UserRole::class);
    }
}

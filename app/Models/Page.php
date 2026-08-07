<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * @property int $id
 * @property string $name
 * @property string $route_path
 * @property string $group_name
 * @property int $sort_order
 * @property int $user_count
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Role> $roles
 */
class Page extends Model
{
    protected $fillable = [
        'name',
        'route_path',
        'group_name',
        'sort_order',
    ];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_pages');
    }
}

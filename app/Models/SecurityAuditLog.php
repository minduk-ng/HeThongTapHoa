<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int|null $actor_id
 * @property string $action
 * @property string|null $target_type
 * @property int|null $target_id
 * @property array<string, mixed>|null $before
 * @property array<string, mixed>|null $after
 * @property string|null $ip
 * @property string|null $user_agent
 * @property Carbon|null $created_at
 */
class SecurityAuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'actor_id', 'action', 'target_type', 'target_id',
        'before', 'after', 'ip', 'user_agent', 'created_at',
    ];

    protected $casts = [
        'before' => 'array',
        'after' => 'array',
        'created_at' => 'datetime',
    ];

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function getAuditableTypeAttribute(): ?string
    {
        return $this->target_type;
    }

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    public static function record(
        ?User $actor,
        string $action,
        Model|string|null $target = null,
        ?array $before = null,
        ?array $after = null,
        ?string $ip = null,
        ?string $userAgent = null,
    ): self {
        $targetType = $target instanceof Model ? $target::class : (is_string($target) ? $target : null);
        $targetId = $target instanceof Model ? $target->getKey() : null;

        return static::create([
            'actor_id' => $actor?->id,
            'action' => $action,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'before' => $before,
            'after' => $after,
            'ip' => $ip,
            'user_agent' => $userAgent,
        ]);
    }
}

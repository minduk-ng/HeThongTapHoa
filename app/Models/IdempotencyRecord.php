<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IdempotencyRecord extends Model
{
    protected $fillable = [
        'action',
        'idempotency_key',
        'user_id',
        'resource_fingerprint',
        'resource_type',
        'resource_id',
        'status',
        'response_code',
        'response_body',
    ];

    protected $casts = [
        'response_code' => 'integer',
        'resource_id' => 'integer',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

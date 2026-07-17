<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $email
 * @property string $code
 * @property string $type
 * @property Carbon $expires_at
 * @property Carbon|null $created_at
 */
class OtpCode extends Model
{
    public $timestamps = false;

    protected $fillable = ['email', 'code', 'type', 'expires_at'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (OtpCode $otp) {
            $otp->created_at = now();
        });
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}

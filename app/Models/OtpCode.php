<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $email
 * @property string $code
 * @property string $type
 * @property CarbonInterface $expires_at
 * @property CarbonInterface|null $created_at
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

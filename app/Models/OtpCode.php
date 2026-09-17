<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * @property int $id
 * @property string $email
 * @property string $code
 * @property string $type
 * @property int $attempts
 * @property CarbonInterface $expires_at
 * @property CarbonInterface|null $locked_at
 * @property CarbonInterface|null $created_at
 */
class OtpCode extends Model
{
    public const MAX_ATTEMPTS = 5;

    public $timestamps = false;

    protected $fillable = ['email', 'code', 'type', 'expires_at', 'attempts', 'locked_at'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'locked_at' => 'datetime',
            'created_at' => 'datetime',
            'attempts' => 'integer',
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

    public function isLocked(): bool
    {
        return $this->locked_at !== null;
    }

    /** Legacy plaintext rows verify too, so pre-hash DB rows keep working. */
    public function matchesCode(string $plain): bool
    {
        // ponytail: Hash::check() throws on non-hashes, so detect first.
        if (! Hash::isHashed($this->code)) {
            return hash_equals($this->code, $plain);
        }

        return Hash::check($plain, $this->code);
    }

    /** Issue a fresh hashed code, replacing only the same-purpose OTP. Returns plaintext for mailing. */
    public static function issue(string $email, string $type, int $ttlMinutes = 10): string
    {
        static::where('email', $email)->where('type', $type)->delete();

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        static::create([
            'email' => $email,
            'code' => Hash::make($code),
            'type' => $type,
            'expires_at' => now()->addMinutes($ttlMinutes),
            'attempts' => 0,
        ]);

        return $code;
    }

    /**
     * Check a code under a row lock; wrong attempts 1-4 keep it usable, 5th locks it.
     * Locked/expired/wrong all return null so callers emit one generic response.
     * Success does not delete; the caller deletes (inside its own transaction when needed).
     */
    public static function attemptVerify(string $email, string $type, string $plain): ?self
    {
        return DB::transaction(function () use ($email, $type, $plain): ?self {
            $otp = static::where('email', $email)->where('type', $type)
                ->orderByDesc('id')->lockForUpdate()->first();

            if (! $otp || $otp->isLocked() || $otp->isExpired()) {
                return null;
            }

            if (! $otp->matchesCode($plain)) {
                $attempts = $otp->attempts + 1;
                $otp->update([
                    'attempts' => $attempts,
                    'locked_at' => $attempts >= self::MAX_ATTEMPTS ? now() : $otp->locked_at,
                ]);

                return null;
            }

            return $otp;
        });
    }
}

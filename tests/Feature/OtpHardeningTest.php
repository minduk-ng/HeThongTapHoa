<?php

use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;

function otpHardeningUser(string $email): User
{
    return User::create([
        'name' => 'OTP Hardening User',
        'email' => $email,
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);
}

function lastMailedOtpCode(): ?string
{
    $code = null;
    Mail::assertQueued(OtpMail::class, function ($mail) use (&$code) {
        $code = $mail->otpCode;

        return true;
    });

    return $code;
}

function wrongOtpCode(string $real): string
{
    return $real === '000000' ? '000001' : '000000';
}

test('otp wrong attempts 1-4 keep code usable', function () {
    Mail::fake();
    $user = otpHardeningUser('otp_attempts_'.uniqid().'@example.com');

    $this->post('/forgot-password', ['email' => $user->email])->assertRedirect('/verify-otp');
    $code = lastMailedOtpCode();
    $wrong = wrongOtpCode($code);

    for ($i = 0; $i < 4; $i++) {
        $this->post('/verify-otp', ['code' => $wrong])->assertSessionHasErrors(['code']);
    }

    $this->post('/verify-otp', ['code' => $code])->assertRedirect('/reset-password');
});

test('otp fifth wrong attempt locks code and correct code then fails generic', function () {
    Mail::fake();
    $user = otpHardeningUser('otp_lock_'.uniqid().'@example.com');

    $this->post('/forgot-password', ['email' => $user->email])->assertRedirect('/verify-otp');
    $code = lastMailedOtpCode();
    $wrong = wrongOtpCode($code);

    for ($i = 0; $i < 5; $i++) {
        $this->post('/verify-otp', ['code' => $wrong])->assertSessionHasErrors(['code']);
    }

    $otp = OtpCode::where('email', $user->email)->where('type', 'reset_password')->first();
    expect($otp)->not->toBeNull()
        ->and((int) $otp->attempts)->toBe(5)
        ->and($otp->locked_at)->not->toBeNull();

    // Correct code after lockout still fails, row survives for resend rotation.
    $this->post('/verify-otp', ['code' => $code])->assertSessionHasErrors(['code']);
    expect(OtpCode::where('email', $user->email)->where('type', 'reset_password')->exists())->toBeTrue();
});

test('otp locked and expired share one generic response', function () {
    Mail::fake();
    $lockedUser = otpHardeningUser('otp_locked_'.uniqid().'@example.com');

    $this->post('/forgot-password', ['email' => $lockedUser->email])->assertRedirect('/verify-otp');
    $lockedCode = lastMailedOtpCode();
    $wrong = wrongOtpCode($lockedCode);
    for ($i = 0; $i < 5; $i++) {
        $this->post('/verify-otp', ['code' => $wrong]);
    }
    $this->post('/verify-otp', ['code' => $lockedCode])->assertSessionHasErrors(['code']);
    $lockedMessage = session('errors')->get('code')[0];

    $expiredUser = otpHardeningUser('otp_expired_'.uniqid().'@example.com');
    OtpCode::create([
        'email' => $expiredUser->email,
        'code' => '123456',
        'type' => 'reset_password',
        'expires_at' => now()->subMinute(),
    ]);
    session(['otp_email' => $expiredUser->email, 'otp_type' => 'reset_password']);
    $this->post('/verify-otp', ['code' => '123456'])->assertSessionHasErrors(['code']);
    $expiredMessage = session('errors')->get('code')[0];

    expect($lockedMessage)->toBe($expiredMessage);
});

test('forgot password does not delete other purpose otps', function () {
    Mail::fake();
    $user = otpHardeningUser('otp_purpose_'.uniqid().'@example.com');
    OtpCode::create([
        'email' => $user->email, 'code' => '111111', 'type' => 'change_email', 'expires_at' => now()->addMinutes(10),
    ]);
    OtpCode::create([
        'email' => $user->email, 'code' => '222222', 'type' => 'change_password', 'expires_at' => now()->addMinutes(10),
    ]);

    $this->post('/forgot-password', ['email' => $user->email])->assertRedirect('/verify-otp');

    expect(OtpCode::where('email', $user->email)->where('type', 'change_email')->exists())->toBeTrue()
        ->and(OtpCode::where('email', $user->email)->where('type', 'change_password')->exists())->toBeTrue()
        ->and(OtpCode::where('email', $user->email)->where('type', 'reset_password')->exists())->toBeTrue();
});

test('new otp codes are stored hashed and still verify', function () {
    Mail::fake();
    $user = otpHardeningUser('otp_hash_'.uniqid().'@example.com');

    $this->post('/forgot-password', ['email' => $user->email])->assertRedirect('/verify-otp');
    $code = lastMailedOtpCode();

    $otp = OtpCode::where('email', $user->email)->where('type', 'reset_password')->first();
    expect($otp)->not->toBeNull()
        ->and($otp->code)->not->toBe($code)
        ->and(Hash::check($code, $otp->code))->toBeTrue();

    $this->post('/verify-otp', ['code' => $code])->assertRedirect('/reset-password');
});

test('legacy plaintext otp rows still verify', function () {
    $user = otpHardeningUser('otp_legacy_'.uniqid().'@example.com');
    OtpCode::create([
        'email' => $user->email, 'code' => '123456', 'type' => 'reset_password', 'expires_at' => now()->addMinutes(10),
    ]);

    session(['otp_email' => $user->email, 'otp_type' => 'reset_password']);
    $this->post('/verify-otp', ['code' => '123456'])->assertRedirect('/reset-password');
});

test('resend rotates otp code and replaces locked code', function () {
    Mail::fake();
    $user = otpHardeningUser('otp_resend_'.uniqid().'@example.com');
    OtpCode::create([
        'email' => $user->email,
        'code' => Hash::make('123456'),
        'type' => 'reset_password',
        'expires_at' => now()->addMinutes(10),
        'attempts' => 5,
        'locked_at' => now(),
    ]);
    session(['otp_email' => $user->email, 'otp_type' => 'reset_password']);

    // Locked: even the correct code fails.
    $this->post('/verify-otp', ['code' => '123456'])->assertSessionHasErrors(['code']);

    $this->post('/resend-otp')->assertRedirect();
    $second = lastMailedOtpCode();

    $otp = OtpCode::where('email', $user->email)->where('type', 'reset_password')->first();
    expect($otp)->not->toBeNull()
        ->and((int) $otp->attempts)->toBe(0)
        ->and($otp->locked_at)->toBeNull();

    $this->post('/verify-otp', ['code' => $second])->assertRedirect('/reset-password');
});

test('otp principal limiter is keyed by email purpose session', function () {
    $limiter = RateLimiter::limiter('otp-principal');
    expect($limiter)->not->toBeNull();

    $makeRequest = function (string $email, string $purpose, string $sessionId): Request {
        $request = Request::create('/verify-otp', 'POST');
        $session = app('session')->driver();
        $session->setId($sessionId);
        $session->start();
        $session->put('otp_email', $email);
        $session->put('otp_type', $purpose);
        $request->setLaravelSession($session);

        return $request;
    };

    $sessionA = str_repeat('a', 40);
    $sessionB = str_repeat('b', 40);
    $limitA = $limiter($makeRequest('a@example.com', 'reset_password', $sessionA));
    $keyA = $limitA->key;
    $keyB = $limiter($makeRequest('b@example.com', 'reset_password', $sessionA))->key;
    $keyPurpose = $limiter($makeRequest('a@example.com', 'signup', $sessionA))->key;
    $keySession = $limiter($makeRequest('a@example.com', 'reset_password', $sessionB))->key;

    expect($keyA)->not->toBe($keyB)
        ->and($keyA)->not->toBe($keyPurpose)
        ->and($keyA)->not->toBe($keySession);

    foreach (range(1, $limitA->maxAttempts) as $i) {
        RateLimiter::hit($keyA);
    }

    expect(RateLimiter::tooManyAttempts($keyA, $limitA->maxAttempts))->toBeTrue()
        ->and(RateLimiter::tooManyAttempts($keyB, $limitA->maxAttempts))->toBeFalse();
});

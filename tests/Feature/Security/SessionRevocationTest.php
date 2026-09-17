<?php

use App\Models\OtpCode;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\Security\SessionRevoker;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

if (! function_exists('sessionTestUser')) {
    function sessionTestUser(array $attrs = []): User
    {
        return User::create(array_merge([
            'name' => 'Session Test User',
            'email' => 'session_'.uniqid().'@example.com',
            'password' => Hash::make('password123'),
            'email_verified_at' => now(),
            'remember_token' => Str::random(60),
        ], $attrs));
    }
}

test('revoke_others deletes other sessions keeps current session and rotates remember token', function () {
    $user = sessionTestUser(['remember_token' => 'original-token-12345']);
    $otherUser = sessionTestUser();

    DB::table('sessions')->insert([
        ['id' => 'current-sess', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => 'payload1', 'last_activity' => time()],
        ['id' => 'other-sess', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => 'payload2', 'last_activity' => time()],
        ['id' => 'diff-user-sess', 'user_id' => $otherUser->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => 'payload3', 'last_activity' => time()],
    ]);

    SessionRevoker::revokeOthers($user, 'current-sess');

    expect(DB::table('sessions')->where('id', 'current-sess')->exists())->toBeTrue()
        ->and(DB::table('sessions')->where('id', 'other-sess')->exists())->toBeFalse()
        ->and(DB::table('sessions')->where('id', 'diff-user-sess')->exists())->toBeTrue()
        ->and($user->fresh()->remember_token)->not->toBe('original-token-12345')
        ->and(SecurityAuditLog::where('action', 'user.sessions.revoked')->where('actor_id', $user->id)->count())->toBe(1);
});

test('revoke_others with null current session deletes all sessions for user and rotates remember token', function () {
    $user = sessionTestUser(['remember_token' => 'original-token-67890']);

    DB::table('sessions')->insert([
        ['id' => 'sess-1', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => 'payload1', 'last_activity' => time()],
        ['id' => 'sess-2', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => 'payload2', 'last_activity' => time()],
    ]);

    SessionRevoker::revokeOthers($user, null);

    expect(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and($user->fresh()->remember_token)->not->toBe('original-token-67890')
        ->and(SecurityAuditLog::where('action', 'user.sessions.revoked')->where('actor_id', $user->id)->count())->toBe(1);
});

test('forgot password reset deletes all existing sessions for that user and rotates remember token', function () {
    $user = sessionTestUser(['remember_token' => 'forgot-token-old']);

    DB::table('sessions')->insert([
        ['id' => 'forgot-sess-1', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
        ['id' => 'forgot-sess-2', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
    ]);

    $this->withSession(['otp_email' => $user->email, 'reset_verified' => true])
        ->post('/reset-password', [
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ])
        ->assertRedirect('/login');

    expect(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and($user->fresh()->remember_token)->not->toBe('forgot-token-old')
        ->and(Hash::check('newpassword123', $user->fresh()->password))->toBeTrue()
        ->and(SecurityAuditLog::where('action', 'user.sessions.revoked')->where('actor_id', $user->id)->count())->toBe(1);
});

test('password change via verifyPasswordOtp preserves current session deletes other session and rotates remember token', function () {
    $user = sessionTestUser(['remember_token' => 'pwd-token-old']);

    $session = app('session.store');
    if (! $session->isStarted()) {
        $session->start();
    }
    $currentSessionId = $session->getId();
    $cookieName = $session->getName();

    $this->actingAs($user)
        ->withCredentials()
        ->withSession(['recent_auth_at' => time()])
        ->withCookie($cookieName, $currentSessionId);

    DB::table('sessions')->insert([
        ['id' => $currentSessionId, 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
        ['id' => 'other-session-pwd', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
    ]);

    $code = OtpCode::issue($user->email, 'change_password');
    session([
        'pending_new_password' => Hash::make('newsecret999'),
        'otp_email' => $user->email,
        'otp_type' => 'change_password',
    ]);

    $this->postJson('/profile/verify-password-otp', ['code' => $code])
        ->assertOk()
        ->assertJson(['success' => true]);

    expect(DB::table('sessions')->where('id', $currentSessionId)->exists())->toBeTrue()
        ->and(DB::table('sessions')->where('id', 'other-session-pwd')->exists())->toBeFalse()
        ->and($user->fresh()->remember_token)->not->toBe('pwd-token-old')
        ->and(Hash::check('newsecret999', $user->fresh()->password))->toBeTrue()
        ->and(SecurityAuditLog::where('action', 'user.sessions.revoked')->where('actor_id', $user->id)->count())->toBe(1);
});

test('email change via verifyEmailOtp preserves current session deletes other session and rotates remember token', function () {
    Mail::fake();
    $user = sessionTestUser(['remember_token' => 'email-token-old']);

    $session = app('session.store');
    if (! $session->isStarted()) {
        $session->start();
    }
    $currentSessionId = $session->getId();

    $this->actingAs($user)
        ->withCredentials()
        ->withSession(['recent_auth_at' => time()])
        ->withCookie($session->getName(), $currentSessionId);

    DB::table('sessions')->insert([
        ['id' => $currentSessionId, 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
        ['id' => 'other-session-email', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
    ]);

    $newEmail = 'new-verified-email@example.com';
    $code = OtpCode::issue($newEmail, 'change_email');
    session([
        'pending_new_email' => $newEmail,
        'otp_email' => $newEmail,
        'otp_type' => 'change_email',
    ]);

    $this->postJson('/profile/verify-email-otp', ['code' => $code])
        ->assertOk()
        ->assertJson(['success' => true]);

    expect(DB::table('sessions')->where('id', $currentSessionId)->exists())->toBeTrue()
        ->and(DB::table('sessions')->where('id', 'other-session-email')->exists())->toBeFalse()
        ->and($user->fresh()->email)->toBe($newEmail)
        ->and($user->fresh()->remember_token)->not->toBe('email-token-old')
        ->and(SecurityAuditLog::where('action', 'user.sessions.revoked')->where('actor_id', $user->id)->count())->toBe(1);
});

test('setup password preserves current session deletes other session and rotates remember token', function () {
    $user = sessionTestUser(['password' => null, 'remember_token' => 'setup-token-old']);

    $session = app('session.store');
    if (! $session->isStarted()) {
        $session->start();
    }
    $currentSessionId = $session->getId();

    $this->actingAs($user)
        ->withCredentials()
        ->withSession([])
        ->withCookie($session->getName(), $currentSessionId);

    DB::table('sessions')->insert([
        ['id' => $currentSessionId, 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
        ['id' => 'other-session-setup', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'Test', 'payload' => '', 'last_activity' => time()],
    ]);

    $this->postJson('/profile/setup-password', [
        'password' => 'newsetup123',
        'password_confirmation' => 'newsetup123',
    ])
        ->assertOk()
        ->assertJson(['success' => true]);

    expect(DB::table('sessions')->where('id', $currentSessionId)->exists())->toBeTrue()
        ->and(DB::table('sessions')->where('id', 'other-session-setup')->exists())->toBeFalse()
        ->and($user->fresh()->remember_token)->not->toBe('setup-token-old')
        ->and(Hash::check('newsetup123', $user->fresh()->password))->toBeTrue()
        ->and(SecurityAuditLog::where('action', 'user.sessions.revoked')->where('actor_id', $user->id)->count())->toBe(1);
});

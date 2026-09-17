<?php

use App\Mail\EmailChangeAlert;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\SecurityAuditLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

function emailChangeUser(array $attrs = []): User
{
    return User::create(array_merge([
        'name' => 'Email Change User',
        'email' => 'change_'.uniqid().'@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ], $attrs));
}

test('update_email_without_recent_auth_is_forbidden', function () {
    Mail::fake();
    $user = emailChangeUser();
    $this->actingAs($user);

    $response = $this->postJson('/profile/update-email', ['email' => 'new_'.uniqid().'@example.com']);

    $response->assertStatus(403);
    expect(OtpCode::count())->toBe(0);
    Mail::assertNothingSent();
});

test('update_email_with_stale_recent_auth_is_forbidden', function () {
    Mail::fake();
    $user = emailChangeUser();
    $this->actingAs($user)->withSession(['recent_auth_at' => now()->subMinutes(16)->timestamp]);

    $response = $this->postJson('/profile/update-email', ['email' => 'new_'.uniqid().'@example.com']);

    $response->assertStatus(403);
    expect(OtpCode::count())->toBe(0);
});

test('confirm_password_with_wrong_password_fails_and_keeps_gate_closed', function () {
    $user = emailChangeUser();
    $this->actingAs($user);

    $this->postJson('/profile/confirm-password', ['password' => 'wrongpass'])
        ->assertStatus(422);

    $this->postJson('/profile/update-email', ['email' => 'new_'.uniqid().'@example.com'])
        ->assertStatus(403);
});

test('confirm_password_then_update_email_runs_otp_flow_and_notifies_old_email', function () {
    Mail::fake();
    $user = emailChangeUser();
    $user->forceFill(['remember_token' => 'old-test-token'])->save();
    $oldEmail = $user->email;
    $newEmail = 'new_'.uniqid().'@example.com';
    $this->actingAs($user);

    $this->postJson('/profile/confirm-password', ['password' => 'password123'])
        ->assertOk()
        ->assertJson(['success' => true]);

    $this->postJson('/profile/update-email', ['email' => $newEmail])
        ->assertOk()
        ->assertJson(['success' => true, 'requires_otp' => true]);

    Mail::assertQueued(OtpMail::class, fn ($mail) => $mail->hasTo($newEmail));

    $otp = OtpCode::where('email', $newEmail)->where('type', 'change_email')->first();
    expect($otp)->not->toBeNull();

    // Codes are stored hashed; verify with the mailed plaintext.
    $code = null;
    Mail::assertQueued(OtpMail::class, function ($mail) use (&$code, $newEmail) {
        if (! $mail->hasTo($newEmail)) {
            return false;
        }
        $code = $mail->otpCode;

        return true;
    });

    // REGRESSION: wrong OTP still rejected
    $this->postJson('/profile/verify-email-otp', ['code' => '000000'])->assertStatus(422);

    $this->postJson('/profile/verify-email-otp', ['code' => $code])
        ->assertOk()
        ->assertJson(['success' => true]);

    expect($user->fresh()->email)->toBe($newEmail)
        ->and($user->fresh()->remember_token)->not->toBe('old-test-token');

    Mail::assertQueued(EmailChangeAlert::class, fn ($mail) => $mail->hasTo($oldEmail));

    expect(SecurityAuditLog::where('action', 'user.email.updated')->where('actor_id', $user->id)->count())->toBe(1);

    // recent auth is one-shot
    $this->postJson('/profile/update-email', ['email' => 'another_'.uniqid().'@example.com'])
        ->assertStatus(403);
});

test('google_only_account_must_setup_password_before_email_change', function () {
    Mail::fake();
    $user = emailChangeUser(['password' => null, 'google_id' => 'google-'.uniqid()]);
    $this->actingAs($user);

    $this->postJson('/profile/confirm-password', ['password' => 'anything'])
        ->assertStatus(422);

    $this->postJson('/profile/update-email', ['email' => 'new_'.uniqid().'@example.com'])
        ->assertStatus(403);

    // password setup grants recent auth
    $this->postJson('/profile/setup-password', [
        'password' => 'newpassword123',
        'password_confirmation' => 'newpassword123',
    ])->assertOk();

    $this->postJson('/profile/update-email', ['email' => 'new_'.uniqid().'@example.com'])
        ->assertOk()
        ->assertJson(['requires_otp' => true]);
});

test('verify_email_otp_rolls_back_all_db_writes_when_user_save_fails', function () {
    Mail::fake();
    $user = emailChangeUser();
    $oldEmail = $user->email;
    $newEmail = 'new_'.uniqid().'@example.com';
    $this->actingAs($user);

    $this->postJson('/profile/confirm-password', ['password' => 'password123'])->assertOk();
    $this->postJson('/profile/update-email', ['email' => $newEmail])->assertOk();

    $otp = OtpCode::where('email', $newEmail)->where('type', 'change_email')->first();
    expect($otp)->not->toBeNull();

    // Codes are stored hashed; verify with the mailed plaintext.
    $code = null;
    Mail::assertQueued(OtpMail::class, function ($mail) use (&$code, $newEmail) {
        if (! $mail->hasTo($newEmail)) {
            return false;
        }
        $code = $mail->otpCode;

        return true;
    });

    // Simulate a mid-commit DB failure: without a transaction the OTP row would be gone.
    User::saving(function () {
        DB::statement('select * from table_that_does_not_exist_xyz');
    });

    $this->postJson('/profile/verify-email-otp', ['code' => $code])->assertStatus(500);

    expect($user->fresh()->email)->toBe($oldEmail)
        ->and(OtpCode::where('email', $newEmail)->where('type', 'change_email')->exists())->toBeTrue()
        ->and(SecurityAuditLog::where('action', 'user.email.updated')->count())->toBe(0);
});

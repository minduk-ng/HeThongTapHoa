<?php

use App\Mail\EmailChangeAlert;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\SecurityAuditLog;
use App\Models\User;
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

    // REGRESSION: wrong OTP still rejected
    $this->postJson('/profile/verify-email-otp', ['code' => '000000'])->assertStatus(422);

    $this->postJson('/profile/verify-email-otp', ['code' => $otp->code])
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

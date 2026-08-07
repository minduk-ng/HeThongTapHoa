<?php

test('google_auth_callback_regenerates_session', function () {
    $path = app_path('Http/Controllers/Auth/GoogleAuthController.php');
    expect(file_get_contents($path))->toContain('session()->regenerate()');
});

test('otp_signup_login_regenerates_session', function () {
    $path = app_path('Http/Controllers/Auth/OtpController.php');
    expect(file_get_contents($path))->toContain('session()->regenerate()');
});

test('profile otp routes bi throttle', function () {
    $user = posStaff(['profile.view'], ['/profile']);
    $this->actingAs($user);

    for ($i = 0; $i < 10; $i++) {
        $this->postJson('/profile/verify-email-otp', ['code' => 'bad'])->assertStatus(422);
    }

    $response = $this->postJson('/profile/verify-email-otp', ['code' => 'bad']);
    $response->assertStatus(429);
});

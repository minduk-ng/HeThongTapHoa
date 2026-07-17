<?php

use App\Models\User;
use App\Models\OtpCode;
use App\Models\Role;
use App\Models\Page;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Seed standard roles and pages
    $this->adminRole = Role::create(['name' => 'admin', 'description' => 'Admin role', 'is_system' => true]);
    $this->guestRole = Role::create(['name' => 'guest', 'description' => 'Guest role', 'is_system' => true]);
    
    $this->homePage = Page::create(['name' => 'Home', 'route_path' => '/', 'group_name' => 'Home', 'sort_order' => 1]);
    $this->adminPage = Page::create(['name' => 'Pages', 'route_path' => '/admin/pages', 'group_name' => 'Admin', 'sort_order' => 2]);
    
    $this->adminRole->pages()->attach([$this->homePage->id, $this->adminPage->id]);
    $this->guestRole->pages()->attach([$this->homePage->id]);
});

test('login is prevented for unverified email accounts', function () {
    $unverifiedUser = User::create([
        'name' => 'Test User',
        'email' => 'unverified@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => null,
    ]);
    $unverifiedUser->roles()->attach($this->guestRole->id);

    $response = $this->post('/login', [
        'email' => 'unverified@example.com',
        'password' => 'password123',
    ]);

    $response->assertRedirect('/verify-otp');
    $this->assertNull(session('otp_verified'));
    $this->assertFalse(Auth::check());
});

test('OTP verification fails when incorrect or expired', function () {
    $user = User::create([
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => null,
    ]);
    
    // Save expired OTP
    OtpCode::create([
        'email' => 'test@example.com',
        'code' => '111111',
        'type' => 'signup',
        'expires_at' => now()->subMinutes(1),
    ]);

    session(['otp_email' => 'test@example.com', 'otp_type' => 'signup']);

    // Attempt with expired code
    $response = $this->post('/verify-otp', ['code' => '111111']);
    $response->assertSessionHasErrors(['code']);
    
    // Attempt with incorrect code
    $response = $this->post('/verify-otp', ['code' => '222222']);
    $response->assertSessionHasErrors(['code']);
});

test('unauthorized users cannot access admin routes', function () {
    $user = User::create([
        'name' => 'Regular User',
        'email' => 'regular@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);
    $user->roles()->attach($this->guestRole->id);

    $this->actingAs($user);

    // Try accessing admin pages route which guest role does not have access to
    $response = $this->get('/admin/pages');
    $response->assertStatus(403);
});

test('reset password works correctly', function () {
    $user = User::create([
        'name' => 'Regular User',
        'email' => 'user@example.com',
        'password' => bcrypt('oldpassword'),
        'email_verified_at' => now(),
    ]);

    // Request reset password (fails with non-existing email but shows generic success redirect)
    $response = $this->post('/forgot-password', ['email' => 'nonexistent@example.com']);
    $response->assertRedirect('/verify-otp');
    
    // Correct request
    $response = $this->post('/forgot-password', ['email' => 'user@example.com']);
    $response->assertRedirect('/verify-otp');
    
    $otp = OtpCode::where('email', 'user@example.com')->first();
    $this->assertNotNull($otp);

    // Verify OTP
    session(['otp_email' => 'user@example.com', 'otp_type' => 'reset_password']);
    $response = $this->post('/verify-otp', ['code' => $otp->code]);
    $response->assertRedirect('/reset-password');
    $this->assertTrue(session('reset_verified'));

    // Attempt password reset without verification fails
    session()->forget('reset_verified');
    $response = $this->post('/reset-password', [
        'password' => 'newpassword123',
        'password_confirmation' => 'newpassword123',
    ]);
    $response->assertRedirect('/forgot-password');

    // Attempt password reset with verification succeeds
    session(['reset_verified' => true, 'otp_email' => 'user@example.com']);
    $response = $this->post('/reset-password', [
        'password' => 'newpassword123',
        'password_confirmation' => 'newpassword123',
    ]);
    $response->assertRedirect('/login');
    
    // Verify password is updated
    $this->assertTrue(Auth::attempt([
        'email' => 'user@example.com',
        'password' => 'newpassword123',
    ]));
});

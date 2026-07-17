<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\OtpController;
use App\Http\Controllers\Auth\SignupController;
use Illuminate\Support\Facades\Route;

// Home (authenticated)
Route::inertia('/', 'welcome')->name('home')->middleware('auth');

// Guest routes (only accessible when NOT logged in)
Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login'])->middleware(['throttle:10,1']);
    Route::post('/login/check-attempts', [AuthController::class, 'checkAttempts']);

    Route::get('/signup', [SignupController::class, 'show'])->name('signup');
    Route::post('/signup', [SignupController::class, 'store'])->middleware(['throttle:5,1']);

    Route::get('/verify-otp', [OtpController::class, 'show'])->name('verify-otp');
    Route::post('/verify-otp', [OtpController::class, 'verify'])->middleware(['throttle:10,1']);
    Route::post('/resend-otp', [OtpController::class, 'resend'])->middleware(['throttle:2,1'])->name('resend-otp');

    Route::get('/forgot-password', [ForgotPasswordController::class, 'show'])->name('forgot-password');
    Route::post('/forgot-password', [ForgotPasswordController::class, 'sendOtp'])->middleware(['throttle:5,1']);

    Route::get('/reset-password', [ForgotPasswordController::class, 'showReset'])->name('reset-password');
    Route::post('/reset-password', [ForgotPasswordController::class, 'reset'])->middleware(['throttle:5,1']);

    // Google OAuth
    Route::get('/auth/google', [GoogleAuthController::class, 'redirect'])->name('google.redirect');
    Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback'])->name('google.callback');
});

// Authenticated routes
Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    // Profile Settings
    Route::get('/settings', [\App\Http\Controllers\Auth\ProfileController::class, 'show'])->name('settings');
    Route::post('/profile/update-name', [\App\Http\Controllers\Auth\ProfileController::class, 'updateName']);
    Route::post('/profile/update-email', [\App\Http\Controllers\Auth\ProfileController::class, 'updateEmail']);
    Route::post('/profile/verify-email-otp', [\App\Http\Controllers\Auth\ProfileController::class, 'verifyEmailOtp']);
    Route::post('/profile/setup-password', [\App\Http\Controllers\Auth\ProfileController::class, 'setupPassword']);
    Route::post('/profile/change-password', [\App\Http\Controllers\Auth\ProfileController::class, 'changePassword']);
    Route::post('/profile/verify-password-otp', [\App\Http\Controllers\Auth\ProfileController::class, 'verifyPasswordOtp']);

    Route::prefix('admin')->middleware(\App\Http\Middleware\CheckPageAccess::class)->group(function () {
        // Page Manager
        Route::get('/pages', [\App\Http\Controllers\Admin\PageController::class, 'index'])->middleware('permission:pages.view');
        Route::post('/pages', [\App\Http\Controllers\Admin\PageController::class, 'store'])->middleware('permission:pages.create');
        Route::put('/pages/reorder', [\App\Http\Controllers\Admin\PageController::class, 'reorder'])->middleware('permission:pages.edit');
        Route::put('/pages/{page}', [\App\Http\Controllers\Admin\PageController::class, 'update'])->middleware('permission:pages.edit');
        Route::delete('/pages/{page}', [\App\Http\Controllers\Admin\PageController::class, 'destroy'])->middleware('permission:pages.delete');
        // Role Manager
        Route::get('/roles', [\App\Http\Controllers\Admin\RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::post('/roles', [\App\Http\Controllers\Admin\RoleController::class, 'store'])->middleware('permission:roles.create');
        Route::put('/roles/{role}', [\App\Http\Controllers\Admin\RoleController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('/roles/{role}', [\App\Http\Controllers\Admin\RoleController::class, 'destroy'])->middleware('permission:roles.delete');

        // User Permission Manager
        Route::get('/permissions', [\App\Http\Controllers\Admin\UserPermissionController::class, 'index'])->middleware('permission:users.view');
        Route::put('/permissions/{user}', [\App\Http\Controllers\Admin\UserPermissionController::class, 'update'])->middleware('permission:users.edit');
        Route::post('/permissions/bulk', [\App\Http\Controllers\Admin\UserPermissionController::class, 'bulkAction'])->middleware('permission:users.edit');
    });
});

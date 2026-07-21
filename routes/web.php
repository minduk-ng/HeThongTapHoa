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

    // Store Management Routes (/manager/)
    Route::prefix('manager')->middleware(\App\Http\Middleware\CheckPageAccess::class)->group(function () {
        // Products Management
        Route::get('/products', [\App\Http\Controllers\Manager\ProductController::class, 'index'])->middleware('permission:products.view');
        Route::post('/products', [\App\Http\Controllers\Manager\ProductController::class, 'store'])->middleware('permission:products.create');
        Route::get('/products/export', [\App\Http\Controllers\Manager\ProductController::class, 'export'])->middleware('permission:products.export');
        Route::post('/products/check-import', [\App\Http\Controllers\Manager\ProductController::class, 'checkImport'])->middleware('permission:products.import');
        Route::post('/products/confirm-import', [\App\Http\Controllers\Manager\ProductController::class, 'confirmImport'])->middleware('permission:products.import');
        Route::post('/products/{product}', [\App\Http\Controllers\Manager\ProductController::class, 'update'])->middleware('permission:products.edit');
        Route::delete('/products/{product}', [\App\Http\Controllers\Manager\ProductController::class, 'destroy'])->middleware('permission:products.delete');


        // Categories Management
        Route::get('/categories', [\App\Http\Controllers\Manager\CategoryController::class, 'index'])->middleware('permission:categories.view');
        Route::post('/categories', [\App\Http\Controllers\Manager\CategoryController::class, 'store'])->middleware('permission:categories.create');
        Route::post('/categories/{category}', [\App\Http\Controllers\Manager\CategoryController::class, 'update'])->middleware('permission:categories.edit');
        Route::delete('/categories/{category}', [\App\Http\Controllers\Manager\CategoryController::class, 'destroy'])->middleware('permission:categories.delete');

        // Inventory Management
        Route::get('/inventory/ingredients', [\App\Http\Controllers\Manager\IngredientController::class, 'index'])->middleware('permission:ingredients.view');
        Route::post('/inventory/ingredients', [\App\Http\Controllers\Manager\IngredientController::class, 'store'])->middleware('permission:ingredients.create');
        Route::post('/inventory/ingredients/import', [\App\Http\Controllers\Manager\IngredientController::class, 'importStock'])->middleware('permission:ingredients.import');
        Route::post('/inventory/ingredients/{ingredient}', [\App\Http\Controllers\Manager\IngredientController::class, 'update'])->middleware('permission:ingredients.edit');
        Route::delete('/inventory/ingredients/{ingredient}', [\App\Http\Controllers\Manager\IngredientController::class, 'destroy'])->middleware('permission:ingredients.delete');

        // Recipes Management
        Route::get('/inventory/recipes', [\App\Http\Controllers\Manager\RecipeController::class, 'index'])->middleware('permission:recipes.view');
        Route::post('/inventory/recipes/{product}', [\App\Http\Controllers\Manager\RecipeController::class, 'updateRecipe'])->middleware('permission:recipes.edit');

        // Tables Management
        Route::get('/tables', [\App\Http\Controllers\Manager\TableController::class, 'index'])->middleware('permission:tables.view');
        Route::post('/tables', [\App\Http\Controllers\Manager\TableController::class, 'store'])->middleware('permission:tables.create');
        Route::post('/tables/batch', [\App\Http\Controllers\Manager\TableController::class, 'batchStore'])->middleware('permission:tables.create');
        Route::post('/tables/{table}', [\App\Http\Controllers\Manager\TableController::class, 'update'])->middleware('permission:tables.edit');
        Route::delete('/tables/{table}', [\App\Http\Controllers\Manager\TableController::class, 'destroy'])->middleware('permission:tables.delete');
    });

    // Staff Features (POS & Kitchen Display)
    Route::prefix('staff')->middleware(\App\Http\Middleware\CheckPageAccess::class)->group(function () {
        Route::get('/pos', [\App\Http\Controllers\Staff\POSController::class, 'index'])->middleware('permission:pos.view');
        Route::post('/pos/send-to-kitchen', [\App\Http\Controllers\Staff\POSController::class, 'sendToKitchen'])->middleware('permission:pos.create');
        Route::post('/pos/checkout', [\App\Http\Controllers\Staff\POSController::class, 'checkout'])->middleware('permission:pos.create');

        Route::get('/kitchen', [\App\Http\Controllers\Staff\KitchenController::class, 'index'])->middleware('permission:kitchen.view');
        Route::post('/kitchen/complete/{order}', [\App\Http\Controllers\Staff\KitchenController::class, 'completeOrder'])->middleware('permission:kitchen.update');
    });

});


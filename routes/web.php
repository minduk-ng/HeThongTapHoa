<?php

use App\Http\Controllers\Admin\PageController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\UserPermissionController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\OtpController;
use App\Http\Controllers\Auth\ProfileController;
use App\Http\Controllers\Auth\SignupController;
use App\Http\Controllers\Manager\CategoryController;
use App\Http\Controllers\Manager\DashboardController;
use App\Http\Controllers\Manager\IngredientController;
use App\Http\Controllers\Manager\OrderListController;
use App\Http\Controllers\Manager\ProductController;
use App\Http\Controllers\Manager\PromotionController;
use App\Http\Controllers\Manager\RecipeController;
use App\Http\Controllers\Manager\Reports\SalesInvoiceReportController;
use App\Http\Controllers\Reports\InvoiceItemsReportController;
use App\Http\Controllers\Reports\CancelledReportController;
use App\Http\Controllers\Reports\PaymentsReportController;
use App\Http\Controllers\Reports\ProfitReportController;
use App\Http\Controllers\Reports\ReservationsReportController;
use App\Http\Controllers\Reports\ShiftReportController;
use App\Http\Controllers\Reports\ProductDetailsReportController;
use App\Http\Controllers\Manager\TableController;
use App\Http\Controllers\Staff\KitchenController;
use App\Http\Controllers\Staff\POSController;
use App\Http\Controllers\Staff\ServingController;
use App\Http\Controllers\Staff\ShiftController;
use App\Http\Middleware\CheckPageAccess;
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
    Route::get('/settings', [ProfileController::class, 'show'])->name('settings');
    Route::post('/profile/update-name', [ProfileController::class, 'updateName']);
    Route::post('/profile/update-email', [ProfileController::class, 'updateEmail']);
    Route::post('/profile/verify-email-otp', [ProfileController::class, 'verifyEmailOtp']);
    Route::post('/profile/setup-password', [ProfileController::class, 'setupPassword']);
    Route::post('/profile/change-password', [ProfileController::class, 'changePassword']);
    Route::post('/profile/verify-password-otp', [ProfileController::class, 'verifyPasswordOtp']);

    Route::prefix('admin')->middleware(CheckPageAccess::class)->group(function () {
        // Page Manager
        Route::get('/pages', [PageController::class, 'index'])->middleware('permission:pages.view');
        Route::post('/pages', [PageController::class, 'store'])->middleware('permission:pages.create');
        Route::put('/pages/reorder', [PageController::class, 'reorder'])->middleware('permission:pages.edit');
        Route::put('/pages/{page}', [PageController::class, 'update'])->middleware('permission:pages.edit');
        Route::delete('/pages/{page}', [PageController::class, 'destroy'])->middleware('permission:pages.delete');
        // Role Manager
        Route::get('/roles', [RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::post('/roles', [RoleController::class, 'store'])->middleware('permission:roles.create');
        Route::put('/roles/{role}', [RoleController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('/roles/{role}', [RoleController::class, 'destroy'])->middleware('permission:roles.delete');

        // User Permission Manager
        Route::get('/permissions', [UserPermissionController::class, 'index'])->middleware('permission:users.view');
        Route::put('/permissions/{user}', [UserPermissionController::class, 'update'])->middleware('permission:users.edit');
        Route::post('/permissions/bulk', [UserPermissionController::class, 'bulkAction'])->middleware('permission:users.edit');
    });

    // Store Management Routes (/manager/)
    Route::prefix('manager')->middleware(CheckPageAccess::class)->group(function () {
        // Products Management
        Route::get('/products', [ProductController::class, 'index'])->middleware('permission:products.view');
        Route::post('/products', [ProductController::class, 'store'])->middleware('permission:products.create');
        Route::get('/products/export', [ProductController::class, 'export'])->middleware('permission:products.export');
        Route::post('/products/check-import', [ProductController::class, 'checkImport'])->middleware('permission:products.import');
        Route::post('/products/confirm-import', [ProductController::class, 'confirmImport'])->middleware('permission:products.import');
        Route::post('/products/{product}', [ProductController::class, 'update'])->middleware('permission:products.edit');
        Route::delete('/products/{product}', [ProductController::class, 'destroy'])->middleware('permission:products.delete');

        // Categories Management
        Route::get('/categories', [CategoryController::class, 'index'])->middleware('permission:categories.view');
        Route::post('/categories', [CategoryController::class, 'store'])->middleware('permission:categories.create');
        Route::post('/categories/{category}', [CategoryController::class, 'update'])->middleware('permission:categories.edit');
        Route::delete('/categories/{category}', [CategoryController::class, 'destroy'])->middleware('permission:categories.delete');

        // Promotions Management
        Route::get('/promotions', [PromotionController::class, 'index'])->middleware('permission:promotions.view');
        Route::post('/promotions', [PromotionController::class, 'store'])->middleware('permission:promotions.create');
        Route::post('/promotions/{promotion}', [PromotionController::class, 'update'])->middleware('permission:promotions.edit');
        Route::delete('/promotions/{promotion}', [PromotionController::class, 'destroy'])->middleware('permission:promotions.delete');

        // Inventory Management
        Route::get('/inventory/ingredients', [IngredientController::class, 'index'])->middleware('permission:ingredients.view');
        Route::post('/inventory/ingredients', [IngredientController::class, 'store'])->middleware('permission:ingredients.create');
        Route::post('/inventory/ingredients/import', [IngredientController::class, 'importStock'])->middleware('permission:ingredients.import');
        Route::post('/inventory/ingredients/{ingredient}', [IngredientController::class, 'update'])->middleware('permission:ingredients.edit');
        Route::delete('/inventory/ingredients/{ingredient}', [IngredientController::class, 'destroy'])->middleware('permission:ingredients.delete');

        // Recipes Management
        Route::get('/inventory/recipes', [RecipeController::class, 'index'])->middleware('permission:recipes.view');
        Route::post('/inventory/recipes/{product}', [RecipeController::class, 'updateRecipe'])->middleware('permission:recipes.edit');

        // Tables Management
        Route::get('/tables', [TableController::class, 'index'])->middleware('permission:tables.view');
        Route::post('/tables', [TableController::class, 'store'])->middleware('permission:tables.create');
        Route::post('/tables/batch', [TableController::class, 'batchStore'])->middleware('permission:tables.create');
        Route::post('/tables/{table}', [TableController::class, 'update'])->middleware('permission:tables.edit');
        Route::delete('/tables/{table}', [TableController::class, 'destroy'])->middleware('permission:tables.delete');

        // Order List
        Route::get('/orders', [OrderListController::class, 'index'])->middleware('permission:orders.view');
        Route::get('/orders/{order}', [OrderListController::class, 'show'])->middleware('permission:orders.view');

        // Dashboard/Báo cáo
        Route::get('/dashboard', [DashboardController::class, 'index'])->middleware('permission:dashboard.view');
    });

    // Reports Management
    Route::prefix('reports')->middleware(CheckPageAccess::class)->group(function () {
        Route::get('/sales-invoices', [SalesInvoiceReportController::class, 'index'])->middleware('permission:reports.view');
        Route::get('/invoice-items', [InvoiceItemsReportController::class, 'index'])->middleware('permission:reports.view');
        Route::get('/product-details', [ProductDetailsReportController::class, 'index'])->middleware('permission:reports.view');
        Route::get('/cancelled', [CancelledReportController::class, 'index'])->middleware('permission:reports.view');
        Route::get('/payments', [PaymentsReportController::class, 'index'])->middleware('permission:reports.view');
        Route::get('/profit', [ProfitReportController::class, 'index'])->middleware('permission:reports.view');
        Route::get('/reservations', [ReservationsReportController::class, 'index'])->middleware('permission:reports.view');
        Route::get('/shifts', [ShiftReportController::class, 'index'])->middleware('permission:reports.view');
    });

    // Staff Features (POS & Kitchen Display)
    Route::prefix('staff')->middleware(CheckPageAccess::class)->group(function () {
        Route::get('/pos', [POSController::class, 'index'])->middleware('permission:pos.view');
        Route::post('/pos/reserve', [POSController::class, 'reserve'])->middleware('permission:pos.create');
        Route::post('/pos/reservation/check-in', [POSController::class, 'checkInReservation'])->middleware('permission:pos.create');
        Route::post('/pos/reservation/cancel', [POSController::class, 'cancelReservation'])->middleware('permission:pos.create');
        Route::post('/pos/deposit', [POSController::class, 'deposit'])->middleware('permission:pos.create');
        Route::post('/pos/send-to-kitchen', [POSController::class, 'sendToKitchen'])->middleware('permission:pos.create');
        Route::post('/pos/validate-promotion', [POSController::class, 'validatePromotion'])->middleware('permission:pos.create');
        Route::post('/pos/checkout', [POSController::class, 'checkout'])->middleware('permission:pos.create');
        Route::post('/pos/bulk-checkout', [POSController::class, 'bulkCheckout'])->middleware('permission:pos.create');
        Route::post('/pos/transfer-table', [POSController::class, 'transferTable'])->middleware('permission:pos.create');
        Route::post('/pos/merge-tables', [POSController::class, 'mergeTables'])->middleware('permission:pos.create');
        Route::post('/pos/unmerge-table', [POSController::class, 'unmergeTable'])->middleware('permission:pos.create');
        Route::get('/pos/serving-queue', [POSController::class, 'servingQueue'])->middleware('permission:pos.view');
        Route::post('/pos/mark-served', [POSController::class, 'markServed'])->middleware('permission:pos.create');
        Route::post('/pos/cancel-order', [POSController::class, 'cancelOrder'])->middleware('permission:pos.cancel_item|kitchen.cancel_item');

        Route::get('/shifts', [ShiftController::class, 'index'])->middleware('permission:shifts.view');
        Route::post('/shifts/open', [ShiftController::class, 'open'])->middleware('permission:shifts.open');
        Route::get('/shifts/current', [ShiftController::class, 'current'])->middleware('permission:shifts.view');
        Route::post('/shifts/close', [ShiftController::class, 'close'])->middleware('permission:shifts.close');

        Route::get('/kitchen', [KitchenController::class, 'index'])->middleware('permission:kitchen.view');
        Route::post('/kitchen/complete-items', [KitchenController::class, 'completeItems'])->middleware('permission:kitchen.update');
        Route::post('/kitchen/complete/{order}', [KitchenController::class, 'completeOrder'])->middleware('permission:kitchen.update');
        Route::post('/kitchen/cancel-item', [KitchenController::class, 'cancelItem'])->middleware('permission:kitchen.cancel_item|pos.cancel_item');

        // Serving Display
        Route::get('/serving', [ServingController::class, 'index'])->middleware('permission:serving.view');
        Route::post('/serving/mark-served', [ServingController::class, 'markServed'])->middleware('permission:serving.update');
    });

});

<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use App\Services\Security\SessionRevoker;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;

class ForgotPasswordController extends Controller
{
    public function show(): Response
    {
        return Inertia::render('auth/Auth', ['step' => 'forgot']);
    }

    public function sendOtp(Request $request): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $request->email)->first();

        if ($user) {
            // ponytail: scoped to reset_password so change-email/change-password OTPs survive.
            $code = OtpCode::issue($request->email, 'reset_password');

            Mail::to($request->email)->queue(new OtpMail($code, 'reset_password'));
        }

        $request->session()->put('otp_email', $request->email);
        $request->session()->put('otp_type', 'reset_password');

        return redirect('/verify-otp')->with('success', 'Nếu email của bạn tồn tại trong hệ thống, mã xác minh OTP đã được gửi.');
    }

    public function showReset(Request $request): Response|RedirectResponse
    {
        if (! $request->session()->get('reset_verified')) {
            return redirect('/forgot-password');
        }

        return Inertia::render('auth/Auth', ['step' => 'reset']);
    }

    public function reset(Request $request): RedirectResponse
    {
        if (! $request->session()->get('reset_verified')) {
            return redirect('/forgot-password');
        }

        $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $email = $request->session()->get('otp_email');
        $user = User::where('email', $email)->first();

        if ($user) {
            DB::transaction(function () use ($user, $request): void {
                $user->update(['password' => $request->password]);
                SessionRevoker::revokeOthers($user, null);
            });
        }

        // Clear session
        $request->session()->forget(['otp_email', 'otp_type', 'reset_verified']);

        return redirect('/login')->with('success', 'Mật khẩu đã được thay đổi thành công. Vui lòng đăng nhập lại.');
    }
}

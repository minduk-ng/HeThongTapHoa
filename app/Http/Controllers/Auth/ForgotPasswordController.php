<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;

class ForgotPasswordController extends Controller
{
    public function show(): Response
    {
        return Inertia::render('auth/Auth', ['step' => 'forgot']);
    }

    public function sendOtp(Request $request): \Illuminate\Http\RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $request->email)->first();

        if ($user) {
            // Delete existing OTPs
            OtpCode::where('email', $request->email)->delete();

            // Generate OTP
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            OtpCode::create([
                'email' => $request->email,
                'code' => $code,
                'type' => 'reset_password',
                'expires_at' => now()->addMinutes(10),
            ]);

            Mail::to($request->email)->queue(new OtpMail($code, 'reset_password'));
        }

        $request->session()->put('otp_email', $request->email);
        $request->session()->put('otp_type', 'reset_password');

        return redirect('/verify-otp')->with('success', 'Nếu email của bạn tồn tại trong hệ thống, mã xác minh OTP đã được gửi.');
    }

    public function showReset(Request $request): Response|\Illuminate\Http\RedirectResponse
    {
        if (! $request->session()->get('reset_verified')) {
            return redirect('/forgot-password');
        }

        return Inertia::render('auth/Auth', ['step' => 'reset']);
    }

    public function reset(Request $request): \Illuminate\Http\RedirectResponse
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
            $user->update(['password' => $request->password]);
        }

        // Clear session
        $request->session()->forget(['otp_email', 'otp_type', 'reset_verified']);

        return redirect('/login')->with('success', 'Mật khẩu đã được thay đổi thành công. Vui lòng đăng nhập lại.');
    }
}

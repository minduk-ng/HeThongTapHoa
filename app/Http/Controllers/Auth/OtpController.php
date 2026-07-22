<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;

class OtpController extends Controller
{
    public function show(Request $request): Response|RedirectResponse
    {
        $email = $request->session()->get('otp_email');
        $type = $request->session()->get('otp_type');

        if (! $email || ! $type) {
            return redirect('/login');
        }

        return Inertia::render('auth/Auth', [
            'step' => 'otp',
            'email' => $email,
            'otpType' => $type,
        ]);
    }

    public function verify(Request $request): RedirectResponse|JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $email = $request->session()->get('otp_email');
        $type = $request->session()->get('otp_type');

        if (! $email || ! $type) {
            if ($request->wantsJson()) {
                return response()->json(['errors' => ['code' => 'Phiên làm việc đã hết hạn.']], 422);
            }

            return redirect('/login');
        }

        $otp = OtpCode::where('email', $email)
            ->where('type', $type)
            ->where('code', $request->code)
            ->where('expires_at', '>', now())
            ->first();

        if (! $otp) {
            if ($request->wantsJson()) {
                return response()->json(['errors' => ['code' => 'Mã xác thực không đúng hoặc đã hết hạn.']], 422);
            }

            return back()->withErrors([
                'code' => 'Mã xác thực không đúng hoặc đã hết hạn.',
            ]);
        }

        // Delete used OTP
        $otp->delete();

        if ($type === 'signup') {
            $user = User::where('email', $email)->first();
            if ($user) {
                $user->update(['email_verified_at' => now()]);
                Auth::login($user);
            }

            $request->session()->forget(['otp_email', 'otp_type']);

            if ($request->wantsJson()) {
                return response()->json(['success' => true, 'redirect' => '/']);
            }

            return redirect('/');
        }

        // For reset_password: set session flag and redirect to reset form
        $request->session()->put('reset_verified', true);

        if ($request->wantsJson()) {
            return response()->json(['success' => true, 'redirect' => '/reset-password']);
        }

        return redirect('/reset-password');
    }

    public function resend(Request $request): RedirectResponse
    {
        $email = $request->session()->get('otp_email');
        $type = $request->session()->get('otp_type');

        if (! $email || ! $type) {
            return redirect('/login');
        }

        // Check for existing valid unexpired OTP code
        $existingOtp = OtpCode::where('email', $email)
            ->where('type', $type)
            ->where('expires_at', '>', now())
            ->first();

        if ($existingOtp) {
            $code = $existingOtp->code;
        } else {
            OtpCode::where('email', $email)->delete();
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            OtpCode::create([
                'email' => $email,
                'code' => $code,
                'type' => $type,
                'expires_at' => now()->addMinutes(10),
            ]);
        }

        Mail::to($email)->queue(new OtpMail($code, $type));

        return back()->with('success', 'Mã xác thực mới đã được gửi.');
    }
}

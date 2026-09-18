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

        $otp = OtpCode::consume($email, $type, $request->code, function () use ($email, $type, $request): void {
            if ($type === 'signup' && ($user = User::where('email', $email)->first())) {
                $user->update(['email_verified_at' => now()]);
                Auth::login($user);
                $request->session()->regenerate();
                $request->session()->put('session_version', (int) $user->session_version);
            }
        });

        if (! $otp) {
            if ($request->wantsJson()) {
                return response()->json(['errors' => ['code' => 'Mã xác thực không đúng hoặc đã hết hạn.']], 422);
            }

            return back()->withErrors([
                'code' => 'Mã xác thực không đúng hoặc đã hết hạn.',
            ]);
        }

        if ($type === 'signup') {
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

        // ponytail: hashing is one-way, so resend always rotates to a fresh code
        // (replacing a locked one too) instead of re-mailing the stored value.
        $code = OtpCode::issue($email, $type);

        Mail::to($email)->queue(new OtpMail($code, $type));

        return back()->with('success', 'Mã xác thực mới đã được gửi.');
    }
}

<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class AuthController extends Controller
{
    public function showLogin(): Response
    {
        return Inertia::render('auth/Auth', ['step' => 'login']);
    }

    public function login(Request $request): \Illuminate\Http\RedirectResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $email = $credentials['email'];
        $ip = $request->ip();
        $emailHash = md5(strtolower(trim($email)));
        $cacheKey = "login_attempts:{$ip}:{$emailHash}";

        $attempts = \Illuminate\Support\Facades\Cache::get($cacheKey, 0);

        if ($attempts >= 5) {
            $recaptchaToken = $request->input('recaptcha_token');
            if (!$recaptchaToken) {
                return back()->withErrors([
                    'recaptcha_token' => 'Vui lòng hoàn thành xác thực reCAPTCHA.',
                ]);
            }

            // Verify Google API
            $response = \Illuminate\Support\Facades\Http::asForm()->post('https://www.google.com/recaptcha/api/siteverify', [
                'secret' => config('services.recaptcha.secret'),
                'response' => $recaptchaToken,
                'remoteip' => $ip,
            ]);

            if (!$response->json('success')) {
                return back()->withErrors([
                    'recaptcha_token' => 'Xác thực reCAPTCHA không hợp lệ. Vui lòng thử lại.',
                ]);
            }
        }

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            // Increment gõ sai và lưu 15 phút
            $newAttempts = $attempts + 1;
            \Illuminate\Support\Facades\Cache::put($cacheKey, $newAttempts, now()->addMinutes(15));

            return back()->withErrors([
                'email' => 'Email hoặc mật khẩu không chính xác.',
            ]);
        }

        // Đăng nhập thành công, kiểm tra xác minh email / OTP
        $user = Auth::user();
        if (is_null($user->email_verified_at)) {
            Auth::logout();
            
            $request->session()->put('otp_email', $user->email);
            $request->session()->put('otp_type', 'signup');

            return redirect('/verify-otp')->withErrors([
                'code' => 'Tài khoản của bạn chưa được xác minh OTP. Vui lòng xác minh để tiếp tục.',
            ]);
        }

        // Đăng nhập thành công, xóa Cache
        \Illuminate\Support\Facades\Cache::forget($cacheKey);
        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    public function checkAttempts(Request $request): \Illuminate\Http\JsonResponse
    {
        $email = $request->input('email');
        if (!$email) {
            return response()->json(['failed_attempts' => 0, 'show_recaptcha' => false]);
        }
        $ip = $request->ip();
        $emailHash = md5(strtolower(trim($email)));
        $cacheKey = "login_attempts:{$ip}:{$emailHash}";
        
        $attempts = \Illuminate\Support\Facades\Cache::get($cacheKey, 0);
        return response()->json([
            'failed_attempts' => $attempts,
            'show_recaptcha' => $attempts >= 5
        ]);
    }

    public function logout(Request $request): \Illuminate\Http\RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/login');
    }
}

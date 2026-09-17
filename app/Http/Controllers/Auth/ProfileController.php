<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\EmailChangeAlert;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\SecurityAuditLog;
use App\Services\Security\SessionRevoker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    private const RECENT_AUTH_TTL = 900; // 15 minutes

    public function show(Request $request): Response
    {
        return Inertia::render('profile/Settings');
    }

    public function updateName(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $user = Auth::user();
        $user->update(['name' => $validated['name']]);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'has_password' => $user->password !== null,
            ],
        ]);
    }

    public function confirmPassword(Request $request): JsonResponse
    {
        $user = Auth::user();
        if ($user->password === null) {
            return response()->json(['errors' => ['password' => 'Tài khoản Google chưa thiết lập mật khẩu. Vui lòng thiết lập mật khẩu trước.']], 422);
        }

        $validated = $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (! Hash::check($validated['password'], $user->password)) {
            return response()->json(['errors' => ['password' => 'Mật khẩu không chính xác.']], 422);
        }

        $request->session()->put('recent_auth_at', time());

        return response()->json(['success' => true]);
    }

    private function hasRecentAuth(Request $request): bool
    {
        $at = $request->session()->get('recent_auth_at');
        $now = time();

        return is_int($at) && $at <= $now && ($now - $at) <= self::RECENT_AUTH_TTL;
    }

    public function updateEmail(Request $request): JsonResponse
    {
        if (! $this->hasRecentAuth($request)) {
            return response()->json(['errors' => ['password' => 'Vui lòng xác nhận mật khẩu trước khi đổi email.']], 403);
        }

        $validated = $request->validate([
            'email' => ['required', 'email', 'unique:users,email,'.Auth::id()],
        ]);

        $email = $validated['email'];

        // Prevent resending OTP if a usable OTP code already exists (locked codes get rotated below)
        $existingOtp = OtpCode::where('email', $email)
            ->where('type', 'change_email')
            ->whereNull('locked_at')
            ->where('expires_at', '>', now())
            ->first();

        if ($existingOtp) {
            $request->session()->put('pending_new_email', $email);
            $request->session()->put('otp_email', $email);
            $request->session()->put('otp_type', 'change_email');

            return response()->json(['success' => true, 'requires_otp' => true]);
        }

        // Generate OTP
        $code = OtpCode::issue($email, 'change_email');

        Mail::to($email)->send(new OtpMail($code, 'signup'));

        $request->session()->put('pending_new_email', $email);
        $request->session()->put('otp_email', $email);
        $request->session()->put('otp_type', 'change_email');

        return response()->json(['success' => true, 'requires_otp' => true]);
    }

    public function verifyEmailOtp(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $newEmail = $request->session()->get('pending_new_email');
        if (! $newEmail) {
            return response()->json(['errors' => ['code' => 'Yêu cầu đổi email không hợp lệ.']], 422);
        }

        $otp = OtpCode::attemptVerify($newEmail, 'change_email', $request->code);

        if (! $otp) {
            return response()->json(['errors' => ['code' => 'Mã xác thực không đúng hoặc đã hết hạn.']], 422);
        }

        $user = Auth::user();
        $oldEmail = $user->email;

        DB::transaction(function () use ($otp, $user, $oldEmail, $newEmail, $request): void {
            $otp->delete();
            $user->forceFill(['email' => $newEmail])->save();
            SessionRevoker::revokeOthers($user, $request->session()->getId());
            SecurityAuditLog::record($user, 'user.email.updated', $user, ['email' => $oldEmail], ['email' => $newEmail], $request->ip(), $request->userAgent());
        });

        // Queued after commit: EmailChangeAlert is ShouldQueue, so an SMTP failure
        // retries via the queue instead of leaving a half-applied state.
        Mail::to($oldEmail)->queue(new EmailChangeAlert($oldEmail, $newEmail));

        $request->session()->regenerate();
        $request->session()->forget(['pending_new_email', 'otp_email', 'otp_type', 'recent_auth_at']);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'has_password' => $user->password !== null,
            ],
        ]);
    }

    public function setupPassword(Request $request): JsonResponse
    {
        $user = Auth::user();
        if ($user->password !== null) {
            return response()->json(['errors' => ['password' => 'Mật khẩu đã tồn tại.']], 422);
        }

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        DB::transaction(function () use ($user, $validated, $request): void {
            $user->update([
                'password' => Hash::make($validated['password']),
            ]);
            SessionRevoker::revokeOthers($user, $request->session()->getId());
        });

        $request->session()->regenerate();
        $request->session()->put('recent_auth_at', time());

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'has_password' => true,
            ],
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $user = Auth::user();
        if ($user->password === null) {
            return response()->json(['errors' => ['password' => 'Không thể đổi mật khẩu chưa thiết lập.']], 422);
        }

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (! Hash::check($validated['current_password'], $user->password)) {
            return response()->json(['errors' => ['current_password' => 'Mật khẩu hiện tại không chính xác.']], 422);
        }

        $email = $user->email;

        // Prevent resending OTP if a usable OTP code already exists (locked codes get rotated below)
        $existingOtp = OtpCode::where('email', $email)
            ->where('type', 'change_password')
            ->whereNull('locked_at')
            ->where('expires_at', '>', now())
            ->first();

        if ($existingOtp) {
            $request->session()->put('pending_new_password', Hash::make($validated['password']));
            $request->session()->put('otp_email', $email);
            $request->session()->put('otp_type', 'change_password');

            return response()->json(['success' => true, 'requires_otp' => true]);
        }

        // Generate OTP to current email
        $code = OtpCode::issue($email, 'change_password');

        Mail::to($email)->send(new OtpMail($code, 'reset'));

        $request->session()->put('pending_new_password', Hash::make($validated['password']));
        $request->session()->put('otp_email', $email);
        $request->session()->put('otp_type', 'change_password');

        return response()->json(['success' => true, 'requires_otp' => true]);
    }

    public function verifyPasswordOtp(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $user = Auth::user();
        $newPasswordHash = $request->session()->get('pending_new_password');

        if (! $newPasswordHash) {
            return response()->json(['errors' => ['code' => 'Yêu cầu đổi mật khẩu không hợp lệ.']], 422);
        }

        $otp = OtpCode::attemptVerify($user->email, 'change_password', $request->code);

        if (! $otp) {
            return response()->json(['errors' => ['code' => 'Mã xác thực không đúng hoặc đã hết hạn.']], 422);
        }

        DB::transaction(function () use ($otp, $user, $newPasswordHash, $request): void {
            $otp->delete();
            $user->update(['password' => $newPasswordHash]);
            SessionRevoker::revokeOthers($user, $request->session()->getId());
        });

        $request->session()->regenerate();
        $request->session()->forget(['pending_new_password', 'otp_email', 'otp_type']);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'has_password' => true,
            ],
        ]);
    }
}

<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return Inertia::render('profile/Settings');
    }

    public function updateName(Request $request)
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
            ]
        ]);
    }

    public function updateEmail(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'unique:users,email,' . Auth::id()],
        ]);

        $email = $validated['email'];

        // Prevent resending OTP if an unexpired OTP code already exists
        $existingOtp = OtpCode::where('email', $email)
            ->where('type', 'change_email')
            ->where('expires_at', '>', now())
            ->first();

        if ($existingOtp) {
            $request->session()->put('pending_new_email', $email);
            $request->session()->put('otp_email', $email);
            $request->session()->put('otp_type', 'change_email');

            return response()->json(['success' => true, 'requires_otp' => true]);
        }

        // Generate OTP
        OtpCode::where('email', $email)->where('type', 'change_email')->delete();
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        OtpCode::create([
            'email' => $email,
            'code' => $code,
            'type' => 'change_email',
            'expires_at' => now()->addMinutes(10),
        ]);

        Mail::to($email)->send(new OtpMail($code, 'signup'));

        $request->session()->put('pending_new_email', $email);
        $request->session()->put('otp_email', $email);
        $request->session()->put('otp_type', 'change_email');

        return response()->json(['success' => true, 'requires_otp' => true]);
    }

    public function verifyEmailOtp(Request $request)
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $newEmail = $request->session()->get('pending_new_email');
        if (!$newEmail) {
            return response()->json(['errors' => ['code' => 'Yêu cầu đổi email không hợp lệ.']], 422);
        }

        $otp = OtpCode::where('email', $newEmail)
            ->where('type', 'change_email')
            ->where('code', $request->code)
            ->where('expires_at', '>', now())
            ->first();

        if (!$otp) {
            return response()->json(['errors' => ['code' => 'Mã xác thực không đúng hoặc đã hết hạn.']], 422);
        }

        $otp->delete();

        $user = Auth::user();
        $user->update(['email' => $newEmail]);
        $request->session()->forget(['pending_new_email', 'otp_email', 'otp_type']);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'has_password' => $user->password !== null,
            ]
        ]);
    }

    public function setupPassword(Request $request)
    {
        $user = Auth::user();
        if ($user->password !== null) {
            return response()->json(['errors' => ['password' => 'Mật khẩu đã tồn tại.']], 422);
        }

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user->update([
            'password' => Hash::make($validated['password']),
        ]);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'has_password' => true,
            ]
        ]);
    }

    public function changePassword(Request $request)
    {
        $user = Auth::user();
        if ($user->password === null) {
            return response()->json(['errors' => ['password' => 'Không thể đổi mật khẩu chưa thiết lập.']], 422);
        }

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (!Hash::check($validated['current_password'], $user->password)) {
            return response()->json(['errors' => ['current_password' => 'Mật khẩu hiện tại không chính xác.']], 422);
        }

        $email = $user->email;

        // Prevent resending OTP if an unexpired OTP code already exists
        $existingOtp = OtpCode::where('email', $email)
            ->where('type', 'change_password')
            ->where('expires_at', '>', now())
            ->first();

        if ($existingOtp) {
            $request->session()->put('pending_new_password', Hash::make($validated['password']));
            $request->session()->put('otp_email', $email);
            $request->session()->put('otp_type', 'change_password');

            return response()->json(['success' => true, 'requires_otp' => true]);
        }

        // Generate OTP to current email
        OtpCode::where('email', $email)->where('type', 'change_password')->delete();
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        OtpCode::create([
            'email' => $email,
            'code' => $code,
            'type' => 'change_password',
            'expires_at' => now()->addMinutes(10),
        ]);

        Mail::to($email)->send(new OtpMail($code, 'reset'));

        $request->session()->put('pending_new_password', Hash::make($validated['password']));
        $request->session()->put('otp_email', $email);
        $request->session()->put('otp_type', 'change_password');

        return response()->json(['success' => true, 'requires_otp' => true]);
    }

    public function verifyPasswordOtp(Request $request)
    {
        $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $user = Auth::user();
        $newPasswordHash = $request->session()->get('pending_new_password');

        if (!$newPasswordHash) {
            return response()->json(['errors' => ['code' => 'Yêu cầu đổi mật khẩu không hợp lệ.']], 422);
        }

        $otp = OtpCode::where('email', $user->email)
            ->where('type', 'change_password')
            ->where('code', $request->code)
            ->where('expires_at', '>', now())
            ->first();

        if (!$otp) {
            return response()->json(['errors' => ['code' => 'Mã xác thực không đúng hoặc đã hết hạn.']], 422);
        }

        $otp->delete();

        $user->update(['password' => $newPasswordHash]);
        $request->session()->forget(['pending_new_password', 'otp_email', 'otp_type']);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'has_password' => true,
            ]
        ]);
    }
}

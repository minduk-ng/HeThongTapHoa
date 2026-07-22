<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;

class SignupController extends Controller
{
    public function show(): Response
    {
        return Inertia::render('auth/Auth', ['step' => 'signup']);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ]);

        $guestRole = Role::where('name', 'guest')->first();
        if ($guestRole) {
            $user->roles()->attach($guestRole->id);
        }

        // Delete any existing OTP for this email
        OtpCode::where('email', $validated['email'])->delete();

        // Generate and save OTP
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        OtpCode::create([
            'email' => $validated['email'],
            'code' => $code,
            'type' => 'signup',
            'expires_at' => now()->addMinutes(10),
        ]);

        // Send OTP email
        Mail::to($validated['email'])->queue(new OtpMail($code, 'signup'));

        // Store email and type in session for OTP verification
        $request->session()->put('otp_email', $validated['email']);
        $request->session()->put('otp_type', 'signup');

        return redirect('/verify-otp');
    }
}

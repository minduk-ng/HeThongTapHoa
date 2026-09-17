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

        // ponytail: issue() replaces the same-purpose OTP only, keeping other purposes intact.
        $code = OtpCode::issue($validated['email'], 'signup');

        // Send OTP email
        Mail::to($validated['email'])->queue(new OtpMail($code, 'signup'));

        // Store email and type in session for OTP verification
        $request->session()->put('otp_email', $validated['email']);
        $request->session()->put('otp_type', 'signup');

        return redirect('/verify-otp');
    }
}

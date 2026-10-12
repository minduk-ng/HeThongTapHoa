<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;

class GoogleAuthController extends Controller
{
    public function redirect(): \Symfony\Component\HttpFoundation\RedirectResponse
    {
        /** @var GoogleProvider $driver */
        $driver = Socialite::driver('google');

        return $driver->stateless()->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        try {
            /** @var GoogleProvider $driver */
            $driver = Socialite::driver('google');
            $googleUser = $driver->stateless()->user();
        } catch (\Exception $e) {
            Log::error('Google Auth callback error: '.$e->getMessage(), [
                'exception' => $e,
                'input' => $request->except(['code', 'state']),
            ]);

            return redirect('/login')->withErrors([
                'email' => 'Không thể xác thực với Google. Vui lòng thử lại.',
            ]);
        }

        // Find user by google_id or email
        $user = User::where('google_id', $googleUser->getId())
            ->orWhere('email', $googleUser->getEmail())
            ->first();

        if ($user) {
            // Update google info if not set
            if (! $user->google_id) {
                $user->update([
                    'google_id' => $googleUser->getId(),
                    'avatar' => $googleUser->getAvatar(),
                ]);
            }
        } else {
            // Create new user
            $user = User::create([
                'google_id' => $googleUser->getId(),
                'name' => $googleUser->getName(),
                'email' => $googleUser->getEmail(),
                'avatar' => $googleUser->getAvatar(),
                'email_verified_at' => now(),
            ]);

            $guestRole = Role::where('name', 'guest')->first();
            if ($guestRole) {
                $user->roles()->attach($guestRole->id);
            }
        }

        $adminEmail = (string) config('services.admin.email');
        if ($adminEmail !== '' && strcasecmp($user->email, $adminEmail) === 0) {
            if (! $user->is_root_admin) {
                $user->update(['is_root_admin' => true]);
            }
            $adminRole = Role::where('name', 'admin')->first();
            if ($adminRole && ! $user->hasRole('admin')) {
                $user->roles()->syncWithoutDetaching([$adminRole->id]);
            }
        }

        Auth::login($user, true);
        $request->session()->regenerate();
        $request->session()->put('session_version', (int) $user->session_version);
        $request->session()->put('recent_auth_at', time());

        return redirect('/');
    }
}

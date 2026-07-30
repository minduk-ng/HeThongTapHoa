<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        return Inertia::render('manager/dashboard/DashboardManager', [
            'filters' => [
                'date_range' => $request->input('date_range', 'today'),
            ]
        ]);
    }
}

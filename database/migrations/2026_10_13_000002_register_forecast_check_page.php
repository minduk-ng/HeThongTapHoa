<?php

use App\Models\Page;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;

return new class extends Migration
{
    public function up(): void
    {
        $page = Page::firstOrCreate(
            ['route_path' => '/planning/forecast-checks'],
            [
                'name' => 'Kiểm tra dự báo 7 ngày',
                'group_name' => 'Dự báo & Kế hoạch',
                'sort_order' => 55,
            ]
        );

        // Attach to roles that have access to /admin/synthetic-datasets or permission planning.experiments
        $roles = Role::whereHas('permissions', fn ($q) => $q->where('name', 'planning.experiments'))
            ->orWhereHas('pages', fn ($q) => $q->where('route_path', '/admin/synthetic-datasets'))
            ->get();

        foreach ($roles as $role) {
            $role->pages()->syncWithoutDetaching([$page->id]);
        }

        Cache::forget('system_page_roles');
    }

    public function down(): void
    {
        Page::where('route_path', '/planning/forecast-checks')->delete();
        Cache::forget('system_page_roles');
    }
};

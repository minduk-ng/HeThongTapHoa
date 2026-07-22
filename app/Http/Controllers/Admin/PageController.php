<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Page;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

class PageController extends Controller
{
    public function index(): Response
    {
        $superAdminUserIds = User::all()
            ->filter(fn ($u) => $u->isAdmin())
            ->pluck('id')
            ->toArray();

        $pages = Page::with('roles')->get()
            ->groupBy('group_name')
            ->sortBy(fn ($group) => $group->min('sort_order'))
            ->flatMap(fn ($group) => $group->sortBy('sort_order'))
            ->values();

        // Optimize: Fetch all user-role assignments at once to avoid N+1 query
        $userRoles = \DB::table('user_roles')
            ->select('role_id', 'user_id')
            ->get()
            ->groupBy('role_id');

        foreach ($pages as $page) {
            $roleIds = $page->roles->pluck('id');
            $roleUserIds = [];
            foreach ($roleIds as $roleId) {
                if ($userRoles->has($roleId)) {
                    $roleUserIds = array_merge($roleUserIds, $userRoles->get($roleId)->pluck('user_id')->toArray());
                }
            }
            $page->user_count = count(array_unique(array_merge($roleUserIds, $superAdminUserIds)));
        }

        return Inertia::render('admin/PagesManager', [
            'pages' => $pages,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'route_path' => ['required', 'string', 'max:255', 'unique:pages,route_path'],
            'group_name' => ['required', 'string', 'max:255'],
        ]);

        Page::create([
            'name' => $validated['name'],
            'route_path' => $validated['route_path'],
            'group_name' => $validated['group_name'],
            'sort_order' => (int) Page::max('sort_order') + 1,
        ]);

        Cache::forget('system_page_roles');

        return redirect()->back()->with('success', 'Tạo trang thành công.');
    }

    public function update(Request $request, Page $page): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'route_path' => ['required', 'string', 'max:255', 'unique:pages,route_path,'.$page->id],
            'group_name' => ['required', 'string', 'max:255'],
        ]);

        $page->update([
            'name' => $validated['name'],
            'route_path' => $validated['route_path'],
            'group_name' => $validated['group_name'],
        ]);

        Cache::forget('system_page_roles');

        return redirect()->back()->with('success', 'Cập nhật trang thành công.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'groups' => ['required', 'array'],
            'groups.*.group_name' => ['required', 'string'],
            'groups.*.pages' => ['array'],
        ]);

        $index = 1;
        foreach ($validated['groups'] as $groupData) {
            $groupName = $groupData['group_name'];
            if (isset($groupData['pages'])) {
                foreach ($groupData['pages'] as $pageId) {
                    Page::where('id', $pageId)->update([
                        'group_name' => $groupName,
                        'sort_order' => $index++,
                    ]);
                }
            }
        }

        Cache::forget('system_page_roles');

        return redirect()->back()->with('success', 'Đã lưu thứ tự trang.');
    }

    public function destroy(Request $request, Page $page): RedirectResponse
    {
        $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (! \Hash::check($request->input('password'), $request->user()->password)) {
            return redirect()->back()->with('error', 'Mật khẩu xác nhận không chính xác.');
        }

        $page->delete();

        Cache::forget('system_page_roles');

        return redirect()->back()->with('success', 'Xóa trang thành công.');
    }
}

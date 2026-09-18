<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Table;
use App\Models\User;
use App\Services\POS\CheckoutLockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CheckoutLockController extends Controller
{
    public function __construct(private CheckoutLockService $locks) {}

    public function acquire(Request $request): JsonResponse
    {
        $tableId = $this->tableId($request);
        $user = $request->user();
        $result = $this->locks->acquire($tableId, $user->id, $user->name ?? 'Nhân viên');

        if (! $result['acquired']) {
            return response()->json([
                'error' => 'Bàn đang được thanh toán bởi '.($result['lock']['user_name'] ?? 'nhân viên khác').'.',
                'lock' => $result['lock'],
            ], 409);
        }

        return response()->json(['lock' => $result['lock']]);
    }

    public function release(Request $request): JsonResponse
    {
        $tableId = $this->tableId($request);
        $user = $request->user();
        $token = $request->validate(['owner_token' => 'required|string|uuid'])['owner_token'];
        $result = $this->locks->release($tableId, $user->id, $token, $this->isPrivileged($user));

        if ($result['forbidden']) {
            return response()->json(['error' => 'Chỉ người giữ lock hoặc quản trị mới được giải phóng.'], 403);
        }

        return response()->json(['released' => true]);
    }

    public function renew(Request $request): JsonResponse
    {
        $tableId = $this->tableId($request);
        $token = $request->validate(['owner_token' => 'required|string|uuid'])['owner_token'];
        $result = $this->locks->renew($tableId, $request->user()->id, $token);

        if ($result['lock'] === null) {
            return response()->json(['error' => 'Lock không tồn tại hoặc đã hết hạn.'], 404);
        }

        if (! $result['renewed']) {
            return response()->json([
                'error' => 'Chỉ người giữ lock mới được gia hạn.',
                'lock' => $result['lock'],
            ], 403);
        }

        return response()->json(['lock' => $result['lock']]);
    }

    public function status(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'table_ids' => 'required|array|min:1|max:50',
            'table_ids.*' => 'integer|min:0',
        ]);

        $locks = [];
        foreach ($validated['table_ids'] as $id) {
            $locks[$id] = $this->locks->status((int) $id);
        }

        return response()->json(['locks' => $locks]);
    }

    private function tableId(Request $request): int
    {
        $validated = $request->validate([
            'table_id' => 'required|integer|min:0',
        ]);

        $tableId = (int) $validated['table_id'];

        // id 0 = virtual "Mang đi" table; real tables must exist.
        abort_unless($tableId === 0 || Table::whereKey($tableId)->exists(), 404);

        return $tableId;
    }

    private function isPrivileged(User $user): bool
    {
        return (bool) ($user->is_root_admin ?? false) || $user->isAdmin();
    }
}

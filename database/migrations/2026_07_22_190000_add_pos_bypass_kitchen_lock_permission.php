<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        DB::table('permissions')->updateOrInsert(
            ['name' => 'pos.bypass_kitchen_lock'],
            ['created_at' => $now, 'updated_at' => $now]
        );

        $adminRoleId = DB::table('roles')->where('name', 'admin')->value('id');
        $permissionId = DB::table('permissions')->where('name', 'pos.bypass_kitchen_lock')->value('id');

        if ($adminRoleId && $permissionId) {
            DB::table('role_permissions')->updateOrInsert([
                'role_id' => $adminRoleId,
                'permission_id' => $permissionId,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('permissions')->where('name', 'pos.bypass_kitchen_lock')->delete();
    }
};

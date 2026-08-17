<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->where('name', 'pos.bypass_kitchen_lock')->delete();
    }

    public function down(): void
    {
        // Không khôi phục — quyền đã bị loại khỏi hệ thống có chủ đích.
    }
};

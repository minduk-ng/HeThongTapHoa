<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class Employee extends Model
{
    protected $fillable = [
        'user_id',
        'employee_code',
        'full_name',
        'position',
        'base_salary',
        'hire_date',
        'is_active',
    ];

    public static function idForUser(?int $userId): ?int
    {
        if ($userId === null) {
            return null;
        }

        return DB::table('employees')->where('user_id', $userId)->value('id');
    }
}

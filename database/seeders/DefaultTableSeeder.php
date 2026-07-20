<?php

namespace Database\Seeders;

use App\Models\Table;
use Illuminate\Database\Seeder;

class DefaultTableSeeder extends Seeder
{
    public function run(): void
    {
        $tables = [
            // Tầng 1
            ['table_number' => 'Bàn 001', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 002', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 003', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 2, 'status' => 'available'],
            ['table_number' => 'Bàn 004', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 6, 'status' => 'available'],

            // Tầng 2
            ['table_number' => 'Bàn 005', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 006', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 007', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 8, 'status' => 'available'],
            ['table_number' => 'Bàn 008', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 2, 'status' => 'available'],

            // Sân vườn / Ngoài trời
            ['table_number' => 'Bàn 009', 'area' => 'Sân vườn (Ngoài trời)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 010', 'area' => 'Sân vườn (Ngoài trời)', 'capacity' => 6, 'status' => 'available'],
        ];

        foreach ($tables as $tData) {
            Table::updateOrCreate(
                ['table_number' => $tData['table_number']],
                $tData
            );
        }
    }
}

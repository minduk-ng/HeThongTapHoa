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
            ['table_number' => 'Bàn 01', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 02', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 03', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 2, 'status' => 'available'],
            ['table_number' => 'Bàn 04', 'area' => 'Tầng 1 (Trong nhà)', 'capacity' => 6, 'status' => 'available'],

            // Tầng 2
            ['table_number' => 'Bàn 05', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 06', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 07', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 8, 'status' => 'available'],
            ['table_number' => 'Bàn 08', 'area' => 'Tầng 2 (Trong nhà)', 'capacity' => 2, 'status' => 'available'],

            // Sân vườn / Ngoài trời
            ['table_number' => 'Bàn 09', 'area' => 'Sân vườn (Ngoài trời)', 'capacity' => 4, 'status' => 'available'],
            ['table_number' => 'Bàn 10', 'area' => 'Sân vườn (Ngoài trời)', 'capacity' => 6, 'status' => 'available'],
        ];

        foreach ($tables as $tData) {
            Table::updateOrCreate(
                ['table_number' => $tData['table_number']],
                $tData
            );
        }
    }
}

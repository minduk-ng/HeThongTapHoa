<?php

namespace Database\Seeders;

use App\Models\Ingredient;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ProductRecipe;
use Illuminate\Database\Seeder;

class DefaultMenuAndInventorySeeder extends Seeder
{
    public function run(): void
    {
        // 1. Categories
        $categoriesData = [
            ['id' => 1, 'name' => 'Cà phê truyền thống', 'sort_order' => 1, 'description' => 'Các loại cà phê phin, pha máy đậm vị'],
            ['id' => 2, 'name' => 'Trà & Trà sữa', 'sort_order' => 2, 'description' => 'Trà hoa quả giải nhiệt & trà sữa béo ngậy'],
            ['id' => 3, 'name' => 'Nước ép & Sinh tố', 'sort_order' => 3, 'description' => 'Nước ép trái cây tươi & sinh tố nguyên chất'],
            ['id' => 4, 'name' => 'Đồ đóng chai', 'sort_order' => 4, 'description' => 'Nước giải khát đóng lon, đóng chai sẵn'],
            ['id' => 5, 'name' => 'Đồ ăn vặt', 'sort_order' => 5, 'description' => 'Món ăn kèm thơm ngon phong phú'],
        ];

        foreach ($categoriesData as $catData) {
            MenuCategory::updateOrCreate(['id' => $catData['id']], $catData);
        }

        // 2. Ingredients (NVL)
        $ingredientsData = [
            ['code' => 'hat-cafe', 'name' => 'Hạt cà phê Rang Xay', 'unit' => 'g', 'stock_quantity' => 10000, 'min_stock_alert' => 500, 'cost_price' => 200],
            ['code' => 'duong-nuoc', 'name' => 'Nước đường Syrup', 'unit' => 'ml', 'stock_quantity' => 5000, 'min_stock_alert' => 500, 'cost_price' => 30],
            ['code' => 'sua-dac', 'name' => 'Sữa đặc Ngôi Sao Phương Nam', 'unit' => 'ml', 'stock_quantity' => 5000, 'min_stock_alert' => 500, 'cost_price' => 80],
            ['code' => 'sua-tuoi', 'name' => 'Sữa tươi thanh trùng', 'unit' => 'ml', 'stock_quantity' => 5000, 'min_stock_alert' => 500, 'cost_price' => 40],
            ['code' => 'ly-nhua', 'name' => 'Ly nhựa 500ml', 'unit' => 'cái', 'stock_quantity' => 1000, 'min_stock_alert' => 100, 'cost_price' => 500],
            ['code' => 'ong-hut', 'name' => 'Ống hút phi 8/12', 'unit' => 'cái', 'stock_quantity' => 1000, 'min_stock_alert' => 100, 'cost_price' => 100],
            ['code' => 'cot-tra', 'name' => 'Cốt trà đen/lài', 'unit' => 'g', 'stock_quantity' => 2000, 'min_stock_alert' => 200, 'cost_price' => 150],
            ['code' => 'chanh-quat', 'name' => 'Chanh / Quất tươi', 'unit' => 'g', 'stock_quantity' => 3000, 'min_stock_alert' => 300, 'cost_price' => 30],
            ['code' => 'siro-dao', 'name' => 'Siro Đào Monin', 'unit' => 'ml', 'stock_quantity' => 2000, 'min_stock_alert' => 200, 'cost_price' => 250],
            ['code' => 'dao-mieng', 'name' => 'Đào ngâm đóng hộp', 'unit' => 'miếng', 'stock_quantity' => 200, 'min_stock_alert' => 30, 'cost_price' => 2000],
            ['code' => 'bot-beo', 'name' => 'Bột béo Milk Cap', 'unit' => 'g', 'stock_quantity' => 3000, 'min_stock_alert' => 300, 'cost_price' => 120],
            ['code' => 'tran-chau', 'name' => 'Trân châu đen', 'unit' => 'g', 'stock_quantity' => 5000, 'min_stock_alert' => 500, 'cost_price' => 50],
            ['code' => 'cam-tuoi', 'name' => 'Cam tươi sành', 'unit' => 'g', 'stock_quantity' => 10000, 'min_stock_alert' => 1000, 'cost_price' => 25],
            ['code' => 'bo-tuoi', 'name' => 'Thịt bơ sáp', 'unit' => 'g', 'stock_quantity' => 5000, 'min_stock_alert' => 500, 'cost_price' => 60],
            ['code' => 'chanh-leo', 'name' => 'Ruột chanh leo tươi', 'unit' => 'g', 'stock_quantity' => 3000, 'min_stock_alert' => 300, 'cost_price' => 45],
            ['code' => 'coca-lon', 'name' => 'Coca Cola Lon 320ml', 'unit' => 'lon', 'stock_quantity' => 200, 'min_stock_alert' => 24, 'cost_price' => 8500],
            ['code' => 'pepsi-lon', 'name' => 'Pepsi Lon 320ml', 'unit' => 'lon', 'stock_quantity' => 200, 'min_stock_alert' => 24, 'cost_price' => 8500],
            ['code' => 'huong-duong-g', 'name' => 'Hạt hướng dương vị dừa', 'unit' => 'g', 'stock_quantity' => 5000, 'min_stock_alert' => 500, 'cost_price' => 70],
            ['code' => 'kho-ga-g', 'name' => 'Khô gà lá chanh', 'unit' => 'g', 'stock_quantity' => 5000, 'min_stock_alert' => 500, 'cost_price' => 140],
            ['code' => 'kho-bo-g', 'name' => 'Khô bò sợi miếng', 'unit' => 'g', 'stock_quantity' => 3000, 'min_stock_alert' => 300, 'cost_price' => 280],
        ];

        $ingredientModels = [];
        foreach ($ingredientsData as $ingData) {
            $ing = Ingredient::updateOrCreate(['code' => $ingData['code']], $ingData);
            $ingredientModels[$ingData['code']] = $ing;
        }

        // 3. Products
        $productsData = [
            // Cà phê
            ['name' => 'Cà phê đen', 'price' => 15000, 'category_id' => 1, 'description' => 'Cà phê phin đậm đà truyền thống'],
            ['name' => 'Cà phê sữa', 'price' => 20000, 'category_id' => 1, 'description' => 'Cà phê phin hòa quyện sữa đặc'],
            ['name' => 'Bạc xỉu', 'price' => 22000, 'category_id' => 1, 'description' => 'Nhiều sữa tươi béo ngậy thơm vị cà phê'],

            // Trà & Trà sữa
            ['name' => 'Trà chanh', 'price' => 15000, 'category_id' => 2, 'description' => 'Trà chanh thanh mát giải nhiệt'],
            ['name' => 'Trà quất', 'price' => 15000, 'category_id' => 2, 'description' => 'Trà quất thơm ngát sảng khoái'],
            ['name' => 'Trà đào', 'price' => 25000, 'category_id' => 2, 'description' => 'Trà đào kèm miếng đào ngâm giòn ngọt'],
            ['name' => 'Trà sữa trân châu truyền thống', 'price' => 25000, 'category_id' => 2, 'description' => 'Trà sữa đậm vị kèm trân châu giòn dai'],

            // Nước ép & Sinh tố
            ['name' => 'Nước cam vắt', 'price' => 25000, 'category_id' => 3, 'description' => 'Nước cam tươi mọng nước dồi dào vitamin C'],
            ['name' => 'Sinh tố bơ', 'price' => 30000, 'category_id' => 3, 'description' => 'Sinh tố bơ sáp béo ngậy quánh mịn'],
            ['name' => 'Chanh leo', 'price' => 20000, 'category_id' => 3, 'description' => 'Nước chanh leo chua ngọt mát lạnh'],

            // Đồ đóng chai
            ['name' => 'Coca Cola', 'price' => 15000, 'category_id' => 4, 'description' => 'Coca Cola lon 320ml ướp lạnh'],
            ['name' => 'Pepsi', 'price' => 15000, 'category_id' => 4, 'description' => 'Pepsi lon 320ml ướp lạnh'],

            // Đồ ăn vặt
            ['name' => 'Hướng dương', 'price' => 15000, 'category_id' => 5, 'description' => 'Đĩa hạt hướng dương rang vị dừa'],
            ['name' => 'Khô gà', 'price' => 25000, 'category_id' => 5, 'description' => 'Đĩa khô gà xé phay lá chanh'],
            ['name' => 'Khô bò', 'price' => 30000, 'category_id' => 5, 'description' => 'Đĩa khô bò sợi cay nồng đậm đà'],
        ];

        $productModels = [];
        foreach ($productsData as $pData) {
            $p = MenuItem::updateOrCreate(
                ['name' => $pData['name']],
                [
                    'price' => $pData['price'],
                    'category_id' => $pData['category_id'],
                    'description' => $pData['description'],
                    'is_available' => true,
                    'vat_rate' => 0,
                ]
            );
            $productModels[$pData['name']] = $p;
        }

        // 4. Recipes Mapping
        $recipesData = [
            'Cà phê đen' => [
                ['ingredient' => 'hat-cafe', 'amount' => 25],
                ['ingredient' => 'duong-nuoc', 'amount' => 20],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Cà phê sữa' => [
                ['ingredient' => 'hat-cafe', 'amount' => 25],
                ['ingredient' => 'sua-dac', 'amount' => 40],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Bạc xỉu' => [
                ['ingredient' => 'hat-cafe', 'amount' => 15],
                ['ingredient' => 'sua-dac', 'amount' => 45],
                ['ingredient' => 'sua-tuoi', 'amount' => 60],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Trà chanh' => [
                ['ingredient' => 'cot-tra', 'amount' => 5],
                ['ingredient' => 'duong-nuoc', 'amount' => 30],
                ['ingredient' => 'chanh-quat', 'amount' => 20],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Trà quất' => [
                ['ingredient' => 'cot-tra', 'amount' => 5],
                ['ingredient' => 'duong-nuoc', 'amount' => 35],
                ['ingredient' => 'chanh-quat', 'amount' => 25],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Trà đào' => [
                ['ingredient' => 'cot-tra', 'amount' => 5],
                ['ingredient' => 'siro-dao', 'amount' => 20],
                ['ingredient' => 'dao-mieng', 'amount' => 2],
                ['ingredient' => 'duong-nuoc', 'amount' => 15],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Trà sữa trân châu truyền thống' => [
                ['ingredient' => 'cot-tra', 'amount' => 8],
                ['ingredient' => 'bot-beo', 'amount' => 30],
                ['ingredient' => 'duong-nuoc', 'amount' => 25],
                ['ingredient' => 'tran-chau', 'amount' => 50],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Nước cam vắt' => [
                ['ingredient' => 'cam-tuoi', 'amount' => 200],
                ['ingredient' => 'duong-nuoc', 'amount' => 20],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Sinh tố bơ' => [
                ['ingredient' => 'bo-tuoi', 'amount' => 150],
                ['ingredient' => 'sua-dac', 'amount' => 30],
                ['ingredient' => 'sua-tuoi', 'amount' => 50],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Chanh leo' => [
                ['ingredient' => 'chanh-leo', 'amount' => 80],
                ['ingredient' => 'duong-nuoc', 'amount' => 40],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Coca Cola' => [
                ['ingredient' => 'coca-lon', 'amount' => 1],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Pepsi' => [
                ['ingredient' => 'pepsi-lon', 'amount' => 1],
                ['ingredient' => 'ly-nhua', 'amount' => 1],
                ['ingredient' => 'ong-hut', 'amount' => 1],
            ],
            'Hướng dương' => [
                ['ingredient' => 'huong-duong-g', 'amount' => 50],
            ],
            'Khô gà' => [
                ['ingredient' => 'kho-ga-g', 'amount' => 70],
            ],
            'Khô bò' => [
                ['ingredient' => 'kho-bo-g', 'amount' => 50],
            ],
        ];

        foreach ($recipesData as $productName => $items) {
            if (!isset($productModels[$productName])) continue;
            $product = $productModels[$productName];

            foreach ($items as $rec) {
                $ingCode = $rec['ingredient'];
                if (!isset($ingredientModels[$ingCode])) continue;
                $ing = $ingredientModels[$ingCode];

                ProductRecipe::updateOrCreate(
                    [
                        'menu_item_id' => $product->id,
                        'ingredient_id' => $ing->id,
                    ],
                    [
                        'amount' => $rec['amount'],
                        'unit' => $ing->unit,
                    ]
                );
            }
        }
    }
}

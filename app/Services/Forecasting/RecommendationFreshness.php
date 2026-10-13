<?php

namespace App\Services\Forecasting;

use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\InventoryRecommendation;
use App\Models\ProductRecipe;
use Illuminate\Validation\ValidationException;

class RecommendationFreshness
{
    /**
     * Assert recommendation is fresh and consistent with current stock, BOM, run, and policy.
     *
     * @throws ValidationException
     */
    public static function assertFresh(InventoryRecommendation $recommendation): void
    {
        // 0. Recommendation must be pending
        if ($recommendation->status !== 'pending') {
            throw ValidationException::withMessages([
                'recommendation' => "Đề xuất đã ở trạng thái '{$recommendation->status}', không thể xem xét lại.",
            ]);
        }

        // 1. Forecast run must be completed and active
        $run = $recommendation->relationLoaded('forecastRun')
            ? $recommendation->forecastRun
            : $recommendation->forecastRun()->first();

        if (! $run || ! $run->is_active || $run->status !== 'completed') {
            throw ValidationException::withMessages([
                'recommendation' => 'Đợt dự báo không còn hiệu lực hoặc chưa hoàn tất.',
            ]);
        }

        // For synthetic runs: fail closed against frozen snapshot, never fallback to live DB.
        if ($run->synthetic_dataset_id !== null) {
            $config = is_array($run->configuration) ? $run->configuration : [];
            $snapshot = $config['snapshot'] ?? null;
            $snapshotHash = is_array($snapshot) ? ($snapshot['content_hash'] ?? null) : null;
            if (empty($snapshotHash) || empty($recommendation->bom_hash) || $recommendation->bom_hash !== $snapshotHash) {
                throw ValidationException::withMessages([
                    'recommendation' => 'Đề xuất mô phỏng không khớp snapshot bất biến của đợt dự báo.',
                ]);
            }

            return;
        }

        // 2. Ingredient stock must match recommendation snapshot
        $ingredient = $recommendation->relationLoaded('ingredient')
            ? $recommendation->ingredient
            : $recommendation->ingredient()->first();

        if (! $ingredient instanceof Ingredient) {
            throw ValidationException::withMessages([
                'recommendation' => 'Nguyên liệu không tồn tại.',
            ]);
        }

        $snapshotStock = $recommendation->stock_snapshot_quantity !== null
            ? (float) $recommendation->stock_snapshot_quantity
            : (float) $recommendation->stock_quantity;

        $currentStock = (float) $ingredient->stock_quantity;

        // ponytail: stock changed since recommendation snapshot -> stale
        if (abs($currentStock - $snapshotStock) > 0.0001) {
            throw ValidationException::withMessages([
                'recommendation' => "Tồn kho nguyên liệu '{$ingredient->name}' đã thay đổi ({$currentStock}) so với thời điểm tính toán ({$snapshotStock}).",
            ]);
        }

        // 3. BOM hash must match current recipes
        $recipes = ProductRecipe::where('ingredient_id', $ingredient->id)->get();
        if ($recipes->isNotEmpty()) {
            $currentBomHash = (new IngredientDemandCalculator)->bomHash($recipes);
        } else {
            $currentBomHash = hash('sha256', "bom:{$ingredient->id}");
        }

        $allRecipesHash = (new IngredientDemandCalculator)->bomHash(ProductRecipe::all());

        if (! empty($recommendation->bom_hash) && $currentBomHash !== $recommendation->bom_hash && $allRecipesHash !== $recommendation->bom_hash) {
            throw ValidationException::withMessages([
                'recommendation' => "Công thức định lượng của nguyên liệu '{$ingredient->name}' đã thay đổi kể từ khi tạo đề xuất.",
            ]);
        }

        // 4. Supplier policy hash & timestamp verification
        if (! empty($recommendation->policy_hash) || $recommendation->supplier_id !== null) {
            $policy = IngredientSupplierPolicy::where('ingredient_id', $ingredient->id)
                ->when($recommendation->supplier_id, fn ($q, $sId) => $q->where('supplier_id', $sId))
                ->orderByDesc('is_primary')
                ->first();

            if ($policy) {
                if (! empty($policy->policy_hash) && ! empty($recommendation->policy_hash) && $policy->policy_hash !== $recommendation->policy_hash) {
                    throw ValidationException::withMessages([
                        'recommendation' => "Chính sách nhà cung cấp của nguyên liệu '{$ingredient->name}' đã thay đổi.",
                    ]);
                }

                if ($policy->updated_at && $recommendation->stock_snapshot_at && $policy->updated_at->gt($recommendation->stock_snapshot_at)) {
                    throw ValidationException::withMessages([
                        'recommendation' => "Chính sách nhà cung cấp của nguyên liệu '{$ingredient->name}' đã được cập nhật sau thời điểm tính toán.",
                    ]);
                }
            }
        }
    }
}

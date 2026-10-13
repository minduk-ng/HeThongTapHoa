<?php

namespace App\Http\Requests\Planning;

use App\Models\ForecastRun;
use App\Models\IngredientSupplierPolicy;
use App\Models\InventoryRecommendation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ReviewProcurementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1'],
            'items.*.recommendation_id' => ['required', 'integer', 'distinct', 'exists:inventory_recommendations,id'],
            'items.*.final_quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.adjustment_reason' => ['nullable', 'string'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $items = $this->input('items', []);
            if (! is_array($items)) {
                return;
            }

            $recIds = collect($items)->pluck('recommendation_id')->filter()->all();
            $recommendations = InventoryRecommendation::with('forecastRun')->whereIn('id', $recIds)->get()->keyBy('id');

            $firstRunId = null;
            foreach ($items as $item) {
                if (! isset($item['recommendation_id']) || ! isset($recommendations[$item['recommendation_id']])) {
                    continue;
                }
                $rec = $recommendations[$item['recommendation_id']];
                $recRun = $rec->relationLoaded('forecastRun') ? $rec->getRelation('forecastRun') : $rec->forecastRun()->first();
                if (! $recRun instanceof ForecastRun) {
                    continue;
                }
                if ($firstRunId === null) {
                    $firstRunId = (int) $rec->forecast_run_id;
                } elseif ((int) $rec->forecast_run_id !== $firstRunId) {
                    $validator->errors()->add('items', 'Tất cả đề xuất phải thuộc cùng một đợt dự báo.');

                    return;
                }
            }

            foreach ($items as $index => $item) {
                if (! isset($item['recommendation_id'], $item['final_quantity'])) {
                    continue;
                }

                if (! isset($recommendations[$item['recommendation_id']])) {
                    continue;
                }
                $rec = $recommendations[$item['recommendation_id']];

                $finalQtyRaw = $item['final_quantity'];
                if (! is_finite((float) $finalQtyRaw)) {
                    $validator->errors()->add("items.{$index}.final_quantity", 'Số lượng phải là số hữu hạn.');

                    continue;
                }
                $finalQty = (float) $finalQtyRaw;
                if ($rec->status !== 'pending') {
                    $validator->errors()->add("items.{$index}.recommendation_id", 'Đề xuất không ở trạng thái chờ duyệt.');
                }
                $suggestedQty = (float) $rec->suggested_quantity;
                $reason = isset($item['adjustment_reason']) ? trim((string) $item['adjustment_reason']) : '';

                // ponytail: reason required (min 3 chars) on manual quantity adjustment
                if (abs($finalQty - $suggestedQty) > 0.0001) {
                    if (mb_strlen($reason) < 3) {
                        $validator->errors()->add(
                            "items.{$index}.adjustment_reason",
                            'Lý do điều chỉnh là bắt buộc và phải có ít nhất 3 ký tự khi số lượng thay đổi.'
                        );
                    }
                }

                $run = $rec->relationLoaded('forecastRun') ? $rec->getRelation('forecastRun') : $rec->forecastRun()->first();
                if (! $run instanceof ForecastRun) {
                    continue;
                }
                $runConfig = $run->configuration;
                $snapshot = is_array($runConfig) ? ($runConfig['snapshot'] ?? null) : null;
                $isSynthetic = $run->synthetic_dataset_id !== null;
                if ($isSynthetic && ! is_array($snapshot)) {
                    $validator->errors()->add("items.{$index}.recommendation_id", 'Thiếu snapshot bất biến cho đợt mô phỏng.');

                    continue;
                }

                $snapPolicy = is_array($snapshot) ? ($snapshot['policies'][$rec->ingredient_id] ?? null) : null;
                $snapIng = is_array($snapshot) ? ($snapshot['ingredients'][$rec->ingredient_id] ?? null) : null;

                if (is_array($snapPolicy)) {
                    $moq = (float) ($snapPolicy['moq'] ?? 0.0);
                    $multiple = (float) ($snapPolicy['order_multiple'] ?? 1.0);
                    $packSize = (float) ($snapPolicy['pack_size'] ?? 0.0);
                } else {
                    $policy = IngredientSupplierPolicy::where('ingredient_id', $rec->ingredient_id)
                        ->when($rec->supplier_id, fn ($q, $s) => $q->where('supplier_id', $s))
                        ->orderByDesc('is_primary')
                        ->first();
                    $moq = $policy ? (float) $policy->moq : 0.0;
                    $multiple = $policy ? (float) $policy->order_multiple : 1.0;
                    $packSize = $policy ? (float) $policy->pack_size : 0.0;
                }

                if ($moq > 0 && $finalQty < $moq - 0.0001) {
                    $validator->errors()->add(
                        "items.{$index}.final_quantity",
                        "Số lượng đặt hàng ({$finalQty}) phải tối thiểu đạt MOQ ({$moq})."
                    );
                }

                if ($multiple > 0) {
                    $ratio = $finalQty / $multiple;
                    if (abs($ratio - round($ratio)) > 0.0001) {
                        $validator->errors()->add(
                            "items.{$index}.final_quantity",
                            "Số lượng đặt hàng ({$finalQty}) phải là bội số của {$multiple}."
                        );
                    }
                }

                $baseUnit = $snapIng['unit'] ?? $rec->unit;
                $purchaseUnit = $snapIng['purchase_unit'] ?? $rec->purchase_unit;
                $conv = $snapIng['unit_conversion'] ?? null;
                if ($conv === null) {
                    $ingLive = $rec->relationLoaded('ingredient') ? $rec->ingredient : null;
                    $conv = $ingLive ? (float) ($ingLive->unit_conversion ?? 1.0) : 1.0;
                } else {
                    $conv = (float) $conv;
                }
                if (empty($snapPolicy) && $packSize <= 0) {
                    $packSize = (float) $conv;
                }

                if (strtolower(trim((string) $baseUnit)) === strtolower(trim((string) $purchaseUnit))) {
                    if (abs($conv - 1.0) > 1e-9) {
                        $validator->errors()->add(
                            "items.{$index}.final_quantity",
                            'Cấu hình đơn vị không nhất quán: đơn vị cơ sở trùng đơn vị mua thì hệ số quy đổi phải bằng 1.'
                        );
                    } elseif ($packSize <= 0) {
                        $validator->errors()->add(
                            "items.{$index}.final_quantity",
                            'Thiếu pack_size hợp lệ cho đề xuất.'
                        );
                    }
                } elseif ($conv > 0 && $packSize > 0 && abs($packSize - $conv) > 1e-6 * max(1.0, $conv)) {
                    $validator->errors()->add(
                        "items.{$index}.final_quantity",
                        'Cấu hình đơn vị không nhất quán: pack_size xung đột unit_conversion.'
                    );
                } elseif ($conv <= 0 || $packSize <= 0) {
                    $validator->errors()->add(
                        "items.{$index}.final_quantity",
                        'Thiếu hệ số quy đổi đơn vị hợp lệ.'
                    );
                }
            }
        });
    }
}

<?php

namespace App\Http\Requests\Planning;

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
            $recommendations = InventoryRecommendation::whereIn('id', $recIds)->get()->keyBy('id');

            foreach ($items as $index => $item) {
                if (! isset($item['recommendation_id'], $item['final_quantity'])) {
                    continue;
                }

                $rec = $recommendations->get($item['recommendation_id']);
                if (! $rec) {
                    continue;
                }

                $finalQty = (float) $item['final_quantity'];
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

                // ponytail: validate MOQ & order multiple against supplier policy
                $policy = IngredientSupplierPolicy::where('ingredient_id', $rec->ingredient_id)
                    ->when($rec->supplier_id, fn ($q, $s) => $q->where('supplier_id', $s))
                    ->orderByDesc('is_primary')
                    ->first();

                if ($policy) {
                    if ($policy->moq > 0 && $finalQty < $policy->moq) {
                        $validator->errors()->add(
                            "items.{$index}.final_quantity",
                            "Số lượng đặt hàng ({$finalQty}) phải tối thiểu đạt MOQ ({$policy->moq})."
                        );
                    }

                    if ($policy->order_multiple > 0) {
                        $ratio = $finalQty / $policy->order_multiple;
                        if (abs($ratio - round($ratio)) > 0.0001) {
                            $validator->errors()->add(
                                "items.{$index}.final_quantity",
                                "Số lượng đặt hàng ({$finalQty}) phải là bội số của {$policy->order_multiple}."
                            );
                        }
                    }
                }
            }
        });
    }
}

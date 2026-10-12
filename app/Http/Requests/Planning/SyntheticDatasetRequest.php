<?php

namespace App\Http\Requests\Planning;

use App\Models\SyntheticDataset;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SyntheticDatasetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('planning.experiments') ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        if ($this->isMethod('DELETE')) {
            return [
                'confirmation' => ['required', 'string'],
            ];
        }

        return [
            'name' => ['required', 'string', 'max:100', 'unique:synthetic_datasets,name'],
            'description' => ['nullable', 'string', 'max:1000'],
            'seed' => ['nullable', 'integer', 'min:1', 'max:2147483646'],
            'configuration' => ['nullable', 'array'],
            'configuration.preset' => ['nullable', 'string', 'in:stable,weekly_seasonal,trend_seasonal,intermittent,level_shift,data_stress'],
            'configuration.days' => ['nullable', 'integer', 'min:1', 'max:730'],
            'configuration.start_date' => ['nullable', 'date_format:Y-m-d'],
            'configuration.menu_item_ids' => ['nullable', 'array', 'max:50'],
            'configuration.menu_item_ids.*' => ['integer', 'distinct', 'exists:menu_items,id'],
            'configuration.base' => ['nullable', 'numeric', 'min:0.01'],
            'configuration.noise' => ['nullable', 'numeric', 'min:0'],
            'configuration.trend' => ['nullable', 'numeric', 'min:-0.01', 'max:0.01'],
            'configuration.zero_demand_rate' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'configuration.outlier_rate' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'configuration.missing_rate' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'configuration.stockout_censor_rate' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'configuration.promotion_rate' => ['nullable', 'numeric', 'min:0', 'max:1'],
        ];
    }

    /**
     * @param  Validator  $validator
     */
    public function withValidator($validator): void
    {
        if ($this->isMethod('DELETE')) {
            $validator->after(function ($validator) {
                $dataset = $this->route('synthetic_dataset') ?? $this->route('syntheticDataset');
                if (! ($dataset instanceof SyntheticDataset)) {
                    $dataset = is_numeric($dataset) ? SyntheticDataset::find((int) $dataset) : null;
                }

                if ($dataset instanceof SyntheticDataset && $this->input('confirmation') !== $dataset->name) {
                    $validator->errors()->add('confirmation', 'Confirmation string must match dataset name.');
                }
            });
        }
    }
}

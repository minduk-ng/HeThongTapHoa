<?php

namespace App\Http\Requests\Planning;

use Illuminate\Foundation\Http\FormRequest;

class RunForecastRequest extends FormRequest
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
            'horizon_days' => ['nullable', 'integer', 'in:7,30'],
            'synthetic_dataset_id' => ['nullable', 'integer', 'exists:synthetic_datasets,id'],
            'cutoff' => ['nullable', 'date_format:Y-m-d'],
        ];
    }
}

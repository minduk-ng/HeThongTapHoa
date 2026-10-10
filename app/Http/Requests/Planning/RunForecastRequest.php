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
            'horizon_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'synthetic_dataset_id' => ['nullable', 'integer', 'exists:synthetic_datasets,id'],
        ];
    }
}

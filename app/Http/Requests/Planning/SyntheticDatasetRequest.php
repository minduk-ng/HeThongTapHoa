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
            'name' => ['required', 'string', 'max:255', 'unique:synthetic_datasets,name'],
            'description' => ['nullable', 'string', 'max:1000'],
            'seed' => ['nullable', 'integer'],
            'configuration' => ['nullable', 'array'],
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

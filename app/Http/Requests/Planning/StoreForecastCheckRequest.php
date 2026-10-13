<?php

namespace App\Http\Requests\Planning;

use App\Models\SyntheticDataset;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreForecastCheckRequest extends FormRequest
{
    public function authorize(): bool
    {
        if (! config('forecasting.synthetic_enabled', false)) {
            return false;
        }

        return $this->user()?->hasPermission('planning.experiments') ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'synthetic_dataset_id' => ['required', 'integer', 'exists:synthetic_datasets,id'],
            'menu_item_id' => ['required', 'integer', 'exists:menu_items,id'],
            'start_date' => ['required', 'date_format:Y-m-d'],
            'submission_token' => ['required', 'string', 'uuid'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $datasetId = $this->input('synthetic_dataset_id');
            $startDateStr = $this->input('start_date');

            if (! is_numeric($datasetId) || ! is_string($startDateStr) || $startDateStr === '') {
                return;
            }

            $dataset = SyntheticDataset::find((int) $datasetId);
            if (! $dataset instanceof SyntheticDataset) {
                return;
            }

            if ($dataset->status !== 'completed') {
                $validator->errors()->add(
                    'synthetic_dataset_id',
                    "Tập dữ liệu chưa hoàn thành (trạng thái: {$dataset->status})."
                );

                return;
            }

            $startDate = CarbonImmutable::parse($startDateStr)->startOfDay();
            $cutoff = $startDate->subDay();
            $endDate = $startDate->addDays(6);

            $datasetStart = $dataset->start_date ? CarbonImmutable::parse((string) $dataset->start_date)->startOfDay() : null;
            $datasetEnd = $dataset->end_date ? CarbonImmutable::parse((string) $dataset->end_date)->startOfDay() : null;

            if ($datasetStart && $cutoff->lt($datasetStart)) {
                $validator->errors()->add(
                    'start_date',
                    "Ngày bắt đầu ({$startDateStr}) không hợp lệ: ngày cắt dữ liệu ({$cutoff->toDateString()}) phải từ ngày bắt đầu của tập dữ liệu ({$datasetStart->toDateString()})."
                );
            }

            if ($datasetEnd && $endDate->gt($datasetEnd)) {
                $validator->errors()->add(
                    'start_date',
                    "Khoảng kiểm tra ({$startDateStr} đến {$endDate->toDateString()}) vượt quá ngày kết thúc của tập dữ liệu ({$datasetEnd->toDateString()})."
                );
            }

            $config = $dataset->configuration;
            $menuItemIds = $config['menu_item_ids'] ?? null;
            $itemId = (int) $this->input('menu_item_id');

            if (is_array($menuItemIds) && ! empty($menuItemIds) && ! in_array($itemId, array_map('intval', $menuItemIds), true)) {
                $validator->errors()->add(
                    'menu_item_id',
                    "Món được chọn không thuộc tập dữ liệu '{$dataset->name}'."
                );
            }
        });
    }
}

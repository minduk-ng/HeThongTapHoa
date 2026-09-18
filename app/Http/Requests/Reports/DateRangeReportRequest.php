<?php

namespace App\Http\Requests\Reports;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;

class DateRangeReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // Support legacy 'from'/'to' parameter aliases seamlessly
        if (! $this->has('start_date') && $this->has('from')) {
            $this->merge(['start_date' => $this->input('from')]);
        }
        if (! $this->has('end_date') && $this->has('to')) {
            $this->merge(['end_date' => $this->input('to')]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'start_date' => ['nullable', 'date_format:Y-m-d'],
            'end_date' => [
                'nullable',
                'date_format:Y-m-d',
                'after_or_equal:start_date',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    $startDate = $this->input('start_date');
                    if (! $startDate || ! $value) {
                        return;
                    }

                    try {
                        $start = Carbon::createFromFormat('Y-m-d', (string) $startDate)->startOfDay();
                        $end = Carbon::createFromFormat('Y-m-d', (string) $value)->startOfDay();

                        if ($start->greaterThan($end)) {
                            return;
                        }

                        // ponytail: 90-day window cap protects against database exhaustion queries
                        if ($start->diffInDays($end) > 90) {
                            $fail('Khoảng thời gian báo cáo không được vượt quá 90 ngày.');
                        }
                    } catch (\Throwable) {
                        // Handled by date_format rule
                    }
                },
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'end_date.after_or_equal' => 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
            'start_date.date_format' => 'Ngày bắt đầu không đúng định dạng Y-m-d.',
            'end_date.date_format' => 'Ngày kết thúc không đúng định dạng Y-m-d.',
        ];
    }

    public function startDate(?string $default = null): string
    {
        $val = $this->validated('start_date') ?? $this->input('start_date');

        return filled($val) ? (string) $val : ($default ?? today()->toDateString());
    }

    public function endDate(?string $default = null): string
    {
        $val = $this->validated('end_date') ?? $this->input('end_date');

        return filled($val) ? (string) $val : ($default ?? today()->toDateString());
    }

    /**
     * @return array{0: string, 1: string}
     */
    public function dateRange(?string $defaultStart = null, ?string $defaultEnd = null): array
    {
        $start = $this->startDate($defaultStart);
        $end = $this->endDate($defaultEnd);

        return ["{$start} 00:00:00", "{$end} 23:59:59"];
    }
}

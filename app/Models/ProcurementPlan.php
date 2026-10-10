<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $plan_code
 * @property int|null $supplier_id
 * @property int|null $forecast_run_id
 * @property string $status
 * @property int|null $approved_by
 * @property Carbon|null $approved_at
 * @property string|null $notes
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Supplier|null $supplier
 * @property-read ForecastRun|null $forecastRun
 * @property-read User|null $approver
 * @property-read Collection<int, ProcurementPlanItem> $items
 */
class ProcurementPlan extends Model
{
    protected $table = 'procurement_plans';

    protected $fillable = [
        'plan_code',
        'supplier_id',
        'forecast_run_id',
        'status',
        'approved_by',
        'approved_at',
        'notes',
    ];

    protected $casts = [
        'supplier_id' => 'integer',
        'forecast_run_id' => 'integer',
        'approved_by' => 'integer',
        'approved_at' => 'datetime',
    ];

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    /** @return BelongsTo<ForecastRun, $this> */
    public function forecastRun(): BelongsTo
    {
        return $this->belongsTo(ForecastRun::class, 'forecast_run_id');
    }

    /** @return BelongsTo<User, $this> */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** @return HasMany<ProcurementPlanItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(ProcurementPlanItem::class, 'procurement_plan_id');
    }
}

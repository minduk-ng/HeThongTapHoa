<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceLine extends Model
{
    protected $fillable = [
        'invoice_id', 'order_item_id', 'menu_item_id', 'name_snapshot',
        'quantity', 'unit_price', 'subtotal', 'vat_rate', 'vat_amount', 'discount_amount',
        'refunded_qty',
    ];

    protected $casts = [
        'quantity' => 'int',
        'unit_price' => 'float',
        'subtotal' => 'float',
        'vat_rate' => 'float',
        'vat_amount' => 'float',
        'discount_amount' => 'float',
        'refunded_qty' => 'int',
    ];

    /** Doanh thu thực thu 1 dòng = giá bán sau giảm giá (đã gồm VAT). */
    public const REVENUE_SQL = 'invoice_lines.subtotal - invoice_lines.discount_amount';

    /** @return BelongsTo<Invoice, $this> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /** Thực thu dòng (PHP-side, khớp REVENUE_SQL). */
    public function getNetAttribute(): float
    {
        return (float) $this->subtotal - (float) $this->discount_amount;
    }

    /** Giới hạn lines thuộc các hóa đơn phát hành trong khoảng ngày.
     * @param  Builder<InvoiceLine>  $query
     * @return Builder<InvoiceLine>
     */
    public function scopeSettledBetween(Builder $query, string $from, string $to): Builder
    {
        return $query
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereNull('invoices.synthetic_dataset_id')
            ->whereBetween('invoices.issued_at', ["{$from} 00:00:00", "{$to} 23:59:59"]);
    }

    /**
     * @param  Builder<InvoiceLine>  $query
     * @return Builder<InvoiceLine>
     */
    public function scopeReal(Builder $query): Builder
    {
        return $query->whereHas('invoice', fn (Builder $q) => $q->whereNull('synthetic_dataset_id'));
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CashMovement extends Model
{
    protected $fillable = ['shift_id', 'type', 'category', 'amount', 'note', 'created_by'];

    protected $casts = ['amount' => 'float'];

    public function shift()
    {
        return $this->belongsTo(Shift::class);
    }
}

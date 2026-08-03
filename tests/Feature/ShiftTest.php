<?php

use App\Models\Shift;

test('shift model lưu đúng trạng thái mở ca', function () {
    $shift = Shift::create([
        'opening_cash' => 200000,
        'status' => 'open',
        'opened_by' => posAdmin()->id,
    ]);

    expect($shift->fresh()->status)->toBe('open');
    expect((float) $shift->fresh()->opening_cash)->toBe(200000.0);
});

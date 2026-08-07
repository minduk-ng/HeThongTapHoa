<?php

use App\Models\Table;

test('tables index la read-only - khong tao hay xoa ban', function () {
    $this->actingAs(posAdmin());

    Table::where('table_number', 'Mang đi')->delete();
    $before = Table::count();

    $dangero = Table::create([
        'table_number' => 'Mang đi The He',
        'area' => 'Trong nhà',
        'status' => 'available',
        'capacity' => 4,
    ]);

    $response = $this->get('/manager/tables');
    $response->assertOk();

    expect(Table::where('table_number', 'Mang đi')->exists())->toBeFalse();
    expect(Table::find($dangero->id))->not->toBeNull();
    expect(Table::count())->toBe($before + 1);
});

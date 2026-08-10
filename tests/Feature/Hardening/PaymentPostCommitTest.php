<?php

use Illuminate\Cache\CacheManager;
use Illuminate\Support\Facades\Cache;

test('checkout van tra success khi cache flush loi (redis down)', function () {
    // Giả lập Redis down: Cache::tags(['pos_tables']) throw, các tags khác (vd dashboard) vẫn chạy thật.
    // CacheManager không có method `tags` thật — đi qua `__call` → store()->tags().
    // partialMock defer các arg khác sang CacheManager thật, nhưng Mockery không gọi constructor
    // nên `$this->app` = null → set lại qua reflection để store() resolve được.
    $mock = Cache::partialMock();
    (new ReflectionProperty(CacheManager::class, 'app'))->setValue($mock, app());

    $mock->shouldReceive('tags')
        ->with(['pos_tables'])
        ->andThrow(new RedisException('Connection refused'));

    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);

    $response = $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
    ]);

    $response->assertStatus(200)->assertJson(['success' => true]);
    $this->assertDatabaseHas('invoices', ['total_amount' => 100000]);
});

<?php

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

test('update product tu choi file khong phai hinh anh lam image', function () {
    $this->actingAs(posAdmin());
    $product = posMenuItem();

    Storage::fake('public');
    $file = UploadedFile::fake()->create('doc.txt', 100);

    $response = $this->post("/manager/products/{$product->id}", [
        'name' => 'Mon T',
        'category_id' => $product->category_id,
        'price' => 20000,
        'image' => $file,
    ]);

    $response->assertSessionHasErrors(['image']);
});

test('update product chap nhan file anh hop le', function () {
    $this->actingAs(posAdmin());
    $product = posMenuItem();

    Storage::fake('public');
    $file = UploadedFile::fake()->image('dish.jpg', 100, 100);

    $response = $this->post("/manager/products/{$product->id}", [
        'name' => 'Mon T',
        'category_id' => $product->category_id,
        'price' => 20000,
        'image' => $file,
    ]);

    $response->assertSessionHasNoErrors();
});

<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Services\Sirv\SirvClientService;
use App\Services\Sirv\SirvFlysystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\Config;
use League\Flysystem\UnableToWriteFile;

test('two uploads with the same product name generate distinct filenames using ulid', function () {
    Carbon::setTestNow(Carbon::create(2026, 9, 17, 10, 0, 0));
    $this->actingAs(posAdmin());
    $category = MenuCategory::firstOrCreate(
        ['name' => 'Do Uong Test'],
        ['sort_order' => 1]
    );
    Storage::fake('public');

    $file1 = UploadedFile::fake()->image('test1.jpg', 100, 100);
    $file2 = UploadedFile::fake()->image('test2.jpg', 100, 100);

    $this->post('/manager/products', [
        'name' => 'Tra Dao Cam Sa',
        'category_id' => $category->id,
        'price' => 30000,
        'image' => $file1,
    ]);

    $this->post('/manager/products', [
        'name' => 'Tra Dao Cam Sa',
        'category_id' => $category->id,
        'price' => 30000,
        'image' => $file2,
    ]);

    $items = MenuItem::where('name', 'Tra Dao Cam Sa')->orderBy('id')->get();
    expect($items)->toHaveCount(2);
    expect($items[0]->image)->not->toBe($items[1]->image);

    // Filename should match slug_ULID.ext format (ULID is 26 characters base32)
    $filename1 = basename((string) $items[0]->image);
    $filename2 = basename((string) $items[1]->image);
    expect($filename1)->toMatch('/^tra-dao-cam-sa_[0-9A-Z]{26}\.jpg$/i');
    expect($filename2)->toMatch('/^tra-dao-cam-sa_[0-9A-Z]{26}\.jpg$/i');
});

test('update product image generates filename using ulid', function () {
    $this->actingAs(posAdmin());
    Storage::fake('public');

    $product = posMenuItem(['name' => 'Ca Phe Muoi']);
    $file = UploadedFile::fake()->image('coffee.webp', 100, 100);

    $this->post("/manager/products/{$product->id}", [
        'name' => 'Ca Phe Muoi Dac Biet',
        'category_id' => $product->category_id,
        'price' => 35000,
        'image' => $file,
    ]);

    $product->refresh();
    $filename = basename((string) $product->image);
    expect($filename)->toMatch('/^ca-phe-muoi-dac-biet_[0-9A-Z]{26}\.webp$/i');
});

test('when store upload fails menu item is not created in database', function () {
    $this->actingAs(posAdmin());
    $category = MenuCategory::firstOrCreate(
        ['name' => 'Do Uong Test'],
        ['sort_order' => 1]
    );

    config()->set('filesystems.disks.sirv', [
        'driver' => 'sirv',
        'enabled' => true,
        'client_id' => 'test-client-id',
        'client_secret' => 'test-client-secret',
        'cdn_url' => 'https://example.sirv.com',
        'base_folder' => '/TapHoa',
    ]);

    Http::fake([
        'api.sirv.com/v2/token' => Http::response(['token' => 'fake-jwt-token'], 200),
        'api.sirv.com/v2/files/upload*' => Http::response(['message' => 'Disk full'], 500),
    ]);

    $file = UploadedFile::fake()->image('new-dish.jpg', 100, 100);

    try {
        $this->withoutExceptionHandling()->post('/manager/products', [
            'name' => 'Mon Moi Fail',
            'category_id' => $category->id,
            'price' => 50000,
            'image' => $file,
        ]);
    } catch (Throwable $e) {
        // Exception expected
    }

    expect(MenuItem::where('name', 'Mon Moi Fail')->exists())->toBeFalse();
});

test('when file upload fails the product image url in database is not updated and old image is retained', function () {
    $this->actingAs(posAdmin());
    Storage::fake('public');

    $product = posMenuItem(['image' => '/storage/products/initial.jpg']);

    config()->set('filesystems.disks.sirv', [
        'driver' => 'sirv',
        'enabled' => true,
        'client_id' => 'test-client-id',
        'client_secret' => 'test-client-secret',
        'cdn_url' => 'https://example.sirv.com',
        'base_folder' => '/TapHoa',
    ]);

    // Mock Sirv token and upload failure
    Http::fake([
        'api.sirv.com/v2/token' => Http::response(['token' => 'fake-jwt-token'], 200),
        'api.sirv.com/v2/files/upload*' => Http::response(['message' => 'Disk full'], 500),
    ]);

    $file = UploadedFile::fake()->image('replacement.jpg', 100, 100);

    try {
        $this->withoutExceptionHandling()->post("/manager/products/{$product->id}", [
            'name' => 'Mon Update',
            'category_id' => $product->category_id,
            'price' => 25000,
            'image' => $file,
        ]);
    } catch (Throwable $e) {
        // Exception expected on upload failure
    }

    $product->refresh();
    expect($product->image)->toBe('/storage/products/initial.jpg');
});

test('sirv adapter throws unable to write file when upload fails', function () {
    $mockClient = Mockery::mock(SirvClientService::class);
    $mockClient->shouldReceive('uploadFile')->andReturn(false);

    $adapter = new SirvFlysystemAdapter($mockClient);

    expect(fn () => $adapter->write('products/test.jpg', 'fake-bytes', new Config))
        ->toThrow(UnableToWriteFile::class);

    $stream = fopen('php://temp', 'r+');
    expect(fn () => $adapter->writeStream('products/test.jpg', $stream, new Config))
        ->toThrow(UnableToWriteFile::class);

    if (is_resource($stream)) {
        fclose($stream);
    }
});

test('sirv client getAccessToken logs only status code without leaking response body', function () {
    Cache::forget('sirv_access_token');
    Log::spy();

    config()->set('filesystems.disks.sirv', [
        'driver' => 'sirv',
        'enabled' => true,
        'client_id' => 'test-client-id',
        'client_secret' => 'test-client-secret',
        'cdn_url' => 'https://example.sirv.com',
        'base_folder' => '/TapHoa',
    ]);

    Http::fake([
        'api.sirv.com/v2/token' => Http::response('SENSITIVE_AUTH_ERROR_BODY', 401),
    ]);

    $service = new SirvClientService;
    $service->getAccessToken();

    Log::shouldHaveReceived('error')->with(
        'Sirv authentication failed',
        ['status' => 401]
    )->once();
});

test('sirv client uploadFile logs only status code without leaking response body', function () {
    Cache::forget('sirv_access_token');
    Log::spy();

    config()->set('filesystems.disks.sirv', [
        'driver' => 'sirv',
        'enabled' => true,
        'client_id' => 'test-client-id',
        'client_secret' => 'test-client-secret',
        'cdn_url' => 'https://example.sirv.com',
        'base_folder' => '/TapHoa',
    ]);

    Http::fake([
        'api.sirv.com/v2/token' => Http::response(['token' => 'valid-token'], 200),
        'api.sirv.com/v2/files/upload*' => Http::response('SENSITIVE_UPLOAD_ERROR_BODY', 500),
    ]);

    $service = new SirvClientService;
    $service->uploadFile('products/test.jpg', 'content');

    Log::shouldHaveReceived('error')->with(
        'Sirv file upload failed',
        ['path' => 'products/test.jpg', 'status' => 500]
    )->once();
});

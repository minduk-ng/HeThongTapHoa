<?php

namespace Tests;

use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Illuminate\Contracts\Broadcasting\Factory;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    private int $financialRequestSequence = 0;

    /**
     * Test env mặc định BROADCAST_CONNECTION=null → channels.php (booted callback
     * của withBroadcasting) không đăng ký channel lên broadcaster thật → không test
     * được auth guard của /broadcasting/auth.
     *
     * Ở đây: broadcasting.default = pusher TRƯỚC khi app boot, để channels.php đăng ký
     * channel lên PusherBroadcaster và /broadcasting/auth chạy đúng guard
     * (guest → 403, user đã đăng nhập → 200).
     *
     * Pusher dùng mock HTTP handler → sign/auth cục bộ, không gọi mạng; mọi broadcast
     * trong test trả về 200 giả mà không thực sự gửi đi.
     */
    public function createApplication()
    {
        $app = parent::createApplication();

        $config = $app->make('config');

        $config->set('broadcasting.connections.pusher', [
            'driver' => 'pusher',
            'key' => 'test-key-1234567890',
            'secret' => 'test-secret-1234567890',
            'app_id' => 'test-app',
            'options' => [
                'useTLS' => false,
                'scheme' => 'http',
                'host' => 'localhost',
                'port' => 9999,
                'timeout' => 5,
            ],
            'client_options' => [
                'handler' => (function () {
                    $stack = new HandlerStack(function () {
                        return new Response(200, [], '{}');
                    });

                    return $stack;
                })(),
                'timeout' => 5,
            ],
        ]);
        $config->set('broadcasting.default', 'pusher');

        $app->booted(function () use ($app, $config) {
            // withBroadcasting (bootstrap/app.php) không load channels.php trong test.
            // Làm đúng thứ tự: Broadcast::routes() rồi require channels.php để channel
            // đăng ký lên PusherBroadcaster (broadcasting.default đã = pusher).
            $broadcast = $app->make(Factory::class);
            $broadcast->routes();
            if (file_exists($channels = $app->basePath('routes/channels.php'))) {
                require $channels;
            }
        });

        return $app;
    }

    public function actingAs($user, $guard = null)
    {
        $this->flushSession();

        return parent::actingAs($user, $guard);
    }

    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $financialRoutes = [
            '/staff/pos/checkout', '/staff/pos/bulk-checkout', '/staff/pos/deposit',
            '/staff/pos/refund', '/staff/shifts/movements',
        ];
        $isFinancial = in_array(parse_url((string) $uri, PHP_URL_PATH), $financialRoutes, true)
            || preg_match('#^/manager/suppliers/\d+/payments$#', (string) parse_url((string) $uri, PHP_URL_PATH));
        if (strtoupper((string) $method) === 'POST' && $isFinancial) {
            $json = is_string($content) ? json_decode($content, true) : null;
            if (is_array($json) && ! array_key_exists('idempotency_key', $json)) {
                $json['idempotency_key'] = 'test-'.(++$this->financialRequestSequence).'-'.bin2hex(random_bytes(8));
                $content = json_encode($json);
            } elseif ($content === null && ! array_key_exists('idempotency_key', $parameters)) {
                $parameters['idempotency_key'] = 'test-'.(++$this->financialRequestSequence).'-'.bin2hex(random_bytes(8));
            }
        }

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }
}

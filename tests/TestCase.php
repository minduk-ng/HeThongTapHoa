<?php

namespace Tests;

use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Illuminate\Contracts\Broadcasting\Factory;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
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
}

<?php

use App\Models\User;

test('unauthenticated users are redirected to login on home', function () {
    $response = $this->get('/');

    $response->assertRedirect('/login');
});

test('authenticated users without dashboard.view permission get 403 on home', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/');

    $response->assertStatus(403);
});

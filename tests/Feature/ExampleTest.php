<?php

test('redirects to login for unauthenticated users', function () {
    $response = $this->get('/');

    $response->assertStatus(302);
});
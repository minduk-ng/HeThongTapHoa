<?php

test('unauthenticated users cannot access home', function () {
    $response = $this->get('/');

    $response->assertStatus(403);
});

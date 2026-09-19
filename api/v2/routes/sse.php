<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 SSE Routes
 */

declare(strict_types=1);

use App\Controllers\SSEController;

$sseController = new SSEController();

route('GET', '/sse/orders', [$sseController, 'orders']);
route('GET', '/sse/notifications', [$sseController, 'notifications']);
route('GET', '/sse/profile', [$sseController, 'profile']);

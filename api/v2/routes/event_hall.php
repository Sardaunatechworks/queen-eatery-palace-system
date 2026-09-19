<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Event Hall Routes
 */

declare(strict_types=1);

use App\Controllers\EventHallController;

$controller = new EventHallController();

// Public availability check & submission
route('GET', '/event-hall/availability', [$controller, 'availability']);
route('POST', '/event-hall/inquire', [$controller, 'inquire']);

// Stats & list (before {id} parameter route)
route('GET', '/event-hall/inquiries/stats', [$controller, 'stats']);
route('GET', '/event-hall/inquiries', [$controller, 'index']);

// Single item actions
route('GET', '/event-hall/inquiries/{id}', [$controller, 'show']);
route('PATCH', '/event-hall/inquiries/{id}/status', [$controller, 'updateStatus']);
route('DELETE', '/event-hall/inquiries/{id}', [$controller, 'delete']);

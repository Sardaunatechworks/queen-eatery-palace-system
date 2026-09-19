<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Notifications Routes
 */

declare(strict_types=1);

use App\Controllers\NotificationController;

$controller = new NotificationController();

// Unread count & bulk actions before parameter routes
route('GET', '/notifications/unread-count', [$controller, 'unreadCount']);
route('POST', '/notifications/mark-all-read', [$controller, 'markAllAsRead']);

// List
route('GET', '/notifications', [$controller, 'index']);

// Single item actions
route('PATCH', '/notifications/{id}/read', [$controller, 'markAsRead']);
route('DELETE', '/notifications/{id}', [$controller, 'delete']);

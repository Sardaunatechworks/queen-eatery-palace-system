<?php
/**
 * Queen Eatery Palace - Application Constants
 */

declare(strict_types=1);

// Application identity
if (!defined('QEP_APP')) {
    define('QEP_APP', true);
}
define('QEP_VERSION', '2.0.0');

// User status values
define('STATUS_ACTIVE', 'active');
define('STATUS_RESTRICTED', 'restricted');
define('STATUS_SUSPENDED', 'suspended');
define('STATUS_DELETED', 'deleted');

// Role names
define('ROLE_ADMIN', 'admin');
define('ROLE_CASHIER', 'cashier');
define('ROLE_KITCHEN', 'kitchen');
define('ROLE_CUSTOMER', 'customer');

// Order status values
define('ORDER_PENDING', 'pending');
define('ORDER_ACCEPTED', 'accepted');
define('ORDER_PREPARING', 'preparing');
define('ORDER_READY', 'ready');
define('ORDER_COMPLETED', 'completed');
define('ORDER_CANCELLED', 'cancelled');

// Payment status values
define('PAYMENT_PENDING', 'pending');
define('PAYMENT_PAID', 'paid');
define('PAYMENT_FAILED', 'failed');
define('PAYMENT_REFUNDED', 'refunded');

// Order source
define('SOURCE_CUSTOMER', 'customer');
define('SOURCE_CASHIER', 'cashier');

// Order type
define('TYPE_PICKUP', 'pickup');
define('TYPE_DELIVERY', 'delivery');
define('TYPE_WALKIN', 'walk_in');

// Menu item approval status
define('APPROVAL_PENDING', 'pending');
define('APPROVAL_APPROVED', 'approved');
define('APPROVAL_REJECTED', 'rejected');

// Notification types
define('NOTIFY_ORDER', 'order');
define('NOTIFY_PAYMENT', 'payment');
define('NOTIFY_STOCK', 'stock');
define('NOTIFY_MENU', 'menu');
define('NOTIFY_SYSTEM', 'system');

// Order number prefix
define('ORDER_PREFIX', 'QEP');

// SSE
define('SSE_RETRY_MS', 5000);  // Client retry interval for SSE reconnect

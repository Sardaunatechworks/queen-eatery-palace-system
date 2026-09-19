<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Application Constants
 */

declare(strict_types=1);

// Application identity
if (!defined('QEP_APP')) {
    define('QEP_APP', true);
}
define('QEP_VERSION', '2.0.0');
define('QEP_APP_NAME', "Queen's Palace Eatery & Event Hall");

// Roles
define('ROLE_SUPER_ADMIN', 'super_admin');
define('ROLE_ADMIN', 'admin');
define('ROLE_CASHIER', 'cashier');
define('ROLE_KITCHEN', 'kitchen');
define('ROLE_CUSTOMER', 'customer');
define('ROLE_STAFF', 'staff');

// Staff roles (for authorization checks)
define('STAFF_ROLES', [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN]);

// Permission constants
define('PERM_MANAGE_REPORTS', 'reports.view');
define('PERM_VIEW_REPORTS', 'reports.view');
define('PERM_EXPORT_REPORTS', 'reports.export');
define('PERM_VIEW_DASHBOARD', 'dashboard.view');

// User status
define('STATUS_ACTIVE', 'active');
define('STATUS_RESTRICTED', 'restricted');
define('STATUS_SUSPENDED', 'suspended');
define('STATUS_DELETED', 'deleted');

// Order status
define('ORDER_PENDING', 'pending');
define('ORDER_ACCEPTED', 'accepted');
define('ORDER_PREPARING', 'preparing');
define('ORDER_READY', 'ready');
define('ORDER_COMPLETED', 'completed');
define('ORDER_CANCELLED', 'cancelled');

// Payment status
define('PAYMENT_PENDING', 'pending');
define('PAYMENT_PAID', 'paid');
define('PAYMENT_FAILED', 'failed');
define('PAYMENT_REFUNDED', 'refunded');

// Payment methods
define('PAY_CASH', 'cash');
define('PAY_PAYSTACK', 'paystack');
define('PAY_TRANSFER', 'transfer');
define('PAY_POS', 'pos');
define('PAYMENT_METHODS', [PAY_CASH, PAY_PAYSTACK, PAY_TRANSFER, PAY_POS]);

// Order source
define('SOURCE_CUSTOMER', 'customer');
define('SOURCE_CASHIER', 'cashier');

// Order type
define('TYPE_PICKUP', 'pickup');
define('TYPE_DELIVERY', 'delivery');
define('TYPE_WALKIN', 'walk_in');

// Menu item approval
define('APPROVAL_PENDING', 'pending');
define('APPROVAL_APPROVED', 'approved');
define('APPROVAL_REJECTED', 'rejected');

// Notification types
define('NOTIFY_ORDER', 'order');
define('NOTIFY_PAYMENT', 'payment');
define('NOTIFY_STOCK', 'stock');
define('NOTIFY_MENU', 'menu');
define('NOTIFY_SYSTEM', 'system');
define('NOTIFY_EVENT_HALL', 'event_hall');

// Order number prefix
define('ORDER_PREFIX', 'QEP');

// SSE
define('SSE_RETRY_MS', 5000);

// Pagination defaults
define('DEFAULT_PAGE_SIZE', 25);
define('MAX_PAGE_SIZE', 200);

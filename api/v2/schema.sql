-- ============================================
-- QUEEN'S PALACE EATERY & EVENT HALL
-- V2 Database Schema
-- PHP 8.2+ / MySQL 8.0+
-- ============================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -------------------------------------------
-- Table: roles
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `display_name` VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`name`, `display_name`) VALUES
  ('super_admin', 'Super Administrator'),
  ('admin', 'Administrator'),
  ('cashier', 'Cashier'),
  ('kitchen', 'Kitchen Staff'),
  ('customer', 'Customer');

-- -------------------------------------------
-- Table: permissions
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `group_name` VARCHAR(50) NOT NULL DEFAULT 'general',
  `display_name` VARCHAR(255) DEFAULT NULL,
  `description` VARCHAR(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_group` (`group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permissions` (`name`, `group_name`, `display_name`, `description`) VALUES
  -- Orders
  ('orders.view', 'orders', 'View Orders', 'View all orders'),
  ('orders.create', 'orders', 'Create Orders', 'Place new orders'),
  ('orders.update_status', 'orders', 'Update Order Status', 'Change order status (accept, prepare, ready, complete)'),
  ('orders.cancel', 'orders', 'Cancel Orders', 'Cancel existing orders'),
  ('orders.delete', 'orders', 'Delete Orders', 'Permanently delete orders'),
  -- Menu
  ('menu.view', 'menu', 'View Menu', 'View menu items'),
  ('menu.create', 'menu', 'Create Menu Items', 'Add new menu items'),
  ('menu.edit', 'menu', 'Edit Menu Items', 'Modify existing menu items'),
  ('menu.delete', 'menu', 'Delete Menu Items', 'Remove menu items'),
  ('menu.approve', 'menu', 'Approve Menu Items', 'Approve or reject pending menu items'),
  ('menu.manage_categories', 'menu', 'Manage Categories', 'Create, edit, and delete categories'),
  -- Inventory
  ('inventory.view', 'inventory', 'View Inventory', 'View inventory levels'),
  ('inventory.adjust', 'inventory', 'Adjust Stock', 'Add or deduct inventory stock'),
  -- Transactions
  ('transactions.view', 'transactions', 'View Transactions', 'View payment transactions'),
  ('transactions.export', 'transactions', 'Export Transactions', 'Export transaction data to CSV/Excel/PDF'),
  -- Reports
  ('reports.view', 'reports', 'View Reports', 'Access reports dashboard'),
  ('reports.export', 'reports', 'Export Reports', 'Export reports to CSV/Excel/PDF'),
  -- Customers
  ('customers.view', 'customers', 'View Customers', 'View customer profiles'),
  ('customers.manage', 'customers', 'Manage Customers', 'Edit and manage customer accounts'),
  -- Staff
  ('staff.view', 'staff', 'View Staff', 'View staff accounts'),
  ('staff.create', 'staff', 'Create Staff', 'Create new staff accounts'),
  ('staff.edit', 'staff', 'Edit Staff', 'Modify staff account details'),
  ('staff.suspend', 'staff', 'Suspend Staff', 'Suspend or restrict staff accounts'),
  ('staff.delete', 'staff', 'Delete Staff', 'Remove staff accounts'),
  ('staff.reset_password', 'staff', 'Reset Staff Password', 'Reset password for staff accounts'),
  ('staff.manage_permissions', 'staff', 'Manage Permissions', 'Edit staff permissions'),
  -- Notifications
  ('notifications.view', 'notifications', 'View Notifications', 'View notification feed'),
  ('notifications.manage', 'notifications', 'Manage Notifications', 'Mark all as read, manage notification settings'),
  -- CMS
  ('cms.view', 'cms', 'View CMS', 'View CMS content'),
  ('cms.edit', 'cms', 'Edit CMS', 'Edit website content via CMS'),
  -- Event Hall
  ('event_hall.view_inquiries', 'event_hall', 'View Event Inquiries', 'View event hall inquiry submissions'),
  ('event_hall.manage_inquiries', 'event_hall', 'Manage Event Inquiries', 'Respond to and manage event inquiries'),
  -- Audit
  ('audit.view', 'audit', 'View Audit Logs', 'Access audit log records'),
  -- Dashboard
  ('dashboard.view', 'dashboard', 'View Dashboard', 'Access admin dashboard overview');

-- -------------------------------------------
-- Table: role_permissions
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Super Admin gets ALL permissions
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'super_admin';

-- Admin gets ALL permissions
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin';

-- Cashier defaults
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'cashier' AND p.name IN (
  'orders.view', 'orders.create', 'orders.update_status',
  'menu.view',
  'inventory.view',
  'transactions.view',
  'notifications.view',
  'dashboard.view'
);

-- Kitchen defaults
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'kitchen' AND p.name IN (
  'orders.view', 'orders.update_status',
  'menu.view',
  'notifications.view'
);

-- -------------------------------------------
-- Table: users
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `phone` VARCHAR(20) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_id` INT UNSIGNED NOT NULL,
  `status` ENUM('active', 'restricted', 'suspended', 'deleted') NOT NULL DEFAULT 'active',
  `profile_image` VARCHAR(500) DEFAULT NULL,
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_role_status` (`role_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: user_permissions (per-user overrides)
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  `granted` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_id`, `permission_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: refresh_tokens
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_token_hash` (`token_hash`),
  INDEX `idx_user_expires` (`user_id`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: staff_suspensions
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_suspensions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `reason` TEXT NOT NULL,
  `restriction_type` ENUM('restricted', 'suspended') NOT NULL DEFAULT 'suspended',
  `start_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_date` DATETIME DEFAULT NULL,
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
  INDEX `idx_user_active` (`user_id`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: categories
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: menu_items
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `menu_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `category_id` INT UNSIGNED DEFAULT NULL,
  `price` DECIMAL(12, 2) NOT NULL,
  `image_path` VARCHAR(500) DEFAULT NULL,
  `quantity_available` INT NOT NULL DEFAULT 0,
  `status` ENUM('available', 'out_of_stock', 'disabled') NOT NULL DEFAULT 'available',
  `approval_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
  `created_by` INT UNSIGNED DEFAULT NULL,
  `approved_by` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_category` (`category_id`),
  INDEX `idx_status_approval` (`status`, `approval_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: inventory
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `menu_item_id` INT UNSIGNED NOT NULL UNIQUE,
  `quantity` INT NOT NULL DEFAULT 0,
  `low_stock_threshold` INT NOT NULL DEFAULT 5,
  `last_updated_by` INT UNSIGNED DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`last_updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_menu_item` (`menu_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: stock_movements
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `inventory_id` INT UNSIGNED NOT NULL,
  `movement_type` ENUM('add', 'deduction', 'adjustment') NOT NULL,
  `quantity` INT NOT NULL,
  `reference_id` VARCHAR(100) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_inventory` (`inventory_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: orders
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_number` VARCHAR(20) NOT NULL UNIQUE,
  `customer_id` INT UNSIGNED DEFAULT NULL,
  `cashier_id` INT UNSIGNED DEFAULT NULL,
  `customer_name` VARCHAR(100) DEFAULT NULL,
  `customer_phone` VARCHAR(20) DEFAULT NULL,
  `source` ENUM('customer', 'cashier') NOT NULL DEFAULT 'customer',
  `order_type` ENUM('pickup', 'delivery', 'walk_in') NOT NULL DEFAULT 'pickup',
  `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `payment_status` ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  `payment_method` ENUM('cash', 'paystack', 'transfer', 'pos') DEFAULT NULL,
  `order_status` ENUM('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `delivery_address` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_order_status` (`order_status`),
  INDEX `idx_payment_status` (`payment_status`),
  INDEX `idx_customer_id` (`customer_id`),
  INDEX `idx_cashier_id` (`cashier_id`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_source` (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: order_items
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` INT UNSIGNED NOT NULL,
  `menu_item_id` INT UNSIGNED DEFAULT NULL,
  `item_name` VARCHAR(200) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(12, 2) NOT NULL,
  `subtotal` DECIMAL(12, 2) NOT NULL,
  `notes` VARCHAR(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON DELETE SET NULL,
  INDEX `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: transactions
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` INT UNSIGNED NOT NULL,
  `transaction_reference` VARCHAR(200) NOT NULL UNIQUE,
  `amount` DECIMAL(12, 2) NOT NULL,
  `payment_method` ENUM('cash', 'paystack', 'transfer', 'pos') NOT NULL DEFAULT 'paystack',
  `payment_status` ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
  `provider` VARCHAR(50) NOT NULL DEFAULT 'paystack',
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  INDEX `idx_reference` (`transaction_reference`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: order_counter
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `order_counter` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `current_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `order_counter` (`current_count`) VALUES (0);

-- -------------------------------------------
-- Table: notifications
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED DEFAULT NULL,
  `role_target` VARCHAR(50) DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `type` ENUM('order', 'payment', 'stock', 'menu', 'system', 'event_hall') NOT NULL DEFAULT 'system',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_role_read` (`role_target`, `is_read`),
  INDEX `idx_user_read` (`user_id`, `is_read`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: cms_content
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `cms_content` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `section` VARCHAR(50) NOT NULL,
  `key_name` VARCHAR(100) NOT NULL,
  `value` LONGTEXT DEFAULT NULL,
  `image_path` VARCHAR(500) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `updated_by` INT UNSIGNED DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_section_key` (`section`, `key_name`),
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: event_hall_inquiries
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `event_hall_inquiries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `preferred_date` DATE NOT NULL,
  `expected_guests` INT DEFAULT NULL,
  `message` TEXT DEFAULT NULL,
  `status` ENUM('new', 'contacted', 'confirmed', 'declined', 'completed') NOT NULL DEFAULT 'new',
  `admin_notes` TEXT DEFAULT NULL,
  `handled_by` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_status` (`status`),
  INDEX `idx_preferred_date` (`preferred_date`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: audit_logs
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED DEFAULT NULL,
  `user_name` VARCHAR(100) DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(50) DEFAULT NULL,
  `entity_id` VARCHAR(50) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `old_values` JSON DEFAULT NULL,
  `new_values` JSON DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_user_action` (`user_id`, `action`),
  INDEX `idx_entity` (`entity_type`, `entity_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Table: password_resets
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

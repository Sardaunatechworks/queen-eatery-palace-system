-- Queen's Palace Eatery & Event Hall
-- Production Database Schema & Pristine Initial Data
-- Generated for cPanel / MySQL 8.0+ Deployment

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+01:00';

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` varchar(50) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_action` (`user_id`,`action`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_audit_logs_user` (`user_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `audit_logs` (`id`, `user_id`, `action`, `entity_type`, `entity_id`, `description`, `ip_address`, `created_at`) VALUES
('1', '1', 'system.fresh_reset', 'system', 'database', 'System database wiped and reset to pristine production state', NULL, '2026-09-13 02:30:13');

DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `categories` (`id`, `name`, `sort_order`, `status`, `created_at`) VALUES
('1', 'Rice Dishes', '1', 'active', '2026-09-13 02:30:12'),
('2', 'Soups & Swallows', '2', 'active', '2026-09-13 02:30:12'),
('3', 'Snacks & Pastries', '3', 'active', '2026-09-13 02:30:12'),
('4', 'Drinks & Beverages', '4', 'active', '2026-09-13 02:30:12'),
('5', 'Chef Specials', '5', 'active', '2026-09-13 02:30:12');

DROP TABLE IF EXISTS `cms_content`;
CREATE TABLE `cms_content` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `section` varchar(50) NOT NULL,
  `key_name` varchar(100) NOT NULL,
  `value` longtext DEFAULT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_section_key` (`section`,`key_name`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `cms_content_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `cms_content` (`id`, `section`, `key_name`, `value`, `image_path`, `updated_by`, `updated_at`) VALUES
('1', 'landing_page', 'data', '{\"hero\":{\"title\":\"Simple Food, \\nGreat Taste.\",\"subtitle\":\"Experience quality dining and host your special events at The Queen\'s Palace Eatery and Event Hall. We keep it simple and professional.\",\"imageUrl\":\"\",\"additionalImages\":[]},\"about\":{\"text\":\"The Queen\'s Palace Eatery and Event Hall serves a variety of local and international dishes prepared with care. Our event hall is also open for weddings, meetings, and celebrations in Dutse.\",\"imageUrl\":\"\"},\"services\":[{\"id\":\"dine-in\",\"icon\":\"Utensils\",\"title\":\"Dine-In\",\"description\":\"Eat comfortably in our well-spaced dining hall with premium service.\",\"imageUrl\":\"\",\"additionalImages\":[]},{\"id\":\"fast-orders\",\"icon\":\"MessageSquare\",\"title\":\"Fast Orders\",\"description\":\"Order online and pick it up or get it delivered to your doorstep.\",\"imageUrl\":\"\",\"additionalImages\":[]},{\"id\":\"event-hall\",\"icon\":\"Calendar\",\"title\":\"Event Hall\",\"description\":\"Large hall with state-of-the-art facilities for weddings and gatherings.\",\"imageUrl\":\"\",\"additionalImages\":[]}],\"eventHall\":{\"description\":\"Our event hall is fully equipped with modern facilities. Perfect for weddings and corporate gatherings.\",\"imageUrls\":[]},\"contact\":{\"phone\":\"+234 813 554 9195\",\"address\":\"Behind Dutse Emirs House, \\nOpposite Glo Office, Dutse, Jigawa State\"}}', NULL, '1', '2026-09-13 02:30:12');

DROP TABLE IF EXISTS `event_hall_inquiries`;
CREATE TABLE `event_hall_inquiries` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `event_type` varchar(100) NOT NULL,
  `preferred_date` date NOT NULL,
  `expected_guests` int(11) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `status` enum('new','contacted','confirmed','declined','completed') NOT NULL DEFAULT 'new',
  `admin_notes` text DEFAULT NULL,
  `handled_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_preferred_date` (`preferred_date`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `inventory`;
CREATE TABLE `inventory` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `menu_item_id` int(10) unsigned NOT NULL,
  `quantity` decimal(12,2) NOT NULL DEFAULT 0.00,
  `low_stock_threshold` decimal(12,2) NOT NULL DEFAULT 5.00,
  `last_updated_by` int(10) unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `menu_item_id` (`menu_item_id`),
  KEY `last_updated_by` (`last_updated_by`),
  CONSTRAINT `inventory_ibfk_1` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_ibfk_2` FOREIGN KEY (`last_updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `menu_items`;
CREATE TABLE `menu_items` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `category_id` int(10) unsigned DEFAULT NULL,
  `price` decimal(12,2) NOT NULL,
  `requires_packaging` tinyint(1) NOT NULL DEFAULT 1,
  `image_path` varchar(500) DEFAULT NULL,
  `quantity_available` int(11) NOT NULL DEFAULT 0,
  `status` enum('available','out_of_stock','disabled') NOT NULL DEFAULT 'available',
  `track_inventory` tinyint(1) NOT NULL DEFAULT 1,
  `unit_of_measure` varchar(20) NOT NULL DEFAULT 'portions',
  `approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  `created_by` int(10) unsigned DEFAULT NULL,
  `approved_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_category` (`category_id`),
  KEY `idx_status_approval` (`status`,`approval_status`),
  CONSTRAINT `menu_items_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `menu_items_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `menu_items_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
  `role_target` varchar(50) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` enum('order','payment','stock','menu','system') NOT NULL DEFAULT 'system',
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_role_read` (`role_target`,`is_read`),
  KEY `idx_user_read` (`user_id`,`is_read`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_notif_combined` (`user_id`,`role_target`,`is_read`,`created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `order_counter`;
CREATE TABLE `order_counter` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `current_count` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `order_counter` (`id`, `current_count`) VALUES
('1', '0');

DROP TABLE IF EXISTS `order_items`;
CREATE TABLE `order_items` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int(10) unsigned NOT NULL,
  `menu_item_id` int(10) unsigned DEFAULT NULL,
  `item_name` varchar(200) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `menu_item_id` (`menu_item_id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_order_menu` (`order_id`,`menu_item_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `order_number` varchar(20) NOT NULL,
  `customer_id` int(10) unsigned DEFAULT NULL,
  `cashier_id` int(10) unsigned DEFAULT NULL,
  `customer_name` varchar(100) DEFAULT NULL,
  `guest_name` varchar(100) DEFAULT NULL,
  `guest_access_token` varchar(64) DEFAULT NULL,
  `idempotency_token` varchar(64) DEFAULT NULL,
  `cashier_name` varchar(100) DEFAULT NULL,
  `source` varchar(50) NOT NULL DEFAULT 'customer',
  `table_id` int(10) unsigned DEFAULT NULL,
  `table_number` varchar(50) DEFAULT NULL,
  `order_type` enum('pickup','delivery','walk_in') NOT NULL DEFAULT 'pickup',
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `packaging_quantity` int(11) NOT NULL DEFAULT 0,
  `packaging_unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `packaging_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `delivery_fee` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `payment_status` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  `payment_method` varchar(50) DEFAULT NULL,
  `payment_timing` enum('before_meal','after_meal') DEFAULT 'after_meal',
  `order_status` varchar(50) NOT NULL DEFAULT 'pending',
  `accepted_by` int(10) unsigned DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `served_at` datetime DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  `rejection_reason` varchar(500) DEFAULT NULL,
  `delivery_address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `cashier_id` (`cashier_id`),
  KEY `idx_order_status` (`order_status`),
  KEY `idx_payment_status` (`payment_status`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_source` (`source`),
  KEY `idx_payment_order_status` (`payment_status`,`order_status`),
  KEY `idx_updated_at` (`updated_at`),
  KEY `idx_orders_status_created` (`order_status`,`payment_status`,`created_at`),
  KEY `idx_orders_packaging_fee` (`packaging_fee`),
  KEY `idx_table_id` (`table_id`),
  KEY `idx_guest_access_token` (`guest_access_token`),
  KEY `idx_idempotency_token` (`idempotency_token`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `password_resets`;
CREATE TABLE `password_resets` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email` (`email`),
  KEY `idx_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `group_name` varchar(50) NOT NULL DEFAULT 'general',
  `display_name` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=265 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permissions` (`id`, `name`, `group_name`, `display_name`, `description`) VALUES
('1', 'manageInventory', 'inventory', 'Manage Inventory', 'Manage inventory stock levels'),
('2', 'manageOrders', 'orders', 'Manage Orders', 'View and manage orders'),
('3', 'manageMenu', 'menu', 'Manage Menu', 'Create, edit, delete menu items'),
('4', 'manageReports', 'reports', 'Manage Reports', 'Generate and view reports'),
('5', 'manageCMS', 'cms', 'Manage CMS', 'Edit landing page CMS content'),
('6', 'manageNotifications', 'notifications', 'Manage Notifications', 'Manage notification system'),
('7', 'manageStaff', 'staff', 'Manage Staff', 'Create, suspend, delete staff accounts'),
('8', 'viewDashboard', 'dashboard', 'View Dashboard', 'Access admin dashboard overview'),
('9', 'orders.view', 'orders', 'View Orders', 'View all orders'),
('10', 'orders.create', 'orders', 'Create Orders', 'Place new orders'),
('11', 'orders.update_status', 'orders', 'Update Order Status', 'Change order status'),
('12', 'orders.cancel', 'orders', 'Cancel Orders', 'Cancel orders'),
('13', 'orders.delete', 'orders', 'Delete Orders', 'Delete orders'),
('14', 'menu.view', 'menu', 'View Menu', 'View menu items'),
('15', 'menu.create', 'menu', 'Create Menu Items', 'Add menu items'),
('16', 'menu.edit', 'menu', 'Edit Menu Items', 'Modify menu items'),
('17', 'menu.delete', 'menu', 'Delete Menu Items', 'Delete menu items'),
('18', 'menu.approve', 'menu', 'Approve Menu Items', 'Approve or reject menu items'),
('19', 'menu.manage_categories', 'menu', 'Manage Categories', 'Manage categories'),
('20', 'inventory.view', 'inventory', 'View Inventory', 'View inventory levels'),
('21', 'inventory.adjust', 'inventory', 'Adjust Stock', 'Adjust stock levels'),
('22', 'transactions.view', 'transactions', 'View Transactions', 'View transactions'),
('23', 'transactions.export', 'transactions', 'Export Transactions', 'Export transactions'),
('24', 'reports.view', 'reports', 'View Reports', 'View reports'),
('25', 'reports.export', 'reports', 'Export Reports', 'Export reports'),
('26', 'customers.view', 'customers', 'View Customers', 'View customer profiles'),
('27', 'customers.manage', 'customers', 'Manage Customers', 'Manage customer profiles'),
('28', 'staff.view', 'staff', 'View Staff', 'View staff accounts'),
('29', 'staff.create', 'staff', 'Create Staff', 'Create staff accounts'),
('30', 'staff.edit', 'staff', 'Edit Staff', 'Edit staff accounts'),
('31', 'staff.suspend', 'staff', 'Suspend Staff', 'Suspend staff accounts'),
('32', 'staff.delete', 'staff', 'Delete Staff', 'Delete staff accounts'),
('33', 'staff.reset_password', 'staff', 'Reset Staff Password', 'Reset staff password'),
('34', 'staff.manage_permissions', 'staff', 'Manage Permissions', 'Manage staff permissions'),
('35', 'notifications.view', 'notifications', 'View Notifications', 'View notifications'),
('36', 'notifications.manage', 'notifications', 'Manage Notifications', 'Manage notifications'),
('37', 'cms.view', 'cms', 'View CMS', 'View CMS content'),
('38', 'cms.edit', 'cms', 'Edit CMS', 'Edit CMS content'),
('39', 'event_hall.view_inquiries', 'event_hall', 'View Event Inquiries', 'View event hall inquiries'),
('40', 'event_hall.manage_inquiries', 'event_hall', 'Manage Event Inquiries', 'Manage event hall inquiries'),
('41', 'audit.view', 'audit', 'View Audit Logs', 'View audit logs'),
('42', 'dashboard.view', 'dashboard', 'View Dashboard', 'Access dashboard overview'),
('93', 'tables.manage', 'tables', 'Manage Restaurant Tables & QR', 'Add, edit, disable tables and regenerate QR codes'),
('94', 'inventory.stock_in', 'inventory', 'Stock In', 'Add stock / restock items'),
('95', 'inventory.wastage', 'inventory', 'Record Wastage', 'Record waste, damaged, or spoilt stock');

DROP TABLE IF EXISTS `refresh_tokens`;
CREATE TABLE `refresh_tokens` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_token_hash` (`token_hash`),
  KEY `idx_user_expires` (`user_id`,`expires_at`),
  CONSTRAINT `refresh_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `restaurant_tables`;
CREATE TABLE `restaurant_tables` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `table_number` varchar(50) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `public_token` varchar(64) NOT NULL,
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `qr_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `current_state` enum('available','occupied','disabled') NOT NULL DEFAULT 'available',
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_table_number` (`table_number`),
  UNIQUE KEY `uk_public_token` (`public_token`),
  KEY `idx_table_status` (`status`,`qr_enabled`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `restaurant_tables` (`id`, `table_number`, `name`, `public_token`, `status`, `qr_enabled`, `current_state`, `created_by`, `created_at`, `updated_at`) VALUES
('1', 'Table 01', 'Dine-In Table 01', 'd134ba2bd1628a129df2dfcd0d002b42', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('2', 'Table 02', 'Dine-In Table 02', 'b0806c021f591b1612c6af2e69120e3f', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('3', 'Table 03', 'Dine-In Table 03', 'ee0fd78e9aaef9d1ed042a9ca21bbb65', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('4', 'Table 04', 'Dine-In Table 04', '660b776bda7893296090b7dfa841e55e', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('5', 'Table 05', 'Dine-In Table 05', 'f9809089875c4f25a09d3a08c07a5926', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('6', 'Table 06', 'Dine-In Table 06', '760379c93c9f917e54f08606a257f7c6', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('7', 'Table 07', 'Dine-In Table 07', '79caa1d1816bb6641ab335c7f483c7b6', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('8', 'Table 08', 'Dine-In Table 08', 'b51943775a9cfc4488ca7f02e213fc7f', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('9', 'Table 09', 'Dine-In Table 09', '40ee7c008a7fc59b80e7a9868eaaccfc', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12'),
('10', 'Table 10', 'Dine-In Table 10', 'c35435439af9a01bbdc0aa0376b7bfa7', 'active', '1', 'available', NULL, '2026-09-13 02:30:12', '2026-09-13 02:30:12');

DROP TABLE IF EXISTS `role_permissions`;
CREATE TABLE `role_permissions` (
  `role_id` int(10) unsigned NOT NULL,
  `permission_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
('1', '1'),
('1', '2'),
('1', '3'),
('1', '4'),
('1', '5'),
('1', '6'),
('1', '7'),
('1', '8'),
('1', '9'),
('1', '10'),
('1', '11'),
('1', '12'),
('1', '13'),
('1', '14'),
('1', '15'),
('1', '16'),
('1', '17'),
('1', '18'),
('1', '19'),
('1', '20'),
('1', '21'),
('1', '22'),
('1', '23'),
('1', '24'),
('1', '25'),
('1', '26'),
('1', '27'),
('1', '28'),
('1', '29'),
('1', '30'),
('1', '31'),
('1', '32'),
('1', '33'),
('1', '34'),
('1', '35'),
('1', '36'),
('1', '37'),
('1', '38'),
('1', '39'),
('1', '40'),
('1', '41'),
('1', '42'),
('1', '93'),
('1', '94'),
('1', '95'),
('2', '2'),
('2', '6'),
('2', '9'),
('2', '10'),
('2', '11'),
('2', '14'),
('2', '20'),
('2', '22'),
('2', '35'),
('2', '42'),
('3', '2'),
('3', '3'),
('3', '9'),
('3', '11'),
('3', '14'),
('3', '15'),
('3', '20'),
('3', '35'),
('5', '1'),
('5', '2'),
('5', '3'),
('5', '4'),
('5', '5'),
('5', '6'),
('5', '7'),
('5', '8'),
('5', '9'),
('5', '10'),
('5', '11'),
('5', '12'),
('5', '13'),
('5', '14'),
('5', '15'),
('5', '16'),
('5', '17'),
('5', '18'),
('5', '19'),
('5', '20'),
('5', '21'),
('5', '22'),
('5', '23'),
('5', '24'),
('5', '25'),
('5', '26'),
('5', '27'),
('5', '28'),
('5', '29'),
('5', '30'),
('5', '31'),
('5', '32'),
('5', '33'),
('5', '34'),
('5', '35'),
('5', '36'),
('5', '37'),
('5', '38'),
('5', '39'),
('5', '40'),
('5', '41'),
('5', '42'),
('5', '93'),
('5', '94'),
('5', '95');

DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `display_name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`id`, `name`, `display_name`) VALUES
('1', 'admin', 'Administrator'),
('2', 'cashier', 'Cashier'),
('3', 'kitchen', 'Kitchen Staff'),
('4', 'customer', 'Customer'),
('5', 'super_admin', 'Super Administrator');

DROP TABLE IF EXISTS `staff_suspensions`;
CREATE TABLE `staff_suspensions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `reason` text NOT NULL,
  `restriction_type` enum('restricted','suspended') NOT NULL DEFAULT 'suspended',
  `start_date` datetime NOT NULL DEFAULT current_timestamp(),
  `end_date` datetime DEFAULT NULL,
  `created_by` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `staff_suspensions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `staff_suspensions_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `stock_movements`;
CREATE TABLE `stock_movements` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `inventory_id` int(10) unsigned NOT NULL,
  `movement_type` enum('stock_in','wastage','damaged','order_deduct','order_restore','manual_adjust','initial') NOT NULL,
  `quantity` int(11) NOT NULL,
  `quantity_before` decimal(12,2) DEFAULT NULL,
  `quantity_after` decimal(12,2) DEFAULT NULL,
  `reference_id` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_inv_created` (`inventory_id`,`created_at`),
  CONSTRAINT `stock_movements_ibfk_1` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_movements_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `system_settings`;
CREATE TABLE `system_settings` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `key_name` varchar(100) NOT NULL,
  `value` text NOT NULL,
  `display_name` varchar(255) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `key_name` (`key_name`),
  KEY `idx_key_name` (`key_name`)
) ENGINE=InnoDB AUTO_INCREMENT=73 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `system_settings` (`id`, `key_name`, `value`, `display_name`, `description`, `updated_by`, `updated_at`) VALUES
('1', 'takeaway_pack_price', '300.00', 'Takeaway Pack Price', 'Cost per takeaway pack container in NGN', NULL, '2026-09-13 01:49:53'),
('16', 'qr_payment_policy', 'customer_choice', 'QR Table Ordering Payment Policy', 'Payment timing policy: customer_choice, before_meal, or after_meal', NULL, '2026-09-12 14:44:27');

DROP TABLE IF EXISTS `transactions`;
CREATE TABLE `transactions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int(10) unsigned NOT NULL,
  `transaction_reference` varchar(200) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` varchar(50) NOT NULL DEFAULT 'paystack',
  `payment_status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
  `provider` varchar(50) NOT NULL DEFAULT 'paystack',
  `verified_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `transaction_reference` (`transaction_reference`),
  KEY `order_id` (`order_id`),
  KEY `idx_reference` (`transaction_reference`),
  KEY `idx_payment_status` (`payment_status`),
  KEY `idx_transactions_created_at` (`created_at`),
  CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `user_permissions`;
CREATE TABLE `user_permissions` (
  `user_id` int(10) unsigned NOT NULL,
  `permission_id` int(10) unsigned NOT NULL,
  `granted` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `user_permissions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role_id` int(10) unsigned NOT NULL,
  `status` enum('active','restricted','suspended','deleted') NOT NULL DEFAULT 'active',
  `is_super_admin` tinyint(1) NOT NULL DEFAULT 0,
  `profile_image` varchar(500) DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_email` (`email`),
  KEY `idx_role_status` (`role_id`,`status`),
  KEY `idx_users_created_at` (`created_at`),
  KEY `idx_users_status` (`status`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` (`id`, `full_name`, `email`, `phone`, `address`, `password_hash`, `role_id`, `status`, `is_super_admin`, `profile_image`, `last_login_at`, `created_at`, `updated_at`) VALUES
('1', 'Queen\'s Palace Super Admin', 'admin@queenspalaceeatery.com', '+2348135549195', NULL, '$2y$12$LYTNuQS9528yffwKdWHj2.v2nLBcHYnf09gvnmqYe98Ey6JNxuM4O', '5', 'active', '0', NULL, NULL, '2026-09-13 02:30:13', '2026-09-13 02:30:13');

SET FOREIGN_KEY_CHECKS = 1;

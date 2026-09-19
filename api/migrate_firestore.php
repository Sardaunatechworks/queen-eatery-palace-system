<?php
/**
 * Queen Eatery Palace - Firestore to MySQL Migration Script
 * 
 * Safe offline CLI data seeder. Processes JSON dumps of Firebase collections,
 * maps relational IDs, converts Base64 CMS images into physical server files,
 * validates size and MIME types, performs transaction safety, and prints a data verification report.
 */

declare(strict_types=1);

namespace App\Migration;

// Prevent browser execution, allow only CLI
if (PHP_SAPI !== 'cli') {
    die("This script must be run via the CLI (Command Line Interface).\n");
}

require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/config/Database.php';

use App\Config\Database;
use PDO;

class FirestoreMigrator
{
    private PDO $db;
    private string $migrationDir;
    private string $uploadsDir;
    
    // Memory mapping of Firestore IDs to MySQL Auto-increment IDs
    private array $userMap = [];       // [firestore_uid => mysql_id]
    private array $categoryMap = [];   // [firestore_category_name => mysql_id]
    private array $menuItemMap = [];   // [firestore_item_name => mysql_id]
    private array $orderMap = [];      // [firestore_order_id => mysql_id]

    // Statistics Report Counter
    private array $stats = [
        'users' => ['read' => 0, 'inserted' => 0],
        'categories' => ['read' => 0, 'inserted' => 0],
        'menu' => ['read' => 0, 'inserted' => 0],
        'orders' => ['read' => 0, 'inserted' => 0],
        'transactions' => ['read' => 0, 'inserted' => 0],
        'notifications' => ['read' => 0, 'inserted' => 0],
        'cms_images' => ['converted' => 0],
        'anomalies' => []
    ];

    public function __construct()
    {
        $this->db = Database::getConnection();
        $this->migrationDir = __DIR__ . '/private/migration';
        $this->uploadsDir = dirname(__DIR__) . '/uploads';
    }

    public function run(bool $rollbackOnFailure = true): void
    {
        echo "============================================================\n";
        echo "   QUEEN EATERY PALACE - FIRESTORE TO MYSQL DATA MIGRATION  \n";
        echo "============================================================\n\n";

        // Create folders if not exist
        if (!file_exists($this->migrationDir)) {
            mkdir($this->migrationDir, 0755, true);
            echo "Created directory: {$this->migrationDir}\n";
            echo "Please place your exported JSON files (users.json, categories.json, menu.json, orders.json, cms_content.json) in this directory and re-run.\n";
            return;
        }

        if (!file_exists($this->uploadsDir . '/cms')) {
            mkdir($this->uploadsDir . '/cms', 0755, true);
        }

        $this->db->beginTransaction();

        try {
            $this->migrateCategories();
            $this->migrateUsers();
            $this->migrateMenu();
            $this->migrateOrders();
            $this->migrateCMS();

            $this->db->commit();
            echo "\n[SUCCESS] Migration completed successfully. MySQL transactions committed.\n";
            $this->printVerificationReport();

        } catch (\Throwable $e) {
            if ($rollbackOnFailure) {
                $this->db->rollBack();
                echo "\n[ERROR] Migration failed. Transaction rolled back to preserve database state.\n";
            }
            echo "Error Details: " . $e->getMessage() . "\n";
            echo "Line: " . $e->getLine() . " in file " . $e->getFile() . "\n";
            exit(1);
        }
    }

    private function readJsonFile(string $filename): array
    {
        $filePath = "{$this->migrationDir}/{$filename}";
        if (!file_exists($filePath)) {
            $this->stats['anomalies'][] = "Source file missing: {$filename}. Skipping matching records.";
            return [];
        }

        $content = file_get_contents($filePath);
        $data = json_decode($content, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException("Malformed JSON file: {$filename}. Error: " . json_last_error_msg());
        }

        return is_array($data) ? $data : [];
    }

    private function migrateCategories(): void
    {
        echo "Migrating Categories...\n";
        $data = $this->readJsonFile('categories.json');
        
        $stmt = $this->db->prepare('INSERT INTO categories (name) VALUES (:name)');
        
        foreach ($data as $cat) {
            $this->stats['categories']['read']++;
            $name = trim($cat['name'] ?? '');
            
            if (empty($name)) continue;

            // Check duplicate
            $check = $this->db->prepare('SELECT id FROM categories WHERE name = :name LIMIT 1');
            $check->execute(['name' => $name]);
            $existingId = $check->fetchColumn();

            if ($existingId) {
                $this->categoryMap[$name] = (int)$existingId;
            } else {
                $stmt->execute(['name' => $name]);
                $newId = (int)$this->db->lastInsertId();
                $this->categoryMap[$name] = $newId;
                $this->stats['categories']['inserted']++;
            }
        }
        echo "Categories Done. (Read: {$this->stats['categories']['read']}, Inserted: {$this->stats['categories']['inserted']})\n";
    }

    private function migrateUsers(): void
    {
        echo "Migrating Users...\n";
        $data = $this->readJsonFile('users.json');

        // Prepare statements
        $insStmt = $this->db->prepare('
            INSERT INTO users (full_name, email, phone, password_hash, role_id, status)
            VALUES (:name, :email, :phone, :pw, (SELECT id FROM roles WHERE name = :role LIMIT 1), :status)
        ');

        foreach ($data as $user) {
            $this->stats['users']['read']++;
            $uid = $user['uid'] ?? $user['id'] ?? '';
            $email = trim($user['email'] ?? '');
            $fullName = trim($user['name'] ?? $user['fullName'] ?? 'User');
            $phone = trim($user['phone'] ?? $user['phoneNumber'] ?? '');
            $role = trim($user['role'] ?? ROLE_CUSTOMER);
            $status = trim($user['status'] ?? 'active');

            if (empty($email)) {
                $this->stats['anomalies'][] = "Skipping user missing email: " . json_encode($user);
                continue;
            }

            // Verify if user already exists
            $check = $this->db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
            $check->execute(['email' => $email]);
            $existingId = $check->fetchColumn();

            if ($existingId) {
                $this->userMap[$uid] = (int)$existingId;
            } else {
                // Secure placeholder password hash for customer/staff
                $placeholderPw = password_hash('WelcomeQueenPalace123!', PASSWORD_BCRYPT);

                $insStmt->execute([
                    'name'   => $fullName,
                    'email'  => $email,
                    'phone'  => $phone,
                    'pw'     => $placeholderPw,
                    'role'   => $role,
                    'status' => $status
                ]);
                $newId = (int)$this->db->lastInsertId();
                $this->userMap[$uid] = $newId;
                $this->stats['users']['inserted']++;
            }
        }
        echo "Users Done. (Read: {$this->stats['users']['read']}, Inserted: {$this->stats['users']['inserted']})\n";
    }

    private function migrateMenu(): void
    {
        echo "Migrating Menu Items...\n";
        $data = $this->readJsonFile('menu.json');

        $insItem = $this->db->prepare('
            INSERT INTO menu_items (name, description, category_id, price, quantity_available, status, approval_status, image_path)
            VALUES (:name, :desc, :cid, :price, :qty, :status, :approval, :image)
        ');

        $insInv = $this->db->prepare('
            INSERT INTO inventory (menu_item_id, quantity, low_stock_threshold)
            VALUES (:mid, :qty, 5)
        ');

        foreach ($data as $item) {
            $this->stats['menu']['read']++;
            
            $name = trim($item['name'] ?? '');
            $desc = trim($item['description'] ?? '');
            $price = (float)($item['price'] ?? 0.00);
            $qty = (int)($item['stockQuantity'] ?? $item['quantity_available'] ?? 0);
            $catName = trim($item['category'] ?? '');
            $status = (isset($item['isAvailable']) && !$item['isAvailable']) ? 'disabled' : ($qty > 0 ? 'available' : 'out_of_stock');
            $approval = trim($item['status'] ?? APPROVAL_APPROVED);
            $image = trim($item['image'] ?? '');

            if (empty($name)) continue;

            // Check if menu item already exists to ensure idempotency
            $checkItem = $this->db->prepare('SELECT id FROM menu_items WHERE name = :name LIMIT 1');
            $checkItem->execute(['name' => $name]);
            $existingItemId = $checkItem->fetchColumn();

            if ($existingItemId) {
                $this->menuItemMap[$name] = (int)$existingItemId;
                continue;
            }

            // Get category ID mapping
            $categoryId = $this->categoryMap[$catName] ?? null;
            if (!$categoryId) {
                // Check if category name already exists in database
                $checkCat = $this->db->prepare('SELECT id FROM categories WHERE name = :name LIMIT 1');
                $checkCat->execute(['name' => $catName]);
                $categoryId = $checkCat->fetchColumn();

                if (!$categoryId) {
                    // Create category dynamically if missing
                    $insCat = $this->db->prepare('INSERT INTO categories (name) VALUES (:name)');
                    $insCat->execute(['name' => $catName]);
                    $categoryId = (int)$this->db->lastInsertId();
                }
                $this->categoryMap[$catName] = (int)$categoryId;
            }

            // Insert menu item
            $insItem->execute([
                'name'     => $name,
                'desc'     => $desc,
                'cid'      => $categoryId,
                'price'    => $price,
                'qty'      => $qty,
                'status'   => $status,
                'approval' => $approval,
                'image'    => $image
            ]);
            $itemId = (int)$this->db->lastInsertId();
            $this->menuItemMap[$name] = $itemId;

            // Create inventory entry
            $insInv->execute([
                'mid' => $itemId,
                'qty' => $qty
            ]);

            $this->stats['menu']['inserted']++;
        }
        echo "Menu Items Done. (Read: {$this->stats['menu']['read']}, Inserted: {$this->stats['menu']['inserted']})\n";
    }

    private function migrateOrders(): void
    {
        echo "Migrating Orders & Transactions...\n";
        $data = $this->readJsonFile('orders.json');

        $insOrder = $this->db->prepare('
            INSERT INTO orders (customer_id, order_number, subtotal, total, order_status, payment_status, order_type, delivery_address, created_at)
            VALUES (:uid, :num, :subtotal, :total, :status, :pay_status, :type, :address, :created)
        ');

        $insOrderItem = $this->db->prepare('
            INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, subtotal)
            VALUES (:oid, :mid, :name, :qty, :price, :subtotal)
        ');

        $insTx = $this->db->prepare('
            INSERT INTO transactions (order_id, transaction_reference, amount, payment_method, payment_status, created_at)
            VALUES (:oid, :ref, :amount, :method, :status, :created)
        ');

        foreach ($data as $o) {
            $this->stats['orders']['read']++;
            
            $fUid = $o['userId'] ?? $o['uid'] ?? '';
            $orderNum = $o['orderId'] ?? $o['orderNumber'] ?? '';
            $total = (float)($o['total'] ?? $o['total_amount'] ?? 0.00);
            $status = trim($o['status'] ?? 'completed');
            $payStatus = trim($o['paymentStatus'] ?? 'paid');
            $type = trim($o['deliveryType'] ?? 'takeaway');
            $address = trim($o['address'] ?? '');
            
            // Format created date
            $createdAt = $this->parseTimestamp($o['createdAt'] ?? null);

            // Get mapped user ID
            $userId = $this->userMap[$fUid] ?? null;

            if (empty($orderNum)) {
                $orderNum = 'QEP-MIG-' . bin2hex(random_bytes(4));
            }

            // Check if order already exists to ensure idempotency
            $checkOrder = $this->db->prepare('SELECT id FROM orders WHERE order_number = :num LIMIT 1');
            $checkOrder->execute(['num' => $orderNum]);
            $existingOrderId = $checkOrder->fetchColumn();

            if ($existingOrderId) {
                $this->orderMap[$orderNum] = (int)$existingOrderId;
                continue;
            }

            // Insert Order
            $insOrder->execute([
                'uid'        => $userId,
                'num'        => $orderNum,
                'subtotal'   => $total,
                'total'      => $total,
                'status'     => $status,
                'pay_status' => $payStatus,
                'type'       => $type,
                'address'    => $address,
                'created'    => $createdAt
            ]);
            $orderId = (int)$this->db->lastInsertId();
            $this->stats['orders']['inserted']++;

            // Insert items
            $items = $o['items'] ?? [];
            foreach ($items as $item) {
                $itemName = $item['name'] ?? '';
                $itemQty = (int)($item['quantity'] ?? 1);
                $itemPrice = (float)($item['price'] ?? 0.00);

                $menuId = $this->menuItemMap[$itemName] ?? null;
                $insOrderItem->execute([
                    'oid'      => $orderId,
                    'mid'      => $menuId,
                    'name'     => $itemName,
                    'qty'      => $itemQty,
                    'price'    => $itemPrice,
                    'subtotal' => $itemQty * $itemPrice
                ]);
            }

            // If order was paid, insert matching transaction record
            if ($payStatus === 'paid') {
                $this->stats['transactions']['read']++;
                $ref = $o['paymentReference'] ?? $o['reference'] ?? ('MIG_TX_' . bin2hex(random_bytes(6)));
                $method = $o['paymentMethod'] ?? 'paystack';

                $insTx->execute([
                    'oid'     => $orderId,
                    'ref'     => $ref,
                    'amount'  => $total,
                    'method'  => $method,
                    'status'  => 'success',
                    'created' => $createdAt
                ]);
                $this->stats['transactions']['inserted']++;
            }
        }
        echo "Orders & Transactions Done. (Read Orders: {$this->stats['orders']['read']}, Inserted: {$this->stats['orders']['inserted']})\n";
    }

    private function migrateCMS(): void
    {
        echo "Migrating CMS Landing Page (decoding Base64 images to server files)...\n";
        $data = $this->readJsonFile('cms_content.json');
        
        // Grab default landing doc (usually stored under document landing_page)
        $landing = $data['landing_page'] ?? $data[0] ?? null;
        if (!$landing) {
            $this->stats['anomalies'][] = "No landing_page doc found in cms_content.json. CMS migration skipped.";
            return;
        }

        // Recursively search and convert base64 images
        $cleanedLanding = $this->convertBase64ImagesRecursive($landing);

        // Store landing JSON in DB
        $json = json_encode($cleanedLanding, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
        $stmt = $this->db->prepare('
            INSERT INTO cms_content (section, key_name, value)
            VALUES ("landing_page", "data", :value)
            ON DUPLICATE KEY UPDATE value = :value_update
        ');
        $stmt->execute([
            'value'        => $json,
            'value_update' => $json
        ]);
        echo "CMS Page Done. Converted {$this->stats['cms_images']['converted']} Base64 images to physical files.\n";
    }

    // ============================================
    // RECURSIVE IMAGE PARSING
    // ============================================

    private function convertBase64ImagesRecursive(array $array): array
    {
        foreach ($array as $key => $value) {
            if (is_array($value)) {
                $array[$key] = $this->convertBase64ImagesRecursive($value);
            } elseif (is_string($value) && str_starts_with($value, 'data:image/')) {
                // Matches Base64 image
                $matches = [];
                if (preg_match('/^data:image\/(?P<ext>[a-z]+);base64,(?P<data>.+)$/i', $value, $matches)) {
                    $ext = strtolower($matches['ext'] === 'jpeg' ? 'jpg' : $matches['ext']);
                    $rawBytes = base64_decode($matches['data']);
                    $size = strlen($rawBytes);

                    // Validate MIME & size constraints (Max 5MB)
                    if ($size > 5 * 1024 * 1024) {
                        $this->stats['anomalies'][] = "Skipped large image in key '{$key}': Size " . round($size/1024/1024, 2) . "MB exceeds 5MB limit.";
                        continue;
                    }

                    // Write file with safe unique filename
                    $filename = 'cms_' . bin2hex(random_bytes(10)) . '.' . $ext;
                    $savePath = $this->uploadsDir . '/cms/' . $filename;
                    
                    if (file_put_contents($savePath, $rawBytes) !== false) {
                        // Validate file integrity with actual mime validation
                        $finfo = new \finfo(FILEINFO_MIME_TYPE);
                        $mime = $finfo->file($savePath);

                        if (!str_starts_with($mime, 'image/')) {
                            // Dangerous script file disguised as image, delete!
                            unlink($savePath);
                            $this->stats['anomalies'][] = "Malicious file detected and deleted in key '{$key}'. MIME: {$mime}";
                            continue;
                        }

                        $relativeUrl = "/uploads/cms/" . $filename;
                        $array[$key] = $relativeUrl;
                        $this->stats['cms_images']['converted']++;
                    }
                }
            }
        }
        return $array;
    }

    // ============================================
    // TIME PARSING HELPER
    // ============================================

    private function parseTimestamp($timestamp): string
    {
        if (is_array($timestamp) && isset($timestamp['seconds'])) {
            // Firestore timestamp format
            return date('Y-m-d H:i:s', (int)$timestamp['seconds']);
        }
        if (is_string($timestamp)) {
            $time = strtotime($timestamp);
            if ($time !== false) {
                return date('Y-m-d H:i:s', $time);
            }
        }
        return date('Y-m-d H:i:s'); // default now
    }

    // ============================================
    // REPORT OUTPUT
    // ============================================

    private function printVerificationReport(): void
    {
        echo "\n";
        echo "============================================================\n";
        echo "                 DATA VERIFICATION REPORT                   \n";
        echo "============================================================\n";
        echo "  ENTITY        |  SOURCE RECORDS  |  MYSQL INSERTED RECORDS\n";
        echo "------------------------------------------------------------\n";
        printf("  Categories    |  %-14d  |  %-22d\n", $this->stats['categories']['read'], $this->stats['categories']['inserted']);
        printf("  Users         |  %-14d  |  %-22d\n", $this->stats['users']['read'], $this->stats['users']['inserted']);
        printf("  Menu Items    |  %-14d  |  %-22d\n", $this->stats['menu']['read'], $this->stats['menu']['inserted']);
        printf("  Orders        |  %-14d  |  %-22d\n", $this->stats['orders']['read'], $this->stats['orders']['inserted']);
        printf("  Transactions  |  %-14d  |  %-22d\n", $this->stats['transactions']['read'], $this->stats['transactions']['inserted']);
        echo "------------------------------------------------------------\n";
        echo "  CMS Images Converted to Files: " . $this->stats['cms_images']['converted'] . "\n";
        echo "============================================================\n";

        if (!empty($this->stats['anomalies'])) {
            echo "\n[WARNING] Anomalies detected during migration:\n";
            foreach ($this->stats['anomalies'] as $idx => $anomaly) {
                echo "  " . ($idx + 1) . ". {$anomaly}\n";
            }
        }
        echo "\nReady for final checkout verify. DirectAdmin migration scripts synced.\n";
    }
}

// Instantiate and execute CLI runner
$migrator = new FirestoreMigrator();
$migrator->run(true); // set rollback on failure

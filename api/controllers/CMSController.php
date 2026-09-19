<?php
/**
 * Queen Eatery Palace - CMS Controller
 * 
 * Handles reading and writing the landing page CMS content
 * as a single JSON payload to avoid relational complexity, 
 * and handles secure image uploads.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\FileUploadService;
use App\Services\AuditService;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class CMSController
{
    /**
     * Get CMS Landing page content (Public)
     * GET /api/cms
     */
    public function index(): void
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT value FROM cms_content WHERE section = "landing_page" AND key_name = "data" LIMIT 1');
        $stmt->execute();
        $row = $stmt->fetch();

        if ($row && !empty($row['value'])) {
            $data = json_decode($row['value'], true);
            Response::success($data);
        }

        // Return empty mock so client falls back to default data
        Response::success(null);
    }

    /**
     * Update CMS Landing page content
     * PUT /api/cms
     */
    public function update(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageCMS');

        $input = $_REQUEST['json_input'] ?? [];

        if (empty($input)) {
            Response::error('Invalid CMS payload', 400);
        }

        // Clean input structure recursively
        $cleanInput = Sanitizer::cleanArray($input);
        $jsonValue = json_encode($cleanInput, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $user = $_REQUEST['auth_user'];
        $db = Database::getConnection();

        // Upsert key-value pair
        $stmt = $db->prepare('
            INSERT INTO cms_content (section, key_name, value, updated_by)
            VALUES ("landing_page", "data", :value, :user)
            ON DUPLICATE KEY UPDATE value = :value_up, updated_by = :user_up
        ');
        $stmt->execute([
            'value'    => $jsonValue,
            'user'     => $user['id'],
            'value_up' => $jsonValue,
            'user_up'  => $user['id'],
        ]);

        // Log Audit
        AuditService::cmsUpdated('landing_page');

        Response::success($cleanInput, 'CMS landing page content updated successfully');
    }

    /**
     * Upload CMS Image
     * POST /api/cms/upload
     */
    public function uploadImage(): void
    {
        AuthMiddleware::verify();
        // Allow Admin, Kitchen, or cashier with proper permissions
        RoleMiddleware::requireAnyPermission('manageCMS', 'manageMenu');

        if (empty($_FILES['image'])) {
            Response::error('No image file uploaded', 400);
        }

        $uploadService = new FileUploadService();
        $result = $uploadService->upload($_FILES['image'], 'cms');

        if (!$result['success']) {
            Response::error($result['error'], 400);
        }

        Response::success([
            'url' => $result['url']
        ], 'Image uploaded successfully');
    }
}

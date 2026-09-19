<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 CMS Controller
 *
 * Handles reading and updating the landing page CMS configuration,
 * section management, and image asset uploads.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\CMSService;

class CMSController
{
    /**
     * Get CMS landing page content (Public).
     * GET /api/v2/cms
     */
    public function index(): void
    {
        $content = CMSService::getLandingPageContent();
        Response::success($content);
    }

    /**
     * Update CMS landing page content.
     * PUT /api/v2/cms
     */
    public function update(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('manageCMS', 'cms.manage');

        $input = $_REQUEST['json_input'] ?? [];
        if (empty($input) || !is_array($input)) {
            Response::badRequest('Valid CMS JSON payload required');
        }

        $user = $_REQUEST['auth_user'];

        try {
            $updated = CMSService::updateLandingPageContent($input, (int) $user['id']);
            Response::success($updated, 'CMS landing page content updated successfully');
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    /**
     * Upload an image asset for CMS.
     * POST /api/v2/cms/upload
     */
    public function uploadImage(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('manageCMS', 'cms.manage', 'manageMenu', 'menu.create', 'menu.edit', 'menu.manage');

        if (empty($_FILES['image'])) {
            Response::badRequest('No image file provided');
        }

        try {
            $url = CMSService::uploadImage($_FILES['image']);
            Response::success(['url' => $url], 'Image uploaded successfully');
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }
}

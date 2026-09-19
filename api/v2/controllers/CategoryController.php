<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Category Controller
 *
 * Thin controller for category CRUD. No direct SQL.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Services\AuditService;
use App\Repositories\CategoryRepository;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class CategoryController
{
    /**
     * GET /api/v2/categories — List all categories (public).
     */
    public function index(): void
    {
        $categories = CategoryRepository::findAll();
        Response::success($categories);
    }

    /**
     * POST /api/v2/categories — Create a new category.
     */
    public function create(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.manage_categories');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name', 'Category name')
                  ->minLength($input, 'name', 2, 'Category name')
                  ->maxLength($input, 'name', 100, 'Category name');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $name = Sanitizer::clean($input['name']);

        if (CategoryRepository::nameExists($name)) {
            Response::error('A category with this name already exists', 400);
        }

        $sortOrder = isset($input['sort_order']) ? Sanitizer::int($input['sort_order']) : 0;
        $id = CategoryRepository::create($name, $sortOrder);

        AuditService::log('category.created', 'category', (string) $id, "Category created: {$name}");

        Response::created([
            'id'         => $id,
            'name'       => $name,
            'sort_order' => $sortOrder,
            'status'     => 'active',
        ], 'Category created successfully');
    }

    /**
     * PUT /api/v2/categories/{id} — Update a category.
     */
    public function update(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.manage_categories');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name', 'Category name')
                  ->minLength($input, 'name', 2, 'Category name')
                  ->maxLength($input, 'name', 100, 'Category name');

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $category = CategoryRepository::findById($id);
        if (!$category) {
            Response::notFound('Category not found');
        }

        $name = Sanitizer::clean($input['name']);

        if (CategoryRepository::nameExists($name, $id)) {
            Response::error('A category with this name already exists', 400);
        }

        $updateData = ['name' => $name];

        if (isset($input['sort_order'])) {
            $updateData['sort_order'] = Sanitizer::int($input['sort_order']);
        }

        if (isset($input['status'])) {
            $status = $input['status'];
            if (!in_array($status, ['active', 'disabled'], true)) {
                $status = 'active';
            }
            $updateData['status'] = $status;
        }

        CategoryRepository::update($id, $updateData);

        AuditService::log('category.updated', 'category', (string) $id, "Category updated: {$name}");

        $updated = CategoryRepository::findById($id);
        Response::success($updated, 'Category updated successfully');
    }

    /**
     * DELETE /api/v2/categories/{id} — Delete a category.
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('menu.manage_categories');

        $category = CategoryRepository::findById($id);
        if (!$category) {
            Response::notFound('Category not found');
        }

        // Block delete if category has linked menu items
        $itemCount = CategoryRepository::countMenuItems($id);
        if ($itemCount > 0) {
            Response::error(
                "Cannot delete category '{$category['name']}'. It has {$itemCount} menu item(s) linked to it. Please reassign or delete them first.",
                400
            );
        }

        CategoryRepository::delete($id);

        AuditService::log('category.deleted', 'category', (string) $id, "Category deleted: {$category['name']}");

        Response::success(null, 'Category deleted successfully');
    }
}

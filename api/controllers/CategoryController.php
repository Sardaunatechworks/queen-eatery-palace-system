<?php
/**
 * Queen Eatery Palace - Category Controller
 * 
 * Handles category listing, creation, updates, and deletion.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\Response;
use App\Helpers\Validator;
use App\Helpers\Sanitizer;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

class CategoryController
{
    /**
     * List all categories (Public)
     * GET /api/categories
     */
    public function index(): void
    {
        $db = Database::getConnection();
        $stmt = $db->query('SELECT * FROM categories ORDER BY name ASC');
        $categories = $stmt->fetchAll();

        // Compatibility with frontend expectation (return items list)
        Response::success($categories);
    }

    /**
     * Create category
     * POST /api/categories
     */
    public function create(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageMenu');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name')
                  ->minLength($input, 'name', 2);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $name = Sanitizer::clean($input['name']);
        $db = Database::getConnection();

        // Check uniqueness
        $stmt = $db->prepare('SELECT id FROM categories WHERE name = :name LIMIT 1');
        $stmt->execute(['name' => $name]);
        if ($stmt->fetch()) {
            Response::error('Category with this name already exists', 400);
        }

        $stmt = $db->prepare('INSERT INTO categories (name, status) VALUES (:name, "active")');
        $stmt->execute(['name' => $name]);
        $id = (int)$db->lastInsertId();

        Response::created([
            'id'     => $id,
            'name'   => $name,
            'status' => 'active'
        ], 'Category created successfully');
    }

    /**
     * Update category
     * PUT /api/categories/{id}
     */
    public function update(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageMenu');

        $input = $_REQUEST['json_input'] ?? [];

        $validator = new Validator();
        $validator->required($input, 'name')
                  ->minLength($input, 'name', 2);

        if ($validator->fails()) {
            Response::error($validator->firstError(), 400);
        }

        $name = Sanitizer::clean($input['name']);
        $db = Database::getConnection();

        // Check if category exists
        $stmt = $db->prepare('SELECT id FROM categories WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            Response::notFound('Category not found');
        }

        // Check uniqueness against others
        $stmt = $db->prepare('SELECT id FROM categories WHERE name = :name AND id != :id LIMIT 1');
        $stmt->execute(['name' => $name, 'id' => $id]);
        if ($stmt->fetch()) {
            Response::error('Category with this name already exists', 400);
        }

        $status = $input['status'] ?? 'active';
        if (!in_array($status, ['active', 'disabled'], true)) {
            $status = 'active';
        }

        $stmt = $db->prepare('UPDATE categories SET name = :name, status = :status WHERE id = :id');
        $stmt->execute([
            'name'   => $name,
            'status' => $status,
            'id'     => $id
        ]);

        Response::success([
            'id'     => $id,
            'name'   => $name,
            'status' => $status
        ], 'Category updated successfully');
    }

    /**
     * Delete category
     * DELETE /api/categories/{id}
     */
    public function delete(int $id): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requirePermission('manageMenu');

        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT id FROM categories WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            Response::notFound('Category not found');
        }

        $stmt = $db->prepare('DELETE FROM categories WHERE id = :id');
        $stmt->execute(['id' => $id]);

        Response::success(null, 'Category deleted successfully');
    }
}

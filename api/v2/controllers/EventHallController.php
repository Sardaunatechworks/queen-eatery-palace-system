<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Event Hall Controller
 *
 * REST controller for customer hall inquiry bookings, admin management,
 * status transitions, and inquiry volume analytics.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Sanitizer;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\EventHallService;

class EventHallController
{
    /**
     * Get real-time slot availability for a date (Public endpoint).
     * GET /api/v2/event-hall/availability?date=YYYY-MM-DD
     */
    public function availability(): void
    {
        $date = isset($_GET['date']) ? Sanitizer::string($_GET['date']) : '';
        if (empty($date)) {
            Response::badRequest('A date parameter (YYYY-MM-DD) is required');
        }

        try {
            $data = EventHallService::getAvailability($date);
            Response::success($data);
        } catch (\InvalidArgumentException $e) {
            Response::badRequest($e->getMessage());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    /**
     * Submit a new event inquiry (Public endpoint).
     * POST /api/v2/event-hall/inquire
     */
    public function inquire(): void
    {
        $input = $_REQUEST['json_input'] ?? [];

        try {
            $inquiry = EventHallService::createInquiry($input);
            Response::created(
                $inquiry,
                'Your event inquiry has been submitted! Our event team will review and contact you shortly.'
            );
        } catch (\InvalidArgumentException $e) {
            Response::badRequest($e->getMessage());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    /**
     * List inquiries with pagination and filters (Staff/Admin).
     * GET /api/v2/event-hall/inquiries
     */
    public function index(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('event_hall.view_inquiries', 'manageCMS');

        $page = max(1, Sanitizer::int($_GET['page'] ?? 1));
        $perPage = min(100, max(1, Sanitizer::int($_GET['per_page'] ?? 20)));

        $filters = [
            'status'     => isset($_GET['status']) ? Sanitizer::string($_GET['status']) : null,
            'event_type' => isset($_GET['event_type']) ? Sanitizer::string($_GET['event_type']) : null,
            'start_date' => isset($_GET['start_date']) ? Sanitizer::string($_GET['start_date']) : null,
            'end_date'   => isset($_GET['end_date']) ? Sanitizer::string($_GET['end_date']) : null,
            'search'     => isset($_GET['search']) ? Sanitizer::string($_GET['search']) : null,
        ];

        $result = EventHallService::listInquiries($filters, $page, $perPage);

        Response::paginated(
            $result['data'],
            $result['total'],
            $page,
            $perPage
        );
    }

    /**
     * Get aggregate inquiry statistics.
     * GET /api/v2/event-hall/inquiries/stats
     */
    public function stats(): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('event_hall.view_inquiries', 'manageCMS');

        $stats = EventHallService::getStats();
        Response::success($stats);
    }

    /**
     * View single inquiry.
     * GET /api/v2/event-hall/inquiries/{id}
     */
    public function show(array $params): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('event_hall.view_inquiries', 'manageCMS');

        $id = (int) ($params['id'] ?? 0);
        if ($id <= 0) {
            Response::badRequest('Valid inquiry ID required');
        }

        $inquiry = EventHallService::getInquiry($id);
        if (!$inquiry) {
            Response::notFound('Event hall inquiry not found');
        }

        Response::success($inquiry);
    }

    /**
     * Update inquiry status and admin notes.
     * PATCH /api/v2/event-hall/inquiries/{id}/status
     */
    public function updateStatus(array $params): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireAnyPermission('event_hall.manage_inquiries', 'manageCMS');

        $id = (int) ($params['id'] ?? 0);
        if ($id <= 0) {
            Response::badRequest('Valid inquiry ID required');
        }

        $input = $_REQUEST['json_input'] ?? [];
        $status = Sanitizer::string($input['status'] ?? '');
        $notes = isset($input['admin_notes']) ? Sanitizer::string($input['admin_notes']) : null;
        $user = $_REQUEST['auth_user'];

        try {
            $updated = EventHallService::updateInquiryStatus($id, $status, $notes, (int) $user['id']);
            Response::success($updated, 'Inquiry status updated successfully');
        } catch (\InvalidArgumentException $e) {
            Response::badRequest($e->getMessage());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    /**
     * Delete an inquiry (Admin only).
     * DELETE /api/v2/event-hall/inquiries/{id}
     */
    public function delete(array $params): void
    {
        AuthMiddleware::verify();
        RoleMiddleware::requireRole(ROLE_ADMIN);

        $id = (int) ($params['id'] ?? 0);
        if ($id <= 0) {
            Response::badRequest('Valid inquiry ID required');
        }

        $user = $_REQUEST['auth_user'];

        try {
            EventHallService::deleteInquiry($id, (int) $user['id']);
            Response::success(null, 'Inquiry deleted successfully');
        } catch (\InvalidArgumentException $e) {
            Response::notFound($e->getMessage());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 500);
        }
    }
}

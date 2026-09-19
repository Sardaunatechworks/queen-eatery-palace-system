<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Event Hall Service
 *
 * Business logic layer for event hall inquiries, bookings, slot availability,
 * collision detection, admin notification dispatches, and status lifecycle transitions.
 */

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Sanitizer;
use App\Helpers\Validator;
use App\Repositories\EventHallRepository;

class EventHallService
{
    /**
     * Allowed event inquiry status transitions.
     */
    public const VALID_STATUSES = ['new', 'contacted', 'confirmed', 'declined', 'completed'];

    /**
     * Standard operating hours for event bookings (08:00 AM - 11:00 PM).
     */
    public const OPERATING_OPEN = '08:00';
    public const OPERATING_CLOSE = '23:00';

    /**
     * Submit a new event inquiry / reservation with slot conflict checks.
     */
    public static function createInquiry(array $input): array
    {
        $fullName = Sanitizer::string($input['full_name'] ?? '');
        $phone = Sanitizer::string($input['phone'] ?? '');
        $email = isset($input['email']) && !empty($input['email']) ? Sanitizer::email($input['email']) : null;
        $eventType = Sanitizer::string($input['event_type'] ?? '');
        $preferredDate = Sanitizer::string($input['preferred_date'] ?? '');
        $startTime = isset($input['start_time']) && !empty($input['start_time']) ? trim(Sanitizer::string($input['start_time'])) : null;
        $endTime = isset($input['end_time']) && !empty($input['end_time']) ? trim(Sanitizer::string($input['end_time'])) : null;
        $expectedGuests = isset($input['expected_guests']) && $input['expected_guests'] !== '' ? max(1, Sanitizer::int($input['expected_guests'])) : null;
        $message = isset($input['message']) ? Sanitizer::string($input['message']) : null;

        // Core validations
        if (strlen($fullName) < 2) {
            throw new \InvalidArgumentException('Full name is required (at least 2 characters)');
        }

        if (strlen($phone) < 7) {
            throw new \InvalidArgumentException('Valid contact phone number is required');
        }

        if (empty($eventType)) {
            throw new \InvalidArgumentException('Event type is required');
        }

        if (empty($preferredDate) || !Validator::isValidDate($preferredDate)) {
            throw new \InvalidArgumentException('A valid preferred date (YYYY-MM-DD) is required');
        }

        // Prevent booking dates in the past
        if (strtotime($preferredDate) < strtotime(date('Y-m-d'))) {
            throw new \InvalidArgumentException('Preferred date cannot be in the past');
        }

        if ($email !== null && !Validator::isValidEmail($email)) {
            throw new \InvalidArgumentException('Invalid email address format');
        }

        // Time slot validation if either start_time or end_time is provided
        if ($startTime !== null || $endTime !== null) {
            if ($startTime === null || $endTime === null) {
                throw new \InvalidArgumentException('Both start time and end time must be specified together');
            }

            // Normalize HH:MM:SS -> HH:MM
            $startTime = substr($startTime, 0, 5);
            $endTime = substr($endTime, 0, 5);

            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $startTime)) {
                throw new \InvalidArgumentException('Invalid start time format (expected HH:MM)');
            }

            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $endTime)) {
                throw new \InvalidArgumentException('Invalid end time format (expected HH:MM)');
            }

            if ($endTime <= $startTime) {
                throw new \InvalidArgumentException('End time must be later than start time');
            }

            // Check slot collision against existing active bookings
            $conflict = EventHallRepository::hasTimeConflict($preferredDate, $startTime, $endTime);
            if ($conflict !== null) {
                $cStart = $conflict['start_time'] ?? '';
                $cEnd = $conflict['end_time'] ?? '';
                $windowDesc = ($cStart && $cEnd) ? "{$cStart} - {$cEnd}" : "Full Day";
                throw new \InvalidArgumentException(
                    "The selected time slot ({$startTime} - {$endTime}) on {$preferredDate} is unavailable. It conflicts with an existing reservation ({$windowDesc}). Please choose an open window."
                );
            }
        }

        $inquiryData = [
            'full_name'       => $fullName,
            'phone'           => $phone,
            'email'           => $email,
            'event_type'      => $eventType,
            'preferred_date'  => $preferredDate,
            'start_time'      => $startTime,
            'end_time'        => $endTime,
            'expected_guests' => $expectedGuests,
            'message'         => $message,
        ];

        $id = EventHallRepository::create($inquiryData);

        // Notify admins and staff
        NotificationService::eventHallInquiry($fullName, $eventType);

        $created = EventHallRepository::findById($id);
        if (!$created) {
            throw new \RuntimeException('Failed to retrieve created inquiry');
        }

        return $created;
    }

    /**
     * Compute real-time slot availability and open windows for a given date.
     */
    public static function getAvailability(string $date): array
    {
        if (empty($date) || !Validator::isValidDate($date)) {
            throw new \InvalidArgumentException('Valid date (YYYY-MM-DD) is required');
        }

        $rawBookings = EventHallRepository::getBookingsForDate($date);

        // Filter and format booked slots
        $bookedSlots = [];
        $hasFullDayBooking = false;

        foreach ($rawBookings as $b) {
            if (empty($b['start_time']) || empty($b['end_time'])) {
                $hasFullDayBooking = true;
                $bookedSlots[] = [
                    'id'         => $b['id'],
                    'start_time' => self::OPERATING_OPEN,
                    'end_time'   => self::OPERATING_CLOSE,
                    'status'     => $b['status'],
                    'is_full_day' => true,
                ];
            } else {
                $bookedSlots[] = [
                    'id'         => $b['id'],
                    'start_time' => $b['start_time'],
                    'end_time'   => $b['end_time'],
                    'status'     => $b['status'],
                    'is_full_day' => false,
                ];
            }
        }

        // Calculate free/open available windows between OPERATING_OPEN and OPERATING_CLOSE
        $availableWindows = [];
        if ($hasFullDayBooking) {
            $availableWindows = [];
        } elseif (empty($bookedSlots)) {
            $availableWindows[] = [
                'start_time' => self::OPERATING_OPEN,
                'end_time'   => self::OPERATING_CLOSE,
            ];
        } else {
            // Sort booked slots by start time
            usort($bookedSlots, function ($a, $b) {
                return strcmp($a['start_time'], $b['start_time']);
            });

            $currentPointer = self::OPERATING_OPEN;

            foreach ($bookedSlots as $slot) {
                $slotStart = $slot['start_time'];
                $slotEnd = $slot['end_time'];

                // If there is a gap before this slot
                if ($slotStart > $currentPointer) {
                    $availableWindows[] = [
                        'start_time' => $currentPointer,
                        'end_time'   => $slotStart,
                    ];
                }

                // Advance pointer past this slot if it reaches further
                if ($slotEnd > $currentPointer) {
                    $currentPointer = $slotEnd;
                }
            }

            // Check if there is space between the last slot and closing
            if ($currentPointer < self::OPERATING_CLOSE) {
                $availableWindows[] = [
                    'start_time' => $currentPointer,
                    'end_time'   => self::OPERATING_CLOSE,
                ];
            }
        }

        return [
            'date'              => $date,
            'operating_hours'   => [
                'open'  => self::OPERATING_OPEN,
                'close' => self::OPERATING_CLOSE,
            ],
            'booked_slots'      => $bookedSlots,
            'available_windows' => $availableWindows,
            'is_fully_booked'   => empty($availableWindows),
        ];
    }

    /**
     * List inquiries with pagination and filters.
     */
    public static function listInquiries(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $page = max(1, $page);
        $perPage = min(100, max(1, $perPage));
        $offset = ($page - 1) * $perPage;

        return EventHallRepository::list($filters, $perPage, $offset);
    }

    /**
     * Get single inquiry details.
     */
    public static function getInquiry(int $id): ?array
    {
        return EventHallRepository::findById($id);
    }

    /**
     * Update inquiry status and admin notes.
     */
    public static function updateInquiryStatus(int $id, string $status, ?string $adminNotes, int $handledBy): array
    {
        $inquiry = EventHallRepository::findById($id);
        if (!$inquiry) {
            throw new \InvalidArgumentException('Event hall inquiry not found');
        }

        if (!in_array($status, self::VALID_STATUSES, true)) {
            throw new \InvalidArgumentException('Invalid status value');
        }

        // If confirming, verify that no conflicting confirmed booking exists
        if ($status === 'confirmed' && !empty($inquiry['start_time']) && !empty($inquiry['end_time'])) {
            $conflict = EventHallRepository::hasTimeConflict(
                $inquiry['preferred_date'],
                $inquiry['start_time'],
                $inquiry['end_time'],
                $id
            );
            if ($conflict !== null && $conflict['status'] === 'confirmed') {
                $cStart = $conflict['start_time'] ?? '';
                $cEnd = $conflict['end_time'] ?? '';
                throw new \InvalidArgumentException(
                    "Cannot confirm inquiry: conflicts with an already confirmed reservation ({$cStart} - {$cEnd}) on {$inquiry['preferred_date']}."
                );
            }
        }

        $cleanedNotes = $adminNotes !== null ? Sanitizer::string($adminNotes) : null;

        $updated = EventHallRepository::updateStatus($id, $status, $cleanedNotes, $handledBy);
        if (!$updated) {
            throw new \RuntimeException('Failed to update inquiry status');
        }

        AuditService::log(
            'event_hall.status_updated',
            'event_hall_inquiries',
            (string) $id,
            "Updated status to '{$status}'" . ($cleanedNotes ? " with notes: {$cleanedNotes}" : ""),
            ['status' => $inquiry['status']],
            ['status' => $status, 'admin_notes' => $cleanedNotes]
        );

        return EventHallRepository::findById($id) ?? [];
    }

    /**
     * Get aggregate statistics.
     */
    public static function getStats(): array
    {
        return EventHallRepository::getStats();
    }

    /**
     * Delete an inquiry.
     */
    public static function deleteInquiry(int $id, int $userId): bool
    {
        $inquiry = EventHallRepository::findById($id);
        if (!$inquiry) {
            throw new \InvalidArgumentException('Event hall inquiry not found');
        }

        $deleted = EventHallRepository::delete($id);
        if ($deleted) {
            AuditService::log(
                'event_hall.deleted',
                'event_hall_inquiries',
                (string) $id,
                "Deleted inquiry from {$inquiry['full_name']}"
            );
        }

        return $deleted;
    }
}

<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 CMS Service
 *
 * Handles landing page content management, schema fallbacks,
 * image uploads, and audit logging.
 */

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Sanitizer;
use App\Repositories\CMSRepository;

class CMSService
{
    /**
     * Get default CMS structure if not yet saved in database.
     */
    public static function getDefaultLandingData(): array
    {
        return [
            'hero' => [
                'title'            => "Simple Food, \nGreat Taste.",
                'subtitle'         => "Experience quality dining and host your special events at The Queen's Palace Eatery and Event Hall. We keep it simple and professional.",
                'imageUrl'         => "",
                'additionalImages' => [],
            ],
            'about' => [
                'text'     => "The Queen's Palace Eatery and Event Hall serves a variety of local and international dishes prepared with care. Our event hall is also open for weddings, meetings, and celebrations in Dutse.",
                'imageUrl' => "",
            ],
            'services' => [
                [
                    'id'               => 'dine-in',
                    'icon'             => 'Utensils',
                    'title'            => 'Dine-In',
                    'description'      => 'Eat comfortably in our well-spaced dining hall with premium service.',
                    'imageUrl'         => '',
                    'additionalImages' => [],
                ],
                [
                    'id'               => 'fast-orders',
                    'icon'             => 'MessageSquare',
                    'title'            => 'Fast Orders',
                    'description'      => 'Order online and pick it up or get it delivered to your doorstep.',
                    'imageUrl'         => '',
                    'additionalImages' => [],
                ],
                [
                    'id'               => 'event-hall',
                    'icon'             => 'Calendar',
                    'title'            => 'Event Hall',
                    'description'      => 'Large hall with state-of-the-art facilities for weddings and gatherings.',
                    'imageUrl'         => '',
                    'additionalImages' => [],
                ],
            ],
            'eventHall' => [
                'description' => 'Our event hall is fully equipped with modern facilities. Perfect for weddings and corporate gatherings.',
                'imageUrls'   => [],
            ],
            'contact' => [
                'phone'   => '+234 813 554 9195',
                'address' => "Behind Dutse Emirs House, \nOpposite Glo Office, Dutse, Jigawa State",
            ],
        ];
    }

    /**
     * Get landing page CMS content with fallback to default structure.
     */
    public static function getLandingPageContent(): array
    {
        $default = self::getDefaultLandingData();
        $data = CMSRepository::getSection('landing_page', 'data');
        if (empty($data)) {
            return $default;
        }

        $merged = array_merge($default, $data);
        if (!isset($merged['hero']['additionalImages']) || !is_array($merged['hero']['additionalImages'])) {
            $merged['hero']['additionalImages'] = [];
        }
        if (!isset($merged['eventHall']['imageUrls']) || !is_array($merged['eventHall']['imageUrls'])) {
            $merged['eventHall']['imageUrls'] = $default['eventHall']['imageUrls'];
        }

        return $merged;
    }

    /**
     * Update landing page CMS content and log audit action.
     */
    public static function updateLandingPageContent(array $data, int $userId): array
    {
        $clean = Sanitizer::cleanArray($data);

        $saved = CMSRepository::upsertSection('landing_page', 'data', $clean, $userId);
        if (!$saved) {
            throw new \RuntimeException('Failed to save CMS content');
        }

        AuditService::log(
            'cms.updated',
            'cms_content',
            'landing_page',
            'Landing page CMS content updated'
        );

        return $clean;
    }

    /**
     * Handle CMS image upload using FileUploadService.
     */
    public static function uploadImage(array $file): string
    {
        $uploader = new FileUploadService();
        $result = $uploader->upload($file, 'cms');

        if (!$result['success']) {
            throw new \InvalidArgumentException($result['error'] ?? 'Image upload failed');
        }

        return $result['url'];
    }
}

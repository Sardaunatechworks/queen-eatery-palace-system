<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 CMS Routes
 */

declare(strict_types=1);

use App\Controllers\CMSController;

$controller = new CMSController();

// Landing page content
route('GET', '/cms', [$controller, 'index']);
route('PUT', '/cms', [$controller, 'update']);
route('POST', '/cms/upload', [$controller, 'uploadImage']);

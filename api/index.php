<?php
/**
 * Queen's Palace Eatery & Event Hall - Production API Entry Point
 */

declare(strict_types=1);

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

// Emergency shutdown handler to capture fatal errors as JSON
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status'  => 'fatal_error',
            'message' => $error['message'],
            'file'    => $error['file'],
            'line'    => $error['line'],
        ], JSON_PRETTY_PRINT);
    }
});

// Diagnostic check: ?diag=1
if (isset($_GET['diag'])) {
    header('Content-Type: application/json; charset=utf-8');
    $items = scandir(__DIR__);
    $dirListing = [];
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $fullPath = __DIR__ . '/' . $item;
        $dirListing[] = [
            'name'   => $item,
            'is_dir' => is_dir($fullPath),
            'size'   => is_file($fullPath) ? filesize($fullPath) : (is_dir($fullPath) ? count(scandir($fullPath)) - 2 : null),
        ];
    }
    echo json_encode([
        'status'         => 'alive',
        'php_version'    => PHP_VERSION,
        'php_sapi'       => PHP_SAPI,
        'document_root'  => $_SERVER['DOCUMENT_ROOT'] ?? '',
        'script_name'    => $_SERVER['SCRIPT_NAME'] ?? '',
        'request_uri'    => $_SERVER['REQUEST_URI'] ?? '',
        'current_dir'    => __DIR__,
        'v2_exists'      => file_exists(__DIR__ . '/v2/index.php'),
        'env_exists'     => file_exists(__DIR__ . '/.env'),
        'private_config' => file_exists(__DIR__ . '/private/config.php'),
        'pdo_mysql'      => extension_loaded('pdo_mysql'),
        'directory_contents' => $dirListing,
    ], JSON_PRETTY_PRINT);
    exit;
}

// Serve uploaded static files or logo directly if requested
$rawUri = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
if (str_starts_with($rawUri, '/api/uploads/')) {
    $rawUri = substr($rawUri, 4); // /api/uploads/... -> /uploads/...
}

if ($rawUri === '/queen-logo.png' || $rawUri === '/api/queen-logo.png' || $rawUri === '/uploads/queen-logo.png') {
    $logoCandidates = [
        __DIR__ . '/queen-logo.png',
        __DIR__ . '/uploads/queen-logo.png',
        dirname(__DIR__) . '/client/public/queen-logo.png'
    ];
    foreach ($logoCandidates as $cand) {
        if (file_exists($cand) && is_file($cand)) {
            header('Access-Control-Allow-Origin: *');
            header('Content-Type: image/png');
            header('Content-Length: ' . filesize($cand));
            header('Cache-Control: public, max-age=86400');
            readfile($cand);
            exit;
        }
    }
}

if (str_starts_with($rawUri, '/uploads/')) {
    $filePath = __DIR__ . $rawUri;
    if (file_exists($filePath) && is_file($filePath)) {
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mimes = [
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png'  => 'image/png',
            'webp' => 'image/webp',
            'gif'  => 'image/gif',
            'svg'  => 'image/svg+xml'
        ];
        $mime = $mimes[$ext] ?? (mime_content_type($filePath) ?: 'application/octet-stream');
        header('Access-Control-Allow-Origin: *');
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: public, max-age=86400');
        readfile($filePath);
        exit;
    }

    // Graceful fallback for missing uploaded photos: serve the brand logo
    $logoCandidates = [
        __DIR__ . '/queen-logo.png',
        __DIR__ . '/uploads/queen-logo.png',
        dirname(__DIR__) . '/client/public/queen-logo.png'
    ];
    foreach ($logoCandidates as $cand) {
        if (file_exists($cand) && is_file($cand)) {
            header('Access-Control-Allow-Origin: *');
            header('Content-Type: image/png');
            header('Cache-Control: public, max-age=3600');
            readfile($cand);
            exit;
        }
    }
}

// Search candidate locations for the V2 router
$candidatePaths = [
    __DIR__ . '/v2/index.php',
    __DIR__ . '/api/v2/index.php',
    __DIR__ . '/api_production/v2/index.php',
    __DIR__ . '/api_production/api/v2/index.php',
];

foreach ($candidatePaths as $v2Path) {
    if (file_exists($v2Path)) {
        require_once $v2Path;
        exit;
    }
}

// List current directory items to assist debugging
$items = scandir(__DIR__);
$dirListing = [];
foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    $dirListing[] = $item . (is_dir(__DIR__ . '/' . $item) ? '/' : '');
}

http_response_code(500);
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'status'  => 'error',
    'message' => 'V2 API router (v2/index.php) not found in ' . __DIR__,
    'searched_paths' => $candidatePaths,
    'contents_of_current_directory' => $dirListing,
], JSON_PRETTY_PRINT);
exit;

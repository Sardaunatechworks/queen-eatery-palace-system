<?php
$zipFile = __DIR__ . '/api_production.zip';
if (file_exists($zipFile)) {
    unlink($zipFile);
}

$zip = new ZipArchive();
if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    die("Failed to create zip\n");
}

$apiDir = __DIR__ . '/api';
$items = [
    'config', 'controllers', 'helpers', 'middleware', 'migrations',
    'private', 'services', 'uploads', 'v2', 'index.php', 'extract.php', '.htaccess', '.env', 'production_database_dump.sql'
];

foreach ($items as $item) {
    $fullPath = $apiDir . '/' . $item;
    if (is_file($fullPath)) {
        $zip->addFile($fullPath, $item);
    } elseif (is_dir($fullPath)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($fullPath, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($files as $file) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($apiDir) + 1);
            // Convert any Windows backslashes to Linux forward slashes
            $linuxPath = str_replace('\\', '/', $relativePath);
            $zip->addFile($filePath, $linuxPath);
        }
    }
}
$zip->close();
echo "SUCCESS: api_production.zip created with Linux-compatible forward slashes.\n";

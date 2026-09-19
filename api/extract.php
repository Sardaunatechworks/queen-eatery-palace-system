<?php
declare(strict_types=1);

header('Content-Type: text/plain; charset=utf-8');

$zipPath = __DIR__ . '/api_production.zip';
if (!file_exists($zipPath)) {
    die("Error: api_production.zip not found in " . __DIR__ . "\nPlease upload api_production.zip to this folder first.\n");
}

$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) {
    die("Error: Could not open api_production.zip.\n");
}

echo "Extracting api_production.zip to " . __DIR__ . "...\n";

// Backup existing .env file if it exists so extracting never overwrites server credentials
$envBackup = null;
if (file_exists(__DIR__ . '/.env')) {
    $envBackup = file_get_contents(__DIR__ . '/.env');
}

// Remove old backslash-named files left over from Windows zip
$files = scandir(__DIR__);
foreach ($files as $f) {
    if (str_contains($f, '\\')) {
        @unlink(__DIR__ . '/' . $f);
    }
}

$zip->extractTo(__DIR__);
$zip->close();

// Restore existing .env so live DB passwords and secrets are NEVER wiped
if ($envBackup !== null) {
    file_put_contents(__DIR__ . '/.env', $envBackup);
    echo "PRESERVED: Existing .env credentials kept intact.\n";
}

echo "SUCCESS: Extraction complete!\n";
echo "V2 Router Check: " . (file_exists(__DIR__ . '/v2/index.php') ? "FOUND (Ready!)" : "NOT FOUND") . "\n";
echo "Private Config Check: " . (file_exists(__DIR__ . '/private/config.php') ? "FOUND (Ready!)" : "NOT FOUND") . "\n";
echo "\nNext step: visit https://api.queenspalaceeatery.com/api/v2/menu\n";

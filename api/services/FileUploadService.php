<?php
/**
 * Queen Eatery Palace - File Upload Service
 * 
 * Handles secure file uploads with validation.
 */

declare(strict_types=1);

namespace App\Services;

class FileUploadService
{
    private string $basePath;
    private string $baseUrl;
    private int $maxSize;
    private array $allowedTypes;
    private array $allowedExtensions;

    public function __construct()
    {
        $config = $this->loadConfig();
        $this->basePath          = $config['base_path'];
        $this->baseUrl           = $config['base_url'];
        $this->maxSize           = $config['max_size'];
        $this->allowedTypes      = $config['allowed_types'];
        $this->allowedExtensions = $config['allowed_extensions'];
    }

    /**
     * Upload a file to the specified subfolder.
     *
     * @param array  $file       The $_FILES element (e.g., $_FILES['image'])
     * @param string $subfolder  Target subfolder (e.g., 'menu', 'profile', 'cms')
     * @return array             ['success' => bool, 'path' => string, 'url' => string, 'error' => string]
     */
    public function upload(array $file, string $subfolder): array
    {
        // Validate upload error
        if ($file['error'] !== UPLOAD_ERR_OK) {
            return ['success' => false, 'error' => $this->getUploadError($file['error'])];
        }

        // Validate file size
        if ($file['size'] > $this->maxSize) {
            $maxMB = round($this->maxSize / (1024 * 1024), 1);
            return ['success' => false, 'error' => "File size exceeds {$maxMB}MB limit"];
        }

        // Validate MIME type using finfo (not the browser-reported type)
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);

        if (!in_array($mimeType, $this->allowedTypes, true)) {
            return ['success' => false, 'error' => 'Invalid file type. Allowed: ' . implode(', ', $this->allowedExtensions)];
        }

        // Validate file extension
        $originalExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($originalExtension, $this->allowedExtensions, true)) {
            return ['success' => false, 'error' => 'Invalid file extension. Allowed: ' . implode(', ', $this->allowedExtensions)];
        }

        // Determine correct extension from MIME type (don't trust original filename)
        $extension = $this->mimeToExtension($mimeType);

        // Generate unique filename (never use original filename)
        $uniqueName = bin2hex(random_bytes(16)) . '_' . time() . '.' . $extension;

        // Ensure target directory exists
        $targetDir = $this->basePath . '/' . $subfolder;
        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        // Full target path
        $targetPath = $targetDir . '/' . $uniqueName;
        $relativePath = $subfolder . '/' . $uniqueName;
        $publicUrl = $this->baseUrl . '/' . $relativePath;

        // Move the uploaded file
        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            return ['success' => false, 'error' => 'Failed to save uploaded file'];
        }

        return [
            'success'       => true,
            'path'          => $relativePath,
            'url'           => $publicUrl,
            'filename'      => $uniqueName,
            'original_name' => $file['name'],
            'mime_type'     => $mimeType,
            'size'          => $file['size'],
        ];
    }

    /**
     * Delete a previously uploaded file.
     */
    public function delete(string $relativePath): bool
    {
        if (empty($relativePath)) {
            return false;
        }

        $fullPath = $this->basePath . '/' . $relativePath;

        // Security: ensure the path stays within the uploads directory
        $realBase = realpath($this->basePath);
        $realPath = realpath($fullPath);

        if ($realPath === false || !str_starts_with($realPath, $realBase)) {
            return false;
        }

        if (file_exists($fullPath)) {
            return unlink($fullPath);
        }

        return false;
    }

    /**
     * Save base64 image data to a file (for CMS migration).
     */
    public function saveBase64(string $base64Data, string $subfolder): array
    {
        // Extract MIME type and data from data URI
        if (preg_match('/^data:(image\/\w+);base64,(.+)$/', $base64Data, $matches)) {
            $mimeType = $matches[1];
            $data = base64_decode($matches[2]);
        } else {
            return ['success' => false, 'error' => 'Invalid base64 image data'];
        }

        if ($data === false) {
            return ['success' => false, 'error' => 'Failed to decode base64 data'];
        }

        // Validate MIME type
        if (!in_array($mimeType, $this->allowedTypes, true)) {
            return ['success' => false, 'error' => 'Invalid image type'];
        }

        $extension = $this->mimeToExtension($mimeType);
        $uniqueName = bin2hex(random_bytes(16)) . '_' . time() . '.' . $extension;

        $targetDir = $this->basePath . '/' . $subfolder;
        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        $targetPath = $targetDir . '/' . $uniqueName;
        $relativePath = $subfolder . '/' . $uniqueName;
        $publicUrl = $this->baseUrl . '/' . $relativePath;

        if (file_put_contents($targetPath, $data) === false) {
            return ['success' => false, 'error' => 'Failed to write file'];
        }

        return [
            'success'  => true,
            'path'     => $relativePath,
            'url'      => $publicUrl,
            'filename' => $uniqueName,
            'size'     => strlen($data),
        ];
    }

    /**
     * Map MIME type to file extension.
     */
    private function mimeToExtension(string $mimeType): string
    {
        return match ($mimeType) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            default      => 'bin',
        };
    }

    /**
     * Get human-readable upload error message.
     */
    private function getUploadError(int $errorCode): string
    {
        return match ($errorCode) {
            UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload size limit',
            UPLOAD_ERR_FORM_SIZE  => 'File exceeds form upload size limit',
            UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE    => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Server temporary directory missing',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            UPLOAD_ERR_EXTENSION  => 'Upload blocked by server extension',
            default               => 'Unknown upload error',
        };
    }

    /**
     * Load upload configuration.
     */
    private function loadConfig(): array
    {
        $configPath = dirname(__DIR__) . '/private/config.php';
        $privatePath = dirname(__DIR__, 2) . '/private/config.php';

        if (file_exists($privatePath)) {
            $config = require $privatePath;
        } elseif (file_exists($configPath)) {
            $config = require $configPath;
        } else {
            throw new \RuntimeException('Upload configuration not found');
        }

        return $config['uploads'];
    }
}

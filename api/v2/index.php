<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 API Router
 *
 * Central entry point for all V2 API requests.
 * Loads route definitions from modular route files.
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

if (!defined('QEP_START_TIME')) {
    define('QEP_START_TIME', microtime(true));
}

// Boot
require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/config/Cors.php';
require_once __DIR__ . '/helpers/Response.php';
require_once __DIR__ . '/helpers/Validator.php';
require_once __DIR__ . '/helpers/Sanitizer.php';
require_once __DIR__ . '/helpers/CookieHelper.php';
require_once __DIR__ . '/middleware/RateLimiter.php';
require_once __DIR__ . '/middleware/CSRFMiddleware.php';
require_once __DIR__ . '/middleware/AuthMiddleware.php';
require_once __DIR__ . '/middleware/RoleMiddleware.php';

// Services
require_once __DIR__ . '/services/JWTService.php';
require_once __DIR__ . '/services/AuditService.php';
require_once __DIR__ . '/services/NotificationService.php';
require_once __DIR__ . '/services/AuthService.php';
require_once __DIR__ . '/services/MenuService.php';
require_once __DIR__ . '/services/InventoryService.php';
require_once __DIR__ . '/services/FileUploadService.php';
require_once __DIR__ . '/services/PaystackService.php';
require_once __DIR__ . '/services/OrderService.php';
require_once __DIR__ . '/services/ReportService.php';
require_once __DIR__ . '/services/CMSService.php';
require_once __DIR__ . '/services/EventHallService.php';
require_once __DIR__ . '/services/PricingService.php';
require_once __DIR__ . '/services/TableService.php';
require_once __DIR__ . '/services/GuestOrderService.php';

// Repositories
require_once __DIR__ . '/repositories/UserRepository.php';
require_once __DIR__ . '/repositories/PermissionRepository.php';
require_once __DIR__ . '/repositories/AuditRepository.php';
require_once __DIR__ . '/repositories/NotificationRepository.php';
require_once __DIR__ . '/repositories/CategoryRepository.php';
require_once __DIR__ . '/repositories/MenuRepository.php';
require_once __DIR__ . '/repositories/InventoryRepository.php';
require_once __DIR__ . '/repositories/OrderRepository.php';
require_once __DIR__ . '/repositories/TransactionRepository.php';
require_once __DIR__ . '/repositories/ReportRepository.php';
require_once __DIR__ . '/repositories/CMSRepository.php';
require_once __DIR__ . '/repositories/EventHallRepository.php';
require_once __DIR__ . '/repositories/SettingRepository.php';
require_once __DIR__ . '/repositories/TableRepository.php';

// Controller autoloader
spl_autoload_register(function (string $class) {
    $prefix = 'App\\Controllers\\';
    if (str_starts_with($class, $prefix)) {
        $relative = str_replace($prefix, '', $class);
        $file = __DIR__ . '/controllers/' . $relative . '.php';
        if (file_exists($file)) {
            require_once $file;
        }
    }
});

use App\Config\Cors;
use App\Helpers\Response;
use App\Middleware\RateLimiter;

// Handle CORS
Cors::handle();

// Set JSON content type (unless SSE or file export stream)
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$isSpecialStream = str_contains($requestUri, '/sse/') || str_contains($requestUri, '/export');
if (!$isSpecialStream) {
    header('Content-Type: application/json; charset=utf-8');
}

// Check global rate limits
RateLimiter::check();

// Global error handler
set_exception_handler(function (\Throwable $e) {
    $debug = false;
    try {
        $config = \App\Config\Database::getAppConfig();
        $debug = $config['debug'] ?? false;
    } catch (\Throwable $ex) {}

    error_log("Unhandled Exception: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());

    if ($debug) {
        Response::error($e->getMessage(), 500, [
            'file'  => $e->getFile(),
            'line'  => $e->getLine(),
            'trace' => $e->getTraceAsString(),
        ]);
    } else {
        Response::serverError('An unexpected error occurred');
    }
});

// ============================================
// REQUEST PARSING
// ============================================

$method = $_SERVER['REQUEST_METHOD'];
$uri = $_SERVER['REQUEST_URI'] ?? '/';

// Remove query string
$uri = strtok($uri, '?');

// Remove base path (handles /api/v2/, /v2/, and /api/ prefixes)
$basePaths = ['/api/v2', '/v2', '/api'];
foreach ($basePaths as $basePath) {
    if (str_starts_with($uri, $basePath)) {
        $uri = substr($uri, strlen($basePath));
        break;
    }
}

// Normalize
if ($uri === '' || $uri === false) {
    $uri = '/';
}
$uri = rtrim($uri, '/') ?: '/';

// Parse JSON body
$input = [];
if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
    $rawBody = file_get_contents('php://input');
    if (!empty($rawBody)) {
        $input = json_decode($rawBody, true) ?? [];
    }
    $input = array_merge($input, $_POST);
}
$_REQUEST['json_input'] = $input;

// ============================================
// ROUTER
// ============================================

$routes = [];

if (!function_exists('route')) {
    function route(string $method, string $pattern, callable $handler): void
    {
        global $routes;
        $routes[] = [
            'method'  => $method,
            'pattern' => $pattern,
            'handler' => $handler,
        ];
    }
}

if (!function_exists('matchRoute')) {
    function matchRoute(string $pattern, string $uri): ?array
    {
        $regex = preg_replace('/\{([a-zA-Z_]+)\}/', '(?P<$1>[^/]+)', $pattern);
        $regex = '#^' . $regex . '$#';

        if (preg_match($regex, $uri, $matches)) {
            return array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
        }

        return null;
    }
}

// ============================================
// LOAD ROUTE FILES
// ============================================

require_once __DIR__ . '/routes/auth.php';
require_once __DIR__ . '/routes/users.php';
require_once __DIR__ . '/routes/menu.php';
require_once __DIR__ . '/routes/orders.php';
require_once __DIR__ . '/routes/reports.php';
require_once __DIR__ . '/routes/notifications.php';
require_once __DIR__ . '/routes/sse.php';
require_once __DIR__ . '/routes/cms.php';
require_once __DIR__ . '/routes/event_hall.php';
require_once __DIR__ . '/routes/dashboard.php';
require_once __DIR__ . '/routes/settings.php';
require_once __DIR__ . '/routes/tables.php';
require_once __DIR__ . '/routes/qr.php';

// Health check
route('GET', '/', function () {
    Response::success([
        'name'    => QEP_APP_NAME . ' API',
        'version' => QEP_VERSION,
        'status'  => 'online',
        'time'    => date('c'),
    ], 'API is running');
});

route('GET', '/status', function () {
    Response::success([
        'status'    => 'online',
        'timestamp' => date('c'),
    ]);
});

// ============================================
// ROUTE MATCHING
// ============================================

$matched = false;

foreach ($routes as $route) {
    if ($route['method'] !== $method) {
        continue;
    }

    $params = matchRoute($route['pattern'], $uri);
    if ($params !== null) {
        $matched = true;
        $route['handler']($params);
        break;
    }
}

if (!$matched) {
    // Check method not allowed
    foreach ($routes as $route) {
        $params = matchRoute($route['pattern'], $uri);
        if ($params !== null) {
            Response::error('Method not allowed', 405);
        }
    }

    Response::notFound('API endpoint not found: ' . $method . ' ' . $uri);
}

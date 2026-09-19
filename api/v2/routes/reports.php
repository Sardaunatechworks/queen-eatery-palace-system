<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Reports & Dashboard Routes
 */

declare(strict_types=1);

use App\Controllers\DashboardController;
use App\Controllers\ReportController;

// Dashboard overview
route('GET', '/dashboard/overview', function () {
    (new DashboardController())->overview();
});

// Analytical reports
route('GET', '/reports/sales', function () {
    (new ReportController())->sales();
});
route('GET', '/reports/orders', function () {
    (new ReportController())->orders();
});
route('GET', '/reports/inventory', function () {
    (new ReportController())->inventory();
});
route('GET', '/reports/cashiers', function () {
    (new ReportController())->cashiers();
});
route('GET', '/reports/transactions', function () {
    (new ReportController())->transactions();
});
route('GET', '/reports/packaging', function () {
    (new ReportController())->packaging();
});
route('GET', '/reports/export', function () {
    (new ReportController())->export();
});

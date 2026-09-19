<?php
/**
 * Queen's Palace Eatery & Event Hall - V2 Dashboard Routes
 */

declare(strict_types=1);

use App\Controllers\DashboardController;

$dashboardCtrl = new DashboardController();

route('GET', '/admin/dashboard', fn() => $dashboardCtrl->admin());
route('GET', '/cashier/dashboard', fn() => $dashboardCtrl->cashier());
route('GET', '/kitchen/dashboard', fn() => $dashboardCtrl->kitchen());
route('GET', '/customer/dashboard', fn() => $dashboardCtrl->customer());

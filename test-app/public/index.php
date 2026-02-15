<?php

declare(strict_types=1);

/**
 * PHPless Test Application
 * Simple PHP page to verify FrankenPHP is working inside Firecracker.
 */

$startTime = hrtime(true);

$data = [
    'platform'  => 'PHPless',
    'runtime'   => 'FrankenPHP Worker Mode',
    'php'       => PHP_VERSION,
    'sapi'      => php_sapi_name(),
    'zts'       => PHP_ZTS ? 'Yes' : 'No',
    'opcache'   => function_exists('opcache_get_status') && opcache_get_status() !== false ? 'Enabled' : 'Disabled',
    'hostname'  => gethostname(),
    'time'      => date('Y-m-d H:i:s T'),
    'memory'    => round(memory_get_usage(true) / 1024 / 1024, 2) . ' MB',
    'pid'       => getmypid(),
];

$elapsed = (hrtime(true) - $startTime) / 1e6;

header('Content-Type: application/json');
echo json_encode([
    'status'      => 'ok',
    'message'     => 'PHPless microVM is running!',
    'info'        => $data,
    'response_us' => round($elapsed * 1000, 2),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

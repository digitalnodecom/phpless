<?php

declare(strict_types=1);

/**
 * PHPless FrankenPHP Worker Script
 *
 * This script runs in FrankenPHP worker mode: the PHP process stays alive
 * between requests, eliminating per-request bootstrap overhead.
 *
 * The frankenphp_handle_request() function blocks until a new HTTP request
 * arrives, then executes the callback. The process persists across requests.
 */

// One-time initialization (runs once when worker starts)
$requestCount = 0;
$workerStartTime = hrtime(true);

// Require the app's autoloader if it exists (for Laravel/Symfony apps)
$autoloader = '/app/vendor/autoload.php';
if (file_exists($autoloader)) {
    require $autoloader;
}

// Worker loop: handle requests until the process is killed
$running = frankenphp_handle_request(function () use (&$requestCount, $workerStartTime): void {
    $requestCount++;
    $requestStart = hrtime(true);

    // Route the request
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH);

    // Health check
    if ($path === '/health') {
        header('Content-Type: text/plain');
        echo 'ok';
        return;
    }

    // Metrics endpoint
    if ($path === '/metrics') {
        $uptime = (hrtime(true) - $workerStartTime) / 1e9;
        header('Content-Type: application/json');
        echo json_encode([
            'requests_handled' => $requestCount,
            'worker_uptime_s'  => round($uptime, 2),
            'memory_usage_mb'  => round(memory_get_usage(true) / 1024 / 1024, 2),
            'peak_memory_mb'   => round(memory_get_peak_usage(true) / 1024 / 1024, 2),
            'pid'              => getmypid(),
        ]);
        return;
    }

    // Default: serve the main index
    $elapsed = (hrtime(true) - $requestStart) / 1e6;

    header('Content-Type: application/json');
    echo json_encode([
        'status'            => 'ok',
        'message'           => 'PHPless microVM is running!',
        'worker_mode'       => true,
        'requests_handled'  => $requestCount,
        'php_version'       => PHP_VERSION,
        'sapi'              => php_sapi_name(),
        'hostname'          => gethostname(),
        'time'              => date('Y-m-d H:i:s T'),
        'response_ms'       => round($elapsed, 3),
        'pid'               => getmypid(),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
});

// Worker exited — this runs during graceful shutdown

<?php

return [
    'manager_socket' => env('PHPLESS_MANAGER_SOCKET', '/var/fc/manager.sock'),
    'manager_secret' => env('PHPLESS_MANAGER_SECRET', ''),
    'domain' => env('PHPLESS_DOMAIN', 'phpless.digitalno.de'),
    'caddyfile_path' => env('PHPLESS_CADDYFILE_PATH', '/etc/caddy/Caddyfile'),
    'builds_dir' => env('PHPLESS_BUILDS_DIR', '/var/www/phpless/builds'),
    'persistent_dir' => env('PHPLESS_PERSISTENT_DIR', '/var/www/phpless/persistent'),
    'log_dir' => env('PHPLESS_LOG_DIR', '/var/log/phpless/apps'),
    'server_ip' => env('PHPLESS_SERVER_IP', '65.108.14.212'),
    // Comma-separated list of admin emails. Admins get access to /admin (platform view)
    // outside of any team context.
    'admin_emails' => array_values(array_filter(array_map('trim', explode(',', env('PHPLESS_ADMIN_EMAILS', env('PHPLESS_ADMIN_EMAIL', '')))))),
    'registration_open' => env('REGISTRATION_OPEN', true),

    'default_plan' => 'sandbox',

    'plans' => [
        'sandbox' => [
            'label' => 'Sandbox',
            'app_limit' => 1,
            'max_mem_mib' => 128,
            'max_vcpus' => 1,
            'custom_domains' => false,
            'log_retention_days' => 7,
            'price' => 0,
        ],
        'developer' => [
            'label' => 'Developer',
            'app_limit' => 3,
            'max_mem_mib' => 256,
            'max_vcpus' => 1,
            'custom_domains' => true,
            'log_retention_days' => 30,
            'price' => 1000, // cents
        ],
        'team' => [
            'label' => 'Team',
            'app_limit' => 10,
            'max_mem_mib' => 512,
            'max_vcpus' => 2,
            'custom_domains' => true,
            'log_retention_days' => 90,
            'price' => 2500,
        ],
        'business' => [
            'label' => 'Business',
            'app_limit' => 50,
            'max_mem_mib' => 1024,
            'max_vcpus' => 2,
            'custom_domains' => true,
            'priority_support' => true,
            'log_retention_days' => 365,
            'price' => 10000,
        ],
    ],
];

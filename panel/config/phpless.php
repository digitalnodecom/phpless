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
];

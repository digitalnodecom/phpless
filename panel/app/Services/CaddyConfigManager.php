<?php

namespace App\Services;

use App\Models\App;
use Illuminate\Support\Facades\Process;
use RuntimeException;

class CaddyConfigManager
{
    private string $caddyfilePath;
    private string $domain;
    private string $logDir;

    public function __construct()
    {
        $this->caddyfilePath = config('phpless.caddyfile_path');
        $this->domain = config('phpless.domain');
        $this->logDir = config('phpless.log_dir');
    }

    public function regenerateAndReload(): void
    {
        $config = $this->generateConfig();
        file_put_contents($this->caddyfilePath, $config);

        $result = Process::run('sudo /usr/local/bin/phpless-caddy-reload');

        if ($result->failed()) {
            throw new RuntimeException("Failed to reload Caddy: {$result->errorOutput()}");
        }
    }

    private function generateConfig(): string
    {
        $allApps = App::with(['domains' => fn ($q) => $q->where('dns_verified', true)])->get();

        $lines = [];

        // Global options
        $lines[] = '{';
        $lines[] = "\temail admin@phpless.io";
        $lines[] = '}';
        $lines[] = '';

        // Panel block
        $lines[] = "{$this->domain} {";
        $lines[] = "\thandle_path /ws/* {";
        $lines[] = "\t\treverse_proxy 127.0.0.1:7474";
        $lines[] = "\t}";
        $lines[] = "\trequest_body {";
        $lines[] = "\t\tmax_size 1GB";
        $lines[] = "\t}";
        $lines[] = "\troot * /var/www/phpless/panel/public";
        $lines[] = "\tphp_fastcgi unix//run/php/php8.4-fpm.sock";
        $lines[] = "\tfile_server";
        $lines[] = "\tencode gzip";
        $lines[] = '}';
        $lines[] = '';

        // Per-app blocks — every app gets a TLS-enabled block
        foreach ($allApps as $app) {
            $this->appendAppBlock($lines, "{$app->slug}.{$this->domain}", $app);

            // Custom domains for this app
            foreach ($app->domains as $domain) {
                $this->appendAppBlock($lines, $domain->domain, $app);
            }
        }

        // Catch-all for unknown subdomains (HTTP only — no wildcard cert)
        $lines[] = ':80 {';
        $lines[] = "\t@phpless_sub header_regexp Host ^([a-z0-9-]+)\\.phpless\\.digitalno\\.de$";
        $lines[] = "\thandle @phpless_sub {";
        $lines[] = "\t\trespond \"App not found\" 404";
        $lines[] = "\t}";
        $lines[] = "\thandle {";
        $lines[] = "\t\trespond \"PHPless Engine\" 200";
        $lines[] = "\t}";
        $lines[] = '}';
        $lines[] = '';

        // Health check
        $lines[] = ':8081 {';
        $lines[] = "\trespond /health \"PHPless Host OK\" 200";
        $lines[] = '}';
        $lines[] = '';

        return implode("\n", $lines);
    }

    private function appendAppBlock(array &$lines, string $hostname, App $app): void
    {
        $hasAllowlist = ! empty($app->ip_allowlist);
        $isRunning = $app->vm_state === 'running' && $app->vm_ip;

        $lines[] = "{$hostname} {";

        if ($hasAllowlist) {
            $ips = implode(' ', $app->ip_allowlist);
            $lines[] = "\t@allowed remote_ip {$ips}";
            $lines[] = "\thandle @allowed {";
            if ($isRunning) {
                $lines[] = "\t\treverse_proxy {$app->vm_ip}:8080";
            } else {
                $lines[] = "\t\trespond \"App is {$app->vm_state}\" 503";
            }
            $lines[] = "\t}";
            $lines[] = "\trespond \"Forbidden\" 403";
        } else {
            if ($isRunning) {
                $lines[] = "\treverse_proxy {$app->vm_ip}:8080";
            } else {
                $lines[] = "\trespond \"App is {$app->vm_state}\" 503";
            }
        }

        $lines[] = "\tlog {";
        $lines[] = "\t\toutput file {$this->logDir}/{$app->slug}.log {";
        $lines[] = "\t\t\troll_size 50MiB";
        $lines[] = "\t\t\troll_keep 3";
        $lines[] = "\t\t\troll_keep_for 168h";
        $lines[] = "\t\t}";
        $lines[] = "\t\tformat json";
        $lines[] = "\t}";
        $lines[] = '}';
        $lines[] = '';
    }
}

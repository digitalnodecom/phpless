<?php

namespace App\Services;

use App\Models\App;

class CaddyfileGenerator
{
    private function validatePath(string $value, string $field): void
    {
        if (preg_match('/\.\./', $value) || ! preg_match('/^[a-zA-Z0-9\/_.\-]+$/', $value)) {
            throw new \InvalidArgumentException("Invalid {$field}: contains disallowed characters or path traversal.");
        }
    }

    public function generate(App $app): string
    {
        if ($app->web_root && $app->web_root !== '/') {
            $this->validatePath($app->web_root, 'web_root');
        }
        if ($app->worker_script) {
            $this->validatePath($app->worker_script, 'worker_script');
        }

        // Global block
        $lines = ['{', "\tadmin off", "\tauto_https off"];

        // num_threads controls PHP worker threads — 2 is enough for most apps on 1 vCPU,
        // keeps memory under ~80MB RSS. Apps needing more throughput can bump via worker_count.
        $numThreads = $app->worker_mode ? $app->worker_count : 2;

        $lines[] = "\tfrankenphp {";
        $lines[] = "\t\tnum_threads {$numThreads}";
        if ($app->worker_mode) {
            $lines[] = "\t\tworker /app/{$app->worker_script} {$app->worker_count}";
        }
        $lines[] = "\t}";

        $lines[] = "\tservers {";
        $lines[] = "\t\tprotocols h1 h2c";
        $lines[] = "\t}";
        $lines[] = '}';

        // Server block
        $webRoot = $app->web_root ?: '/';
        $docRoot = ($webRoot === '/' || $webRoot === '.') ? '/app' : "/app/{$webRoot}";

        $lines[] = ':8080 {';
        $lines[] = "\troot * {$docRoot}";
        $lines[] = "\tencode zstd gzip";

        if ($app->mercure_enabled) {
            $lines[] = "\tmercure {";
            $lines[] = "\t\tpublisher_jwt {env.MERCURE_PUBLISHER_JWT_KEY}";
            $lines[] = "\t\tsubscriber_jwt {env.MERCURE_SUBSCRIBER_JWT_KEY}";
            $lines[] = "\t\tanonymous";
            $lines[] = "\t}";
        }

        $lines[] = "\tphp_server";
        $lines[] = "\tlog {";
        $lines[] = "\t\toutput stderr";
        $lines[] = "\t\tformat console";
        $lines[] = "\t\tlevel ERROR";
        $lines[] = "\t}";
        $lines[] = '}';

        return implode("\n", $lines) . "\n";
    }
}

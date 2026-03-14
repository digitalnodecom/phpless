<?php

namespace App\Services;

use App\Models\App;

class CaddyfileGenerator
{
    public function generate(App $app): string
    {
        // Global block
        $lines = ['{', "\tadmin off", "\tauto_https off"];

        if ($app->worker_mode) {
            $lines[] = "\tfrankenphp {";
            $lines[] = "\t\tworker /app/{$app->worker_script} {$app->worker_count}";
            $lines[] = "\t}";
        } else {
            $lines[] = "\tfrankenphp";
        }

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

<?php

namespace App\Services;

use App\Models\App;
use App\Models\EnvironmentVariable;
use Illuminate\Support\Collection;

class EnvironmentVariableService
{
    /**
     * Get merged environment variables for an app (team + app, app overrides team on same key).
     * Each item gets a 'source' attribute: 'team' or 'app'.
     */
    public function getMergedVariables(App $app): Collection
    {
        $teamVars = EnvironmentVariable::forTeam($app->team_id)->get()
            ->each(fn ($v) => $v->setAttribute('source', 'team'));

        $appVars = EnvironmentVariable::forApp($app->id)->get()
            ->each(fn ($v) => $v->setAttribute('source', 'app'));

        // Merge: app vars override team vars on same key
        $merged = $teamVars->keyBy('key');

        foreach ($appVars as $var) {
            $merged->put($var->key, $var);
        }

        return $merged->values()->sortBy('key')->values();
    }

    /**
     * Generate .env file content from merged variables.
     */
    public function generateEnvContent(App $app): string
    {
        $vars = $this->getMergedVariables($app);

        if ($vars->isEmpty()) {
            return '';
        }

        $lines = [];

        foreach ($vars as $var) {
            $escaped = str_replace(['\\', '"', '$', '`'], ['\\\\', '\\"', '\\$', '\\`'], $var->value);
            $lines[] = "{$var->key}=\"{$escaped}\"";
        }

        return implode("\n", $lines) . "\n";
    }
}

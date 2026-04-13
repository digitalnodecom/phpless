<?php

namespace App\Services;

use App\Models\App;
use Illuminate\Support\Facades\File;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

class SqliteDetector
{
    /**
     * SQLite file magic bytes: "SQLite format 3\0"
     */
    private const SQLITE_MAGIC = "SQLite format 3\x00";

    /**
     * Scan a build directory for SQLite databases.
     * Returns array of detected file paths (relative to build dir).
     *
     * @return string[]
     */
    public static function detect(string $buildPath, ?App $app = null): array
    {
        $detected = [];

        // 1. Glob for *.sqlite, *.sqlite3, *.db files and verify magic bytes
        if (is_dir($buildPath)) {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($buildPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST,
            );

            foreach ($iterator as $file) {
                if (! $file->isFile()) {
                    continue;
                }

                $ext = strtolower($file->getExtension());
                if (! in_array($ext, ['sqlite', 'sqlite3', 'db'], true)) {
                    continue;
                }

                $fullPath = $file->getRealPath();

                // Verify it's actually a SQLite file by checking magic bytes
                if (self::isSqliteFile($fullPath)) {
                    $detected[] = ltrim(str_replace($buildPath, '', $fullPath), '/');
                }
            }
        }

        // 2. Check env vars for SQLite configuration
        if ($app) {
            $envPaths = self::detectFromEnvVars($app);
            foreach ($envPaths as $envPath) {
                if (! in_array($envPath, $detected, true)) {
                    $detected[] = $envPath;
                }
            }
        }

        return array_values(array_unique($detected));
    }

    /**
     * Merge newly detected SQLite paths with existing app config.
     * - New detections: add with persistent=true, backup_enabled=false
     * - Existing entries: keep user's config
     * - Removed files: keep in config (don't delete user config)
     *
     * @param  array  $existing  Current sqlite_databases from the app
     * @param  string[]  $detectedPaths  Newly detected paths
     * @return array Updated sqlite_databases array
     */
    public static function mergeDetections(array $existing, array $detectedPaths): array
    {
        $existingByPath = [];
        foreach ($existing as $entry) {
            $existingByPath[$entry['path']] = $entry;
        }

        // Add new detections
        foreach ($detectedPaths as $path) {
            if (! isset($existingByPath[$path])) {
                $existingByPath[$path] = [
                    'path' => $path,
                    'persistent' => true,
                    'backup_enabled' => false,
                    'detected_at' => now()->toIso8601String(),
                ];
            }
        }

        return array_values($existingByPath);
    }

    /**
     * Check if a file is a valid SQLite database by reading magic bytes.
     */
    private static function isSqliteFile(string $path): bool
    {
        if (! is_readable($path) || filesize($path) < 16) {
            return false;
        }

        $handle = fopen($path, 'rb');
        if (! $handle) {
            return false;
        }

        $header = fread($handle, 16);
        fclose($handle);

        return $header === self::SQLITE_MAGIC;
    }

    /**
     * Detect SQLite paths from the app's environment variables.
     *
     * @return string[]
     */
    private static function detectFromEnvVars(App $app): array
    {
        $paths = [];
        $envVars = $app->environmentVariables()
            ->pluck('value', 'key')
            ->toArray();

        // Also check team-level env vars
        if ($app->team) {
            $teamVars = $app->team->environmentVariables()
                ->pluck('value', 'key')
                ->toArray();
            $envVars = array_merge($teamVars, $envVars);
        }

        $dbConnection = $envVars['DB_CONNECTION'] ?? null;
        $dbDatabase = $envVars['DB_DATABASE'] ?? null;
        $databaseUrl = $envVars['DATABASE_URL'] ?? null;

        // DB_CONNECTION=sqlite with DB_DATABASE path
        if ($dbConnection === 'sqlite' && $dbDatabase) {
            $path = self::normalizeDbPath($dbDatabase);
            if ($path) {
                $paths[] = $path;
            }
        }

        // DATABASE_URL=sqlite:/path/to/db
        if ($databaseUrl && str_starts_with($databaseUrl, 'sqlite:')) {
            $sqlitePath = substr($databaseUrl, 7);
            // Remove leading slashes for relative paths
            $sqlitePath = ltrim($sqlitePath, '/');
            if ($sqlitePath) {
                $paths[] = $sqlitePath;
            }
        }

        return $paths;
    }

    /**
     * Normalize a database path to be relative to the app root.
     */
    private static function normalizeDbPath(string $dbPath): ?string
    {
        // Already a relative path
        if (! str_starts_with($dbPath, '/')) {
            return $dbPath;
        }

        // Absolute path starting with /app/ (VM path)
        if (str_starts_with($dbPath, '/app/')) {
            return substr($dbPath, 5);
        }

        // Common Laravel default: database_path() resolves to /app/database/
        if (str_contains($dbPath, 'database/database.sqlite')) {
            return 'database/database.sqlite';
        }

        return null;
    }
}

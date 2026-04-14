<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use ZipArchive;

class WordPressSqliteConfigurator
{
    private const PLUGIN_DOWNLOAD_URL = 'https://downloads.wordpress.org/plugin/sqlite-database-integration.latest-stable.zip';

    /**
     * Configure WordPress to use SQLite via the sqlite-database-integration plugin.
     *
     * @return string[] List of configuration actions taken
     */
    public static function configure(string $buildPath): array
    {
        $actions = [];

        $wpContentPath = $buildPath . '/wp-content';
        if (! is_dir($wpContentPath)) {
            File::ensureDirectoryExists($wpContentPath);
        }

        $pluginPaths = [
            $wpContentPath . '/mu-plugins/sqlite-database-integration',
            $wpContentPath . '/plugins/sqlite-database-integration',
        ];

        $pluginFound = false;
        $pluginPath = null;
        foreach ($pluginPaths as $path) {
            if (is_dir($path)) {
                $pluginFound = true;
                $pluginPath = $path;
                break;
            }
        }

        // Download and install the plugin as a must-use plugin if not present
        if (! $pluginFound) {
            $muPluginsDir = $wpContentPath . '/mu-plugins';
            File::ensureDirectoryExists($muPluginsDir);
            $pluginPath = $muPluginsDir . '/sqlite-database-integration';

            if (self::downloadAndExtractPlugin($buildPath, $muPluginsDir)) {
                $actions[] = 'plugin_installed';
            }
        }

        // Copy the db.php drop-in if it doesn't exist
        if ($pluginPath && ! file_exists($wpContentPath . '/db.php')) {
            $dbCopySource = $pluginPath . '/db.copy';
            if (file_exists($dbCopySource)) {
                copy($dbCopySource, $wpContentPath . '/db.php');
                $actions[] = 'db_dropin_copied';
            }
        }

        // Ensure the database directory exists
        $databaseDir = $wpContentPath . '/database';
        if (! is_dir($databaseDir)) {
            File::ensureDirectoryExists($databaseDir);
            // Add .htaccess to prevent direct access
            file_put_contents($databaseDir . '/.htaccess', "Deny from all\n");
            $actions[] = 'database_dir_created';
        }

        return $actions;
    }

    private static function downloadAndExtractPlugin(string $buildPath, string $muPluginsDir): bool
    {
        $tmpZip = sys_get_temp_dir() . '/sqlite-database-integration-' . uniqid() . '.zip';

        try {
            $context = stream_context_create(['http' => ['timeout' => 30]]);
            $data = @file_get_contents(self::PLUGIN_DOWNLOAD_URL, false, $context);
            if ($data === false) {
                // Fallback: try curl
                $exitCode = 0;
                exec('curl -sL -o ' . escapeshellarg($tmpZip) . ' ' . escapeshellarg(self::PLUGIN_DOWNLOAD_URL) . ' 2>&1', $output, $exitCode);
                if ($exitCode !== 0) {
                    return false;
                }
            } else {
                file_put_contents($tmpZip, $data);
            }

            // Extract using ZipArchive
            $zip = new ZipArchive;
            if ($zip->open($tmpZip) !== true) {
                return false;
            }

            $zip->extractTo($muPluginsDir);
            $zip->close();

            return is_dir($muPluginsDir . '/sqlite-database-integration');
        } finally {
            @unlink($tmpZip);
        }
    }
}

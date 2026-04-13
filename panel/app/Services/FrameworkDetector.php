<?php

namespace App\Services;

class FrameworkDetector
{
    /**
     * Detect the PHP framework used in the given build path.
     *
     * @return array{framework: string, web_root: string, build_command: string}
     */
    public static function detect(string $buildPath): array
    {
        $defaults = [
            'framework' => 'vanilla',
            'web_root' => '/',
            'build_command' => '',
        ];

        try {
            // Check for Laravel (artisan file is the strongest signal)
            if (file_exists($buildPath . '/artisan')) {
                return [
                    'framework' => 'laravel',
                    'web_root' => 'public',
                    'build_command' => 'composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache && php artisan view:cache',
                ];
            }

            // Parse composer.json for framework detection
            $composerPath = $buildPath . '/composer.json';
            if (! file_exists($composerPath)) {
                return $defaults;
            }

            $composerJson = @json_decode(file_get_contents($composerPath), true);
            if (! is_array($composerJson)) {
                return $defaults;
            }

            $require = array_merge(
                $composerJson['require'] ?? [],
                $composerJson['require-dev'] ?? [],
            );

            // Laravel via composer.json (fallback if artisan missing)
            if (isset($require['laravel/framework'])) {
                return [
                    'framework' => 'laravel',
                    'web_root' => 'public',
                    'build_command' => 'composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache && php artisan view:cache',
                ];
            }

            // Symfony
            if (isset($require['symfony/framework-bundle'])) {
                return [
                    'framework' => 'symfony',
                    'web_root' => 'public',
                    'build_command' => 'composer install --no-dev --optimize-autoloader',
                ];
            }

            // CakePHP
            if (isset($require['cakephp/cakephp'])) {
                return [
                    'framework' => 'cakephp',
                    'web_root' => 'webroot',
                    'build_command' => 'composer install --no-dev --optimize-autoloader',
                ];
            }

            // CodeIgniter 4
            if (isset($require['codeigniter4/framework'])) {
                return [
                    'framework' => 'codeigniter',
                    'web_root' => 'public',
                    'build_command' => 'composer install --no-dev --optimize-autoloader',
                ];
            }

            // Slim
            if (isset($require['slim/slim'])) {
                return [
                    'framework' => 'slim',
                    'web_root' => 'public',
                    'build_command' => 'composer install --no-dev --optimize-autoloader',
                ];
            }

            // Yii2
            if (isset($require['yiisoft/yii2'])) {
                return [
                    'framework' => 'yii2',
                    'web_root' => 'web',
                    'build_command' => 'composer install --no-dev --optimize-autoloader',
                ];
            }

            return $defaults;
        } catch (\Throwable) {
            return $defaults;
        }
    }
}

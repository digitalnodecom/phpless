<?php

namespace App\Jobs;

use App\Models\App;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class SendUpAlertJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public App $app,
        public int $statusCode,
        public string $checkedAt,
    ) {}

    public function handle(): void
    {
        $payload = [
            'app_name' => $this->app->name,
            'slug' => $this->app->slug,
            'url' => $this->app->url(),
            'status_code' => $this->statusCode,
            'checked_at' => $this->checkedAt,
            'event' => 'up',
        ];

        if ($this->app->alert_email) {
            Mail::raw(
                "Your app {$this->app->name} ({$this->app->url()}) is back UP.\n\n"
                . "Status code: {$this->statusCode}\n"
                . "Recovered at: {$this->checkedAt}\n\n"
                . 'PHPless Monitoring',
                function ($message) {
                    $message->to($this->app->alert_email)
                        ->subject("[PHPless] {$this->app->name} is back UP");
                }
            );
        }

        if ($this->app->alert_webhook_url) {
            Http::timeout(10)->post($this->app->alert_webhook_url, $payload);
        }
    }
}

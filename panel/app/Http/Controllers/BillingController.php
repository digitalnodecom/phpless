<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BillingController extends Controller
{
    public function index(Request $request): Response
    {
        $team = $request->user()->currentTeam;

        $subscription = $team->subscription('default');
        $invoices = [];

        if ($team->hasStripeId()) {
            try {
                $invoices = $team->invoices()->map(fn ($inv) => [
                    'id' => $inv->id,
                    'date' => $inv->date()->toDateString(),
                    'total' => $inv->total(),
                    'status' => $inv->status,
                    'pdf' => $inv->invoice_pdf,
                ])->take(12)->values()->all();
            } catch (\Throwable) {
                // Stripe not reachable or no invoices yet
            }
        }

        return Inertia::render('settings/billing', [
            'subscription' => $subscription ? [
                'status' => $subscription->stripe_status,
                'ends_at' => $subscription->ends_at?->toDateString(),
                'trial_ends_at' => $subscription->trial_ends_at?->toDateString(),
            ] : null,
            'payment_method' => [
                'type' => $team->pm_type,
                'last_four' => $team->pm_last_four,
            ],
            'invoices' => $invoices,
        ]);
    }

    public function checkout(Request $request): RedirectResponse
    {
        $team = $request->user()->currentTeam;

        $checkout = $team->newSubscription('default', config('services.stripe.price_id'))
            ->checkout([
                'success_url' => route('settings.billing') . '?checkout=success',
                'cancel_url' => route('settings.billing'),
            ]);

        return redirect($checkout->url);
    }

    public function portal(Request $request): RedirectResponse
    {
        $team = $request->user()->currentTeam;

        return $team->redirectToBillingPortal(route('settings.billing'));
    }

    public function usage(Request $request)
    {
        $team = $request->user()->currentTeam;

        $periodStart = now()->startOfMonth();

        $totalRequests = \App\Models\RequestMetric::query()
            ->join('apps', 'request_metrics.app_id', '=', 'apps.id')
            ->where('apps.team_id', $team->id)
            ->where('request_metrics.period', '>=', $periodStart)
            ->sum('request_metrics.requests');

        $totalRequests = (int) $totalRequests;
        $freeAllowance = 1000;
        $billableRequests = max(0, $totalRequests - $freeAllowance);
        $pricePerRequest = 0.0001;
        $estimatedCost = round($billableRequests * $pricePerRequest, 4);

        return response()->json([
            'requests_this_month' => $totalRequests,
            'free_allowance' => $freeAllowance,
            'free_remaining' => max(0, $freeAllowance - $totalRequests),
            'billable_requests' => $billableRequests,
            'estimated_cost' => $estimatedCost,
        ]);
    }
}

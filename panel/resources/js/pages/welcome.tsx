import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import {
    ArrowRight,
    Bot,
    Check,
    ChevronRight,
    Cpu,
    GitBranch,
    Lock,
    Rocket,
    Server,
    Shield,
    Terminal,
    Timer,
    Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const features = [
    {
        icon: Shield,
        title: 'Firecracker VM Isolation',
        description: 'True hardware-level isolation per app. Each microVM gets its own kernel, memory, and network — no shared runtimes.',
    },
    {
        icon: Zap,
        title: 'FrankenPHP Performance',
        description: 'The fastest PHP runtime with worker mode support. Built on Caddy with automatic HTTPS and HTTP/3.',
    },
    {
        icon: Timer,
        title: '~1.2s Cold Starts',
        description: 'Firecracker microVMs boot faster than containers. Your app goes from zero to serving requests in just over a second.',
    },
    {
        icon: Bot,
        title: 'AI-Native MCP Server',
        description: 'Let AI agents deploy and manage your apps through the Model Context Protocol. First-class AI integration.',
    },
    {
        icon: GitBranch,
        title: 'Git Push to Deploy',
        description: 'Connect your GitHub repo and push to deploy. Automatic builds, zero-downtime deployments.',
    },
    {
        icon: Terminal,
        title: 'Simple CLI',
        description: 'Run phpless up and you\'re live. Manage apps, environment variables, and logs from your terminal.',
    },
];

const steps = [
    {
        number: '01',
        title: 'Create',
        description: 'Initialize your app with a single command or through the dashboard.',
        code: `$ phpless apps:create my-app
Creating app "my-app"...
App created: my-app.phpless.app`,
    },
    {
        number: '02',
        title: 'Deploy',
        description: 'Push your code. We handle the rest — builds, dependencies, routing.',
        code: `$ phpless deploy
Uploading files...
Building app...
Deployed! Live at my-app.phpless.app`,
    },
    {
        number: '03',
        title: 'Live',
        description: 'Your app is running in an isolated microVM with automatic HTTPS.',
        code: `$ curl https://my-app.phpless.app
Hello from PHPless!

$ phpless logs
[200] GET / - 2.3ms`,
    },
];

const plans = [
    {
        name: 'Sandbox',
        price: 'Free',
        period: '',
        description: 'Perfect for trying things out',
        features: ['1 app', '128 MB memory', 'Shared subdomain', 'Community support', '1 GB storage'],
        cta: 'Get Started Free',
        highlighted: false,
    },
    {
        name: 'Developer',
        price: '$10',
        period: '/mo',
        description: 'For side projects and indie apps',
        features: ['3 apps', '256 MB memory per app', 'Custom domains', 'Automatic SSL', '5 GB storage', 'Email support'],
        cta: 'Start Building',
        highlighted: false,
    },
    {
        name: 'Team',
        price: '$25',
        period: '/mo',
        description: 'For growing teams and products',
        features: [
            '10 apps',
            '512 MB memory per app',
            'Custom domains',
            'Team collaboration',
            '20 GB storage',
            'Priority support',
            'GitHub integration',
        ],
        cta: 'Start Free Trial',
        highlighted: true,
    },
    {
        name: 'Business',
        price: '$100',
        period: '/mo',
        description: 'For production workloads at scale',
        features: [
            '50 apps',
            '1024 MB memory per app',
            'Custom domains',
            'Team collaboration',
            '100 GB storage',
            'Priority support',
            'SLA guarantee',
            'Dedicated resources',
        ],
        cta: 'Contact Sales',
        highlighted: false,
    },
];

const benchmarks = [
    {
        metric: 'Cold Start',
        phpless: '~1.2s',
        docker: '~3-5s',
        traditional: '~30s+',
        icon: Rocket,
        description: 'Time from zero to serving first request',
    },
    {
        metric: 'Throughput',
        phpless: '3-10x',
        docker: '1x (PHP-FPM)',
        traditional: '1x',
        icon: Zap,
        description: 'FrankenPHP worker mode vs PHP-FPM baseline',
    },
    {
        metric: 'Isolation',
        phpless: 'VM-level',
        docker: 'Container',
        traditional: 'Process',
        icon: Lock,
        description: 'Security boundary between applications',
    },
    {
        metric: 'Memory Overhead',
        phpless: '~5 MB',
        docker: '~50 MB',
        traditional: '~500 MB',
        icon: Cpu,
        description: 'Per-instance memory overhead of the runtime',
    },
];

export default function Welcome() {
    const { auth } = usePage<SharedData>().props;

    return (
        <>
            <Head title="PHPless — Serverless PHP Hosting" />
            <div className="min-h-screen bg-background text-foreground">
                {/* Navigation */}
                <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
                    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2">
                            <Server className="h-6 w-6 text-primary" />
                            <span className="text-xl font-bold">PHPless</span>
                        </div>
                        <div className="hidden items-center gap-6 md:flex">
                            <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                Features
                            </a>
                            <a href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                How It Works
                            </a>
                            <a href="#performance" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                Performance
                            </a>
                            <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                                Pricing
                            </a>
                        </div>
                        <div className="flex items-center gap-3">
                            {auth.user ? (
                                <Button asChild>
                                    <Link href={route('dashboard')}>Dashboard</Link>
                                </Button>
                            ) : (
                                <>
                                    <Button variant="ghost" asChild>
                                        <Link href={route('login')}>Log in</Link>
                                    </Button>
                                    <Button asChild>
                                        <Link href={route('register')}>Get Started</Link>
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </nav>

                {/* Hero */}
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
                    <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
                        <div className="mx-auto max-w-3xl text-center">
                            <Badge variant="secondary" className="mb-6">
                                <Zap className="mr-1 h-3 w-3" />
                                Now in Beta
                            </Badge>
                            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                                Serverless PHP Hosting
                            </h1>
                            <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
                                Every app gets its own microVM. No containers. No shared runtimes.
                                <br className="hidden sm:inline" />
                                Just fast, isolated PHP hosting that scales to zero.
                            </p>
                            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                                <Button size="lg" asChild>
                                    <Link href={route('register')}>
                                        Get Started Free
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                                <Button size="lg" variant="outline" asChild>
                                    <a href="/docs/api">
                                        View Docs
                                        <ChevronRight className="ml-1 h-4 w-4" />
                                    </a>
                                </Button>
                            </div>
                            <div className="mt-12 rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm">
                                <span className="text-muted-foreground">$</span>{' '}
                                <span className="text-foreground">phpless up</span>
                                <br />
                                <span className="text-muted-foreground">Deploying to my-app.phpless.app...</span>
                                <br />
                                <span className="text-green-600 dark:text-green-400">Live in 1.2s</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features */}
                <section id="features" className="border-t border-border py-24 sm:py-32">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto max-w-2xl text-center">
                            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                Everything you need to ship PHP apps
                            </h2>
                            <p className="mt-4 text-lg text-muted-foreground">
                                Built on Firecracker — the same technology that powers AWS Lambda — with the fastest PHP runtime available.
                            </p>
                        </div>
                        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {features.map((feature) => (
                                <Card key={feature.title} className="border-border bg-card">
                                    <CardHeader>
                                        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                            <feature.icon className="h-5 w-5 text-primary" />
                                        </div>
                                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                {/* How It Works */}
                <section id="how-it-works" className="border-t border-border bg-muted/30 py-24 sm:py-32">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto max-w-2xl text-center">
                            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                Deploy in three steps
                            </h2>
                            <p className="mt-4 text-lg text-muted-foreground">
                                From zero to production in under a minute.
                            </p>
                        </div>
                        <div className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3">
                            {steps.map((step) => (
                                <div key={step.number} className="flex flex-col">
                                    <div className="mb-4 flex items-center gap-3">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                                            {step.number}
                                        </span>
                                        <h3 className="text-xl font-semibold">{step.title}</h3>
                                    </div>
                                    <p className="mb-4 text-sm text-muted-foreground">{step.description}</p>
                                    <div className="flex-1 rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed">
                                        {step.code.split('\n').map((line, i) => (
                                            <div key={i} className={line.startsWith('$') ? 'text-foreground' : 'text-muted-foreground'}>
                                                {line}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Performance / Benchmarks */}
                <section id="performance" className="border-t border-border py-24 sm:py-32">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto max-w-2xl text-center">
                            <Badge variant="secondary" className="mb-4">
                                <Rocket className="mr-1 h-3 w-3" />
                                Benchmarks
                            </Badge>
                            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                Performance that speaks for itself
                            </h2>
                            <p className="mt-4 text-lg text-muted-foreground">
                                Firecracker microVMs + FrankenPHP deliver the fastest PHP hosting available.
                            </p>
                        </div>

                        {/* Benchmark cards */}
                        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2">
                            {benchmarks.map((bench) => (
                                <Card key={bench.metric} className="border-border">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                                <bench.icon className="h-5 w-5 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">{bench.metric}</CardTitle>
                                                <CardDescription className="text-xs">{bench.description}</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-center">
                                                <div className="text-xs font-medium text-muted-foreground">PHPless</div>
                                                <div className="mt-1 text-lg font-bold text-primary">{bench.phpless}</div>
                                            </div>
                                            <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
                                                <div className="text-xs font-medium text-muted-foreground">Docker</div>
                                                <div className="mt-1 text-lg font-semibold text-muted-foreground">{bench.docker}</div>
                                            </div>
                                            <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
                                                <div className="text-xs font-medium text-muted-foreground">Traditional</div>
                                                <div className="mt-1 text-lg font-semibold text-muted-foreground">{bench.traditional}</div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Source note */}
                        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
                            FrankenPHP throughput benchmarks based on worker mode vs PHP-FPM comparisons.
                            See{' '}
                            <a
                                href="https://frankenphp.dev"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-2 hover:text-foreground"
                            >
                                frankenphp.dev
                            </a>{' '}
                            for detailed benchmarks. Cold start times measured on Hetzner AX41-NVMe bare metal.
                        </p>
                    </div>
                </section>

                {/* Pricing */}
                <section id="pricing" className="border-t border-border bg-muted/30 py-24 sm:py-32">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto max-w-2xl text-center">
                            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                Simple, transparent pricing
                            </h2>
                            <p className="mt-4 text-lg text-muted-foreground">
                                Start free, scale as you grow. No hidden fees.
                            </p>
                        </div>
                        <div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            {plans.map((plan) => (
                                <Card
                                    key={plan.name}
                                    className={`flex flex-col ${plan.highlighted ? 'border-primary shadow-md ring-1 ring-primary' : 'border-border'}`}
                                >
                                    <CardHeader>
                                        {plan.highlighted && (
                                            <Badge className="mb-2 w-fit">Most Popular</Badge>
                                        )}
                                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                                        <CardDescription>{plan.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex-1">
                                        <div className="mb-6">
                                            <span className="text-4xl font-bold">{plan.price}</span>
                                            {plan.period && (
                                                <span className="text-muted-foreground">{plan.period}</span>
                                            )}
                                        </div>
                                        <ul className="space-y-2.5">
                                            {plan.features.map((feature) => (
                                                <li key={feature} className="flex items-start gap-2 text-sm">
                                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                    <CardFooter>
                                        <Button
                                            variant={plan.highlighted ? 'default' : 'outline'}
                                            className="w-full"
                                            asChild
                                        >
                                            <Link href={route('register')}>{plan.cta}</Link>
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                {/* AI Integration */}
                <section className="border-t border-border py-24 sm:py-32">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="mx-auto max-w-5xl">
                            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                                <div>
                                    <Badge variant="secondary" className="mb-4">
                                        <Bot className="mr-1 h-3 w-3" />
                                        AI-Native
                                    </Badge>
                                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                        Let AI deploy your apps
                                    </h2>
                                    <p className="mt-4 text-muted-foreground">
                                        PHPless includes a built-in MCP (Model Context Protocol) server.
                                        Connect your AI assistant and let it create, deploy, and manage your applications
                                        through natural language.
                                    </p>
                                    <ul className="mt-6 space-y-3">
                                        {[
                                            'Create and configure apps via AI',
                                            'Deploy code with a single prompt',
                                            'Manage environment variables',
                                            'Monitor logs and performance',
                                            'Full API access for custom integrations',
                                        ].map((item) => (
                                            <li key={item} className="flex items-center gap-2 text-sm">
                                                <Check className="h-4 w-4 text-primary" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="rounded-lg border border-border bg-muted/50 p-6">
                                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                                        <Bot className="h-4 w-4" />
                                        AI Assistant
                                    </div>
                                    <div className="space-y-4 font-mono text-sm">
                                        <div className="rounded-md bg-background p-3">
                                            <span className="text-muted-foreground">User:</span>
                                            <br />
                                            Deploy my Laravel app to PHPless
                                        </div>
                                        <div className="rounded-md bg-primary/5 p-3">
                                            <span className="text-primary">Assistant:</span>
                                            <br />
                                            I'll create and deploy your app now.
                                            <br />
                                            <br />
                                            <span className="text-muted-foreground">{'>'} Creating app "laravel-app"...</span>
                                            <br />
                                            <span className="text-muted-foreground">{'>'} Setting environment variables...</span>
                                            <br />
                                            <span className="text-muted-foreground">{'>'} Deploying files...</span>
                                            <br />
                                            <br />
                                            <span className="text-green-600 dark:text-green-400">
                                                Done! Your app is live at laravel-app.phpless.app
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="border-t border-border bg-muted/30 py-24 sm:py-32">
                    <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                            Ready to ship?
                        </h2>
                        <p className="mt-4 text-lg text-muted-foreground">
                            Get your PHP app running in an isolated microVM in under 2 minutes.
                        </p>
                        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Button size="lg" asChild>
                                <Link href={route('register')}>
                                    Get Started Free
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                            <Button size="lg" variant="outline" asChild>
                                <a href="/llms.txt">
                                    <Bot className="mr-2 h-4 w-4" />
                                    llms.txt
                                </a>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="border-t border-border bg-background py-12">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Server className="h-5 w-5 text-primary" />
                                    <span className="text-lg font-bold">PHPless</span>
                                </div>
                                <p className="mt-3 text-sm text-muted-foreground">
                                    Serverless PHP hosting powered by Firecracker microVMs and FrankenPHP.
                                </p>
                            </div>
                            <div>
                                <h4 className="mb-3 text-sm font-semibold">Product</h4>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    <li><a href="#features" className="hover:text-foreground">Features</a></li>
                                    <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
                                    <li><a href="#performance" className="hover:text-foreground">Performance</a></li>
                                    <li><a href="/docs/api" className="hover:text-foreground">API Docs</a></li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="mb-3 text-sm font-semibold">Resources</h4>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    <li><a href="/llms.txt" className="hover:text-foreground">llms.txt</a></li>
                                    <li><a href="/docs/api" className="hover:text-foreground">Swagger UI</a></li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="mb-3 text-sm font-semibold">Account</h4>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    {auth.user ? (
                                        <li>
                                            <Link href={route('dashboard')} className="hover:text-foreground">
                                                Dashboard
                                            </Link>
                                        </li>
                                    ) : (
                                        <>
                                            <li>
                                                <Link href={route('login')} className="hover:text-foreground">
                                                    Log in
                                                </Link>
                                            </li>
                                            <li>
                                                <Link href={route('register')} className="hover:text-foreground">
                                                    Sign up
                                                </Link>
                                            </li>
                                        </>
                                    )}
                                </ul>
                            </div>
                        </div>
                        <Separator className="my-8" />
                        <p className="text-center text-xs text-muted-foreground">
                            &copy; {new Date().getFullYear()} PHPless. All rights reserved.
                        </p>
                    </div>
                </footer>
            </div>
        </>
    );
}

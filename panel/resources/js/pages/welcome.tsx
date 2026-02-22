import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';

export default function Welcome() {
    const { auth } = usePage<SharedData>().props;

    return (
        <>
            <Head title="PHPless — Serverless PHP Hosting" />
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#FDFDFC] p-6 text-[#1b1b18] dark:bg-[#0a0a0a] dark:text-[#EDEDEC]">
                <div className="w-full max-w-lg text-center">
                    <h1 className="mb-2 text-4xl font-bold tracking-tight">PHPless</h1>
                    <p className="text-lg text-[#706f6c] dark:text-[#A1A09A]">
                        Serverless PHP hosting powered by Firecracker microVMs.
                    </p>
                    <p className="mt-1 text-sm text-[#706f6c] dark:text-[#A1A09A]">
                        Deploy in seconds. Scale to zero. Pay for what you use.
                    </p>

                    <div className="mt-8 flex items-center justify-center gap-4">
                        {auth.user ? (
                            <Link
                                href={route('dashboard')}
                                className="rounded-md bg-[#1b1b18] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#2d2d2a] dark:bg-[#EDEDEC] dark:text-[#1b1b18] dark:hover:bg-[#d4d4d0]"
                            >
                                Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href={route('login')}
                                    className="rounded-md border border-[#19140035] px-6 py-2.5 text-sm font-medium hover:border-[#1915014a] dark:border-[#3E3E3A] dark:hover:border-[#62605b]"
                                >
                                    Log in
                                </Link>
                                <Link
                                    href={route('register')}
                                    className="rounded-md bg-[#1b1b18] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#2d2d2a] dark:bg-[#EDEDEC] dark:text-[#1b1b18] dark:hover:bg-[#d4d4d0]"
                                >
                                    Get Started
                                </Link>
                            </>
                        )}
                    </div>

                    <div className="mt-12 grid grid-cols-3 gap-6 text-left">
                        <div>
                            <h3 className="text-sm font-semibold">Fast Boot</h3>
                            <p className="mt-1 text-xs text-[#706f6c] dark:text-[#A1A09A]">
                                ~1.2s cold start with dedicated Firecracker microVMs per app.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Isolated</h3>
                            <p className="mt-1 text-xs text-[#706f6c] dark:text-[#A1A09A]">
                                Each app runs in its own VM with dedicated resources and networking.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">Simple CLI</h3>
                            <p className="mt-1 text-xs text-[#706f6c] dark:text-[#A1A09A]">
                                Deploy with a single command. Manage apps, env vars, and logs from your terminal.
                            </p>
                        </div>
                    </div>

                    <div className="mt-10 border-t border-[#19140018] pt-6 dark:border-[#3E3E3A]">
                        <p className="text-xs text-[#706f6c] dark:text-[#A1A09A]">
                            Using an AI assistant?{' '}
                            <a
                                href="/llms.txt"
                                className="underline underline-offset-2 hover:text-[#1b1b18] dark:hover:text-[#EDEDEC]"
                            >
                                llms.txt
                            </a>{' '}
                            has everything needed to deploy via CLI or API.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

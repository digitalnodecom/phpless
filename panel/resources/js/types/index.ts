import { LucideIcon } from 'lucide-react';

export interface Auth {
    user: User;
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    url: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export interface SharedData {
    name: string;
    quote: { message: string; author: string };
    auth: Auth;
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    current_team_id: number | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}

export interface Team {
    id: number;
    name: string;
    slug: string;
    owner_id: number;
    plan: string;
    created_at: string;
    updated_at: string;
}

export interface App {
    id: number;
    team_id: number;
    name: string;
    slug: string;
    vm_id: string | null;
    vm_ip: string | null;
    vm_state: string;
    vcpus: number;
    mem_mib: number;
    php_version: string;
    github_repo: string | null;
    github_branch: string;
    created_at: string;
    updated_at: string;
    deployments?: Deployment[];
    domains?: Domain[];
}

export interface Deployment {
    id: number;
    app_id: number;
    triggered_by: number | null;
    commit_sha: string | null;
    commit_message: string | null;
    branch: string | null;
    status: string;
    log: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface Domain {
    id: number;
    app_id: number;
    domain: string;
    type: string;
    dns_verified: boolean;
    ssl_active: boolean;
    verified_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface RequestMetric {
    id: number;
    app_id: number;
    period: string;
    requests: number;
    avg_duration: number;
    status_2xx: number;
    status_3xx: number;
    status_4xx: number;
    status_5xx: number;
    bytes_sent: number;
}

export interface AnalyticsSummary {
    total_requests: number;
    avg_duration: number;
    error_rate: number;
    total_bytes: number;
}

export interface LogEntry {
    timestamp: string;
    method: string;
    path: string;
    status: number;
    duration: number;
    client_ip: string;
    size: number;
}

export interface DashboardStats {
    totalApps: number;
    runningApps: number;
    appLimit: number;
    engineStatus: string;
    engineHealth: Record<string, unknown> | null;
}

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

export interface TeamSummary {
    id: number;
    name: string;
    slug: string;
}

export interface SharedData {
    name: string;
    quote: { message: string; author: string };
    auth: Auth;
    currentTeam: TeamSummary | null;
    userTeams: TeamSummary[];
    registrationOpen: boolean;
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    current_team_id: number | null;
    is_admin: boolean;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}

export interface Subscription {
    status: string;
    ends_at: string | null;
    trial_ends_at: string | null;
}

export interface Invoice {
    id: string;
    date: string;
    total: string;
    status: string;
    pdf: string | null;
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
    worker_mode: boolean;
    worker_script: string;
    worker_count: number;
    mercure_enabled: boolean;
    web_root: string;
    persistent_paths: string[] | null;
    created_at: string;
    updated_at: string;
    workers: WorkerDef[] | null;
    port_mappings: PortMapping[] | null;
    disk_used: number | null;
    disk_total: number | null;
    mem_used: number | null;
    cpu_pct: number | null;
    deployments?: Deployment[];
    domains?: Domain[];
}

export interface PortMapping {
    external: number;
    internal: number;
    protocol: 'tcp' | 'udp';
}

export interface WorkerDef {
    name: string;
    command: string;
    processes: number;
    directory?: string;
}

export interface WorkerStatus {
    name: string;
    index: number;
    pid: number;
    state: string;
    restarts: number;
    uptime_seconds: number;
    last_exit_code: number;
}

export interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'dir';
    size: number;
    modified_at: string;
    is_persistent: boolean;
}

export interface Deployment {
    id: number;
    app_id: number;
    triggered_by: { id: number; name: string } | null;
    commit_sha: string | null;
    commit_message: string | null;
    branch: string | null;
    status: string;
    log: string | null;
    source: string | null;
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

export interface EnvironmentVariable {
    id: number;
    key: string;
    value: string;
    is_secret: boolean;
    source?: 'app' | 'team';
    created_at: string;
    updated_at: string;
}

export interface DashboardStats {
    totalApps: number;
    runningApps: number;
    engineStatus: string;
    engineHealth: Record<string, unknown> | null;
}

export interface TeamMember {
    id: number;
    name: string;
    email: string;
    role: string;
    is_owner: boolean;
}

export interface TeamInvitation {
    id: number;
    email: string | null;
    url: string;
    expires_at: string;
    created_at: string;
}

export interface Role {
    id: number;
    name: string;
    description: string | null;
    is_system: boolean;
    permissions: Permission[];
    pages?: Page[];
}

export interface Permission {
    id: number;
    name: string;
    description: string | null;
}

export interface Page {
    id: number;
    name: string;
    route_path: string;
    group_name: string;
    sub_group?: string | null;
    sort_order: number;
    user_count?: number;
    roles?: Role[];
}

export interface AdminUser {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
    roles: Role[];
    created_at: string;
}

export interface PaginatedUsers {
    data: AdminUser[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
}

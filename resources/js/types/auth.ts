export type User = {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    google_id?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

export type Auth = {
    user: User;
    roles: string[];
    permissions: string[];
    is_admin: boolean;
};

export type NavigationItem = {
    name: string;
    route_path: string;
};

export type NavigationGroup = {
    [groupName: string]: NavigationItem[];
};

export type PageProps<T extends Record<string, unknown> = Record<string, unknown>> = T & {
    auth: Auth;
    navigation: NavigationGroup;
    flash?: {
        success?: string | null;
        error?: string | null;
    };
};

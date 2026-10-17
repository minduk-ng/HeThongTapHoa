export interface NavLink {
    id: number;
    name: string;
    route_path: string;
}

export interface NavSubGroup {
    name: string;
    links: NavLink[];
}

export interface NavGroup {
    name: string;
    links: NavLink[];
    subs: NavSubGroup[];
}

function isValidNavLink(item: unknown): item is NavLink {
    if (!item || typeof item !== 'object') {
        return false;
    }

    const candidate = item as Record<string, unknown>;

    return (
        typeof candidate.id === 'number' &&
        typeof candidate.name === 'string' &&
        typeof candidate.route_path === 'string'
    );
}

export function normalizeNavigation(value: unknown): NavGroup[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
    }

    const groups: NavGroup[] = [];

    for (const [groupName, groupValue] of Object.entries(value)) {
        if (!groupValue || typeof groupValue !== 'object') {
            continue;
        }

        const links: NavLink[] = [];
        const subs: NavSubGroup[] = [];

        if (Array.isArray(groupValue)) {
            for (const item of groupValue) {
                if (isValidNavLink(item)) {
                    links.push(item);
                }
            }
        } else {
            const groupRecord = groupValue as Record<string, unknown>;

            if (
                groupRecord.__subs &&
                typeof groupRecord.__subs === 'object' &&
                !Array.isArray(groupRecord.__subs)
            ) {
                for (const [subName, subList] of Object.entries(
                    groupRecord.__subs,
                )) {
                    if (Array.isArray(subList)) {
                        const validSubLinks = subList.filter(isValidNavLink);

                        if (validSubLinks.length > 0) {
                            subs.push({
                                name: subName,
                                links: validSubLinks,
                            });
                        }
                    }
                }
            }

            for (const [key, item] of Object.entries(groupRecord)) {
                if (key !== '__subs' && isValidNavLink(item)) {
                    links.push(item);
                }
            }
        }

        if (links.length > 0 || subs.length > 0) {
            groups.push({
                name: groupName,
                links,
                subs,
            });
        }
    }

    return groups;
}

export function activeRoute(
    currentUrl: string,
    paths: readonly string[],
): string | null {
    if (!currentUrl || !paths || paths.length === 0) {
        return null;
    }

    const cleanUrl = currentUrl.split(/[?#]/)[0].replace(/\/+$/, '') || '/';

    const matches: string[] = [];

    for (const rawPath of paths) {
        const cleanPath = rawPath.split(/[?#]/)[0].replace(/\/+$/, '') || '/';

        if (cleanPath === '/') {
            if (cleanUrl === '/') {
                matches.push(rawPath);
            }
        } else if (
            cleanUrl === cleanPath ||
            cleanUrl.startsWith(`${cleanPath}/`)
        ) {
            matches.push(rawPath);
        }
    }

    if (matches.length === 0) {
        return null;
    }

    matches.sort((a, b) => b.length - a.length);

    return matches[0];
}

export function needsCompact(
    viewport: number,
    available: number,
    required: number,
): boolean {
    return viewport < 768 || required + 16 > available;
}

export function dropdownPlacement(
    left: number,
    bottom: number,
    width: number,
    viewport: number,
    height: number,
) {
    const top = Math.max(8, Math.min(bottom + 8, height - 52));

    return {
        left: Math.max(8, Math.min(left, viewport - width - 8)),
        top,
        maxHeight: Math.max(0, height - top - 8),
    };
}

export function flyoutSide(
    left: number,
    right: number,
    width: number,
    viewport: number,
): 'right' | 'left' | 'inline' {
    if (right + 8 + width <= viewport - 8) {
        return 'right';
    }

    if (left - 8 - width >= 8) {
        return 'left';
    }

    return 'inline';
}

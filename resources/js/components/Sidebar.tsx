import { Link, router, usePage } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronRight,
    LogOut,
    Menu,
    Moon,
    Settings,
    Sun,
    X,
} from 'lucide-react';
import React, {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { PageProps } from '../types/auth';
import { cdnAsset, useCdnBaseUrl } from '../utils/cdn';
import MobileNavigation from './navigation/MobileNavigation';
import {
    activeRoute,
    dropdownPlacement,
    flyoutSide,
    needsCompact,
    normalizeNavigation,
} from './navigation/navigationUtils';
import ThemeToggle from './ThemeToggle';

export default function Sidebar() {
    const { auth, navigation } = usePage<PageProps>().props;
    const currentUrl = usePage().url;
    const user = auth.user;
    const cdnUrl = useCdnBaseUrl();
    const idPrefix = useId();

    const navGroups = useMemo(
        () => normalizeNavigation(navigation),
        [navigation],
    );

    const allPaths = useMemo(() => {
        const paths: string[] = [];

        for (const g of navGroups) {
            for (const l of g.links) {
                paths.push(l.route_path);
            }

            for (const s of g.subs) {
                for (const l of s.links) {
                    paths.push(l.route_path);
                }
            }
        }

        return paths;
    }, [navGroups]);

    const currentActivePath = useMemo(
        () => activeRoute(currentUrl, allPaths),
        [currentUrl, allPaths],
    );

    // Responsive compact fit state
    const [isCompact, setIsCompact] = useState<boolean>(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [mobileOpenGroup, setMobileOpenGroup] = useState<string | null>(null);
    const [mobileOpenSub, setMobileOpenSub] = useState<string | null>(null);

    // Desktop dropdown states
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const [pinnedGroup, setPinnedGroup] = useState<string | null>(null);
    const [activeSubGroup, setActiveSubGroup] = useState<string | null>(null);
    const [level2Side, setLevel2Side] = useState<'right' | 'left' | 'inline'>(
        'right',
    );

    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const headerRef = useRef<HTMLElement>(null);
    const navRef = useRef<HTMLElement>(null);
    const availableRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLButtonElement>(null);
    const mobileRef = useRef<HTMLDivElement>(null);
    const avatarButtonRef = useRef<HTMLButtonElement>(null);
    const measuredBrandRef = useRef<HTMLImageElement>(null);
    const measuredAvatarRef = useRef<HTMLDivElement>(null);
    const modeRef = useRef(true);
    const pendingFocusRef = useRef<string | null>(null);
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
    const [subStyle, setSubStyle] = useState<React.CSSProperties>({});

    const clearHover = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }

        hoverTimeoutRef.current = null;
    }, []);
    const closeNavigation = useCallback(() => {
        clearHover();
        setIsMobileOpen(false);
        setMobileOpenGroup(null);
        setMobileOpenSub(null);
        setOpenGroup(null);
        setPinnedGroup(null);
        setActiveSubGroup(null);
    }, [clearHover]);
    const focusTrigger = useCallback(
        (kind: 'group' | 'sub', name: string | null, mobile = false) => {
            const root = mobile ? mobileRef.current : navRef.current;
            Array.from(
                root?.querySelectorAll<HTMLButtonElement>(
                    `[data-nav-${kind}]`,
                ) ?? [],
            )
                .find(
                    (button) =>
                        button.getAttribute(`data-nav-${kind}`) === name,
                )
                ?.focus();
        },
        [],
    );

    useEffect(() => clearHover, [clearHover]);

    // Avatar Dropdown state
    const [isAvatarOpen, setIsAvatarOpen] = useState(false);
    const avatarRef = useRef<HTMLDivElement>(null);

    // Track dark theme for dynamic icon in avatar menu
    const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }

        return false;
    });

    // Close menus on page navigation
    useEffect(() => {
        const removeListener = router.on('navigate', () => {
            closeNavigation();
            setIsAvatarOpen(false);
        });

        return () => {
            removeListener();
        };
    }, [closeNavigation]);

    // Measure required vs available width to toggle compact mode
    const updateFit = useCallback(() => {
        if (!availableRef.current || !measureRef.current) {
            return;
        }

        const viewport = window.innerWidth;
        const available = availableRef.current.getBoundingClientRect().width;

        if (measuredAvatarRef.current && avatarButtonRef.current) {
            measuredAvatarRef.current.style.width = `${avatarButtonRef.current.getBoundingClientRect().width}px`;
        }

        const required = measureRef.current.scrollWidth;

        const compact = needsCompact(viewport, available, required);

        if (compact !== modeRef.current) {
            const focused = document.activeElement;

            if (
                navRef.current?.contains(focused) ||
                mobileRef.current?.contains(focused) ||
                focused === menuRef.current
            ) {
                pendingFocusRef.current =
                    focused instanceof Element
                        ? (focused
                              .closest('[data-nav-group-container]')
                              ?.getAttribute('data-nav-group-container') ?? '')
                        : '';
            }

            modeRef.current = compact;
            closeNavigation();

            if (
                avatarRef.current?.contains(focused) &&
                focused !== avatarButtonRef.current
            ) {
                avatarButtonRef.current?.focus();
            }

            setIsAvatarOpen(false);
            setIsCompact(compact);
        }
    }, [closeNavigation]);

    useLayoutEffect(() => {
        if (pendingFocusRef.current === null) {
            return;
        }

        if (isCompact) {
            menuRef.current?.focus();
        } else {
            const buttons = Array.from(
                navRef.current?.querySelectorAll<HTMLButtonElement>(
                    '[data-nav-group]',
                ) ?? [],
            );
            (
                buttons.find(
                    (button) =>
                        button.dataset.navGroup === pendingFocusRef.current,
                ) ??
                buttons[0] ??
                avatarButtonRef.current
            )?.focus();
        }

        pendingFocusRef.current = null;
    }, [isCompact]);

    useLayoutEffect(() => {
        updateFit();
    }, [updateFit]);

    useEffect(() => {
        const availableEl = availableRef.current;
        const measureEl = measureRef.current;

        if (
            !availableEl ||
            !measureEl ||
            typeof ResizeObserver === 'undefined'
        ) {
            return;
        }

        const observer = new ResizeObserver(() => {
            updateFit();
        });

        observer.observe(availableEl);
        observer.observe(measureEl);

        if (avatarButtonRef.current) {
            observer.observe(avatarButtonRef.current);
        }

        let canceled = false;

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                if (!canceled) {
                    updateFit();
                }
            });
        }

        window.addEventListener('resize', updateFit);

        return () => {
            canceled = true;
            observer.disconnect();
            window.removeEventListener('resize', updateFit);
        };
    }, [updateFit]);

    // Close dropdowns on click outside
    useEffect(() => {
        function handleClickOutside(event: PointerEvent) {
            const target = event.target as Node;

            if (avatarRef.current && !avatarRef.current.contains(target)) {
                setIsAvatarOpen(false);
            }

            if (
                !navRef.current?.contains(target) &&
                !mobileRef.current?.contains(target) &&
                !menuRef.current?.contains(target)
            ) {
                closeNavigation();
            }
        }

        document.addEventListener('pointerdown', handleClickOutside);

        return () =>
            document.removeEventListener('pointerdown', handleClickOutside);
    }, [closeNavigation]);

    // Hierarchical keyboard dismissal via Escape
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape') {
                return;
            }

            if (
                event.defaultPrevented ||
                !headerRef.current?.contains(event.target as Node)
            ) {
                return;
            }

            clearHover();

            if (isAvatarOpen) {
                event.preventDefault();
                setIsAvatarOpen(false);
                avatarButtonRef.current?.focus();

                return;
            }

            if (isCompact && isMobileOpen) {
                event.preventDefault();

                if (mobileOpenSub !== null) {
                    focusTrigger('sub', mobileOpenSub, true);
                    setMobileOpenSub(null);
                } else if (mobileOpenGroup !== null) {
                    focusTrigger('group', mobileOpenGroup, true);
                    setMobileOpenGroup(null);
                } else {
                    closeNavigation();
                    menuRef.current?.focus();
                }

                return;
            }

            if (activeSubGroup !== null) {
                event.preventDefault();
                setActiveSubGroup(null);
                focusTrigger('sub', activeSubGroup);

                return;
            }

            if (openGroup !== null) {
                event.preventDefault();
                setOpenGroup(null);
                setPinnedGroup(null);
                focusTrigger('group', openGroup);

                return;
            }
        }

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activeSubGroup,
        openGroup,
        isMobileOpen,
        isAvatarOpen,
        isCompact,
        mobileOpenGroup,
        mobileOpenSub,
        clearHover,
        closeNavigation,
        focusTrigger,
    ]);

    const handleMouseEnter = (groupName: string) => {
        clearHover();

        if (
            openGroup !== groupName &&
            navRef.current
                ?.querySelector('[data-desktop-panel]')
                ?.contains(document.activeElement)
        ) {
            return;
        }

        setIsAvatarOpen(false);

        setOpenGroup(groupName);

        if (openGroup !== groupName) {
            const group = navGroups.find((g) => g.name === groupName);

            if (group && group.subs.length > 0) {
                const activeSub = group.subs.find((sub) =>
                    sub.links.some((l) => l.route_path === currentActivePath),
                );
                setActiveSubGroup(activeSub ? activeSub.name : null);
            } else {
                setActiveSubGroup(null);
            }
        }
    };

    const handleMouseLeave = () => {
        clearHover();

        if (pinnedGroup || navRef.current?.contains(document.activeElement)) {
            return;
        }

        hoverTimeoutRef.current = setTimeout(() => {
            if (navRef.current?.contains(document.activeElement)) {
                return;
            }

            setOpenGroup(null);
            setActiveSubGroup(null);
        }, 200);
    };

    const handleGroupClick = (groupName: string, e: React.MouseEvent) => {
        e.preventDefault();
        clearHover();
        setIsAvatarOpen(false);

        if (pinnedGroup === groupName) {
            setPinnedGroup(null);
            setOpenGroup(null);
            setActiveSubGroup(null);
        } else {
            setPinnedGroup(groupName);
            setOpenGroup(groupName);

            const group = navGroups.find((g) => g.name === groupName);

            if (openGroup !== groupName) {
                const activeSub = group?.subs.find((sub) =>
                    sub.links.some((l) => l.route_path === currentActivePath),
                );
                setActiveSubGroup(
                    activeSub?.name ?? group?.subs[0]?.name ?? null,
                );
            }
        }
    };

    const handleSubMouseEnter = (subName: string) => {
        clearHover();

        if (
            navRef.current
                ?.querySelector('[data-sub-panel]')
                ?.contains(document.activeElement)
        ) {
            return;
        }

        setActiveSubGroup(subName);
    };

    useLayoutEffect(() => {
        if (isCompact || !openGroup) {
            return;
        }

        const update = () => {
            const trigger = Array.from(
                navRef.current?.querySelectorAll<HTMLButtonElement>(
                    '[data-nav-group]',
                ) ?? [],
            ).find((el) => el.dataset.navGroup === openGroup);
            const panel = navRef.current?.querySelector<HTMLElement>(
                '[data-desktop-panel]',
            );

            if (!trigger || !panel) {
                return;
            }

            const rect = trigger.getBoundingClientRect();
            const placement = dropdownPlacement(
                rect.left,
                rect.bottom,
                panel.offsetWidth,
                window.innerWidth,
                window.innerHeight,
            );
            setPanelStyle(placement);
            // Read subgroup geometry only after its parent's new viewport position applies.
            panel.style.left = `${placement.left}px`;
            panel.style.top = `${placement.top}px`;
            panel.style.maxHeight = `${placement.maxHeight}px`;
            const sub = Array.from(
                panel.querySelectorAll<HTMLButtonElement>('[data-nav-sub]'),
            ).find((el) => el.dataset.navSub === activeSubGroup);

            if (!sub) {
                return;
            }

            const side = flyoutSide(
                placement.left,
                placement.left + panel.offsetWidth,
                240,
                window.innerWidth,
            );
            setLevel2Side(side);
            const top = Math.max(
                8,
                Math.min(
                    sub.getBoundingClientRect().top,
                    window.innerHeight - 52,
                ),
            );
            setSubStyle(
                side === 'inline'
                    ? {}
                    : {
                          position: 'fixed',
                          left:
                              side === 'right'
                                  ? placement.left + panel.offsetWidth + 8
                                  : placement.left - 248,
                          top,
                          maxHeight: Math.max(0, window.innerHeight - top - 8),
                          width: 240,
                      },
            );
        };
        update();

        const observer = new ResizeObserver(update);

        if (navRef.current) {
            observer.observe(navRef.current);
        }

        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [isCompact, openGroup, activeSubGroup]);

    const handleLogout = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsAvatarOpen(false);
        router.post('/logout');
    };

    return (
        <header
            ref={headerRef}
            className="sticky top-0 z-30 w-full shrink-0 border-b border-slate-200 bg-white/95 shadow-xs transition-colors duration-150 motion-reduce:transition-none dark:border-slate-800 dark:bg-slate-900/95"
        >
            {/* Hidden measuring strip for width fit detection */}
            <div
                ref={measureRef}
                aria-hidden="true"
                className="pointer-events-none invisible fixed top-0 left-0 flex w-max max-w-none items-center gap-6 whitespace-nowrap opacity-0"
            >
                <img
                    ref={measuredBrandRef}
                    src={cdnAsset(
                        '/banner/banner_v2.jpg',
                        { h: 72, q: 80, format: 'webp' },
                        cdnUrl,
                    )}
                    alt=""
                    className="h-9 w-auto max-w-none shrink-0"
                    onLoad={updateFit}
                />
                <div className="flex items-center gap-1">
                    {navGroups.map((g) => (
                        <div
                            key={g.name}
                            className="flex min-h-11 items-center gap-1.5 px-3.5 py-2 text-sm font-semibold"
                        >
                            {g.name}
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        </div>
                    ))}
                </div>
                <div ref={measuredAvatarRef} className="h-11 shrink-0" />
            </div>

            <div className="px-4 sm:px-6 md:px-8">
                <div
                    ref={availableRef}
                    className="flex h-16 w-full items-center justify-between gap-6"
                >
                    {/* ========== LEFT SECTION: BANNER & NAVIGATION ========== */}
                    <div
                        className={`flex min-w-0 flex-1 items-center ${isCompact ? 'gap-3' : 'gap-6'}`}
                    >
                        {/* Compact Mode Hamburger Trigger */}
                        {isCompact && (
                            <button
                                ref={menuRef}
                                type="button"
                                aria-expanded={isMobileOpen}
                                aria-controls="mobile-navigation-panel"
                                aria-label={
                                    isMobileOpen
                                        ? 'Đóng menu điều hướng'
                                        : 'Mở menu điều hướng'
                                }
                                onClick={() => {
                                    clearHover();
                                    setIsAvatarOpen(false);

                                    if (isMobileOpen) {
                                        closeNavigation();

                                        return;
                                    }

                                    setIsMobileOpen(!isMobileOpen);

                                    if (!isMobileOpen) {
                                        // Pre-expand group containing current route
                                        const activeGroup = navGroups.find(
                                            (g) =>
                                                g.links.some(
                                                    (l) =>
                                                        l.route_path ===
                                                        currentActivePath,
                                                ) ||
                                                g.subs.some((s) =>
                                                    s.links.some(
                                                        (l) =>
                                                            l.route_path ===
                                                            currentActivePath,
                                                    ),
                                                ),
                                        );

                                        if (activeGroup) {
                                            setMobileOpenGroup(
                                                activeGroup.name,
                                            );
                                            const sub = activeGroup.subs.find(
                                                (s) =>
                                                    s.links.some(
                                                        (l) =>
                                                            l.route_path ===
                                                            currentActivePath,
                                                    ),
                                            );
                                            setMobileOpenSub(
                                                sub ? sub.name : null,
                                            );
                                        }
                                    }
                                }}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {isMobileOpen ? (
                                    <X className="h-5 w-5" aria-hidden="true" />
                                ) : (
                                    <Menu
                                        className="h-5 w-5"
                                        aria-hidden="true"
                                    />
                                )}
                            </button>
                        )}

                        {/* Branding Banner */}
                        <Link
                            href="/"
                            className={`flex items-center focus-visible:outline-2 focus-visible:outline-sky-600 ${isCompact ? 'min-w-0' : 'shrink-0'}`}
                        >
                            <img
                                src={cdnAsset(
                                    '/banner/banner_v2.jpg',
                                    { h: 72, q: 80, format: 'webp' },
                                    cdnUrl,
                                )}
                                alt="Coffee Shop Banner"
                                className={`h-9 rounded-lg object-contain shadow-xs dark:hidden ${isCompact ? 'w-auto max-w-full' : 'max-w-none'}`}
                            />
                            <img
                                src={cdnAsset(
                                    '/banner/banner_v2.jpg',
                                    { h: 72, q: 80, format: 'webp' },
                                    cdnUrl,
                                )}
                                alt="Coffee Shop Banner Dark"
                                className={`hidden h-9 rounded-lg object-contain shadow-xs dark:block ${isCompact ? 'w-auto max-w-full' : 'max-w-none'}`}
                            />
                        </Link>

                        {/* Desktop Navigation Links */}
                        {!isCompact && (
                            <nav
                                ref={navRef}
                                aria-label="Điều hướng chính"
                                className="flex items-center gap-1"
                                onClick={(event) => {
                                    if (
                                        (event.target as Element).closest('a')
                                    ) {
                                        closeNavigation();
                                    }
                                }}
                            >
                                {navGroups.map((group, groupIdx) => {
                                    const isOpen = openGroup === group.name;
                                    const isPinned = pinnedGroup === group.name;
                                    const hasSubs = group.subs.length > 0;
                                    const groupButtonId = `${idPrefix}-desktop-btn-${groupIdx}`;
                                    const groupPanelId = `${idPrefix}-desktop-panel-${groupIdx}`;

                                    const hasActiveChild =
                                        group.links.some(
                                            (l) =>
                                                l.route_path ===
                                                currentActivePath,
                                        ) ||
                                        group.subs.some((s) =>
                                            s.links.some(
                                                (l) =>
                                                    l.route_path ===
                                                    currentActivePath,
                                            ),
                                        );

                                    const activeSub = activeSubGroup;

                                    return (
                                        <div
                                            key={group.name}
                                            data-nav-group-container={
                                                group.name
                                            }
                                            className="relative"
                                            onMouseEnter={() =>
                                                handleMouseEnter(group.name)
                                            }
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <button
                                                data-nav-group={group.name}
                                                id={groupButtonId}
                                                type="button"
                                                aria-expanded={isOpen}
                                                aria-controls={groupPanelId}
                                                onClick={(e) =>
                                                    handleGroupClick(
                                                        group.name,
                                                        e,
                                                    )
                                                }
                                                className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
                                                    hasActiveChild ||
                                                    isOpen ||
                                                    isPinned
                                                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                                                }`}
                                            >
                                                <span>{group.name}</span>
                                                <ChevronDown
                                                    aria-hidden="true"
                                                    className={`h-3.5 w-3.5 shrink-0 transform transition-transform duration-150 motion-reduce:transition-none ${
                                                        isOpen
                                                            ? 'rotate-180'
                                                            : ''
                                                    }`}
                                                />
                                            </button>

                                            {/* Dropdown 1 cấp cho group phẳng */}
                                            {isOpen && !hasSubs && (
                                                <div
                                                    id={groupPanelId}
                                                    role="region"
                                                    aria-labelledby={
                                                        groupButtonId
                                                    }
                                                    data-desktop-panel
                                                    style={panelStyle}
                                                    className="fixed z-50 w-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                                                    onMouseEnter={() =>
                                                        handleMouseEnter(
                                                            group.name,
                                                        )
                                                    }
                                                    onMouseLeave={
                                                        handleMouseLeave
                                                    }
                                                >
                                                    <div className="space-y-1">
                                                        {group.links.map(
                                                            (link) => {
                                                                const isLinkActive =
                                                                    link.route_path ===
                                                                    currentActivePath;

                                                                return (
                                                                    <Link
                                                                        key={
                                                                            link.route_path
                                                                        }
                                                                        href={
                                                                            link.route_path
                                                                        }
                                                                        aria-current={
                                                                            isLinkActive
                                                                                ? 'page'
                                                                                : undefined
                                                                        }
                                                                        onClick={() => {
                                                                            setOpenGroup(
                                                                                null,
                                                                            );
                                                                            setPinnedGroup(
                                                                                null,
                                                                            );
                                                                        }}
                                                                        className={`flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                                                                            isLinkActive
                                                                                ? 'bg-sky-600 font-semibold text-white shadow-xs'
                                                                                : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                                                        }`}
                                                                    >
                                                                        <span className="truncate">
                                                                            {
                                                                                link.name
                                                                            }
                                                                        </span>
                                                                    </Link>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Flyout 2 cấp cho group có sub_group */}
                                            {isOpen && hasSubs && (
                                                <div
                                                    id={groupPanelId}
                                                    role="region"
                                                    aria-labelledby={
                                                        groupButtonId
                                                    }
                                                    data-desktop-panel
                                                    style={panelStyle}
                                                    className="fixed z-50 w-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                                                    onMouseEnter={() =>
                                                        handleMouseEnter(
                                                            group.name,
                                                        )
                                                    }
                                                    onMouseLeave={
                                                        handleMouseLeave
                                                    }
                                                >
                                                    <div className="space-y-0.5">
                                                        {/* Cấp 1: danh sách sub_group */}
                                                        {group.subs.map(
                                                            (sub, subIdx) => {
                                                                const isActiveSub =
                                                                    activeSub ===
                                                                    sub.name;
                                                                const subButtonId = `${idPrefix}-sub-btn-${groupIdx}-${subIdx}`;
                                                                const subPanelId = `${idPrefix}-sub-panel-${groupIdx}-${subIdx}`;

                                                                return (
                                                                    <div
                                                                        key={
                                                                            sub.name
                                                                        }
                                                                        className="relative"
                                                                    >
                                                                        <button
                                                                            data-nav-sub={
                                                                                sub.name
                                                                            }
                                                                            id={
                                                                                subButtonId
                                                                            }
                                                                            type="button"
                                                                            aria-expanded={
                                                                                isActiveSub
                                                                            }
                                                                            aria-controls={
                                                                                subPanelId
                                                                            }
                                                                            onMouseEnter={() =>
                                                                                handleSubMouseEnter(
                                                                                    sub.name,
                                                                                )
                                                                            }
                                                                            onClick={() => {
                                                                                clearHover();
                                                                                setActiveSubGroup(
                                                                                    isActiveSub
                                                                                        ? null
                                                                                        : sub.name,
                                                                                );
                                                                            }}
                                                                            className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                                                                                isActiveSub
                                                                                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                                                                            }`}
                                                                        >
                                                                            <span className="truncate">
                                                                                {
                                                                                    sub.name
                                                                                }
                                                                            </span>
                                                                            <ChevronRight
                                                                                className="h-3.5 w-3.5 shrink-0"
                                                                                aria-hidden="true"
                                                                            />
                                                                        </button>

                                                                        {/* Cấp 2: items của sub_group */}
                                                                        {isActiveSub &&
                                                                            sub
                                                                                .links
                                                                                .length >
                                                                                0 && (
                                                                                <div
                                                                                    id={
                                                                                        subPanelId
                                                                                    }
                                                                                    role="region"
                                                                                    aria-labelledby={
                                                                                        subButtonId
                                                                                    }
                                                                                    data-sub-panel
                                                                                    style={
                                                                                        subStyle
                                                                                    }
                                                                                    className={`z-50 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 ${
                                                                                        level2Side ===
                                                                                        'inline'
                                                                                            ? 'mt-1 w-full pl-2'
                                                                                            : 'fixed w-60'
                                                                                    }`}
                                                                                >
                                                                                    <div className="space-y-0.5">
                                                                                        {sub.links.map(
                                                                                            (
                                                                                                link,
                                                                                            ) => {
                                                                                                const isLinkActive =
                                                                                                    link.route_path ===
                                                                                                    currentActivePath;

                                                                                                return (
                                                                                                    <Link
                                                                                                        key={
                                                                                                            link.route_path
                                                                                                        }
                                                                                                        href={
                                                                                                            link.route_path
                                                                                                        }
                                                                                                        aria-current={
                                                                                                            isLinkActive
                                                                                                                ? 'page'
                                                                                                                : undefined
                                                                                                        }
                                                                                                        onClick={() => {
                                                                                                            setOpenGroup(
                                                                                                                null,
                                                                                                            );
                                                                                                            setPinnedGroup(
                                                                                                                null,
                                                                                                            );
                                                                                                            setActiveSubGroup(
                                                                                                                null,
                                                                                                            );
                                                                                                        }}
                                                                                                        className={`block min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                                                                                                            isLinkActive
                                                                                                                ? 'bg-sky-600 font-semibold text-white shadow-xs'
                                                                                                                : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                                                                                        }`}
                                                                                                    >
                                                                                                        <span className="block min-w-0 truncate">
                                                                                                            {
                                                                                                                link.name
                                                                                                            }
                                                                                                        </span>
                                                                                                    </Link>
                                                                                                );
                                                                                            },
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                    </div>
                                                                );
                                                            },
                                                        )}

                                                        {/* Flat items của mixed group */}
                                                        {group.links.length >
                                                            0 && (
                                                            <>
                                                                <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                                                                {group.links.map(
                                                                    (link) => {
                                                                        const isLinkActive =
                                                                            link.route_path ===
                                                                            currentActivePath;

                                                                        return (
                                                                            <Link
                                                                                key={
                                                                                    link.route_path
                                                                                }
                                                                                href={
                                                                                    link.route_path
                                                                                }
                                                                                aria-current={
                                                                                    isLinkActive
                                                                                        ? 'page'
                                                                                        : undefined
                                                                                }
                                                                                onClick={() => {
                                                                                    setOpenGroup(
                                                                                        null,
                                                                                    );
                                                                                    setPinnedGroup(
                                                                                        null,
                                                                                    );
                                                                                    setActiveSubGroup(
                                                                                        null,
                                                                                    );
                                                                                }}
                                                                                className={`flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                                                                                    isLinkActive
                                                                                        ? 'bg-sky-600 font-semibold text-white shadow-xs'
                                                                                        : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                                                                }`}
                                                                            >
                                                                                <span className="truncate">
                                                                                    {
                                                                                        link.name
                                                                                    }
                                                                                </span>
                                                                            </Link>
                                                                        );
                                                                    },
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </nav>
                        )}
                    </div>

                    {/* ========== FAR RIGHT: USER AVATAR & DROPDOWN (INCLUDES THEME TOGGLE) ========== */}
                    <div className="relative shrink-0" ref={avatarRef}>
                        <button
                            ref={avatarButtonRef}
                            type="button"
                            onClick={() => {
                                closeNavigation();
                                setIsAvatarOpen(!isAvatarOpen);
                            }}
                            aria-expanded={isAvatarOpen}
                            aria-label="Menu tài khoản"
                            className={`flex min-h-11 items-center gap-2 rounded-full p-0.5 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                                isAvatarOpen
                                    ? 'shadow-xs ring-2 ring-sky-500'
                                    : 'ring-2 ring-transparent hover:ring-sky-400'
                            }`}
                        >
                            {user.avatar ? (
                                <img
                                    src={user.avatar}
                                    alt={user.name}
                                    className="h-9 w-9 rounded-full object-cover shadow-xs"
                                />
                            ) : (
                                <div className="avatar-placeholder h-9 w-9 text-sm font-semibold">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </button>

                        {/* Avatar Dropdown Popover */}
                        {isAvatarOpen && (
                            <div className="animate-fade-in absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                                {/* User Profile Info */}
                                <div className="px-3 py-2">
                                    <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                                        {user.name}
                                    </p>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                        {user.email}
                                    </p>
                                </div>

                                <div className="my-2 h-px bg-slate-100 dark:bg-slate-700" />

                                {/* Theme Toggle option inside Avatar Dropdown */}
                                <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50">
                                    <span className="flex items-center gap-2">
                                        {isDarkTheme ? (
                                            <Moon className="h-4 w-4 stroke-[1.5] text-sky-400" />
                                        ) : (
                                            <Sun className="h-4 w-4 stroke-[1.5] text-amber-500" />
                                        )}
                                        Giao diện
                                    </span>
                                    <ThemeToggle
                                        onThemeChange={(isDark) =>
                                            setIsDarkTheme(isDark)
                                        }
                                    />
                                </div>

                                <div className="my-2 h-px bg-slate-100 dark:bg-slate-700" />

                                {/* Actions */}
                                <div className="space-y-1">
                                    <Link
                                        href="/settings"
                                        onClick={() => setIsAvatarOpen(false)}
                                        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-sky-50 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300"
                                    >
                                        <Settings className="h-4 w-4 stroke-[1.5] text-slate-500 dark:text-slate-400" />
                                        Cài đặt
                                    </Link>

                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600 dark:text-red-400 dark:hover:bg-red-950/40"
                                    >
                                        <LogOut className="h-4 w-4 stroke-[1.5] text-red-500 dark:text-red-400" />
                                        Đăng xuất
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Mobile Navigation Panel */}
            {isCompact && isMobileOpen && (
                <div
                    ref={mobileRef}
                    id="mobile-navigation-panel"
                    className="flex max-h-[calc(100dvh-4rem)] flex-col border-t border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
                >
                    <MobileNavigation
                        groups={navGroups}
                        activePath={currentActivePath}
                        openGroup={mobileOpenGroup}
                        openSub={mobileOpenSub}
                        onGroupChange={setMobileOpenGroup}
                        onSubChange={setMobileOpenSub}
                        onNavigate={closeNavigation}
                    />
                </div>
            )}
        </header>
    );
}

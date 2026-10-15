import { Link } from '@inertiajs/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import type { NavGroup } from './navigationUtils';

interface MobileNavigationProps {
    groups: NavGroup[];
    activePath: string | null;
    openGroup: string | null;
    openSub: string | null;
    onGroupChange: (name: string | null) => void;
    onSubChange: (name: string | null) => void;
    onNavigate: () => void;
}

export default function MobileNavigation({
    groups,
    activePath,
    openGroup,
    openSub,
    onGroupChange,
    onSubChange,
    onNavigate,
}: MobileNavigationProps) {
    const idPrefix = useId();

    return (
        <nav
            aria-label="Điều hướng chính di động"
            className="flex-1 overflow-y-auto px-4 py-3 divide-y divide-slate-100 dark:divide-slate-800"
        >
            {groups.map((group, groupIdx) => {
                const groupPanelId = `${idPrefix}-group-panel-${groupIdx}`;
                const isGroupOpen = openGroup === group.name;
                const hasSubs = group.subs.length > 0;
                const hasGroupActiveChild =
                    group.links.some((l) => l.route_path === activePath) ||
                    group.subs.some((s) => s.links.some((l) => l.route_path === activePath));

                return (
                    <div key={group.name} data-nav-group-container={group.name} className="py-2">
                        <button
                            data-nav-group={group.name}
                            type="button"
                            aria-expanded={isGroupOpen}
                            aria-controls={groupPanelId}
                            onClick={() => {
                                onSubChange(null);
                                onGroupChange(isGroupOpen ? null : group.name);
                            }}
                            className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
                                hasGroupActiveChild || isGroupOpen
                                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                        >
                            <span className="min-w-0 truncate">{group.name}</span>
                            <ChevronDown
                                aria-hidden="true"
                                className={`h-4 w-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${
                                    isGroupOpen ? 'rotate-180' : ''
                                }`}
                            />
                        </button>

                        {isGroupOpen && (
                            <div id={groupPanelId} className="mt-1 space-y-1 pl-3 pt-1">
                                {hasSubs && (
                                    <div className="space-y-1">
                                        {group.subs.map((sub, subIdx) => {
                                            const subPanelId = `${idPrefix}-sub-panel-${groupIdx}-${subIdx}`;
                                            const isSubOpen = openSub === sub.name;
                                            const hasSubActiveChild = sub.links.some(
                                                (l) => l.route_path === activePath,
                                            );

                                            return (
                                                <div key={sub.name}>
                                                    <button
                                                        data-nav-sub={sub.name}
                                                        type="button"
                                                        aria-expanded={isSubOpen}
                                                        aria-controls={subPanelId}
                                                        onClick={() => onSubChange(isSubOpen ? null : sub.name)}
                                                        className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                                                            hasSubActiveChild || isSubOpen
                                                                ? 'bg-sky-100/60 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                                                                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                                        }`}
                                                    >
                                                        <span className="min-w-0 truncate">{sub.name}</span>
                                                        <ChevronRight
                                                            aria-hidden="true"
                                                            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${
                                                                isSubOpen ? 'rotate-90' : ''
                                                            }`}
                                                        />
                                                    </button>

                                                    {isSubOpen && (
                                                        <div id={subPanelId} className="space-y-0.5 pl-3 pt-1">
                                                            {sub.links.map((link) => {
                                                                const isLinkActive = link.route_path === activePath;

                                                                return (
                                                                    <Link
                                                                        key={link.route_path}
                                                                        href={link.route_path}
                                                                        aria-current={isLinkActive ? 'page' : undefined}
                                                                        onClick={onNavigate}
                                                                        className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                                                                            isLinkActive
                                                                                ? 'bg-sky-600 font-semibold text-white shadow-xs'
                                                                                : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-300'
                                                                        }`}
                                                                    >
                                                                        <span className="truncate">{link.name}</span>
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {group.links.length > 0 && (
                                    <>
                                        {hasSubs && (
                                            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                                        )}
                                        {group.links.map((link) => {
                                            const isLinkActive = link.route_path === activePath;

                                            return (
                                                <Link
                                                    key={link.route_path}
                                                    href={link.route_path}
                                                    aria-current={isLinkActive ? 'page' : undefined}
                                                    onClick={onNavigate}
                                                    className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                                                        isLinkActive
                                                            ? 'bg-sky-600 font-semibold text-white shadow-xs'
                                                            : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-300'
                                                    }`}
                                                >
                                                    <span className="truncate">{link.name}</span>
                                                </Link>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}

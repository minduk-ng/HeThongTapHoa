import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import {
    activeRoute,
    flyoutSide,
    needsCompact,
    normalizeNavigation,
} from './navigationUtils.ts';

test('route is most specific and segment bounded', () => {
    equal(
        activeRoute('/planning/products?page=2#list', [
            '/planning',
            '/planning/products',
        ]),
        '/planning/products',
    );
    equal(activeRoute('/planning-other', ['/planning']), null);
    equal(activeRoute('/anything', ['/']), null);
    equal(activeRoute('/', ['/', '/planning']), '/');
    equal(activeRoute('/planning', ['/', '/planning']), '/planning');
});

test('mixed groups preserve links and subgroups', () => {
    const link = { id: 1, name: 'Tổng quan', route_path: '/planning' };
    deepEqual(
        normalizeNavigation({
            Planning: { 0: link, __subs: { Reports: [link] } },
        }),
        [
            {
                name: 'Planning',
                links: [link],
                subs: [{ name: 'Reports', links: [link] }],
            },
        ],
    );
    deepEqual(normalizeNavigation(null), []);
    deepEqual(normalizeNavigation({}), []);
});

test('fit is based on width, not role names', () => {
    equal(needsCompact(767, 1000, 100), true);
    equal(needsCompact(1280, 900, 890), true);
    equal(needsCompact(1280, 906, 890), false);
});

test('flyout flips or stacks before leaving viewport', () => {
    equal(flyoutSide(100, 292, 240, 1280), 'right');
    equal(flyoutSide(1000, 1192, 240, 1280), 'left');
    equal(flyoutSide(100, 292, 240, 414), 'inline');
});

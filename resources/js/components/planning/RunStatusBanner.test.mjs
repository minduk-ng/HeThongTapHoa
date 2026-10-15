import { doesNotMatch, match } from 'node:assert/strict';
import { after, test } from 'node:test';
import { App } from '@inertiajs/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true } });
after(() => server.close());
const { default: RunStatusBanner } = await server.ssrLoadModule('/resources/js/components/planning/RunStatusBanner.tsx');

function renderBanner(props) {
    return renderToStaticMarkup(createElement(App, {
        initialPage: { component: 'Test', props: { auth: { is_admin: false, permissions: [] } }, url: '/planning', version: null },
        initialComponent: () => createElement(RunStatusBanner, props),
        resolveComponent: () => RunStatusBanner,
    }));
}

for (const status of ['queued', 'running']) {
    test(`${status} latest attempt does not present form default as persisted horizon`, () => {
        // Latest attempt may be 30 days; status-only metadata does not disclose it.
        const html = renderBanner({ run: null, latestRunStatus: status, defaultHorizon: 7 });
        match(html, /Lượt mới nhất/);
        doesNotMatch(html, /Kỳ dự báo|7 ngày/);
    });
}

test('known active attempt displays persisted horizon instead of form default', () => {
    const html = renderBanner({ run: { id: 42, status: 'running', horizon_days: 30 }, defaultHorizon: 7 });
    match(html, /Lượt #42/);
    match(html, /Kỳ dự báo 30 ngày/);
});

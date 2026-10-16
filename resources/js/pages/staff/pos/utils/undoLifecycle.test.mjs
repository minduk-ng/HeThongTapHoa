import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute production hooks with batched state/effects; transport is deliberately inert.
const require = createRequire(import.meta.url);
function harness() {
    const slots = []; let cursor = 0; let effects = []; let dirty = false;
    const react = {
        useState(initial) {
            const i = cursor++;
            if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
            return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; dirty = true; }];
        },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useMemo(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { deps, value: fn() }; return slots[i].value; },
        useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
        useEffect(fn, deps) {
            const i = cursor++;
            if (!slots[i] || deps.some((d, n) => d !== slots[i][n])) { slots[i] = deps; effects.push(fn); }
        },
    };
    const posts = []; const reloads = []; const timers = [];
    const router = { post: (...args) => posts.push(args), reload: options => reloads.push(options) };
    const cache = new Map();
    function load(path) {
        path = resolve(path);
        if (cache.has(path)) return cache.get(path);
        const module = { exports: {} }; cache.set(path, module.exports);
        const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        vm.runInNewContext(source, {
            module, exports: module.exports,
            require: name => name === 'react' ? react : name === '@inertiajs/react' ? { router, usePage: () => ({ props: { auth: {} } }) } : name === './usePOSCheckoutLock' ? { usePOSCheckoutLock: () => ({ lockedCheckoutTables: {}, fetchStatus() {}, lockTableCheckout() {}, unlockTableCheckout() {} }) } : name.startsWith('.') ? load(resolve(path, '..', `${name}.ts`)) : require(name),
            structuredClone, crypto: globalThis.crypto, queueMicrotask: fn => effects.push(fn),
            setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval() {}, clearInterval() {}, alert() {}, console,
        });
        return module.exports;
    }
    const { usePOSCart } = load('resources/js/pages/staff/pos/hooks/usePOSCart.ts');
    const { usePOSCheckout } = load('resources/js/pages/staff/pos/hooks/usePOSCheckout.ts');
    const product = { id: 1, name: 'Tea', price: 10, is_available: true, max_servings: 100 };
    let tables = [{ id: 0, active_orders: [] }, { id: 2, active_orders: [] }];
    let selected = 0; let cart; let checkout; const promotions = [];
    function render() {
        do {
            dirty = false; cursor = 0;
            cart = usePOSCart(tables.find(t => t.id === selected), tables, [product]);
            checkout = usePOSCheckout(null, tables, promotions, cart);
            const pending = effects; effects = []; pending.forEach(fn => fn());
        } while (dirty || effects.length);
        return cart;
    }
    return { render, product, posts, reloads, timers, get cart() { return cart; }, get checkout() { return checkout; }, setTables(value) { tables = value; return render(); }, select(id) { selected = id; return render(); }, send() { checkout.handleSendToKitchen(tables.find(t => t.id === selected), cart.currentCart, cart.activeInvoiceId[selected] || 'draft_default'); } };
}

test('send locks synchronously, rejects duplicate calls and blocks Undo before render', () => {
    const h = harness(); h.render(); h.cart.handleToggleProduct(h.product); h.render();
    const before = h.cart.currentCart;
    h.send(); h.send(); h.cart.undoDraft(); h.render();
    assert.equal(h.posts.length, 1);
    assert.equal(h.cart.sending, true);
    assert.equal(h.cart.currentCart, before);
});

test('identical reserved baseline retains edited server draft and confirmed identity', () => {
    const h = harness();
    const tables = [{ id: 0, active_orders: [{ id: 8, order_code: 'R8', status: 'reserved', items: [{ id: 80, menu_item_id: 1, quantity: 1, unit_price: 10 }] }] }];
    h.setTables(tables); h.cart.handleUpdateQuantity(1, 1); h.render();
    const before = h.cart.currentCart;
    h.setTables(structuredClone(tables));
    assert.equal(h.cart.currentCart, before);
    assert.equal(h.cart.currentCart[0].quantity, 2);
    assert.equal(h.cart.canUndo, true);
});

test('stale invalidation cannot clear replacement generation', () => {
    const h = harness(); h.render(); h.cart.handleToggleProduct(h.product); h.render();
    const key = h.cart.onSendBegin(0, 'draft_default'); h.render();
    h.cart.invalidateContexts([key]); h.render(); h.cart.handleToggleProduct(h.product); h.render();
    const before = h.cart.currentCart;
    h.cart.invalidateContexts([key]); h.render();
    assert.equal(h.cart.currentCart, before);
    assert.equal(h.cart.canUndo, true);
});

test('validation failure preserves source history after selection changes', () => {
    const h = harness(); h.render(); h.cart.handleToggleProduct(h.product); h.render(); h.send();
    h.select(2); h.cart.handleToggleProduct(h.product); h.render();
    const other = h.cart.currentCart;
    h.posts[0][2].onError({ items: 'capacity' }); h.render();
    assert.equal(h.cart.currentCart, other);
    h.select(0); assert.equal(h.cart.sending, false); assert.equal(h.cart.canUndo, true);
});

test('realtime before success fences old response and preserves new edits', () => {
    const h = harness(); h.render(); h.cart.handleToggleProduct(h.product); h.render(); h.send();
    h.setTables([{ id: 0, active_orders: [{ id: 9, order_code: 'O9', status: 'pending', items: [{ id: 90, menu_item_id: 1, quantity: 1, unit_price: 10 }] }] }, { id: 2, active_orders: [] }]);
    h.cart.handleToggleProduct(h.product); h.render(); const before = h.cart.currentCart;
    h.posts[0][2].onSuccess(); h.render();
    assert.equal(h.cart.currentCart, before); assert.equal(h.cart.canUndo, true);
});

test('ambiguous transport stays locked across identical refresh', () => {
    const h = harness(); h.render(); h.cart.handleToggleProduct(h.product); h.render(); h.send();
    h.posts[0][2].onFinish(); h.render();
    h.setTables([{ id: 0, active_orders: [] }, { id: 2, active_orders: [] }]);
    h.send(); h.cart.undoDraft(); h.render();
    assert.equal(h.posts.length, 1); assert.equal(h.cart.sending, true);
    assert.equal(h.cart.currentCart.length, 1); assert.equal(h.reloads.length, 1);
});

test('confirmed rows retain identity and staged fields across refresh and Undo', () => {
    const h = harness();
    const tables = [{ id: 0, active_orders: [{ id: 9, order_code: 'O9', status: 'pending', items: [{ id: 90, menu_item_id: 1, quantity: 3, unit_price: 10 }] }] }];
    h.setTables(tables); h.cart.handleStageReduction(90, 1, 'reason', 'note'); h.render();
    const confirmed = h.cart.currentCart[0];
    h.cart.handleToggleProduct(h.product); h.render(); h.setTables(structuredClone(tables));
    h.cart.undoDraft(); h.render();
    assert.equal(h.cart.currentCart[0], confirmed); assert.equal(confirmed.stagedReduceQty, 1);
    assert.equal(h.cart.currentCart.length, 1);
});

test('ownership change clears affected local invoice but keeps unrelated history', () => {
    const h = harness(); h.render(); h.cart.addNewDraftInvoice(0); h.render(); h.cart.handleToggleProduct(h.product); h.render();
    h.select(2); h.cart.handleToggleProduct(h.product); h.render(); const before = h.cart.currentCart;
    h.setTables([{ id: 0, merged_into_table_id: 3, active_orders: [] }, { id: 2, active_orders: [] }, { id: 3, active_orders: [] }]);
    assert.equal(h.cart.currentCart, before); assert.equal(h.cart.canUndo, true);
    h.select(0); assert.equal(h.cart.currentCart.length, 0); assert.equal(h.cart.canUndo, false);
});

import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { dropdownPlacement } from './navigationUtils.ts';

test('dropdown clamps both edges and uses remaining viewport height', () => {
    deepEqual(dropdownPlacement(1200, 62, 224, 1280, 800), { left: 1048, top: 70, maxHeight: 722 });
    deepEqual(dropdownPlacement(-10, 62, 224, 1280, 120), { left: 8, top: 68, maxHeight: 44 });
    deepEqual(dropdownPlacement(100, 900, 224, 1280, 120), { left: 100, top: 68, maxHeight: 44 });
});

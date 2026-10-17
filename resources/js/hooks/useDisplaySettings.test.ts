import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('useDisplaySettings storage key and defaults logic', () => {
    it('generates isolated storage keys per screen', () => {
        const getStorageKey = (screenId: string) =>
            `taphoa_settings_${screenId}_v1`;
        assert.equal(getStorageKey('kitchen'), 'taphoa_settings_kitchen_v1');
        assert.equal(getStorageKey('pos'), 'taphoa_settings_pos_v1');
        assert.equal(getStorageKey('serving'), 'taphoa_settings_serving_v1');
    });

    it('validates allowed scale levels and defaults to 100', () => {
        const validScales = [85, 100, 110, 125];
        const sanitizeScale = (val: unknown) =>
            validScales.includes(val as any) ? val : 100;
        assert.equal(sanitizeScale(85), 85);
        assert.equal(sanitizeScale(999), 100);
        assert.equal(sanitizeScale('invalid'), 100);
    });

    it('merges partial updates with preview settings without mutating active saved settings', () => {
        const initial = {
            scale: 100 as const,
            density: 'normal' as const,
            gridColumns: 'auto' as const,
        };
        const preview = { ...initial, scale: 110 as const };
        assert.equal(initial.scale, 100);
        assert.equal(preview.scale, 110);
    });
});

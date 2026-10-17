import { useState, useCallback } from 'react';

export interface DisplaySettings {
    scale: 85 | 100 | 110 | 125;
    density: 'compact' | 'normal' | 'comfortable';
    gridColumns?: 'auto' | 2 | 3 | 4 | 5 | 6;
    cardMode?: 'auto' | 'compact';
    audioAlert?: boolean;
}

const DEFAULT_SETTINGS: Record<'kitchen' | 'pos' | 'serving', DisplaySettings> =
    {
        kitchen: {
            scale: 100,
            density: 'normal',
            gridColumns: 'auto',
            cardMode: 'auto',
            audioAlert: true,
        },
        pos: {
            scale: 100,
            density: 'normal',
        },
        serving: {
            scale: 100,
            density: 'normal',
            gridColumns: 'auto',
        },
    };

export function getStorageKey(screenId: string): string {
    return `taphoa_settings_${screenId}_v1`;
}

export function useDisplaySettings(screenId: 'kitchen' | 'pos' | 'serving') {
    const defaultVal = DEFAULT_SETTINGS[screenId];
    const key = getStorageKey(screenId);

    const [settings, setSettings] = useState<DisplaySettings>(() => {
        if (typeof window === 'undefined') {
            return defaultVal;
        }

        try {
            const raw = localStorage.getItem(key);

            if (!raw) {
                return defaultVal;
            }

            const parsed = JSON.parse(raw);

            return { ...defaultVal, ...parsed };
        } catch {
            return defaultVal;
        }
    });

    const [previewSettings, setPreviewSettings] =
        useState<DisplaySettings>(settings);

    const updatePreview = useCallback((updates: Partial<DisplaySettings>) => {
        setPreviewSettings((prev) => ({ ...prev, ...updates }));
    }, []);

    const saveSettings = useCallback(() => {
        setSettings(previewSettings);

        try {
            localStorage.setItem(key, JSON.stringify(previewSettings));
        } catch {
            // ignore localStorage quota errors
        }
    }, [key, previewSettings]);

    const resetSettings = useCallback(() => {
        setPreviewSettings(defaultVal);
        setSettings(defaultVal);

        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
    }, [defaultVal, key]);

    const revertPreview = useCallback(() => {
        setPreviewSettings(settings);
    }, [settings]);

    const hasUnsavedChanges =
        JSON.stringify(settings) !== JSON.stringify(previewSettings);

    return {
        settings,
        previewSettings,
        updatePreview,
        saveSettings,
        resetSettings,
        revertPreview,
        hasUnsavedChanges,
    };
}

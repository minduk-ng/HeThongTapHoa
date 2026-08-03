import inertia from '@inertiajs/vite';
import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';

import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: 'localhost',
        hmr: {
            host: 'localhost',
        },
    },
    optimizeDeps: {
        // ponytail: exceljs (5MB UMD) pre-bundle từ lúc khởi động, tránh 504
        // khi `import('exceljs')` lần đầu kích hoạt optimize on-the-fly ở dev.
        include: ['exceljs'],
    },
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
        }),
        inertia(),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        wayfinder({
            formVariants: true,
        }),
    ],
});

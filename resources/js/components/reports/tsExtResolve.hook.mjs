// ponytail: stdlib-only resolve hook so node --test can import the real .ts
// module graph (reportExport.ts imports '../../utils/date' extensionless,
// which node ESM does not resolve). No new deps.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        if (
            !specifier.startsWith('.') ||
            !context.parentURL.startsWith('file:')
        ) {
            throw error;
        }

        const base = path.resolve(
            path.dirname(fileURLToPath(context.parentURL)),
            specifier,
        );

        for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
            if (existsSync(candidate)) {
                return {
                    shortCircuit: true,
                    url: pathToFileURL(candidate).href,
                };
            }
        }

        throw error;
    }
}

/**
 * Client-side Canvas Image Compressor & Square Cropper
 * Converts any uploaded or pasted image to a standardized 600x600 WebP file.
 */
export async function compressAndResizeImage(
    file: File,
    targetSize = 600,
    quality = 0.85
): Promise<File> {
    return new Promise((resolve) => {
        // If file is already small svg, resolve as is
        if (file.type === 'image/svg+xml') {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetSize;
                canvas.height = targetSize;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    resolve(file);
                    return;
                }

                // Enable high-quality image smoothing
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Center-crop (Aspect Fill) calculation
                const sourceWidth = img.width;
                const sourceHeight = img.height;
                const sourceAspect = sourceWidth / sourceHeight;

                let drawWidth = sourceWidth;
                let drawHeight = sourceHeight;
                let offsetX = 0;
                let offsetY = 0;

                if (sourceAspect > 1) {
                    // Landscape image: crop left & right
                    drawWidth = sourceHeight;
                    offsetX = (sourceWidth - sourceHeight) / 2;
                } else {
                    // Portrait image: crop top & bottom
                    drawHeight = sourceWidth;
                    offsetY = (sourceHeight - sourceWidth) / 2;
                }

                // Draw centered 1:1 cropped image onto canvas
                ctx.drawImage(
                    img,
                    offsetX,
                    offsetY,
                    drawWidth,
                    drawHeight,
                    0,
                    0,
                    targetSize,
                    targetSize
                );

                // Export to WebP format
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const baseName = file.name.replace(/\.[^/.]+$/, '');
                            const webpFilename = `${baseName}_600x600.webp`;
                            const compressedFile = new File([blob], webpFilename, {
                                type: 'image/webp',
                                lastModified: Date.now(),
                            });
                            resolve(compressedFile);
                        } else {
                            resolve(file);
                        }
                    },
                    'image/webp',
                    quality
                );
            };

            img.onerror = () => resolve(file);
            img.src = event.target?.result as string;
        };

        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

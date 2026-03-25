/**
 * Draws a visible text watermark on a canvas.
 *
 * Supports two patterns:
 * - 'center': renders a single watermark in the middle of the image.
 * - 'tile' (default): renders a repeating grid of watermarks across the entire image.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element to draw on. Its dimensions will
 *   be set to match the image's natural width and height.
 * @param {HTMLImageElement} img - The source image to watermark.
 * @param {Object} options - Watermark configuration.
 * @param {string} [options.text='WATERMARK'] - The watermark text to render.
 * @param {string} [options.font='Arial'] - The font family for the watermark text.
 * @param {number} [options.size=48] - The font size in pixels.
 * @param {string} [options.color='#ff0000'] - The fill color for the watermark text.
 * @param {number} [options.opacity=0.3] - The global alpha (0-1) applied to the watermark.
 * @param {number} [options.angle=-30] - The rotation angle in degrees.
 * @param {string} [options.pattern='tile'] - The watermark layout pattern ('center' or 'tile').
 * @param {number} [options.spacingX=100] - Horizontal spacing between tiled watermarks in pixels.
 * @param {number} [options.spacingY=80] - Vertical spacing between tiled watermarks in pixels.
 */
function applyVisibleWatermark(canvas, img, options) {
    const { text = 'WATERMARK', font = 'Arial', size = 48, color = '#ff0000', opacity = 0.3, angle = -30, pattern = 'tile', spacingX = 100, spacingY = 80 } = options;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px "${font}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const rad = angle * Math.PI / 180;

    if (pattern === 'center') {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.fillText(text, 0, 0);
        ctx.restore();
    } else {
        const stepX = ctx.measureText(text).width + spacingX;
        const stepY = size + spacingY;
        const diag = Math.hypot(canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);

        for (let y = -diag; y < diag * 2; y += stepY) {
            for (let x = -diag; x < diag * 2; x += stepX) {
                ctx.fillText(text, x, y);
            }
        }
        ctx.restore();
    }
}

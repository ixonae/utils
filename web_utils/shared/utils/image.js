/**
 * Create an off-screen canvas containing a copy of the given image.
 * The canvas dimensions match the image's natural (intrinsic) size.
 * @param {HTMLImageElement} img - A fully loaded image element.
 * @returns {HTMLCanvasElement} A canvas with the image drawn onto it.
 */
function createCanvasFromImage(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas;
}

/**
 * Export a canvas to a JPEG ArrayBuffer at the specified quality.
 * @param {HTMLCanvasElement} canvas - The source canvas to encode.
 * @param {number} quality - JPEG quality between 0 and 1.
 * @returns {Promise<ArrayBuffer>} Resolves with the JPEG data as an ArrayBuffer.
 */
function canvasToJpegArrayBuffer(canvas, quality) {
    return new Promise(resolve => {
        canvas.toBlob(blob => {
            blob.arrayBuffer().then(resolve);
        }, 'image/jpeg', quality);
    });
}

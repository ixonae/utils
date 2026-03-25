/** Precomputed cosine lookup table for the DCT basis functions: cos((2n+1)*k*pi/16) for k,n in [0,7]. */
const _DCT_COS_TABLE = new Float64Array(64);
for (let k = 0; k < 8; k++) {
    for (let n = 0; n < 8; n++) {
        _DCT_COS_TABLE[k * 8 + n] = Math.cos(((2 * n + 1) * k * Math.PI) / 16);
    }
}
/** Normalization factor 1/sqrt(2), applied to DC (zero-frequency) components in the DCT. */
const _DCT_SQRT2_INV = 1 / Math.sqrt(2);

/**
 * Computes a single 2D DCT coefficient at frequency (u, v) for an 8x8 pixel block.
 * Applies the standard normalization factors (1/sqrt(2)) for DC components (u=0 or v=0).
 *
 * @param {Float64Array} block - An 8x8 block of pixel values stored as a 64-element array (row-major).
 * @param {number} u - Horizontal frequency index (0-7).
 * @param {number} v - Vertical frequency index (0-7).
 * @returns {number} The DCT coefficient at position (u, v).
 */
function _dctCoeff(block, u, v) {
    let sum = 0;
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            sum += block[x * 8 + y] * _DCT_COS_TABLE[u * 8 + x] * _DCT_COS_TABLE[v * 8 + y];
        }
    }
    const cu = u === 0 ? _DCT_SQRT2_INV : 1;
    const cv = v === 0 ? _DCT_SQRT2_INV : 1;
    return 0.25 * cu * cv * sum;
}

/**
 * Performs a full 2D forward DCT on an 8x8 spatial block.
 * Computes all 64 frequency coefficients by calling {@link _dctCoeff} for each (u, v) pair.
 *
 * @param {Float64Array} block - An 8x8 block of pixel values stored as a 64-element array (row-major).
 * @returns {Float64Array} A 64-element array of DCT frequency coefficients (row-major by frequency index).
 */
function _dct2d(block) {
    const out = new Float64Array(64);
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            out[u * 8 + v] = _dctCoeff(block, u, v);
        }
    }
    return out;
}

/**
 * Computes a single spatial pixel value at position (x, y) from DCT coefficients
 * via the inverse discrete cosine transform.
 *
 * @param {Float64Array} coeffs - A 64-element array of DCT frequency coefficients (row-major).
 * @param {number} x - Row index in the 8x8 spatial block (0-7).
 * @param {number} y - Column index in the 8x8 spatial block (0-7).
 * @returns {number} The reconstructed pixel value at position (x, y).
 */
function _idctPixel(coeffs, x, y) {
    let sum = 0;
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            const cu = u === 0 ? _DCT_SQRT2_INV : 1;
            const cv = v === 0 ? _DCT_SQRT2_INV : 1;
            sum += cu * cv * coeffs[u * 8 + v] * _DCT_COS_TABLE[u * 8 + x] * _DCT_COS_TABLE[v * 8 + y];
        }
    }
    return 0.25 * sum;
}

/**
 * Performs a full 2D inverse DCT, converting 64 frequency coefficients back into
 * an 8x8 spatial pixel block.
 *
 * @param {Float64Array} coeffs - A 64-element array of DCT frequency coefficients (row-major).
 * @returns {Float64Array} A 64-element array representing the reconstructed 8x8 pixel block (row-major).
 */
function _idct2d(coeffs) {
    const out = new Float64Array(64);
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            out[x * 8 + y] = _idctPixel(coeffs, x, y);
        }
    }
    return out;
}

/** Index of the first mid-frequency DCT coefficient used for bit embedding (position [3,2] in the 8x8 grid). */
const _DCT_POS_A = 3 * 8 + 2;
/** Index of the second mid-frequency DCT coefficient used for bit embedding (position [2,3] in the 8x8 grid). */
const _DCT_POS_B = 2 * 8 + 3;
/** Magic header string prepended to encoded messages to identify valid DCT watermarks. */
const DCT_MAGIC = 'DCT\x01';

/**
 * Converts a message string into a bit array with a 32-bit length prefix.
 * The message is first UTF-8 encoded, then the byte length is written as 32 bits (big-endian),
 * followed by each byte of the message as 8 bits (MSB first).
 *
 * @param {string} message - The message to encode into bits.
 * @returns {number[]} Array of 0s and 1s: 32 length-prefix bits followed by the message bits.
 */
function _dctMessageToBits(message) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(message);
    const bits = [];
    for (let i = 31; i >= 0; i--) bits.push((bytes.length >> i) & 1);
    for (const byte of bytes) {
        for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
    }
    return bits;
}

/**
 * Extracts the blue channel values from an 8x8 pixel block at the given grid position.
 * The blue channel (offset +2 in RGBA) is used as the carrier for steganographic data.
 *
 * @param {Uint8ClampedArray} data - The flat RGBA image pixel data array.
 * @param {number} bx - Block x-index in the grid of 8x8 blocks (0-based).
 * @param {number} by - Block y-index in the grid of 8x8 blocks (0-based).
 * @param {number} w - The width of the image in pixels.
 * @returns {Float64Array} A 64-element array containing the blue channel values for the block (row-major).
 */
function _readBlock(data, bx, by, w) {
    const block = new Float64Array(64);
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const px = (by * 8 + y) * w + (bx * 8 + x);
            block[y * 8 + x] = data[px * 4 + 2];
        }
    }
    return block;
}

/**
 * Writes reconstructed blue channel values from a Float64Array back into the image pixel data.
 * Values are rounded and clamped to the valid [0, 255] range before writing.
 *
 * @param {Uint8ClampedArray} data - The flat RGBA image pixel data array to modify in place.
 * @param {number} bx - Block x-index in the grid of 8x8 blocks (0-based).
 * @param {number} by - Block y-index in the grid of 8x8 blocks (0-based).
 * @param {number} w - The width of the image in pixels.
 * @param {Float64Array} reconstructed - A 64-element array of reconstructed blue channel values (row-major).
 */
function _writeBlock(data, bx, by, w, reconstructed) {
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const px = (by * 8 + y) * w + (bx * 8 + x);
            data[px * 4 + 2] = Math.max(0, Math.min(255, Math.round(reconstructed[y * 8 + x])));
        }
    }
}

/**
 * Embeds a single bit into DCT coefficients by adjusting the relative magnitudes of
 * two mid-frequency coefficients at positions A and B.
 * For bit=1, ensures |A| > |B| by at least `strength`. For bit=0, ensures |B| > |A|
 * by at least `strength`. The signs of the original coefficients are preserved.
 *
 * @param {Float64Array} coeffs - A 64-element DCT coefficient array, modified in place.
 * @param {number} bit - The bit to embed (0 or 1).
 * @param {number} strength - The minimum magnitude difference to enforce between the two coefficients.
 */
function _embedBit(coeffs, bit, strength) {
    const a = coeffs[_DCT_POS_A];
    const b = coeffs[_DCT_POS_B];
    const sign = v => v >= 0 ? 1 : -1;

    if (bit === 1 && Math.abs(a) - Math.abs(b) < strength) {
        const avg = (Math.abs(a) + Math.abs(b)) / 2;
        coeffs[_DCT_POS_A] = sign(a) * (avg + strength / 2 + 1);
        coeffs[_DCT_POS_B] = sign(b) * Math.max(0, avg - strength / 2 - 1);
    } else if (bit === 0 && Math.abs(b) - Math.abs(a) < strength) {
        const avg = (Math.abs(a) + Math.abs(b)) / 2;
        coeffs[_DCT_POS_B] = sign(b) * (avg + strength / 2 + 1);
        coeffs[_DCT_POS_A] = sign(a) * Math.max(0, avg - strength / 2 - 1);
    }
}

/**
 * Decodes a bit array back into bytes. Reads a 32-bit big-endian length header,
 * then extracts that many bytes (8 bits each, MSB first) from the remaining bits.
 * Returns null if the bit array is too short or the length header is invalid.
 *
 * @param {number[]} allBits - Array of 0s and 1s to decode.
 * @returns {Uint8Array|null} The decoded byte array, or null if the data is invalid.
 */
function _bitsToBytes(allBits) {
    if (allBits.length < 32) return null;
    let length = 0;
    for (let i = 0; i < 32; i++) length = (length << 1) | allBits[i];

    if (length <= 0 || length > (allBits.length - 32) / 8) return null;

    const bytes = [];
    for (let i = 0; i < length; i++) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            byte = (byte << 1) | allBits[32 + i * 8 + j];
        }
        bytes.push(byte);
    }
    return new Uint8Array(bytes);
}

/**
 * Encodes a hidden message into a canvas image using DCT-based steganography.
 * The image is divided into 8x8 blocks, and one bit is embedded per block by
 * manipulating two mid-frequency DCT coefficients in the blue channel. A magic
 * header ({@link DCT_MAGIC}) is prepended to the message for later validation.
 * Throws an error if the message requires more blocks than are available.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element containing the image to encode into. Modified in place.
 * @param {string} message - The message to hide in the image.
 * @param {number} strength - The embedding strength (minimum coefficient magnitude difference per bit).
 * @throws {Error} If the message is too long to fit in the available 8x8 blocks.
 */
function dctEncode(canvas, message, strength) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;

    const bits = _dctMessageToBits(DCT_MAGIC + message);
    const blocksX = Math.floor(w / 8);
    const blocksY = Math.floor(canvas.height / 8);

    if (bits.length > blocksX * blocksY) {
        throw new Error(`Message too long. Need ${bits.length} blocks but only ${blocksX * blocksY} available.`);
    }

    let bitIdx = 0;
    for (let by = 0; by < blocksY && bitIdx < bits.length; by++) {
        for (let bx = 0; bx < blocksX && bitIdx < bits.length; bx++) {
            const coeffs = _dct2d(_readBlock(data, bx, by, w));
            _embedBit(coeffs, bits[bitIdx], strength);
            _writeBlock(data, bx, by, w, _idct2d(coeffs));
            bitIdx++;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

/**
 * Extracts a hidden DCT-steganographic message from a canvas image.
 * Reads one bit per 8x8 block by comparing the magnitudes of the two mid-frequency
 * DCT coefficients, then decodes the bit stream into bytes. Validates the magic
 * header ({@link DCT_MAGIC}) and returns the message without it, or null if no
 * valid watermark is found.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element containing the potentially watermarked image.
 * @returns {string|null} The extracted message string, or null if no valid watermark is found.
 */
function dctDecode(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;

    const blocksX = Math.floor(w / 8);
    const blocksY = Math.floor(canvas.height / 8);

    const allBits = [];
    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const coeffs = _dct2d(_readBlock(data, bx, by, w));
            allBits.push(Math.abs(coeffs[_DCT_POS_A]) > Math.abs(coeffs[_DCT_POS_B]) ? 1 : 0);
        }
    }

    const bytes = _bitsToBytes(allBits);
    if (!bytes) return null;

    const text = new TextDecoder().decode(bytes);
    if (!text.startsWith(DCT_MAGIC)) return null;
    return text.slice(DCT_MAGIC.length);
}

/**
 * Returns the steganographic capacity of an image with the given dimensions.
 * Calculates the total number of 8x8 blocks available and the maximum number
 * of characters that can be encoded (accounting for the 32-bit length prefix).
 *
 * @param {number} width - The image width in pixels.
 * @param {number} height - The image height in pixels.
 * @returns {{totalBlocks: number, maxChars: number}} The total 8x8 blocks and maximum encodable characters.
 */
function dctCapacity(width, height) {
    const blocksX = Math.floor(width / 8);
    const blocksY = Math.floor(height / 8);
    const totalBlocks = blocksX * blocksY;
    return { totalBlocks, maxChars: Math.floor((totalBlocks - 32) / 8) };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { _dctCoeff, _dct2d, _idctPixel, _idct2d, _dctMessageToBits, _readBlock, _writeBlock, _embedBit, _bitsToBytes, dctEncode, dctDecode, dctCapacity, _DCT_COS_TABLE, _DCT_SQRT2_INV, _DCT_POS_A, _DCT_POS_B, DCT_MAGIC };
}

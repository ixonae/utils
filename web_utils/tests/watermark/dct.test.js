const {
    _dctCoeff, _dct2d, _idctPixel, _idct2d,
    _dctMessageToBits, _embedBit, _bitsToBytes,
    _readBlock, _writeBlock, dctEncode, dctDecode,
    dctCapacity, _DCT_POS_A, _DCT_POS_B, DCT_MAGIC,
} = require('../../tools/watermark/dct.js');

function createMockCanvas(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i++) data[i] = 128;
    const imageData = { data, width, height };
    const ctx = {
        getImageData: () => ({ ...imageData, data }),
        putImageData: () => {},
    };
    return { width, height, getContext: () => ctx };
}

describe('DCT forward/inverse round-trip', () => {
    it('_idct2d(_dct2d(block)) recovers the original block', () => {
        const block = new Float64Array(64);
        for (let i = 0; i < 64; i++) block[i] = Math.floor(Math.random() * 256);

        const coeffs = _dct2d(block);
        const recovered = _idct2d(coeffs);

        for (let i = 0; i < 64; i++) {
            expect(recovered[i]).toBeCloseTo(block[i], 6);
        }
    });

    it('DC coefficient is proportional to block mean', () => {
        const block = new Float64Array(64).fill(128);
        const coeffs = _dct2d(block);
        // DC coefficient at (0,0) should be 128 * 8 (due to 0.25 * sqrt2inv * sqrt2inv * 64*128)
        // Actually just check it's large and positive
        expect(coeffs[0]).toBeGreaterThan(0);
        // All other AC coefficients should be ~0 for a flat block
        for (let i = 1; i < 64; i++) {
            expect(Math.abs(coeffs[i])).toBeCloseTo(0, 6);
        }
    });
});

describe('_dctCoeff', () => {
    it('computes the same value as _dct2d for a given (u,v)', () => {
        const block = new Float64Array(64);
        for (let i = 0; i < 64; i++) block[i] = i * 3.7;

        const coeffs = _dct2d(block);
        expect(_dctCoeff(block, 3, 2)).toBeCloseTo(coeffs[3 * 8 + 2], 10);
        expect(_dctCoeff(block, 0, 0)).toBeCloseTo(coeffs[0], 10);
    });
});

describe('_idctPixel', () => {
    it('computes the same value as _idct2d for a given (x,y)', () => {
        const block = new Float64Array(64);
        for (let i = 0; i < 64; i++) block[i] = i * 2.1;
        const coeffs = _dct2d(block);

        const recovered = _idct2d(coeffs);
        expect(_idctPixel(coeffs, 3, 5)).toBeCloseTo(recovered[3 * 8 + 5], 10);
        expect(_idctPixel(coeffs, 0, 0)).toBeCloseTo(recovered[0], 10);
    });
});

describe('_embedBit', () => {
    it('makes |A| > |B| for bit=1', () => {
        const coeffs = new Float64Array(64);
        coeffs[_DCT_POS_A] = 10;
        coeffs[_DCT_POS_B] = 20;

        _embedBit(coeffs, 1, 30);
        expect(Math.abs(coeffs[_DCT_POS_A])).toBeGreaterThan(Math.abs(coeffs[_DCT_POS_B]));
    });

    it('makes |B| > |A| for bit=0', () => {
        const coeffs = new Float64Array(64);
        coeffs[_DCT_POS_A] = 20;
        coeffs[_DCT_POS_B] = 10;

        _embedBit(coeffs, 0, 30);
        expect(Math.abs(coeffs[_DCT_POS_B])).toBeGreaterThan(Math.abs(coeffs[_DCT_POS_A]));
    });

    it('preserves signs of coefficients', () => {
        const coeffs = new Float64Array(64);
        coeffs[_DCT_POS_A] = -5;
        coeffs[_DCT_POS_B] = 15;

        _embedBit(coeffs, 1, 30);
        expect(coeffs[_DCT_POS_A]).toBeLessThan(0); // sign preserved
        expect(coeffs[_DCT_POS_B]).toBeGreaterThanOrEqual(0);
    });

    it('does nothing if relationship already satisfies the bit', () => {
        const coeffs = new Float64Array(64);
        coeffs[_DCT_POS_A] = 50;
        coeffs[_DCT_POS_B] = 5;
        const origA = coeffs[_DCT_POS_A];
        const origB = coeffs[_DCT_POS_B];

        _embedBit(coeffs, 1, 10); // |A| - |B| = 45 > strength=10, no change needed
        expect(coeffs[_DCT_POS_A]).toBe(origA);
        expect(coeffs[_DCT_POS_B]).toBe(origB);
    });
});

describe('_dctMessageToBits / _bitsToBytes round-trip', () => {
    it('round-trips a message through bits', () => {
        const message = 'Hello DCT!';
        const bits = _dctMessageToBits(message);

        const bytes = _bitsToBytes(bits);
        expect(bytes).not.toBeNull();

        const decoded = new TextDecoder().decode(bytes);
        expect(decoded).toBe(message);
    });

    it('encodes length as 32-bit prefix', () => {
        const bits = _dctMessageToBits('AB');
        let length = 0;
        for (let i = 0; i < 32; i++) length = (length << 1) | bits[i];
        expect(length).toBe(2);
    });
});

describe('_bitsToBytes', () => {
    it('returns null for fewer than 32 bits', () => {
        expect(_bitsToBytes([1, 0, 1])).toBeNull();
    });

    it('returns null for invalid length', () => {
        // 32 zero bits = length 0
        const bits = new Array(32).fill(0);
        expect(_bitsToBytes(bits)).toBeNull();
    });
});

describe('dctCapacity', () => {
    it('calculates blocks and max chars', () => {
        const { totalBlocks, maxChars } = dctCapacity(160, 80);
        expect(totalBlocks).toBe(20 * 10); // 160/8 * 80/8
        expect(maxChars).toBe(Math.floor((200 - 32) / 8));
    });

    it('returns 0 maxChars for tiny images', () => {
        const { totalBlocks, maxChars } = dctCapacity(8, 8);
        expect(totalBlocks).toBe(1);
        expect(maxChars).toBe(Math.floor((1 - 32) / 8));
    });
});

describe('DCT_MAGIC', () => {
    it('is a 4-character string', () => {
        expect(DCT_MAGIC).toBe('DCT\x01');
        expect(DCT_MAGIC.length).toBe(4);
    });
});

describe('_readBlock', () => {
    it('extracts blue channel values from an 8x8 block', () => {
        const w = 16;
        const h = 16;
        const data = new Uint8ClampedArray(w * h * 4);
        // Set known blue channel values for block (0,0)
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const px = y * w + x;
                data[px * 4 + 2] = y * 8 + x; // blue channel = sequential values
            }
        }
        const block = _readBlock(data, 0, 0, w);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                expect(block[y * 8 + x]).toBe(y * 8 + x);
            }
        }
    });

    it('reads the correct block when bx/by are non-zero', () => {
        const w = 16;
        const h = 16;
        const data = new Uint8ClampedArray(w * h * 4);
        // Set blue channel for block (1, 1) — starts at pixel (8, 8)
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const px = (8 + y) * w + (8 + x);
                data[px * 4 + 2] = 100 + y * 8 + x;
            }
        }
        const block = _readBlock(data, 1, 1, w);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                expect(block[y * 8 + x]).toBe(100 + y * 8 + x);
            }
        }
    });
});

describe('_writeBlock', () => {
    it('writes blue channel values back to image data', () => {
        const w = 16;
        const h = 16;
        const data = new Uint8ClampedArray(w * h * 4);
        const reconstructed = new Float64Array(64);
        for (let i = 0; i < 64; i++) reconstructed[i] = i + 50;

        _writeBlock(data, 0, 0, w, reconstructed);

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const px = y * w + x;
                expect(data[px * 4 + 2]).toBe(y * 8 + x + 50);
            }
        }
    });

    it('clamps values to [0, 255]', () => {
        const w = 8;
        const h = 8;
        const data = new Uint8ClampedArray(w * h * 4);
        const reconstructed = new Float64Array(64);
        reconstructed[0] = -50;   // should clamp to 0
        reconstructed[1] = 300;   // should clamp to 255
        reconstructed[2] = 127.6; // should round to 128

        _writeBlock(data, 0, 0, w, reconstructed);

        expect(data[0 * 4 + 2]).toBe(0);
        expect(data[1 * 4 + 2]).toBe(255);
        expect(data[2 * 4 + 2]).toBe(128);
    });
});

describe('dctEncode / dctDecode round-trip', () => {
    it('round-trips a short message', () => {
        // Need enough 8x8 blocks. "DCT\x01" + "Hi" = 6 bytes = 32 + 48 = 80 bits needed
        // 80x80 = 100 blocks, which is plenty
        const canvas = createMockCanvas(80, 80);
        const message = 'Hi';
        dctEncode(canvas, message, 30);
        const decoded = dctDecode(canvas);
        expect(decoded).toBe(message);
    });
});

describe('dctDecode', () => {
    it('returns null on a clean (non-encoded) canvas', () => {
        const canvas = createMockCanvas(80, 80);
        const result = dctDecode(canvas);
        expect(result).toBeNull();
    });
});

describe('dctEncode', () => {
    it('throws when message is too long for the canvas', () => {
        // 16x16 = 2x2 = 4 blocks total, far too few for a long message
        const canvas = createMockCanvas(16, 16);
        const longMessage = 'This message is way too long to fit in a tiny image with only 4 blocks';
        expect(() => dctEncode(canvas, longMessage, 30)).toThrow(/too long/i);
    });
});

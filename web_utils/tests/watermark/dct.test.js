const {
    _dctCoeff, _dct1d, _idct1d, _dct2d, _idctPixel, _idct2d,
    _dctMessageToBits, _embedBit, _bitsToBytes, _rgbToY,
    _readBlock, _writeBlock, dctEncode, dctDecode,
    dctCapacity, _DCT_POS_A, _DCT_POS_B, DCT_MAGIC,
    _DCT_REPETITIONS, _DCT_MAX_LENGTH,
} = require('../../tools/watermark/dct.js');

function createMockCanvas(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 128;     // R
        data[i + 1] = 128; // G
        data[i + 2] = 128; // B
        data[i + 3] = 255; // A
    }
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
        for (let i = 0; i < 64; i++) block[i] = (i * 37 + 13) % 256;

        const coeffs = _dct2d(block);
        const recovered = _idct2d(coeffs);

        for (let i = 0; i < 64; i++) {
            expect(recovered[i]).toBeCloseTo(block[i], 4);
        }
    });

    it('DC coefficient is proportional to block mean', () => {
        const block = new Float64Array(64).fill(128);
        const coeffs = _dct2d(block);
        expect(coeffs[0]).toBeGreaterThan(0);
        for (let i = 1; i < 64; i++) {
            expect(Math.abs(coeffs[i])).toBeCloseTo(0, 4);
        }
    });
});

describe('_dct1d / _idct1d', () => {
    it('round-trips a 1D signal', () => {
        const input = new Float64Array([10, 20, 30, 40, 50, 60, 70, 80]);
        const dctOut = new Float64Array(8);
        const recovered = new Float64Array(8);

        _dct1d(input, dctOut);
        _idct1d(dctOut, recovered);

        for (let i = 0; i < 8; i++) {
            expect(recovered[i]).toBeCloseTo(input[i], 4);
        }
    });
});

describe('_dctCoeff', () => {
    it('computes the same value as _dct2d for a given (u,v)', () => {
        const block = new Float64Array(64);
        for (let i = 0; i < 64; i++) block[i] = i * 3.7;

        const coeffs = _dct2d(block);
        expect(_dctCoeff(block, 3, 2)).toBeCloseTo(coeffs[3 * 8 + 2], 4);
        expect(_dctCoeff(block, 0, 0)).toBeCloseTo(coeffs[0], 4);
    });
});

describe('_idctPixel', () => {
    it('computes the same value as _idct2d for a given (x,y)', () => {
        const block = new Float64Array(64);
        for (let i = 0; i < 64; i++) block[i] = i * 2.1;
        const coeffs = _dct2d(block);

        const recovered = _idct2d(coeffs);
        expect(_idctPixel(coeffs, 3, 5)).toBeCloseTo(recovered[3 * 8 + 5], 4);
        expect(_idctPixel(coeffs, 0, 0)).toBeCloseTo(recovered[0], 4);
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
    it('round-trips a message through bits with repetition coding', () => {
        const message = 'Hello DCT!';
        const rawBits = _dctMessageToBits(message);

        // Apply repetition coding (same as dctEncode does)
        const bits = [];
        for (const b of rawBits) {
            for (let r = 0; r < _DCT_REPETITIONS; r++) bits.push(b);
        }

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
    it('returns null for fewer than 32 logical bits', () => {
        // With repetition=3, need at least 32*3=96 raw bits for the header
        expect(_bitsToBytes([1, 0, 1])).toBeNull();
    });

    it('returns null for invalid length', () => {
        // 32 zero bits repeated 3 times = length 0
        const bits = [];
        for (let i = 0; i < 32; i++) {
            for (let r = 0; r < _DCT_REPETITIONS; r++) bits.push(0);
        }
        expect(_bitsToBytes(bits)).toBeNull();
    });

    it('returns null for length exceeding MAX_LENGTH', () => {
        // Craft a length header that exceeds _DCT_MAX_LENGTH
        const bigLength = _DCT_MAX_LENGTH + 1;
        const headerBits = [];
        for (let i = 31; i >= 0; i--) {
            const bit = (bigLength >> i) & 1;
            for (let r = 0; r < _DCT_REPETITIONS; r++) headerBits.push(bit);
        }
        // Pad with enough data bits
        const totalBits = headerBits.length + bigLength * 8 * _DCT_REPETITIONS;
        while (headerBits.length < totalBits) headerBits.push(0);
        expect(_bitsToBytes(headerBits)).toBeNull();
    });

    it('corrects a single flipped bit via majority vote', () => {
        const message = 'OK';
        const rawBits = _dctMessageToBits(message);
        const bits = [];
        for (const b of rawBits) {
            for (let r = 0; r < _DCT_REPETITIONS; r++) bits.push(b);
        }

        // Flip one bit in the first repetition group (the other 2 still vote correctly)
        bits[0] = bits[0] === 1 ? 0 : 1;

        const bytes = _bitsToBytes(bits);
        expect(bytes).not.toBeNull();
        const decoded = new TextDecoder().decode(bytes);
        expect(decoded).toBe(message);
    });
});

describe('dctCapacity', () => {
    it('calculates blocks and max chars accounting for repetition and magic header', () => {
        const { totalBlocks, maxChars } = dctCapacity(160, 80);
        expect(totalBlocks).toBe(20 * 10); // 160/8 * 80/8
        const logicalBits = Math.floor(200 / _DCT_REPETITIONS);
        expect(maxChars).toBe(Math.floor((logicalBits - 32) / 8) - DCT_MAGIC.length);
    });

    it('returns negative maxChars for tiny images', () => {
        const { totalBlocks, maxChars } = dctCapacity(8, 8);
        expect(totalBlocks).toBe(1);
        const logicalBits = Math.floor(1 / _DCT_REPETITIONS);
        expect(maxChars).toBe(Math.floor((logicalBits - 32) / 8) - DCT_MAGIC.length);
    });
});

describe('DCT_MAGIC', () => {
    it('is a 4-character string with version 2', () => {
        expect(DCT_MAGIC).toBe('DCT\x02');
        expect(DCT_MAGIC.length).toBe(4);
    });
});

describe('_rgbToY', () => {
    it('computes luminance from RGB using BT.601 coefficients', () => {
        // Pure white
        expect(_rgbToY(255, 255, 255)).toBeCloseTo(255, 0);
        // Pure black
        expect(_rgbToY(0, 0, 0)).toBeCloseTo(0, 0);
        // Known value: (128, 128, 128) -> 128
        expect(_rgbToY(128, 128, 128)).toBeCloseTo(128, 4);
    });

    it('weights green more than red more than blue', () => {
        const fromRed = _rgbToY(255, 0, 0);
        const fromGreen = _rgbToY(0, 255, 0);
        const fromBlue = _rgbToY(0, 0, 255);
        expect(fromGreen).toBeGreaterThan(fromRed);
        expect(fromRed).toBeGreaterThan(fromBlue);
    });
});

describe('_readBlock', () => {
    it('extracts luminance values from an 8x8 block', () => {
        const w = 16;
        const h = 16;
        const data = new Uint8ClampedArray(w * h * 4);
        // Set known RGB values for block (0,0)
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const px = y * w + x;
                const val = y * 8 + x;
                data[px * 4] = val;     // R
                data[px * 4 + 1] = val; // G
                data[px * 4 + 2] = val; // B
                data[px * 4 + 3] = 255;
            }
        }
        const block = _readBlock(data, 0, 0, w);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const val = y * 8 + x;
                expect(block[y * 8 + x]).toBeCloseTo(_rgbToY(val, val, val), 4);
            }
        }
    });

    it('reads the correct block when bx/by are non-zero', () => {
        const w = 16;
        const h = 16;
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const px = (8 + y) * w + (8 + x);
                const val = 100 + y * 8 + x;
                data[px * 4] = val;
                data[px * 4 + 1] = val;
                data[px * 4 + 2] = val;
                data[px * 4 + 3] = 255;
            }
        }
        const block = _readBlock(data, 1, 1, w);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const val = 100 + y * 8 + x;
                expect(block[y * 8 + x]).toBeCloseTo(_rgbToY(val, val, val), 4);
            }
        }
    });
});

describe('_writeBlock', () => {
    it('adjusts RGB channels to match new luminance', () => {
        const w = 8;
        const h = 8;
        const data = new Uint8ClampedArray(w * h * 4);
        // Fill with uniform gray
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 100; data[i + 1] = 100; data[i + 2] = 100; data[i + 3] = 255;
        }
        const reconstructed = new Float64Array(64);
        for (let i = 0; i < 64; i++) reconstructed[i] = 120; // shift luminance up by 20

        _writeBlock(data, 0, 0, w, reconstructed);

        // All channels should shift by ~20
        for (let i = 0; i < 64; i++) {
            const px = i * 4;
            expect(data[px]).toBe(120);
            expect(data[px + 1]).toBe(120);
            expect(data[px + 2]).toBe(120);
        }
    });

    it('clamps values to [0, 255]', () => {
        const w = 8;
        const h = 8;
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 250; data[i + 1] = 250; data[i + 2] = 250; data[i + 3] = 255;
        }
        const reconstructed = new Float64Array(64);
        reconstructed[0] = 300; // way above current Y, will push channels over 255

        _writeBlock(data, 0, 0, w, reconstructed);

        // First pixel channels should be clamped to 255
        expect(data[0]).toBe(255);
        expect(data[1]).toBe(255);
        expect(data[2]).toBe(255);
    });
});

describe('dctEncode / dctDecode round-trip', () => {
    it('round-trips a short message', () => {
        // With repetition=3, "DCT\x02" + "Hi" = 6 bytes = (32 + 48) * 3 = 240 blocks needed
        // 160x160 = 20*20 = 400 blocks, which is plenty
        const canvas = createMockCanvas(160, 160);
        const message = 'Hi';
        dctEncode(canvas, message, 30);
        const decoded = dctDecode(canvas);
        expect(decoded).toBe(message);
    });
});

describe('dctDecode', () => {
    it('returns null on a clean (non-encoded) canvas', () => {
        const canvas = createMockCanvas(160, 160);
        const result = dctDecode(canvas);
        expect(result).toBeNull();
    });
});

describe('dctEncode', () => {
    it('throws when message is too long for the canvas', () => {
        // 16x16 = 2x2 = 4 blocks total, far too few for any message with repetition
        const canvas = createMockCanvas(16, 16);
        const longMessage = 'This message is way too long to fit in a tiny image with only 4 blocks';
        expect(() => dctEncode(canvas, longMessage, 30)).toThrow(/too long/i);
    });
});

const { _lsbTextToBits, _lsbBitsToText, lsbEncode, lsbDecode, lsbCapacity, LSB_MAGIC } = require('../../tools/watermark/lsb.js');

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

describe('LSB_MAGIC', () => {
    it('is a 4-character string starting with LSB', () => {
        expect(LSB_MAGIC).toBe('LSB\x01');
        expect(LSB_MAGIC.length).toBe(4);
    });
});

describe('_lsbTextToBits', () => {
    it('produces a 32-bit length header followed by message bits', () => {
        const bits = _lsbTextToBits('A');
        // 'A' is 1 byte, so length = 1
        // 32 bits for length + 8 bits for 'A' = 40 bits total
        expect(bits.length).toBe(40);
    });

    it('encodes the length as big-endian 32-bit in the first 32 bits', () => {
        const bits = _lsbTextToBits('AB');
        // 'AB' = 2 bytes, so the 32-bit header should be ...00000010
        let length = 0;
        for (let i = 0; i < 32; i++) length = (length << 1) | bits[i];
        expect(length).toBe(2);
    });

    it('encodes ASCII characters as their byte values', () => {
        const bits = _lsbTextToBits('A');
        // After the 32-bit header, the next 8 bits should be 0x41 = 01000001
        const charBits = bits.slice(32);
        let byte = 0;
        for (let i = 0; i < 8; i++) byte = (byte << 1) | charBits[i];
        expect(byte).toBe(0x41);
    });

    it('handles multi-byte UTF-8 characters', () => {
        const bits = _lsbTextToBits('\u00e9'); // e-acute, 2 bytes in UTF-8
        let length = 0;
        for (let i = 0; i < 32; i++) length = (length << 1) | bits[i];
        expect(length).toBe(2);
        expect(bits.length).toBe(32 + 16);
    });
});

describe('_lsbBitsToText', () => {
    it('reconstructs text from bits', () => {
        const text = _lsbBitsToText([0, 1, 0, 0, 0, 0, 0, 1]); // 0x41 = 'A'
        expect(text).toBe('A');
    });

    it('handles multiple bytes', () => {
        // 'Hi' = 0x48 0x69
        const bits = [0,1,0,0,1,0,0,0, 0,1,1,0,1,0,0,1];
        expect(_lsbBitsToText(bits)).toBe('Hi');
    });
});

describe('_lsbTextToBits / _lsbBitsToText round-trip', () => {
    it('round-trips ASCII text', () => {
        const original = 'Hello, world!';
        const bits = _lsbTextToBits(original);
        // Skip the 32-bit header, get the message bits
        let length = 0;
        for (let i = 0; i < 32; i++) length = (length << 1) | bits[i];
        const messageBits = bits.slice(32, 32 + length * 8);
        expect(_lsbBitsToText(messageBits)).toBe(original);
    });
});

describe('lsbCapacity', () => {
    it('calculates capacity for blue channel only', () => {
        // 100x100 = 10000 pixels, 1 bit per pixel, minus 32-bit header, divided by 8
        expect(lsbCapacity(100, 100, 'b')).toBe(Math.floor((10000 - 32) / 8));
    });

    it('calculates capacity for RGB channels', () => {
        // 100x100 = 10000 pixels, 3 bits per pixel = 30000, minus 32, divided by 8
        expect(lsbCapacity(100, 100, 'rgb')).toBe(Math.floor((30000 - 32) / 8));
    });

    it('returns higher capacity for rgb than blue-only', () => {
        expect(lsbCapacity(50, 50, 'rgb')).toBeGreaterThan(lsbCapacity(50, 50, 'b'));
    });
});

describe('lsbEncode / lsbDecode round-trip', () => {
    it('round-trips a message with blue channel mode', () => {
        const canvas = createMockCanvas(100, 100);
        const message = 'Hello LSB!';
        lsbEncode(canvas, message, 'b');
        const decoded = lsbDecode(canvas, 'b');
        expect(decoded).toBe(message);
    });

    it('round-trips a message with rgb channel mode', () => {
        const canvas = createMockCanvas(100, 100);
        const message = 'RGB mode test';
        lsbEncode(canvas, message, 'rgb');
        const decoded = lsbDecode(canvas, 'rgb');
        expect(decoded).toBe(message);
    });
});

describe('lsbDecode', () => {
    it('returns null on a clean (non-encoded) canvas', () => {
        const canvas = createMockCanvas(100, 100);
        const result = lsbDecode(canvas, 'b');
        expect(result).toBeNull();
    });
});

describe('lsbEncode', () => {
    it('throws when message is too long for the canvas', () => {
        const canvas = createMockCanvas(4, 4); // 16 pixels = 16 bits in 'b' mode
        const longMessage = 'This message is way too long to fit in a tiny canvas';
        expect(() => lsbEncode(canvas, longMessage, 'b')).toThrow(/too long/i);
    });
});

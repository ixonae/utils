const { loadIntoGlobal } = require('../helpers/load-globals.js');
const { createMinimalJpeg, createMinimalTiff } = require('../helpers/fixtures.js');

// Load dependencies into globalThis
loadIntoGlobal('../../tools/exif/tag-dictionary.js');
loadIntoGlobal('../../tools/exif/exif-parser.js');
const {
    stripAllExif, stripSelectedTags, countAllEntries,
    calculateOffsets, createTiffWriters, buildDataOffsetMap,
} = require('../../tools/exif/exif-writer.js');

describe('stripAllExif', () => {
    it('removes EXIF APP1 segment from JPEG', () => {
        const tiff = createMinimalTiff([{
            tag: 0x0112, type: 3, count: 1,
            valueBytes: [0x00, 0x01, 0x00, 0x00],
        }]);
        const jpeg = createMinimalJpeg({ exifTiffBytes: tiff });

        const stripped = stripAllExif(jpeg);

        // Should still be a valid JPEG
        expect(stripped[0]).toBe(0xFF);
        expect(stripped[1]).toBe(0xD8);

        // Should have no EXIF
        expect(findExifSegment(stripped)).toBeNull();
    });

    it('preserves JPEG without EXIF unchanged', () => {
        const jpeg = createMinimalJpeg();
        const stripped = stripAllExif(jpeg);

        expect(stripped[0]).toBe(0xFF);
        expect(stripped[1]).toBe(0xD8);
    });
});

describe('stripSelectedTags', () => {
    it('removes specific tags by key', () => {
        // JPEG with Orientation tag
        const tiff = createMinimalTiff([
            { tag: 0x010F, type: 2, count: 5, valueBytes: [0x54, 0x65, 0x73, 0x74, 0x00] }, // Make = "Test"
            { tag: 0x0112, type: 3, count: 1, valueBytes: [0x00, 0x01, 0x00, 0x00] }, // Orientation = 1
        ]);
        const jpeg = createMinimalJpeg({ exifTiffBytes: tiff });

        // Remove only the Orientation tag
        const result = stripSelectedTags(jpeg, new Set(['IFD0:0x0112']));

        // Should still have EXIF
        const seg = findExifSegment(result);
        expect(seg).not.toBeNull();

        // Parse remaining tags - should only have Make
        const tags = parseAllExifTags(result);
        const tagNames = tags.map(t => t.name);
        expect(tagNames).toContain('Make');
        expect(tagNames).not.toContain('Orientation');
    });

    it('strips all EXIF when all tags are removed', () => {
        const tiff = createMinimalTiff([
            { tag: 0x0112, type: 3, count: 1, valueBytes: [0x00, 0x01, 0x00, 0x00] },
        ]);
        const jpeg = createMinimalJpeg({ exifTiffBytes: tiff });

        const result = stripSelectedTags(jpeg, new Set(['IFD0:0x0112']));
        expect(findExifSegment(result)).toBeNull();
    });

    it('returns original bytes when no EXIF segment exists', () => {
        const jpeg = createMinimalJpeg();
        const result = stripSelectedTags(jpeg, new Set(['IFD0:0x0112']));
        expect(result).toEqual(jpeg);
    });
});

describe('countAllEntries', () => {
    it('returns 0 for null/undefined', () => {
        expect(countAllEntries(null)).toBe(0);
        expect(countAllEntries(undefined)).toBe(0);
    });

    it('counts flat entries', () => {
        expect(countAllEntries({ entries: [{}, {}, {}] })).toBe(3);
    });

    it('counts entries in sub-IFDs', () => {
        const ifd = {
            entries: [
                {},
                { subIFD: { entries: [{}, {}] } },
                {},
            ],
        };
        // 2 leaf entries + 2 sub-IFD entries = 4
        expect(countAllEntries(ifd)).toBe(4);
    });
});

describe('calculateOffsets', () => {
    it('calculates offsets for a single IFD', () => {
        const ifdsToWrite = [{
            entries: [
                { totalBytes: 2, isSubIFDPointer: false },
                { totalBytes: 4, isSubIFDPointer: false },
            ],
        }];

        const { ifdOffsets, dataBlocks, totalSize } = calculateOffsets(ifdsToWrite);
        expect(ifdOffsets).toHaveLength(1);
        expect(ifdOffsets[0]).toBe(8); // right after TIFF header
        // No data blocks since all values fit in 4 bytes
        expect(dataBlocks).toHaveLength(0);
        // totalSize = 8 (header) + 2 (count) + 2*12 (entries) + 4 (next ptr)
        expect(totalSize).toBe(8 + 2 + 24 + 4);
    });

    it('allocates data blocks for large values', () => {
        const ifdsToWrite = [{
            entries: [
                { totalBytes: 8, isSubIFDPointer: false }, // > 4 bytes, needs data block
            ],
        }];

        const { dataBlocks, totalSize } = calculateOffsets(ifdsToWrite);
        expect(dataBlocks).toHaveLength(1);
        expect(totalSize).toBe(8 + 2 + 12 + 4 + 8); // header + IFD + data
    });
});

describe('createTiffWriters', () => {
    it('creates big-endian writers', () => {
        const buf = new ArrayBuffer(4);
        const { w16, w32 } = createTiffWriters(true, new DataView(buf));
        w16(0, 0x1234);
        expect(new Uint8Array(buf)[0]).toBe(0x12);
        expect(new Uint8Array(buf)[1]).toBe(0x34);
    });

    it('creates little-endian writers', () => {
        const buf = new ArrayBuffer(4);
        const { w16 } = createTiffWriters(false, new DataView(buf));
        w16(0, 0x1234);
        expect(new Uint8Array(buf)[0]).toBe(0x34);
        expect(new Uint8Array(buf)[1]).toBe(0x12);
    });
});

describe('buildDataOffsetMap', () => {
    it('maps ifdIdx:entryIdx to offset', () => {
        const blocks = [
            { ifdIdx: 0, entryIdx: 2, offset: 100 },
            { ifdIdx: 1, entryIdx: 0, offset: 200 },
        ];
        const map = buildDataOffsetMap(blocks);
        expect(map.get('0:2')).toBe(100);
        expect(map.get('1:0')).toBe(200);
        expect(map.get('0:0')).toBeUndefined();
    });
});

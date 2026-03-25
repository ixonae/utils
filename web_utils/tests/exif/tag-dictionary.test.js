const { lookupTag, IFD0_TAGS, EXIF_TAGS, GPS_TAGS, INTEROP_TAGS } = require('../../tools/exif/tag-dictionary.js');

describe('lookupTag', () => {
    it('finds IFD0 tags by ID', () => {
        expect(lookupTag(0x010F, 'IFD0')).toEqual({ name: 'Make', group: 'Camera' });
        expect(lookupTag(0x0110, 'IFD0')).toEqual({ name: 'Model', group: 'Camera' });
    });

    it('finds IFD1 tags using IFD0 dictionary', () => {
        expect(lookupTag(0x013B, 'IFD1')).toEqual({ name: 'Artist', group: 'Author' });
    });

    it('finds ExifIFD tags', () => {
        expect(lookupTag(0x829A, 'ExifIFD')).toEqual({ name: 'ExposureTime', group: 'Camera' });
        expect(lookupTag(0x920A, 'ExifIFD')).toEqual({ name: 'FocalLength', group: 'Camera' });
    });

    it('finds GPS tags', () => {
        expect(lookupTag(0x0002, 'GPSIFD')).toEqual({ name: 'GPSLatitude', group: 'GPS' });
    });

    it('finds Interop tags', () => {
        expect(lookupTag(0x0001, 'InteropIFD')).toEqual({ name: 'InteroperabilityIndex', group: 'Interop' });
    });

    it('returns undefined for unknown tag IDs', () => {
        expect(lookupTag(0xFFFF, 'IFD0')).toBeUndefined();
    });

    it('returns undefined for unknown IFD names', () => {
        expect(lookupTag(0x010F, 'UnknownIFD')).toBeUndefined();
    });
});

describe('tag dictionaries', () => {
    it('IFD0_TAGS contains expected number of entries', () => {
        expect(Object.keys(IFD0_TAGS).length).toBeGreaterThan(10);
    });

    it('EXIF_TAGS contains expected number of entries', () => {
        expect(Object.keys(EXIF_TAGS).length).toBeGreaterThan(30);
    });

    it('GPS_TAGS contains expected number of entries', () => {
        expect(Object.keys(GPS_TAGS).length).toBeGreaterThan(15);
    });

    it('all tag entries have name and group properties', () => {
        for (const dict of [IFD0_TAGS, EXIF_TAGS, GPS_TAGS, INTEROP_TAGS]) {
            for (const [, entry] of Object.entries(dict)) {
                expect(entry).toHaveProperty('name');
                expect(entry).toHaveProperty('group');
                expect(typeof entry.name).toBe('string');
                expect(typeof entry.group).toBe('string');
            }
        }
    });
});

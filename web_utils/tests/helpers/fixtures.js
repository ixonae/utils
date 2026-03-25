/**
 * Creates a minimal valid JPEG byte array.
 * Not a real image, but has valid JPEG marker structure for EXIF testing.
 * @param {object} [options]
 * @param {Uint8Array} [options.exifTiffBytes] - TIFF data to include in an APP1 segment
 * @returns {Uint8Array}
 */
function createMinimalJpeg({ exifTiffBytes = null } = {}) {
    const parts = [];

    // SOI marker
    parts.push(0xFF, 0xD8);

    // APP1 EXIF segment (if provided)
    if (exifTiffBytes) {
        const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
        const segLength = 2 + exifHeader.length + exifTiffBytes.length;
        parts.push(0xFF, 0xE1);
        parts.push((segLength >> 8) & 0xFF, segLength & 0xFF);
        parts.push(...exifHeader);
        parts.push(...exifTiffBytes);
    }

    // SOS marker + minimal scan data + EOI
    parts.push(0xFF, 0xDA);
    parts.push(0x00, 0x02); // segment length = 2 (just the length field)
    parts.push(0x00, 0x00); // dummy scan data
    parts.push(0xFF, 0xD9); // EOI

    return new Uint8Array(parts);
}

/**
 * Creates a minimal big-endian TIFF structure with a single IFD0 entry.
 * @param {Array<{tag: number, type: number, count: number, valueBytes: number[]}>} entries
 * @returns {Uint8Array}
 */
function createMinimalTiff(entries = []) {
    // TIFF header: MM (big-endian), magic 42, offset to IFD0 = 8
    const headerSize = 8;
    const ifdSize = 2 + entries.length * 12 + 4; // count + entries + next IFD pointer
    let dataOffset = headerSize + ifdSize;

    // Calculate data area for entries with values > 4 bytes
    const entryData = entries.map(e => {
        const valueBytes = new Uint8Array(e.valueBytes);
        return { ...e, valueBytes, dataOffset: valueBytes.length > 4 ? dataOffset : null, _advance: valueBytes.length > 4 ? (dataOffset += valueBytes.length, true) : false };
    });

    const totalSize = dataOffset;
    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);

    // TIFF header (big-endian)
    view.setUint16(0, 0x4D4D); // byte order: big-endian
    view.setUint16(2, 42);      // magic
    view.setUint32(4, 8);       // offset to IFD0

    // IFD0
    let pos = 8;
    view.setUint16(pos, entries.length); pos += 2;

    for (const e of entryData) {
        view.setUint16(pos, e.tag); pos += 2;
        view.setUint16(pos, e.type); pos += 2;
        view.setUint32(pos, e.count); pos += 4;
        if (e.dataOffset !== null) {
            view.setUint32(pos, e.dataOffset);
            u8.set(e.valueBytes, e.dataOffset);
        } else {
            u8.set(e.valueBytes.slice(0, 4), pos);
        }
        pos += 4;
    }

    // Next IFD pointer = 0
    view.setUint32(pos, 0);

    return new Uint8Array(buf);
}

module.exports = { createMinimalJpeg, createMinimalTiff };

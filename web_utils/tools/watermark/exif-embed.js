/**
 * Builds a TIFF/EXIF byte array from the provided metadata fields.
 *
 * Constructs a valid big-endian TIFF structure containing an IFD0 for standard
 * tags (Artist, Copyright) and an optional ExifIFD for extended tags (UserComment).
 * String values are encoded as null-terminated ASCII. The UserComment field uses
 * the EXIF UNDEFINED type with an 8-byte ASCII charset prefix.
 *
 * @param {Object} fields - The metadata fields to embed.
 * @param {string} [fields.artist] - The artist/creator name (EXIF tag 0x013B).
 * @param {string} [fields.copyright] - The copyright notice (EXIF tag 0x8298).
 * @param {string} [fields.userComment] - A user comment string (EXIF tag 0x9286).
 * @returns {Uint8Array|null} A Uint8Array containing the complete TIFF/EXIF binary
 *   data, or null if no fields are provided.
 */
function buildExifBytes(fields) {
    const entries = [];
    const encoder = new TextEncoder();

    /**
     * Encodes a string value as a null-terminated ASCII EXIF entry and
     * appends it to the entries list.
     *
     * @param {number} tag - The EXIF tag number (e.g. 0x013B for Artist).
     * @param {string|undefined} value - The string value to encode. If falsy,
     *   the entry is skipped.
     */
    function addAsciiTag(tag, value) {
        if (!value) return;
        const bytes = encoder.encode(value + '\0');
        entries.push({ tag, type: 2, count: bytes.length, data: bytes });
    }

    addAsciiTag(0x013B, fields.artist);
    addAsciiTag(0x8298, fields.copyright);

    if (fields.userComment) {
        const commentBytes = encoder.encode(fields.userComment);
        const prefix = new Uint8Array([0x41, 0x53, 0x43, 0x49, 0x49, 0x00, 0x00, 0x00]);
        const data = new Uint8Array(prefix.length + commentBytes.length);
        data.set(prefix);
        data.set(commentBytes, prefix.length);
        entries.push({ tag: 0x9286, type: 7, count: data.length, data });
    }

    if (entries.length === 0) return null;

    const ifd0Tags = entries.filter(e => e.tag < 0x8000);
    const exifTags = entries.filter(e => e.tag >= 0x8000);

    const tiffHeaderSize = 8;
    const ifd0EntryCount = ifd0Tags.length + (exifTags.length > 0 ? 1 : 0);
    const ifd0Size = 2 + ifd0EntryCount * 12 + 4;
    const exifIfdSize = exifTags.length > 0 ? 2 + exifTags.length * 12 + 4 : 0;

    let dataOffset = tiffHeaderSize + ifd0Size + exifIfdSize;

    const allEntries = [...ifd0Tags];
    if (exifTags.length > 0) {
        allEntries.push({ tag: 0x8769, type: 4, count: 1, data: null, isExifPointer: true });
    }

    /**
     * Calculates and assigns data area offsets for IFD entries whose values
     * exceed 4 bytes. Values of 4 bytes or fewer are stored inline in the
     * IFD entry itself; longer values are placed in the data area and
     * referenced by offset. Offsets are aligned to 2-byte boundaries.
     *
     * @param {Array<Object>} list - The list of IFD entry objects to process.
     *   Each entry with data longer than 4 bytes will have its `offset`
     *   property set.
     */
    function assignOffsets(list) {
        for (const entry of list) {
            if (entry.isExifPointer) continue;
            if (entry.data.length > 4) {
                entry.offset = dataOffset;
                dataOffset += entry.data.length;
                if (dataOffset % 2 !== 0) dataOffset++;
            }
        }
    }

    assignOffsets(allEntries);
    assignOffsets(exifTags);

    const totalSize = dataOffset;
    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let pos = 0;

    view.setUint16(pos, 0x4D4D); pos += 2;
    view.setUint16(pos, 42); pos += 2;
    view.setUint32(pos, 8); pos += 4;

    const exifIfdOffset = tiffHeaderSize + ifd0Size;

    view.setUint16(pos, ifd0EntryCount); pos += 2;

    /**
     * Writes a single IFD entry (12 bytes) to the output buffer at the
     * current position. Each entry consists of the tag, type, count, and
     * either the inline value or an offset to the data area. Advances the
     * write position by 12 bytes.
     *
     * @param {Object} entry - The IFD entry to write.
     * @param {number} entry.tag - The EXIF tag number.
     * @param {number} entry.type - The EXIF data type identifier.
     * @param {number} entry.count - The number of values.
     * @param {Uint8Array|null} entry.data - The raw value bytes, or null for pointer entries.
     * @param {number} [entry.offset] - The data area offset for values exceeding 4 bytes.
     * @param {boolean} [entry.isExifPointer] - If true, writes the ExifIFD offset as the value.
     */
    function writeEntry(entry) {
        view.setUint16(pos, entry.tag); pos += 2;
        view.setUint16(pos, entry.type); pos += 2;
        view.setUint32(pos, entry.count); pos += 4;

        if (entry.isExifPointer) {
            view.setUint32(pos, exifIfdOffset); pos += 4;
        } else if (entry.data.length <= 4) {
            u8.set(entry.data, pos);
            pos += 4;
        } else {
            view.setUint32(pos, entry.offset); pos += 4;
        }
    }

    allEntries.sort((a, b) => a.tag - b.tag);
    for (const entry of allEntries) writeEntry(entry);
    view.setUint32(pos, 0); pos += 4;

    if (exifTags.length > 0) {
        exifTags.sort((a, b) => a.tag - b.tag);
        view.setUint16(pos, exifTags.length); pos += 2;
        for (const entry of exifTags) writeEntry(entry);
        view.setUint32(pos, 0); pos += 4;
    }

    /**
     * Writes overflow value data to the data area of the output buffer for
     * entries whose values exceed 4 bytes. Entries with inline values (4 bytes
     * or fewer) and ExifIFD pointer entries are skipped.
     *
     * @param {Array<Object>} list - The list of IFD entry objects. Each entry
     *   with a data length greater than 4 will have its data written at the
     *   previously assigned offset.
     */
    function writeData(list) {
        for (const entry of list) {
            if (entry.isExifPointer || entry.data.length <= 4) continue;
            u8.set(entry.data, entry.offset);
        }
    }
    writeData(allEntries);
    writeData(exifTags);

    return u8.slice(0, totalSize);
}

/**
 * Removes all APP1 (EXIF) segments from a JPEG byte array.
 *
 * Iterates through the JPEG marker segments and copies all segments except
 * APP1 (marker 0xE1) into a new array. Preserves the SOI marker and all
 * other segments (APP0, DQT, DHT, SOF, SOS, etc.) in their original order.
 * Stops processing at the SOS (0xDA) or EOI (0xD9) marker and copies the
 * remaining image data verbatim.
 *
 * @param {Uint8Array} jpeg - The source JPEG byte array.
 * @returns {Uint8Array} A new JPEG byte array with all APP1 segments removed.
 */
function stripExifFromJpeg(jpeg) {
    const result = [jpeg[0], jpeg[1]];
    let i = 2;
    while (i < jpeg.length - 1) {
        if (jpeg[i] !== 0xFF) break;
        const marker = jpeg[i + 1];
        if (marker === 0xD9 || marker === 0xDA) {
            for (let j = i; j < jpeg.length; j++) result.push(jpeg[j]);
            break;
        }
        const segLen = (jpeg[i + 2] << 8) | jpeg[i + 3];
        if (marker === 0xE1) {
            i += 2 + segLen;
        } else {
            for (let j = i; j < i + 2 + segLen; j++) result.push(jpeg[j]);
            i += 2 + segLen;
        }
    }
    return new Uint8Array(result);
}

/**
 * Inserts EXIF data into a JPEG file.
 *
 * First strips any existing APP1 (EXIF) segments from the JPEG, then injects
 * a new APP1 segment containing the provided EXIF data immediately after the
 * SOI marker. The APP1 segment includes the standard "Exif\0\0" header prefix.
 *
 * @param {ArrayBuffer} jpegArrayBuffer - The source JPEG file as an ArrayBuffer.
 * @param {Uint8Array} exifData - The TIFF/EXIF binary data to embed (as produced
 *   by {@link buildExifBytes}).
 * @returns {Uint8Array} A new JPEG byte array with the EXIF data inserted.
 * @throws {Error} If the input is not a valid JPEG (missing SOI marker 0xFFD8).
 */
function insertExifIntoJpeg(jpegArrayBuffer, exifData) {
    const jpeg = new Uint8Array(jpegArrayBuffer);
    if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) throw new Error('Not a JPEG');

    const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    const app1Length = 2 + exifHeader.length + exifData.length;
    const app1 = new Uint8Array(4 + exifHeader.length + exifData.length);
    app1[0] = 0xFF;
    app1[1] = 0xE1;
    app1[2] = (app1Length >> 8) & 0xFF;
    app1[3] = app1Length & 0xFF;
    app1.set(exifHeader, 4);
    app1.set(exifData, 4 + exifHeader.length);

    const cleanJpeg = stripExifFromJpeg(jpeg);

    const result = new Uint8Array(2 + app1.length + cleanJpeg.length - 2);
    result[0] = 0xFF;
    result[1] = 0xD8;
    result.set(app1, 2);
    result.set(cleanJpeg.slice(2), 2 + app1.length);

    return result;
}

/**
 * Extracts watermark-related EXIF fields from a JPEG file.
 *
 * Scans the JPEG marker segments for the first APP1 segment with a valid
 * "Exif" header, then delegates to {@link _parseWmTiffIFD} to extract the
 * Artist, Copyright, and UserComment tags.
 *
 * @param {ArrayBuffer} jpegArrayBuffer - The JPEG file as an ArrayBuffer.
 * @returns {Object|null} An object containing the extracted fields
 *   ({artist, copyright, userComment}), or null if the input is not a valid
 *   JPEG or contains no EXIF APP1 segment.
 */
function parseExifFromJpeg(jpegArrayBuffer) {
    const jpeg = new Uint8Array(jpegArrayBuffer);
    if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) return null;

    let i = 2;
    while (i < jpeg.length - 1) {
        if (jpeg[i] !== 0xFF) break;
        const marker = jpeg[i + 1];
        if (marker === 0xD9 || marker === 0xDA) break;
        const segLen = (jpeg[i + 2] << 8) | jpeg[i + 3];

        if (marker === 0xE1) {
            if (jpeg[i + 4] === 0x45 && jpeg[i + 5] === 0x78 && jpeg[i + 6] === 0x69 && jpeg[i + 7] === 0x66) {
                const tiffStart = i + 10;
                return _parseWmTiffIFD(jpeg, tiffStart);
            }
        }
        i += 2 + segLen;
    }
    return null;
}

/**
 * Parses specific EXIF tags from TIFF IFD data.
 *
 * Reads through the IFD entries starting at the given TIFF offset, extracting
 * Artist (0x013B), Copyright (0x8298), and UserComment (0x9286) tags. Supports
 * both big-endian and little-endian TIFF byte orders. Recursively follows
 * ExifIFD sub-IFD pointers (tag 0x8769) to locate tags stored in the Exif
 * sub-IFD.
 *
 * @param {Uint8Array} data - The raw byte array containing the JPEG data.
 * @param {number} tiffStart - The byte offset within data where the TIFF
 *   header begins (immediately after the "Exif\0\0" prefix).
 * @returns {Object} An object with the extracted fields. May contain any
 *   combination of {artist, copyright, userComment} depending on which
 *   tags are present.
 */
function _parseWmTiffIFD(data, tiffStart) {
    const view = new DataView(data.buffer, data.byteOffset + tiffStart);
    const bigEndian = view.getUint16(0) === 0x4D4D;
    const g16 = off => bigEndian ? view.getUint16(off) : view.getUint16(off, true);
    const g32 = off => bigEndian ? view.getUint32(off) : view.getUint32(off, true);

    const result = {};
    const decoder = new TextDecoder();

    function readIFD(offset) {
        const count = g16(offset);
        for (let i = 0; i < count; i++) {
            const entryOff = offset + 2 + i * 12;
            const tag = g16(entryOff);
            const type = g16(entryOff + 2);
            const cnt = g32(entryOff + 4);
            let valOffset = entryOff + 8;

            const totalBytes = cnt * [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] || cnt;
            if (totalBytes > 4) valOffset = g32(entryOff + 8);

            if (tag === 0x8769) {
                readIFD(g32(entryOff + 8));
            } else if (tag === 0x013B) {
                result.artist = decoder.decode(data.slice(tiffStart + valOffset, tiffStart + valOffset + cnt - 1));
            } else if (tag === 0x8298) {
                result.copyright = decoder.decode(data.slice(tiffStart + valOffset, tiffStart + valOffset + cnt - 1));
            } else if (tag === 0x9286) {
                result.userComment = decoder.decode(data.slice(tiffStart + valOffset + 8, tiffStart + valOffset + cnt));
            }
        }
    }

    const ifdOffset = g32(4);
    readIFD(ifdOffset);
    return result;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildExifBytes, stripExifFromJpeg, insertExifIntoJpeg, parseExifFromJpeg, _parseWmTiffIFD };
}

/**
 * Removes all APP1/EXIF segments from a JPEG byte array by walking segment
 * markers and skipping any APP1 segment whose payload starts with the "Exif"
 * signature. All other segments (and the SOS/image data) are preserved.
 *
 * @param {Uint8Array} jpegBytes - Raw JPEG file bytes.
 * @returns {Uint8Array} A new JPEG byte array with all EXIF APP1 segments removed.
 */
function stripAllExif(jpegBytes) {
    const result = [jpegBytes[0], jpegBytes[1]]; // FF D8
    let i = 2;
    while (i < jpegBytes.length - 1) {
        if (jpegBytes[i] !== 0xFF) break;
        const marker = jpegBytes[i + 1];
        if (marker === 0xD9 || marker === 0xDA) {
            for (let j = i; j < jpegBytes.length; j++) result.push(jpegBytes[j]);
            break;
        }
        const segLen = (jpegBytes[i + 2] << 8) | jpegBytes[i + 3];
        if (marker === 0xE1 &&
            jpegBytes[i + 4] === 0x45 && jpegBytes[i + 5] === 0x78 &&
            jpegBytes[i + 6] === 0x69 && jpegBytes[i + 7] === 0x66) {
            // Skip this EXIF APP1 segment
            i += 2 + segLen;
        } else {
            for (let j = i; j < i + 2 + segLen; j++) result.push(jpegBytes[j]);
            i += 2 + segLen;
        }
    }
    return new Uint8Array(result);
}

/**
 * Strip selected tags from the EXIF data in a JPEG.
 * tagKeysToRemove is a Set of strings like "IFD0:0x013B" or "ExifIFD:0x9286".
 *
 * Strategy: rebuild the entire TIFF structure excluding the specified tags.
 * This preserves byte order and all tags not in the removal set.
 */
function stripSelectedTags(jpegBytes, tagKeysToRemove) {
    const seg = findExifSegment(jpegBytes);
    if (!seg) return jpegBytes;

    const { tiffOffset, segmentOffset, segmentLength } = seg;
    const tiffData = jpegBytes.slice(tiffOffset);
    const view = new DataView(tiffData.buffer, tiffData.byteOffset);
    const bigEndian = view.getUint16(0) === 0x4D4D;

    const g16 = off => bigEndian ? view.getUint16(off) : view.getUint16(off, true);
    const g32 = off => bigEndian ? view.getUint32(off) : view.getUint32(off, true);

    const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

    /**
     * Reads all entries from an IFD (Image File Directory) at the given TIFF
     * offset, including sub-IFD pointers for ExifIFD, GPSIFD, and InteropIFD.
     *
     * @param {number} offset - Byte offset within the TIFF data where the IFD starts.
     * @param {string} ifdName - Logical name of the IFD (e.g. "IFD0", "ExifIFD").
     * @returns {{entries: Array, nextIFDOffset: number, ifdName: string}|Array}
     *   An object containing the parsed entries, the offset of the next linked
     *   IFD (0 if none), and the IFD name. Returns an empty array if the
     *   offset is out of bounds or the entry count is invalid.
     */
    function readIFDEntries(offset, ifdName) {
        if (offset < 0 || offset + 2 > tiffData.length) return [];

        const count = g16(offset);
        if (count === 0 || count > 500) return [];

        const entries = [];
        for (let i = 0; i < count; i++) {
            const entryOff = offset + 2 + i * 12;
            if (entryOff + 12 > tiffData.length) break;

            const tagId = g16(entryOff);
            const type = g16(entryOff + 2);
            const cnt = g32(entryOff + 4);
            const typeSize = TYPE_SIZES[type] || 1;
            const totalBytes = cnt * typeSize;

            let valueBytes;
            if (totalBytes <= 4) {
                valueBytes = tiffData.slice(entryOff + 8, entryOff + 12);
            } else {
                const dataOff = g32(entryOff + 8);
                valueBytes = tiffData.slice(dataOff, dataOff + totalBytes);
            }

            // Check for sub-IFD pointers
            let subIFD = null;
            let subIFDName = null;
            if (tagId === 0x8769) { subIFDName = 'ExifIFD'; subIFD = readIFDEntries(g32(entryOff + 8), 'ExifIFD'); }
            else if (tagId === 0x8825) { subIFDName = 'GPSIFD'; subIFD = readIFDEntries(g32(entryOff + 8), 'GPSIFD'); }
            else if (tagId === 0xA005) { subIFDName = 'InteropIFD'; subIFD = readIFDEntries(g32(entryOff + 8), 'InteropIFD'); }

            const key = `${ifdName}:0x${tagId.toString(16).padStart(4, '0')}`;

            entries.push({ tagId, type, count: cnt, valueBytes, totalBytes, ifdName, key, subIFD, subIFDName });
        }

        // Next IFD pointer
        const nextPtr = offset + 2 + count * 12;
        let nextIFDOffset = 0;
        if (nextPtr + 4 <= tiffData.length) {
            nextIFDOffset = g32(nextPtr);
        }

        return { entries, nextIFDOffset, ifdName };
    }

    const ifd0Offset = g32(4);
    const ifd0 = readIFDEntries(ifd0Offset, 'IFD0');
    if (!ifd0?.entries) return jpegBytes;

    let ifd1 = null;
    if (ifd0.nextIFDOffset > 0 && ifd0.nextIFDOffset < tiffData.length) {
        ifd1 = readIFDEntries(ifd0.nextIFDOffset, 'IFD1');
    }

    /**
     * Recursively filters IFD entries, removing those whose keys are present
     * in the tagKeysToRemove set. Sub-IFD pointers are also dropped if all of
     * their child entries were removed.
     *
     * @param {{entries: Array, ifdName: string}} ifd - The IFD object to filter.
     * @returns {{entries: Array, ifdName: string}|null} A new IFD object with
     *   only the retained entries, or null if the input is invalid.
     */
    function filterEntries(ifd) {
        if (!ifd?.entries) return null;

        const filtered = [];
        for (const entry of ifd.entries) {
            if (entry.subIFD) {
                // Filter sub-IFD entries
                const filteredSub = filterEntries(entry.subIFD);
                if (filteredSub && filteredSub.entries.length > 0) {
                    filtered.push({ ...entry, subIFD: filteredSub });
                }
                // If all sub-IFD entries removed, drop the pointer too
                continue;
            }

            if (!tagKeysToRemove.has(entry.key)) {
                filtered.push(entry);
            }
        }
        return { ...ifd, entries: filtered };
    }

    const filteredIfd0 = filterEntries(ifd0);
    const filteredIfd1 = ifd1 ? filterEntries(ifd1) : null;

    // Check if all tags were removed
    const totalRemaining = countAllEntries(filteredIfd0) +
        (filteredIfd1 ? countAllEntries(filteredIfd1) : 0);
    if (totalRemaining === 0) {
        return stripAllExif(jpegBytes);
    }

    // Rebuild the TIFF data
    const newTiff = rebuildTiff(bigEndian, filteredIfd0, filteredIfd1);

    // Build new APP1 segment
    const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
    const app1DataLen = 2 + exifHeader.length + newTiff.length;
    const newApp1 = new Uint8Array(2 + app1DataLen);
    newApp1[0] = 0xFF;
    newApp1[1] = 0xE1;
    newApp1[2] = (app1DataLen >> 8) & 0xFF;
    newApp1[3] = app1DataLen & 0xFF;
    newApp1.set(exifHeader, 4);
    newApp1.set(newTiff, 4 + exifHeader.length);

    // Replace old APP1 with new one
    const before = jpegBytes.slice(0, segmentOffset);
    const after = jpegBytes.slice(segmentOffset + segmentLength);
    const result = new Uint8Array(before.length + newApp1.length + after.length);
    result.set(before, 0);
    result.set(newApp1, before.length);
    result.set(after, before.length + newApp1.length);

    return result;
}

/**
 * Recursively counts leaf (non-sub-IFD) entries across an IFD and all of its
 * nested sub-IFDs.
 *
 * @param {{entries: Array}} ifd - The IFD object whose entries to count.
 * @returns {number} Total number of leaf entries. Returns 0 if the IFD is
 *   null or has no entries.
 */
function countAllEntries(ifd) {
    if (!ifd?.entries) return 0;
    let count = 0;
    for (const entry of ifd.entries) {
        if (entry.subIFD) {
            count += countAllEntries(entry.subIFD);
        } else {
            count++;
        }
    }
    return count;
}

/**
 * Flattens the IFD tree into an ordered list suitable for sequential writing.
 * Plain entries and sub-IFD entries are separated: sub-IFD pointers are
 * replaced with placeholder entries whose offsets will be fixed up later.
 * The resulting list records fixup information so that sub-IFD pointer values
 * can be patched to the correct offsets after layout.
 *
 * @param {{entries: Array, ifdName: string}} ifd0 - The primary IFD (IFD0).
 * @param {{entries: Array, ifdName: string}|null} ifd1 - The thumbnail IFD
 *   (IFD1), or null if there is no thumbnail.
 * @returns {{ifdsToWrite: Array, subIFDFixups: Array<{parentIfdIdx: number, tagId: number, subIfdIdx: number}>, ifd1Idx: number}}
 *   ifdsToWrite is the flat list of IFDs in write order; subIFDFixups records
 *   which parent entries need their value patched to a sub-IFD offset;
 *   ifd1Idx is the index of IFD1 in ifdsToWrite (-1 if absent).
 */
function collectIFDs(ifd0, ifd1) {
    const ifdsToWrite = [];
    const subIFDFixups = [];

    function collectIFD(ifd) {
        const idx = ifdsToWrite.length;
        const plainEntries = [];
        const subEntries = [];

        for (const entry of ifd.entries) {
            if (entry.subIFD) {
                subEntries.push(entry);
            } else {
                plainEntries.push(entry);
            }
        }

        const allEntries = [...plainEntries, ...subEntries.map(e => ({
            tagId: e.tagId,
            type: 4,
            count: 1,
            totalBytes: 4,
            valueBytes: new Uint8Array(4),
            isSubIFDPointer: true,
        }))];

        allEntries.sort((a, b) => a.tagId - b.tagId);
        ifdsToWrite.push({ entries: allEntries, ifdName: ifd.ifdName });

        for (const entry of subEntries) {
            const subIdx = ifdsToWrite.length;
            subIFDFixups.push({ parentIfdIdx: idx, tagId: entry.tagId, subIfdIdx: subIdx });
            collectIFD(entry.subIFD);
        }
    }

    collectIFD(ifd0);
    let ifd1Idx = -1;
    if (ifd1 && ifd1.entries.length > 0) {
        ifd1Idx = ifdsToWrite.length;
        collectIFD(ifd1);
    }

    return { ifdsToWrite, subIFDFixups, ifd1Idx };
}

/**
 * Two-pass offset calculation for the TIFF structure. The first pass assigns
 * byte offsets for each IFD (entry count + 12-byte entries + next-IFD
 * pointer). The second pass assigns offsets for overflow data blocks (entry
 * values that exceed 4 bytes), with 2-byte alignment padding.
 *
 * @param {Array<{entries: Array}>} ifdsToWrite - Flat list of IFDs to lay out.
 * @returns {{ifdOffsets: number[], dataBlocks: Array<{ifdIdx: number, entryIdx: number, offset: number}>, totalSize: number}}
 *   ifdOffsets maps each IFD index to its byte offset; dataBlocks maps
 *   overflow entries to their data area offsets; totalSize is the total
 *   byte length of the TIFF structure.
 */
function calculateOffsets(ifdsToWrite) {
    let currentOffset = 8; // TIFF header size
    const ifdOffsets = [];
    const dataBlocks = [];

    for (const ifd of ifdsToWrite) {
        ifdOffsets.push(currentOffset);
        currentOffset += 2 + ifd.entries.length * 12 + 4;
    }

    for (let iIdx = 0; iIdx < ifdsToWrite.length; iIdx++) {
        const ifd = ifdsToWrite[iIdx];
        for (let eIdx = 0; eIdx < ifd.entries.length; eIdx++) {
            const entry = ifd.entries[eIdx];
            if (entry.isSubIFDPointer || entry.totalBytes <= 4) continue;
            dataBlocks.push({ ifdIdx: iIdx, entryIdx: eIdx, offset: currentOffset });
            currentOffset += entry.totalBytes;
            if (currentOffset % 2 !== 0) currentOffset++;
        }
    }

    return { ifdOffsets, dataBlocks, totalSize: currentOffset };
}

/**
 * Writes the value portion of a single 12-byte IFD entry. For sub-IFD
 * pointer entries, the value is resolved to the computed sub-IFD offset.
 * Values that fit in 4 bytes are written inline; larger values are written
 * to the data area and their offset is recorded in the entry.
 *
 * @param {Object} entry - The IFD entry to write.
 * @param {number} pos - Byte position of the entry within the output buffer.
 * @param {number} iIdx - Index of the containing IFD in the ifdsToWrite list.
 * @param {number} eIdx - Index of the entry within its IFD.
 * @param {Object} ctx - Write context containing u8, w32, subIFDFixups,
 *   ifdOffsets, and dataOffsetMap.
 */
function writeEntryValue(entry, pos, iIdx, eIdx, ctx) {
    const { u8, w32, subIFDFixups, ifdOffsets, dataOffsetMap } = ctx;
    if (entry.isSubIFDPointer) {
        const fixup = subIFDFixups.find(f => f.parentIfdIdx === iIdx && f.tagId === entry.tagId);
        if (fixup) w32(pos + 8, ifdOffsets[fixup.subIfdIdx]);
    } else if (entry.totalBytes <= 4) {
        u8.set(entry.valueBytes.slice(0, 4), pos + 8);
    } else {
        const dataOff = dataOffsetMap.get(`${iIdx}:${eIdx}`);
        w32(pos + 8, dataOff);
        u8.set(entry.valueBytes.slice(0, entry.totalBytes), dataOff);
    }
}

/**
 * Creates a lookup map from "ifdIdx:entryIdx" string keys to data area byte
 * offsets. Used during IFD writing to resolve overflow value locations.
 *
 * @param {Array<{ifdIdx: number, entryIdx: number, offset: number}>} dataBlocks
 *   - The data block descriptors produced by calculateOffsets.
 * @returns {Map<string, number>} A map from "ifdIdx:entryIdx" keys to their
 *   corresponding data area offsets.
 */
function buildDataOffsetMap(dataBlocks) {
    const map = new Map();
    for (const db of dataBlocks) {
        map.set(`${db.ifdIdx}:${db.entryIdx}`, db.offset);
    }
    return map;
}

/**
 * Writes a complete IFD to the output buffer: the 2-byte entry count,
 * all 12-byte entries (tag, type, count, value), and the 4-byte next-IFD
 * pointer.
 *
 * @param {{entries: Array}} ifd - The IFD to write.
 * @param {number} iIdx - Index of this IFD in the ifdsToWrite list.
 * @param {number} ifdOffset - Byte offset in the output buffer where this
 *   IFD starts.
 * @param {number} nextIfdOffset - Byte offset of the next IFD, or 0 if this
 *   is the last IFD in the chain.
 * @param {Function} w16 - Endian-aware 16-bit write function (offset, value).
 * @param {Function} w32 - Endian-aware 32-bit write function (offset, value).
 * @param {Object} ctx - Write context passed through to writeEntryValue.
 */
function writeIFD(ifd, iIdx, ifdOffset, nextIfdOffset, w16, w32, ctx) {
    let pos = ifdOffset;
    w16(pos, ifd.entries.length);
    pos += 2;

    for (let eIdx = 0; eIdx < ifd.entries.length; eIdx++) {
        const entry = ifd.entries[eIdx];
        w16(pos, entry.tagId);
        w16(pos + 2, entry.type);
        w32(pos + 4, entry.count);
        writeEntryValue(entry, pos, iIdx, eIdx, ctx);
        pos += 12;
    }

    w32(pos, nextIfdOffset);
}

/**
 * Creates endian-aware write helpers for a DataView. The returned functions
 * handle byte-order conversion so callers can write values without tracking
 * endianness.
 *
 * @param {boolean} bigEndian - True for big-endian (Motorola) byte order,
 *   false for little-endian (Intel).
 * @param {DataView} out - The DataView to write into.
 * @returns {{w16: Function, w32: Function}} w16 writes a 16-bit unsigned
 *   integer; w32 writes a 32-bit unsigned integer. Both accept (offset, value).
 */
function createTiffWriters(bigEndian, out) {
    const le = !bigEndian;
    return {
        w16: (off, val) => out.setUint16(off, val, le),
        w32: (off, val) => out.setUint32(off, val, le),
    };
}

/**
 * Rebuilds a complete TIFF byte structure from IFD trees. Orchestrates the
 * full pipeline: collecting IFDs into a flat list, calculating byte offsets,
 * writing the TIFF header (byte order, magic number 42, IFD0 pointer), and
 * writing all IFDs together with their data areas.
 *
 * @param {boolean} bigEndian - True for big-endian (Motorola) byte order,
 *   false for little-endian (Intel).
 * @param {{entries: Array, ifdName: string}} ifd0 - The primary IFD (IFD0).
 * @param {{entries: Array, ifdName: string}|null} ifd1 - The thumbnail IFD
 *   (IFD1), or null if there is no thumbnail.
 * @returns {Uint8Array} The serialized TIFF byte structure ready to be
 *   embedded in an APP1 segment.
 */
function rebuildTiff(bigEndian, ifd0, ifd1) {
    const { ifdsToWrite, subIFDFixups, ifd1Idx } = collectIFDs(ifd0, ifd1);
    const { ifdOffsets, dataBlocks, totalSize } = calculateOffsets(ifdsToWrite);

    const buf = new ArrayBuffer(totalSize);
    const u8 = new Uint8Array(buf);
    const { w16, w32 } = createTiffWriters(bigEndian, new DataView(buf));

    w16(0, bigEndian ? 0x4D4D : 0x4949);
    w16(2, 42);
    w32(4, ifdOffsets[0]);

    const dataOffsetMap = buildDataOffsetMap(dataBlocks);
    const ctx = { u8, w32, subIFDFixups, ifdOffsets, dataOffsetMap };

    for (let iIdx = 0; iIdx < ifdsToWrite.length; iIdx++) {
        const nextIfdOffset = iIdx === 0 && ifd1Idx >= 0 ? ifdOffsets[ifd1Idx] : 0;
        writeIFD(ifdsToWrite[iIdx], iIdx, ifdOffsets[iIdx], nextIfdOffset, w16, w32, ctx);
    }

    return new Uint8Array(buf);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { stripAllExif, stripSelectedTags, countAllEntries, collectIFDs, calculateOffsets, writeEntryValue, buildDataOffsetMap, writeIFD, createTiffWriters, rebuildTiff };
}

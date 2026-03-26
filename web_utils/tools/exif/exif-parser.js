// TIFF type sizes: index = type ID, value = byte size per component
const _EXIF__EXIF_TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
// Type names for display
const _EXIF__EXIF_TYPE_NAMES = [
  "",
  "BYTE",
  "ASCII",
  "SHORT",
  "LONG",
  "RATIONAL",
  "SBYTE",
  "UNDEFINED",
  "SSHORT",
  "SLONG",
  "SRATIONAL",
  "FLOAT",
  "DOUBLE",
];

/**
 * Find the APP1 EXIF segment in a JPEG.
 * Returns { offset, length } of the full APP1 segment (including FF E1 marker),
 * and tiffOffset (start of TIFF header within the JPEG byte array).
 */
function findExifSegment(jpeg) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;

  let i = 2;
  while (i < jpeg.length - 1) {
    if (jpeg[i] !== 0xff) break;
    const marker = jpeg[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const segLen = (jpeg[i + 2] << 8) | jpeg[i + 3];

    if (
      marker === 0xe1 &&
      jpeg[i + 4] === 0x45 &&
      jpeg[i + 5] === 0x78 &&
      jpeg[i + 6] === 0x69 &&
      jpeg[i + 7] === 0x66 &&
      jpeg[i + 8] === 0x00 &&
      jpeg[i + 9] === 0x00
    ) {
      return {
        segmentOffset: i,
        segmentLength: 2 + segLen,
        tiffOffset: i + 10,
      };
    }
    i += 2 + segLen;
  }
  return null;
}

/**
 * Reads a TIFF value that may be a single item or an array.
 * If count is 1, returns the single value; otherwise returns an array
 * read at the given stride.
 * @param {number} count - Number of values to read.
 * @param {number} stride - Byte distance between consecutive values.
 * @param {function(number): *} getter - Reader function that takes a byte offset and returns a value.
 * @param {number} valOffset - Starting byte offset for the first value.
 * @returns {*|Array<*>} A single value when count is 1, or an array of values.
 */
function readSingleOrArray(count, stride, getter, valOffset) {
  if (count === 1) return getter(valOffset);
  return Array.from({ length: count }, (_, i) =>
    getter(valOffset + i * stride),
  );
}

/**
 * Reads an array of TIFF rational values (numerator/denominator pairs at 8-byte stride).
 * Each rational is returned as an object with the raw numerator, denominator, and computed value.
 * @param {number} count - Number of rational values to read.
 * @param {number} valOffset - Starting byte offset of the first rational.
 * @param {function(number): number} numReader - Reader function for the numerator (4 bytes at offset).
 * @param {function(number): number} denReader - Reader function for the denominator (4 bytes at offset + 4).
 * @returns {Array<{num: number, den: number, value: number}>} Array of rational objects.
 */
function readRationals(count, valOffset, numReader, denReader) {
  return Array.from({ length: count }, (_, i) => {
    const num = numReader(valOffset + i * 8);
    const den = denReader(valOffset + i * 8 + 4);
    return { num, den, value: den ? num / den : 0 };
  });
}

/**
 * Formats a single TIFF rational value for display, with special formatting
 * for certain tag names: ExposureTime (e.g. "1/250s"), FNumber (e.g. "f/2.8"),
 * and FocalLength (e.g. "50.0mm"). Other rationals are shown as "num/den"
 * or just the numerator if the denominator is 1.
 * @param {{num: number, den: number, value: number}} r - The rational value to format.
 * @param {string} tagName - The EXIF tag name, used to select special formatting.
 * @returns {string} The formatted display string.
 */
function formatRational(r, tagName) {
  if (r.den === 1) return String(r.num);
  if (tagName === "ExposureTime" && r.num === 1) return `1/${r.den}s`;
  if (tagName === "FNumber") return `f/${r.value.toFixed(1)}`;
  if (tagName === "FocalLength") return `${r.value.toFixed(1)}mm`;
  return `${r.num}/${r.den}`;
}

/**
 * Formats TIFF UNDEFINED type values for display. Handles UserComment
 * (strips 8-byte charset prefix), ExifVersion/FlashpixVersion (decoded as text),
 * small values of 8 bytes or fewer (shown as hex), or shows a byte count for
 * larger payloads.
 * @param {Uint8Array|*} value - The raw UNDEFINED value (usually a Uint8Array).
 * @param {string} tagName - The EXIF tag name, used to select special handling.
 * @param {TextDecoder} decoder - A TextDecoder instance for converting bytes to strings.
 * @returns {string} The formatted display string.
 */
function formatUndefined(value, tagName, decoder) {
  if (!(value instanceof Uint8Array)) return String(value);
  if (tagName === "UserComment" && value.length >= 8) {
    const prefix = decoder.decode(value.slice(0, 8));
    return prefix.startsWith("ASCII")
      ? decoder.decode(value.slice(8))
      : `[${value.length} bytes]`;
  }
  if (tagName === "ExifVersion" || tagName === "FlashpixVersion") {
    return decoder.decode(value);
  }
  if (value.length <= 8) {
    return Array.from(value)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
  }
  return `[${value.length} bytes]`;
}

/**
 * Parse all EXIF tags from a JPEG Uint8Array.
 * Returns an array of tag objects with: { tagId, ifd, name, group, typeName, value, displayValue, rawOffset, rawLength }
 */
function parseAllExifTags(jpegBytes) {
  const seg = findExifSegment(jpegBytes);
  if (!seg) return [];

  const { tiffOffset } = seg;
  const view = new DataView(
    jpegBytes.buffer,
    jpegBytes.byteOffset + tiffOffset,
  );
  const bigEndian = view.getUint16(0) === 0x4d4d;

  const g16 = (off) =>
    bigEndian ? view.getUint16(off) : view.getUint16(off, true);
  const g32 = (off) =>
    bigEndian ? view.getUint32(off) : view.getUint32(off, true);
  const gs16 = (off) =>
    bigEndian ? view.getInt16(off) : view.getInt16(off, true);
  const gs32 = (off) =>
    bigEndian ? view.getInt32(off) : view.getInt32(off, true);

  const tags = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });

  /**
   * Slices raw bytes from the JPEG at the given TIFF-relative offset.
   * @param {number} valOffset - Byte offset relative to the TIFF header start.
   * @param {number} count - Number of bytes to read.
   * @returns {Uint8Array} The sliced byte range.
   */
  function readBytes(valOffset, count) {
    return jpegBytes.slice(
      tiffOffset + valOffset,
      tiffOffset + valOffset + count,
    );
  }

  /**
   * Reads a null-terminated ASCII string from TIFF data.
   * Trailing null bytes are stripped before decoding.
   * @param {number} valOffset - Byte offset relative to the TIFF header start.
   * @param {number} count - Total number of bytes (including any null terminator).
   * @returns {string} The decoded string.
   */
  function readAscii(valOffset, count) {
    const raw = readBytes(valOffset, count);
    let end = raw.length;
    while (end > 0 && raw[end - 1] === 0) end--;
    return decoder.decode(raw.slice(0, end));
  }

  /**
   * Reads signed byte values, converting unsigned 0-255 to signed -128..127.
   * Returns a single value when count is 1, or an array otherwise.
   * @param {number} valOffset - Byte offset relative to the TIFF header start.
   * @param {number} count - Number of signed bytes to read.
   * @returns {number|Array<number>} A single signed byte or an array of signed bytes.
   */
  function readSignedBytes(valOffset, count) {
    const toSigned = (v) => (v > 127 ? v - 256 : v);
    if (count === 1) return toSigned(jpegBytes[tiffOffset + valOffset]);
    return Array.from(readBytes(valOffset, count), toSigned);
  }

  /**
   * Dispatches to the appropriate reader based on TIFF type ID (1-12).
   * Handles BYTE, ASCII, SHORT, LONG, RATIONAL, SBYTE, UNDEFINED, SSHORT,
   * SLONG, SRATIONAL, and falls back to raw bytes for unknown types.
   * @param {number} type - TIFF type ID (1-12).
   * @param {number} count - Number of values of the given type to read.
   * @param {number} valOffset - Byte offset where the value data begins.
   * @returns {*} The parsed value(s), whose shape depends on the type and count.
   */
  function readValue(type, count, valOffset) {
    switch (type) {
      case 1:
        return readSingleOrArray(
          count,
          1,
          (off) => jpegBytes[tiffOffset + off],
          valOffset,
        ); // BYTE
      case 2:
        return readAscii(valOffset, count);
      case 3:
        return readSingleOrArray(count, 2, g16, valOffset); // SHORT
      case 4:
        return readSingleOrArray(count, 4, g32, valOffset); // LONG
      case 5:
        return readRationals(count, valOffset, g32, g32); // RATIONAL
      case 6:
        return readSignedBytes(valOffset, count); // SBYTE
      case 7:
        return readBytes(valOffset, count); // UNDEFINED
      case 8:
        return readSingleOrArray(count, 2, gs16, valOffset); // SSHORT
      case 9:
        return readSingleOrArray(count, 4, gs32, valOffset); // SLONG
      case 10:
        return readRationals(count, valOffset, gs32, gs32); // SRATIONAL
      default:
        return readBytes(valOffset, count);
    }
  }

  /**
   * Converts a parsed TIFF value to a human-readable display string.
   * Delegates to specialized formatters for ASCII, UNDEFINED, and RATIONAL types,
   * and falls back to joining arrays or converting to string for other types.
   * @param {*} value - The parsed TIFF value.
   * @param {number} type - TIFF type ID.
   * @param {string} tagName - The EXIF tag name, passed through to sub-formatters.
   * @returns {string} The human-readable display string.
   */
  function formatValue(value, type, tagName) {
    if (type === 2) return String(value);
    if (type === 7) return formatUndefined(value, tagName, decoder);
    if (type === 5 || type === 10) {
      if (value.length === 1) return formatRational(value[0], tagName);
      return value
        .map((r) => (r.den === 1 ? String(r.num) : `${r.num}/${r.den}`))
        .join(", ");
    }
    if (Array.isArray(value) && value.length > 20)
      return `[${value.length} values]`;
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  }

  const SUB_IFD_NAMES = {
    0x8769: "ExifIFD",
    0x8825: "GPSIFD",
    0xa005: "InteropIFD",
  };

  /**
   * Parses a single 12-byte IFD entry. If the tag is a known sub-IFD pointer
   * (ExifIFD, GPSIFD, or InteropIFD), recursively reads that sub-IFD and
   * returns null. Otherwise, reads and formats the tag value and returns
   * a tag object.
   * @param {number} entryOff - Byte offset of the 12-byte IFD entry.
   * @param {string} ifdName - Name of the containing IFD (e.g. "IFD0", "ExifIFD").
   * @returns {Object|null} A parsed tag object, or null for sub-IFD pointers and invalid types.
   */
  function readIFDEntry(entryOff, ifdName) {
    const tagId = g16(entryOff);
    const type = g16(entryOff + 2);
    const cnt = g32(entryOff + 4);

    if (type < 1 || type > 12) return null;

    const subIfdName = SUB_IFD_NAMES[tagId];
    if (subIfdName) {
      readIFD(g32(entryOff + 8), subIfdName);
      return null;
    }

    const totalBytes = cnt * (_EXIF__EXIF_TYPE_SIZES[type] || 1);
    const valOffset = totalBytes > 4 ? g32(entryOff + 8) : entryOff + 8;
    const dictEntry = lookupTag(tagId, ifdName);

    let value, displayValue;
    try {
      value = readValue(type, cnt, valOffset);
      displayValue = formatValue(value, type, dictEntry?.name ?? "");
    } catch {
      displayValue = `[error reading ${totalBytes} bytes]`;
      value = null;
    }

    return {
      tagId,
      ifd: ifdName,
      name: dictEntry?.name ?? `Tag_0x${tagId.toString(16).padStart(4, "0")}`,
      group: dictEntry?.group ?? "Other",
      type,
      typeName: _EXIF__EXIF_TYPE_NAMES[type] || "UNKNOWN",
      count: cnt,
      value,
      displayValue,
      rawEntryOffset: entryOff,
      rawValueOffset: valOffset,
      rawLength: totalBytes,
    };
  }

  /**
   * Iterates all entries in an IFD (Image File Directory), parsing each
   * 12-byte entry and pushing valid tag objects to the result array.
   * Skips IFDs with out-of-bounds offsets or unreasonable entry counts.
   * @param {number} offset - Byte offset of the IFD within the TIFF data.
   * @param {string} ifdName - Name for this IFD (e.g. "IFD0", "IFD1", "ExifIFD").
   */
  function readIFD(offset, ifdName) {
    if (offset < 0 || offset + 2 > view.byteLength) return;

    let count;
    try {
      count = g16(offset);
    } catch {
      return;
    }
    if (count === 0 || count > 500) return;

    for (let i = 0; i < count; i++) {
      const entryOff = offset + 2 + i * 12;
      if (entryOff + 12 > view.byteLength) break;

      const entry = readIFDEntry(entryOff, ifdName);
      if (entry) tags.push(entry);
    }
  }

  const ifd0Offset = g32(4);
  readIFD(ifd0Offset, "IFD0");

  // Check for IFD1 (thumbnail)
  const ifd0Count = g16(ifd0Offset);
  const ifd1Pointer = ifd0Offset + 2 + ifd0Count * 12;
  if (ifd1Pointer + 4 <= view.byteLength) {
    const ifd1Offset = g32(ifd1Pointer);
    if (ifd1Offset > 0 && ifd1Offset < view.byteLength) {
      readIFD(ifd1Offset, "IFD1");
    }
  }

  return tags;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    findExifSegment,
    readSingleOrArray,
    readRationals,
    formatRational,
    formatUndefined,
    parseAllExifTags,
    _EXIF__EXIF_TYPE_SIZES,
    _EXIF__EXIF_TYPE_NAMES,
  };
}

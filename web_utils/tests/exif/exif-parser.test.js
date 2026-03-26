const { loadIntoGlobal } = require("../helpers/load-globals.js");
const {
  createMinimalJpeg,
  createMinimalTiff,
} = require("../helpers/fixtures.js");

// Load tag-dictionary into globalThis so exif-parser can find lookupTag
loadIntoGlobal("../../tools/exif/tag-dictionary.js");
const {
  findExifSegment,
  readSingleOrArray,
  readRationals,
  formatRational,
  formatUndefined,
  parseAllExifTags,
} = require("../../tools/exif/exif-parser.js");

describe("findExifSegment", () => {
  it("returns null for non-JPEG data", () => {
    expect(findExifSegment(new Uint8Array([0x00, 0x01]))).toBeNull();
  });

  it("returns null for JPEG without EXIF", () => {
    const jpeg = createMinimalJpeg();
    expect(findExifSegment(jpeg)).toBeNull();
  });

  it("finds EXIF segment in a valid JPEG", () => {
    const tiff = createMinimalTiff();
    const jpeg = createMinimalJpeg({ exifTiffBytes: tiff });
    const seg = findExifSegment(jpeg);

    expect(seg).not.toBeNull();
    expect(seg.segmentOffset).toBe(2); // right after SOI
    expect(seg.tiffOffset).toBe(12); // 2 (SOI) + 2 (marker) + 2 (length) + 6 (Exif\0\0)
  });
});

describe("readSingleOrArray", () => {
  it("returns a single value when count is 1", () => {
    const getter = (off) => off * 10;
    expect(readSingleOrArray(1, 4, getter, 5)).toBe(50);
  });

  it("returns an array when count > 1", () => {
    const getter = (off) => off;
    const result = readSingleOrArray(3, 2, getter, 0);
    expect(result).toEqual([0, 2, 4]);
  });
});

describe("readRationals", () => {
  it("reads a single rational value", () => {
    const data = new DataView(new ArrayBuffer(8));
    data.setUint32(0, 1);
    data.setUint32(4, 3);
    const numReader = (off) => data.getUint32(off);
    const denReader = (off) => data.getUint32(off);

    const result = readRationals(1, 0, numReader, denReader);
    expect(result).toHaveLength(1);
    expect(result[0].num).toBe(1);
    expect(result[0].den).toBe(3);
    expect(result[0].value).toBeCloseTo(1 / 3);
  });

  it("handles zero denominator", () => {
    const data = new DataView(new ArrayBuffer(8));
    data.setUint32(0, 5);
    data.setUint32(4, 0);
    const reader = (off) => data.getUint32(off);

    const result = readRationals(1, 0, reader, reader);
    expect(result[0].value).toBe(0);
  });
});

describe("formatRational", () => {
  it("formats integer rationals (den=1)", () => {
    expect(formatRational({ num: 100, den: 1, value: 100 }, "SomeTag")).toBe(
      "100",
    );
  });

  it("formats ExposureTime with 1/x notation", () => {
    expect(
      formatRational({ num: 1, den: 250, value: 1 / 250 }, "ExposureTime"),
    ).toBe("1/250s");
  });

  it("formats FNumber with f/ notation", () => {
    expect(formatRational({ num: 28, den: 10, value: 2.8 }, "FNumber")).toBe(
      "f/2.8",
    );
  });

  it("formats FocalLength with mm notation", () => {
    expect(formatRational({ num: 50, den: 1, value: 50 }, "FocalLength")).toBe(
      "50",
    );
    expect(
      formatRational({ num: 185, den: 10, value: 18.5 }, "FocalLength"),
    ).toBe("18.5mm");
  });

  it("formats generic rationals as num/den", () => {
    expect(formatRational({ num: 3, den: 7, value: 3 / 7 }, "SomeTag")).toBe(
      "3/7",
    );
  });
});

describe("formatUndefined", () => {
  const decoder = new TextDecoder("utf-8", { fatal: false });

  it("formats ExifVersion as text", () => {
    const value = new Uint8Array([0x30, 0x32, 0x33, 0x32]); // "0232"
    expect(formatUndefined(value, "ExifVersion", decoder)).toBe("0232");
  });

  it("formats FlashpixVersion as text", () => {
    const value = new Uint8Array([0x30, 0x31, 0x30, 0x30]);
    expect(formatUndefined(value, "FlashpixVersion", decoder)).toBe("0100");
  });

  it("formats UserComment with ASCII prefix", () => {
    const prefix = new TextEncoder().encode("ASCII\0\0\0");
    const message = new TextEncoder().encode("Hello");
    const value = new Uint8Array(prefix.length + message.length);
    value.set(prefix);
    value.set(message, prefix.length);
    expect(formatUndefined(value, "UserComment", decoder)).toBe("Hello");
  });

  it("shows byte count for large undefined values", () => {
    const value = new Uint8Array(100);
    expect(formatUndefined(value, "MakerNote", decoder)).toBe("[100 bytes]");
  });

  it("shows hex for small undefined values", () => {
    const value = new Uint8Array([0xab, 0xcd]);
    expect(formatUndefined(value, "SomeTag", decoder)).toBe("ab cd");
  });

  it("returns String(value) for non-Uint8Array", () => {
    expect(formatUndefined(42, "SomeTag", decoder)).toBe("42");
  });
});

describe("parseAllExifTags", () => {
  it("returns empty array for non-JPEG", () => {
    expect(parseAllExifTags(new Uint8Array([0, 1, 2]))).toEqual([]);
  });

  it("returns empty array for JPEG without EXIF", () => {
    const jpeg = createMinimalJpeg();
    expect(parseAllExifTags(jpeg)).toEqual([]);
  });

  it("parses tags from a JPEG with EXIF", () => {
    // Create TIFF with a SHORT tag (Orientation = 1)
    const tiff = createMinimalTiff([
      {
        tag: 0x0112, // Orientation
        type: 3, // SHORT
        count: 1,
        valueBytes: [0x00, 0x01, 0x00, 0x00], // value=1 (big-endian)
      },
    ]);
    const jpeg = createMinimalJpeg({ exifTiffBytes: tiff });
    const tags = parseAllExifTags(jpeg);

    expect(tags.length).toBe(1);
    expect(tags[0].name).toBe("Orientation");
    expect(tags[0].tagId).toBe(0x0112);
    expect(tags[0].value).toBe(1);
  });
});

const {
  buildExifBytes,
  stripExifFromJpeg,
  insertExifIntoJpeg,
  parseExifFromJpeg,
} = require("../../tools/watermark/exif-embed.js");

describe("buildExifBytes", () => {
  it("returns null when no fields are provided", () => {
    expect(buildExifBytes({})).toBeNull();
    expect(buildExifBytes({ artist: "", copyright: "" })).toBeNull();
  });

  it("returns a valid TIFF structure for artist field", () => {
    const result = buildExifBytes({ artist: "John" });
    expect(result).toBeInstanceOf(Uint8Array);
    // Check TIFF header: big-endian (MM) + magic 42
    expect(result[0]).toBe(0x4d);
    expect(result[1]).toBe(0x4d);
    const view = new DataView(result.buffer, result.byteOffset);
    expect(view.getUint16(2)).toBe(42);
  });

  it("includes all three field types", () => {
    const result = buildExifBytes({
      artist: "Alice",
      copyright: "2024",
      userComment: "Hello",
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(20);
  });

  it("places Copyright tag (0x8298) in IFD0, not ExifIFD", () => {
    const result = buildExifBytes({ copyright: "2024 Test" });
    const view = new DataView(result.buffer, result.byteOffset);
    // TIFF header: MM (0x4D4D), magic 42, IFD0 offset at byte 4
    const ifd0Offset = view.getUint32(4);
    const ifd0Count = view.getUint16(ifd0Offset);

    // Copyright (0x8298) should be in IFD0 entries
    let foundCopyrightInIFD0 = false;
    for (let i = 0; i < ifd0Count; i++) {
      const tagId = view.getUint16(ifd0Offset + 2 + i * 12);
      if (tagId === 0x8298) foundCopyrightInIFD0 = true;
    }
    expect(foundCopyrightInIFD0).toBe(true);
  });

  it("places Artist and Copyright in IFD0, UserComment in ExifIFD", () => {
    const result = buildExifBytes({
      artist: "Alice",
      copyright: "2024",
      userComment: "note",
    });
    const view = new DataView(result.buffer, result.byteOffset);
    const ifd0Offset = view.getUint32(4);
    const ifd0Count = view.getUint16(ifd0Offset);

    const ifd0Tags = [];
    for (let i = 0; i < ifd0Count; i++) {
      ifd0Tags.push(view.getUint16(ifd0Offset + 2 + i * 12));
    }
    expect(ifd0Tags).toContain(0x013b); // Artist in IFD0
    expect(ifd0Tags).toContain(0x8298); // Copyright in IFD0
    expect(ifd0Tags).not.toContain(0x9286); // UserComment should NOT be in IFD0
  });
});

describe("stripExifFromJpeg", () => {
  it("removes APP1 segment from JPEG", () => {
    // Build a simple JPEG with an APP1 segment
    const parts = [
      0xff,
      0xd8, // SOI
      0xff,
      0xe1, // APP1
      0x00,
      0x04,
      0x00,
      0x00, // segment length=4, dummy data
      0xff,
      0xda, // SOS
      0x00,
      0x02, // segment length
      0xff,
      0xd9, // EOI
    ];
    const jpeg = new Uint8Array(parts);
    const result = stripExifFromJpeg(jpeg);

    // Should not contain 0xE1 marker
    let hasApp1 = false;
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i] === 0xff && result[i + 1] === 0xe1) hasApp1 = true;
    }
    expect(hasApp1).toBe(false);
    // Should still be a valid JPEG (starts with SOI, ends with EOI)
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);
  });
});

describe("insertExifIntoJpeg + parseExifFromJpeg round-trip", () => {
  it("round-trips EXIF artist field", () => {
    const exifData = buildExifBytes({ artist: "TestArtist" });
    // Create minimal JPEG
    const minimalJpeg = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xda, // SOS
      0x00,
      0x02,
      0xff,
      0xd9,
    ]);

    const jpegWithExif = insertExifIntoJpeg(minimalJpeg.buffer, exifData);
    const parsed = parseExifFromJpeg(jpegWithExif.buffer);

    expect(parsed).not.toBeNull();
    expect(parsed.artist).toBe("TestArtist");
  });

  it("round-trips copyright and userComment", () => {
    const exifData = buildExifBytes({
      copyright: "2024 Test",
      userComment: "Hidden message",
    });
    const minimalJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9,
    ]);

    const jpegWithExif = insertExifIntoJpeg(minimalJpeg.buffer, exifData);
    const parsed = parseExifFromJpeg(jpegWithExif.buffer);

    expect(parsed.copyright).toBe("2024 Test");
    expect(parsed.userComment).toBe("Hidden message");
  });
});

describe("parseExifFromJpeg", () => {
  it("returns null for non-JPEG data", () => {
    const notJpeg = new Uint8Array([0x00, 0x01, 0x02]);
    expect(parseExifFromJpeg(notJpeg.buffer)).toBeNull();
  });

  it("returns null for JPEG without EXIF", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9,
    ]);
    expect(parseExifFromJpeg(jpeg.buffer)).toBeNull();
  });
});

/** Magic header ("LSB" + version byte 0x01) prepended to every encoded message to identify valid LSB watermarks. */
const LSB_MAGIC = "LSB\x01";

/**
 * Converts a text string into an array of bits suitable for LSB embedding.
 *
 * The output format is a 32-bit big-endian length header (byte count of the
 * UTF-8-encoded text) followed by the message bytes, each expanded to 8 bits.
 *
 * @param {string} text - The text string to convert.
 * @returns {number[]} An array of 0s and 1s representing the length-prefixed message.
 */
function _lsbTextToBits(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const bits = [];
  for (let i = 31; i >= 0; i--) bits.push((bytes.length >> i) & 1);
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
}

/**
 * Converts an array of bits back into a text string.
 *
 * Bits are grouped into chunks of 8, each chunk interpreted as a single byte
 * (big-endian). The resulting byte array is decoded as UTF-8.
 *
 * @param {number[]} bits - An array of 0s and 1s representing the message bytes.
 * @returns {string} The decoded text string.
 */
function _lsbBitsToText(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
    bytes.push(byte);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Encodes a hidden message into a canvas image using LSB steganography.
 *
 * The message is automatically prefixed with the {@link LSB_MAGIC} header
 * before encoding. Each bit of the resulting payload replaces the least
 * significant bit of the selected color channel(s) in successive pixels.
 *
 * The canvas image data is modified in place.
 *
 * @param {HTMLCanvasElement} canvas - The canvas whose image data will carry the hidden message.
 * @param {string} message - The plaintext message to hide.
 * @param {'rgb'|'b'} channelMode - Channel mode: `'rgb'` spreads bits across the
 *   red, green, and blue channels (3 bits per pixel), while `'b'` uses the blue
 *   channel only (1 bit per pixel).
 * @throws {Error} If the message (including header) exceeds the available capacity.
 */
function lsbEncode(canvas, message, channelMode) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const fullMessage = LSB_MAGIC + message;
  const bits = _lsbTextToBits(fullMessage);

  const channels = channelMode === "rgb" ? [0, 1, 2] : [2];
  const totalCapacity = (data.length / 4) * channels.length;

  if (bits.length > totalCapacity) {
    throw new Error(
      `Message too long. Need ${bits.length} bits but only ${totalCapacity} available.`,
    );
  }

  let bitIndex = 0;
  for (let px = 0; px < data.length / 4 && bitIndex < bits.length; px++) {
    for (const ch of channels) {
      if (bitIndex >= bits.length) break;
      const idx = px * 4 + ch;
      data[idx] = (data[idx] & 0xfe) | bits[bitIndex];
      bitIndex++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Extracts a hidden LSB-encoded message from a canvas image.
 *
 * Reads the least significant bits from the selected color channel(s),
 * reconstructs the 32-bit length header, then extracts that many bytes of
 * payload. The result is validated against the {@link LSB_MAGIC} header;
 * if the header is missing or the length is invalid, the function returns
 * `null` instead of a corrupted string.
 *
 * @param {HTMLCanvasElement} canvas - The canvas containing the watermarked image.
 * @param {'rgb'|'b'} channelMode - Channel mode used during encoding: `'rgb'`
 *   or `'b'` (blue only).
 * @returns {string|null} The decoded message string, or `null` if no valid
 *   watermark is found.
 */
function lsbDecode(canvas, channelMode) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const channels = channelMode === "rgb" ? [0, 1, 2] : [2];

  const allBits = [];
  for (let px = 0; px < data.length / 4; px++) {
    for (const ch of channels) {
      allBits.push(data[px * 4 + ch] & 1);
    }
  }

  if (allBits.length < 32) return null;
  let length = 0;
  for (let i = 0; i < 32; i++) length = (length << 1) | allBits[i];

  if (length <= 0 || length > allBits.length / 8) return null;

  const messageBits = allBits.slice(32, 32 + length * 8);
  const text = _lsbBitsToText(messageBits);

  if (!text.startsWith(LSB_MAGIC)) return null;
  return text.slice(LSB_MAGIC.length);
}

/**
 * Calculates the maximum number of characters that can be hidden in an image
 * of the given dimensions using LSB encoding.
 *
 * The calculation accounts for the 32-bit length header overhead. Note that
 * this returns raw byte capacity; multi-byte UTF-8 characters will reduce
 * the effective character count.
 *
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @param {'rgb'|'b'} channelMode - Channel mode: `'rgb'` (3 bits per pixel)
 *   or `'b'` (1 bit per pixel, blue channel only).
 * @returns {number} The maximum number of bytes (single-byte characters) that
 *   can be encoded.
 */
function lsbCapacity(width, height, channelMode) {
  const pixels = width * height;
  const bitsPerPixel = channelMode === "rgb" ? 3 : 1;
  return Math.floor((pixels * bitsPerPixel - 32) / 8) - LSB_MAGIC.length;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    _lsbTextToBits,
    _lsbBitsToText,
    lsbEncode,
    lsbDecode,
    lsbCapacity,
    LSB_MAGIC,
  };
}

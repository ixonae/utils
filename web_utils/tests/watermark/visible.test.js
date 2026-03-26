const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(
  require.resolve("../../tools/watermark/visible.js"),
  "utf8",
);
const mod = {};
vm.runInNewContext(src + "\nmodule.exports = { applyVisibleWatermark };", {
  module: mod,
  Math,
});
const { applyVisibleWatermark } = mod.exports;

function createMockCanvas() {
  const ctx = {
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 200 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    globalAlpha: 1,
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
  };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    _ctx: ctx,
  };
}

function createMockImg(naturalWidth, naturalHeight) {
  return { naturalWidth, naturalHeight };
}

describe("applyVisibleWatermark", () => {
  it("sets canvas dimensions from img.naturalWidth/naturalHeight", () => {
    const canvas = createMockCanvas();
    const img = createMockImg(800, 600);
    applyVisibleWatermark(canvas, img, { text: "TEST" });

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("calls drawImage with the img", () => {
    const canvas = createMockCanvas();
    const img = createMockImg(800, 600);
    applyVisibleWatermark(canvas, img, { text: "TEST" });

    expect(canvas._ctx.drawImage).toHaveBeenCalledWith(img, 0, 0);
  });

  it("sets correct context properties", () => {
    const canvas = createMockCanvas();
    const img = createMockImg(800, 600);
    applyVisibleWatermark(canvas, img, {
      text: "TEST",
      font: "Helvetica",
      size: 36,
      color: "#00ff00",
      opacity: 0.5,
    });

    const ctx = canvas._ctx;
    expect(ctx.globalAlpha).toBe(0.5);
    expect(ctx.fillStyle).toBe("#00ff00");
    expect(ctx.font).toBe('bold 36px "Helvetica"');
    expect(ctx.textAlign).toBe("center");
    expect(ctx.textBaseline).toBe("middle");
  });

  it("center pattern calls fillText once", () => {
    const canvas = createMockCanvas();
    const img = createMockImg(800, 600);
    applyVisibleWatermark(canvas, img, { text: "CENTER", pattern: "center" });

    const ctx = canvas._ctx;
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith("CENTER", 0, 0);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("tile pattern calls fillText multiple times", () => {
    const canvas = createMockCanvas();
    const img = createMockImg(800, 600);
    applyVisibleWatermark(canvas, img, { text: "TILE", pattern: "tile" });

    const ctx = canvas._ctx;
    expect(ctx.fillText.mock.calls.length).toBeGreaterThan(1);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("uses default options when not provided", () => {
    const canvas = createMockCanvas();
    const img = createMockImg(400, 300);
    applyVisibleWatermark(canvas, img, {});

    const ctx = canvas._ctx;
    expect(ctx.globalAlpha).toBe(0.3);
    expect(ctx.fillStyle).toBe("#ff0000");
    expect(ctx.font).toBe('bold 48px "Arial"');
    // Default pattern is 'tile', so fillText should be called multiple times
    expect(ctx.fillText.mock.calls.length).toBeGreaterThan(1);
    // Every fillText call should use default text 'WATERMARK'
    for (const call of ctx.fillText.mock.calls) {
      expect(call[0]).toBe("WATERMARK");
    }
  });
});

renderHeader($("app-header"), { activeTool: "Watermark", basePath: "../../" });
renderFooter($("app-footer"));

const dropZone = $("dropZone");
const fileInput = $("fileInput");
const applyBtn = $("applyBtn");
const downloadBtn = $("downloadBtn");
const previewContainer = $("previewContainer");

let originalImage = null;
let resultDataURL = null;
let currentMode = "visible";
let originalFileBytes = null;

// --- Mode tabs ---
document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".mode-tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentMode = tab.dataset.mode;

    document
      .querySelectorAll(".mode-panel")
      .forEach((p) => (p.style.display = "none"));
    const panelMap = {
      visible: "visiblePanel",
      stealth: "stealthPanel",
      dct: "dctPanel",
      exif: "exifPanel",
      decode: "decodePanel",
    };
    $(panelMap[currentMode]).style.display = "";

    if (currentMode !== "decode") {
      $("decodeResult").style.display = "none";
    }
  });
});

// --- File upload ---
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () =>
  dropZone.classList.remove("drag-over"),
);
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith("image/")) handleFile(file);
});

/**
 * Processes an uploaded image file: loads it as an Image element, enables all
 * action buttons, updates capacity info, and auto-applies the visible watermark
 * or shows a plain preview depending on the current mode.
 * @param {File} file - The uploaded image file.
 */
async function handleFile(file) {
  if (!file) return;

  originalFileBytes = await file.arrayBuffer();

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      downloadBtn.onclick = null;
      applyBtn.disabled = false;
      $("applyLsbBtn").disabled = false;
      $("applyDctBtn").disabled = false;
      $("applyExifBtn").disabled = false;
      $("decodeLsbBtn").disabled = false;
      $("decodeDctBtn").disabled = false;
      $("decodeExifBtn").disabled = false;
      dropZone.querySelector(".text").textContent = file.name;
      updateCapacityInfo();
      updateDctCapacityInfo();
      if (currentMode === "visible") doApplyWatermark();
      else showOriginalPreview();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Gets or creates the preview <img> element inside the preview container.
 * If no <img> exists, one is created within a canvas-wrapper div.
 * @returns {HTMLImageElement} The preview image element.
 */
function ensurePreviewImg() {
  let img = previewContainer.querySelector("img");
  if (!img) {
    previewContainer.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-wrapper";
    img = document.createElement("img");
    img.alt = "Preview";
    wrapper.appendChild(img);
    previewContainer.appendChild(wrapper);
  }
  return img;
}

/**
 * Shows the original image in the preview area without any watermark.
 * Converts the original image to a canvas data URL and hides the download button.
 */
function showOriginalPreview() {
  if (!originalImage) return;
  const canvas = createCanvasFromImage(originalImage);
  resultDataURL = canvas.toDataURL("image/png");
  ensurePreviewImg().src = resultDataURL;
  downloadBtn.style.display = "none";
}

// --- Visible watermark settings ---
const wmInputs = [
  "wmText",
  "wmFont",
  "wmSize",
  "wmColor",
  "wmOpacity",
  "wmAngle",
  "wmPattern",
  "wmSpacingX",
  "wmSpacingY",
];
wmInputs.forEach((id) => {
  $(id).addEventListener("input", () => {
    updateDisplayValues();
    if (originalImage && currentMode === "visible") doApplyWatermark();
  });
});

/**
 * Syncs the visible watermark UI labels (opacity %, angle degrees, spacing)
 * with their corresponding slider values. Also toggles spacing field visibility
 * based on the selected pattern mode.
 */
function updateDisplayValues() {
  $("opacityVal").textContent = $("wmOpacity").value + "%";
  $("angleVal").textContent = $("wmAngle").value + "\u00b0";
  $("spacingXVal").textContent = $("wmSpacingX").value;
  $("spacingYVal").textContent = $("wmSpacingY").value;
  $("spacingField").style.display =
    $("wmPattern").value === "tile" ? "" : "none";
}
updateDisplayValues();

// --- Capacity info ---
/**
 * Updates the LSB capacity info text based on current image dimensions
 * and the selected channel mode (e.g. RGB or single channel).
 */
function updateCapacityInfo() {
  if (!originalImage) return;
  const maxChars = lsbCapacity(
    originalImage.naturalWidth,
    originalImage.naturalHeight,
    $("lsbChannel").value,
  );
  $("capacityInfo").textContent =
    `Image: ${originalImage.naturalWidth}\u00d7${originalImage.naturalHeight} \u2014 capacity: ~${maxChars.toLocaleString()} characters`;
}

/**
 * Updates the DCT capacity info text based on current image dimensions.
 * Displays total 8x8 blocks and the approximate character capacity.
 */
function updateDctCapacityInfo() {
  if (!originalImage) return;
  const { totalBlocks, maxChars } = dctCapacity(
    originalImage.naturalWidth,
    originalImage.naturalHeight,
  );
  $("dctCapacityInfo").textContent =
    `Image: ${originalImage.naturalWidth}\u00d7${originalImage.naturalHeight} \u2014 ${totalBlocks} blocks \u2014 capacity: ~${maxChars.toLocaleString()} characters`;
}

$("lsbChannel").addEventListener("change", updateCapacityInfo);
$("dctStrength").addEventListener("input", () => {
  $("dctStrengthVal").textContent = $("dctStrength").value;
});

// --- Visible watermark ---
applyBtn.addEventListener("click", doApplyWatermark);

/**
 * Applies visible watermark settings to the original image and shows the result.
 * Reads text, font, size, color, opacity, angle, pattern, and spacing from the
 * UI controls and renders the watermarked image via a canvas.
 */
function doApplyWatermark() {
  if (!originalImage) return;

  const canvas = document.createElement("canvas");
  applyVisibleWatermark(canvas, originalImage, {
    text: $("wmText").value || "WATERMARK",
    font: $("wmFont").value,
    size: Number.parseInt($("wmSize").value, 10) || 48,
    color: $("wmColor").value,
    opacity: Number.parseInt($("wmOpacity").value, 10) / 100,
    angle: Number.parseInt($("wmAngle").value, 10),
    pattern: $("wmPattern").value,
    spacingX: Number.parseInt($("wmSpacingX").value, 10),
    spacingY: Number.parseInt($("wmSpacingY").value, 10),
  });

  showResult(canvas.toDataURL("image/png"));
}

// --- LSB embed ---
$("applyLsbBtn").addEventListener("click", () => {
  if (!originalImage) return;
  const message = $("lsbMessage").value.trim();
  if (!message) {
    alert("Enter a hidden message.");
    return;
  }

  const canvas = createCanvasFromImage(originalImage);

  try {
    lsbEncode(canvas, message, $("lsbChannel").value);
  } catch (e) {
    alert(e.message);
    return;
  }

  showResult(canvas.toDataURL("image/png"));
});

// --- DCT embed ---
$("applyDctBtn").addEventListener("click", () => {
  if (!originalImage) return;
  const message = $("dctMessage").value.trim();
  if (!message) {
    alert("Enter a hidden message.");
    return;
  }
  const strength = Number.parseInt($("dctStrength").value, 10) || 30;

  const canvas = createCanvasFromImage(originalImage);

  try {
    dctEncode(canvas, message, strength);
  } catch (e) {
    alert(e.message);
    return;
  }

  showResult(canvas.toDataURL("image/png"));
});

// --- EXIF embed ---
$("applyExifBtn").addEventListener("click", async () => {
  if (!originalImage) return;

  const fields = {
    userComment: $("exifComment").value.trim(),
    artist: $("exifArtist").value.trim(),
    copyright: $("exifCopyright").value.trim(),
  };

  if (!fields.userComment && !fields.artist && !fields.copyright) {
    alert("Fill in at least one EXIF field.");
    return;
  }

  const exifData = buildExifBytes(fields);
  if (!exifData) return;

  const canvas = createCanvasFromImage(originalImage);
  const jpegBuf = await canvasToJpegArrayBuffer(canvas, 0.95);
  const result = insertExifIntoJpeg(jpegBuf, exifData);

  const blob = new Blob([result], { type: "image/jpeg" });
  if (resultDataURL?.startsWith("blob:")) URL.revokeObjectURL(resultDataURL);
  resultDataURL = URL.createObjectURL(blob);
  previewContainer.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "canvas-wrapper";
  const img = document.createElement("img");
  img.src = resultDataURL;
  img.alt = "Preview";
  wrapper.appendChild(img);
  previewContainer.appendChild(wrapper);
  downloadBtn.style.display = "";

  downloadBtn.onclick = () => {
    const a = document.createElement("a");
    a.href = resultDataURL;
    a.download = "watermarked.jpg";
    a.click();
  };
});

// --- Decode ---
$("decodeLsbBtn").addEventListener("click", () => {
  if (!originalImage) return;
  const canvas = createCanvasFromImage(originalImage);

  let message = lsbDecode(canvas, "rgb");
  let method = "RGB channels";
  if (!message) {
    const ctx = canvas.getContext("2d");
    ctx.drawImage(originalImage, 0, 0);
    message = lsbDecode(canvas, "b");
    method = "Blue channel";
  }

  showDecodeResult(
    message
      ? `[${method}]\n${message}`
      : "No LSB watermark detected in this image.",
  );
});

$("decodeDctBtn").addEventListener("click", () => {
  if (!originalImage) return;
  const canvas = createCanvasFromImage(originalImage);
  const message = dctDecode(canvas);

  showDecodeResult(
    message ? `[DCT]\n${message}` : "No DCT watermark detected in this image.",
  );
});

$("decodeExifBtn").addEventListener("click", () => {
  if (!originalFileBytes) {
    showDecodeResult("No file loaded.");
    return;
  }

  const exif = parseExifFromJpeg(new Uint8Array(originalFileBytes));

  if (exif && (exif.artist || exif.copyright || exif.userComment)) {
    let output = "";
    if (exif.artist) output += `Artist: ${exif.artist}\n`;
    if (exif.copyright) output += `Copyright: ${exif.copyright}\n`;
    if (exif.userComment) output += `UserComment: ${exif.userComment}\n`;
    showDecodeResult(output.trim());
  } else {
    showDecodeResult(
      "No EXIF watermark data found in this image.\n(Note: EXIF is only preserved in JPEG files)",
    );
  }
});

// --- Download (default for non-EXIF modes) ---
downloadBtn.addEventListener("click", () => {
  if (!resultDataURL || downloadBtn.onclick) return;
  const a = document.createElement("a");
  a.href = resultDataURL;
  a.download = "watermarked.png";
  a.click();
});

// --- Helpers ---

/**
 * Displays a watermarked image data URL in the preview area and shows
 * the download button. Resets any custom download handler.
 * @param {string} dataURL - The data URL of the watermarked image.
 */
function showResult(dataURL) {
  resultDataURL = dataURL;
  downloadBtn.onclick = null;
  ensurePreviewImg().src = resultDataURL;
  downloadBtn.style.display = "";
}

/**
 * Displays decoded watermark text in the decode result panel.
 * @param {string} text - The decoded message or a "not found" notice.
 */
function showDecodeResult(text) {
  $("decodeResult").style.display = "";
  $("decodeOutput").textContent = text;
}

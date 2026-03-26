renderHeader($("app-header"), { activeTool: "EXIF", basePath: "../../" });
renderFooter($("app-footer"));

let originalBytes = null;
let parsedTags = [];
let resultBytes = null;
let _previewUrl = null;

// Upload zone
createUploadZone($("upload-container"), {
  accept: "image/*",
  label: "Drop a JPEG image here or click to browse",
  onFile: handleFile,
});

/**
 * Processes an uploaded JPEG file: reads bytes, validates JPEG format,
 * parses EXIF tags, renders the tag table and summary, and shows a preview.
 * @param {File} file - The uploaded file from the upload zone.
 */
async function handleFile(file) {
  const buf = await file.arrayBuffer();
  originalBytes = new Uint8Array(buf);
  resultBytes = null;

  $("btn-download").style.display = "none";
  $("result-info").style.display = "none";

  // Check if JPEG
  if (originalBytes[0] !== 0xff || originalBytes[1] !== 0xd8) {
    showMessage(
      "This file does not appear to be a JPEG. EXIF metadata is primarily found in JPEG files.",
    );
    parsedTags = [];
    renderTagTable();
    updateSummary();
    return;
  }

  parsedTags = parseAllExifTags(originalBytes);

  if (parsedTags.length === 0) {
    showMessage("No EXIF metadata found in this image.");
  } else {
    hideMessage();
  }

  renderTagTable();
  updateSummary();
  showPreview(originalBytes, "image/jpeg");
}

/**
 * Shows a status message in the UI.
 * @param {string} text - The message text to display.
 */
function showMessage(text) {
  $("status-msg").textContent = text;
  $("status-msg").style.display = "";
}

/** Hides the status message element. */
function hideMessage() {
  $("status-msg").style.display = "none";
}

// --- Tag table rendering ---

/**
 * Renders the EXIF tag table UI with checkboxes, grouped by category
 * (Camera, Lens, Image, Date, Author, GPS, Exif, Vendor, Interop, Other).
 * Replaces the contents of the tag-table-container element.
 */
function renderTagTable() {
  const container = $("tag-table-container");

  if (parsedTags.length === 0) {
    container.innerHTML =
      '<div class="placeholder-msg">Upload a JPEG to view its EXIF data</div>';
    $("actions-panel").style.display = "none";
    return;
  }

  $("actions-panel").style.display = "";

  // Group tags
  const groups = {};
  for (const tag of parsedTags) {
    if (!groups[tag.group]) groups[tag.group] = [];
    groups[tag.group].push(tag);
  }

  // Define group display order
  const groupOrder = [
    "Camera",
    "Lens",
    "Image",
    "Date",
    "Author",
    "GPS",
    "Exif",
    "Vendor",
    "Interop",
    "Other",
  ];
  const sortedGroups = groupOrder.filter((g) => groups[g]);
  for (const g of Object.keys(groups)) {
    if (!sortedGroups.includes(g)) sortedGroups.push(g);
  }

  let html =
    '<table class="exif-table"><thead><tr><th class="exif-col-check"><input type="checkbox" id="selectAll" checked></th><th>Tag</th><th>Value</th><th class="exif-col-id">ID</th></tr></thead><tbody>';

  for (const group of sortedGroups) {
    html +=
      '<tr class="exif-group-row"><td colspan="4">' +
      escapeHtml(group) +
      "</td></tr>";

    for (const tag of groups[group]) {
      const key = tag.ifd + ":0x" + tag.tagId.toString(16).padStart(4, "0");
      const displayVal =
        tag.displayValue.length > 200
          ? tag.displayValue.slice(0, 200) + "\u2026"
          : tag.displayValue;

      html +=
        '<tr data-key="' +
        escapeHtml(key) +
        '">' +
        '<td class="exif-col-check"><input type="checkbox" class="tag-checkbox" data-key="' +
        escapeHtml(key) +
        '" checked></td>' +
        '<td class="exif-tag-name">' +
        escapeHtml(tag.name) +
        '<span class="exif-ifd-badge">' +
        escapeHtml(tag.ifd) +
        "</span></td>" +
        '<td class="exif-tag-value" title="' +
        escapeHtml(tag.displayValue) +
        '">' +
        escapeHtml(displayVal) +
        "</td>" +
        '<td class="exif-col-id exif-tag-id">0x' +
        tag.tagId.toString(16).padStart(4, "0").toUpperCase() +
        "</td>" +
        "</tr>";
    }
  }

  html += "</tbody></table>";
  container.innerHTML = html;

  // Select all checkbox
  $("selectAll").addEventListener("change", function (e) {
    container.querySelectorAll(".tag-checkbox").forEach((cb) => {
      cb.checked = e.target.checked;
    });
  });
}

/**
 * Escapes HTML special characters for safe insertion into innerHTML.
 * @param {string} str - The raw string to escape.
 * @returns {string} The escaped string with &, <, >, and " replaced by HTML entities.
 */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Updates the tag count summary text (e.g. "42 tags found (6 GPS)").
 * Displays "No tags loaded" when parsedTags is empty.
 */
function updateSummary() {
  const summary = $("tag-summary");
  if (parsedTags.length === 0) {
    summary.textContent = "No tags loaded";
    return;
  }

  const gpsCount = parsedTags.filter((t) => t.group === "GPS").length;
  let text = parsedTags.length + " tags found";
  if (gpsCount > 0) text += " (" + gpsCount + " GPS)";
  summary.textContent = text;
}

// --- Actions ---
$("btn-strip-selected").addEventListener("click", function () {
  if (!originalBytes) return;
  const unchecked = getUncheckedKeys();
  if (unchecked.size === 0) {
    alert(
      'All tags are selected (checked). Uncheck the tags you want to keep, or use "Strip All".',
    );
    return;
  }

  const checked = getCheckedKeys();
  if (checked.size === 0) return;

  resultBytes = stripSelectedTags(originalBytes, checked);
  showResultInfo();
});

$("btn-strip-gps").addEventListener("click", function () {
  if (!originalBytes) return;

  const gpsKeys = new Set();
  for (const tag of parsedTags) {
    if (tag.group === "GPS") {
      gpsKeys.add(tag.ifd + ":0x" + tag.tagId.toString(16).padStart(4, "0"));
    }
  }

  if (gpsKeys.size === 0) {
    alert("No GPS tags found in this image.");
    return;
  }

  resultBytes = stripSelectedTags(originalBytes, gpsKeys);
  showResultInfo();
});

$("btn-strip-all").addEventListener("click", function () {
  if (!originalBytes) return;
  resultBytes = stripAllExif(originalBytes);
  showResultInfo();
});

$("btn-download").addEventListener("click", function () {
  if (!resultBytes) return;
  const blob = new Blob([resultBytes], { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cleaned.jpg";
  a.click();
  URL.revokeObjectURL(url);
});

/**
 * Returns a Set of checked tag keys from the table checkboxes.
 * @returns {Set<string>} The set of "ifd:0xNNNN" keys for all checked checkboxes.
 */
function getCheckedKeys() {
  const keys = new Set();
  document.querySelectorAll(".tag-checkbox:checked").forEach((cb) => {
    keys.add(cb.dataset.key);
  });
  return keys;
}

/**
 * Returns a Set of unchecked tag keys from the table checkboxes.
 * @returns {Set<string>} The set of "ifd:0xNNNN" keys for all unchecked checkboxes.
 */
function getUncheckedKeys() {
  const keys = new Set();
  document.querySelectorAll(".tag-checkbox:not(:checked)").forEach((cb) => {
    keys.add(cb.dataset.key);
  });
  return keys;
}

/**
 * Displays before/after tag count comparison after stripping.
 * Re-parses the result bytes, shows the count delta, enables the download
 * button, and refreshes the preview with the stripped image.
 */
function showResultInfo() {
  const remainingTags = parseAllExifTags(resultBytes);

  const resultInfo = $("result-info");
  resultInfo.style.display = "";
  resultInfo.innerHTML =
    "<strong>Before:</strong> " +
    parsedTags.length +
    " tags &rarr; <strong>After:</strong> " +
    remainingTags.length +
    " tags " +
    '<span class="result-removed">(' +
    (parsedTags.length - remainingTags.length) +
    " removed)</span>";

  $("btn-download").style.display = "";
  showPreview(resultBytes, "image/jpeg");
}

/**
 * Creates and displays an image preview from raw bytes.
 * @param {Uint8Array} bytes - The raw image bytes.
 * @param {string} mime - The MIME type (e.g. 'image/jpeg').
 */
function showPreview(bytes, mime) {
  if (_previewUrl) URL.revokeObjectURL(_previewUrl);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  _previewUrl = url;
  const container = $("preview-container");
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "canvas-wrapper";
  const img = document.createElement("img");
  img.src = url;
  img.alt = "Preview";
  wrapper.appendChild(img);
  container.appendChild(wrapper);
}

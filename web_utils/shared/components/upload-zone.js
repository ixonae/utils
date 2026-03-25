/**
 * Create a drag-and-drop file upload zone with a click-to-browse fallback.
 * @param {HTMLElement} container - The element to inject the upload zone into.
 * @param {Object} [options] - Configuration options.
 * @param {string} [options.accept] - File type filter for the input (default: "image/*").
 * @param {string} [options.label] - Placeholder text displayed in the zone.
 * @param {function(File): void} [options.onFile] - Callback invoked with the selected File.
 * @returns {{ zone: HTMLElement, setLabel: function(string): void }} Handle to the zone element and a helper to update its label text.
 */
function createUploadZone(container, options) {
    const accept = options?.accept ?? 'image/*';
    const label = options?.label ?? 'Drop an image here or click to browse';
    const onFile = options?.onFile;

    container.innerHTML =
        '<div class="upload-zone" data-upload-zone>' +
            '<span class="icon">&#128196;</span>' +
            '<span class="text">' + label + '</span>' +
            '<input type="file" accept="' + accept + '">' +
        '</div>';

    const zone = container.querySelector('[data-upload-zone]');
    const input = zone.querySelector('input[type="file"]');
    const textEl = zone.querySelector('.text');

    zone.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
        if (input.files[0]) {
            textEl.textContent = input.files[0].name;
            onFile(input.files[0]);
        }
    });

    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            textEl.textContent = file.name;
            onFile(file);
        }
    });

    return { zone: zone, setLabel: function (text) { textEl.textContent = text; } };
}

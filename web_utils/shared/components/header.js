/**
 * Render the site header with navigation links into the given container.
 * The currently active tool link is highlighted automatically.
 * @param {HTMLElement} container - The element to inject the header HTML into.
 * @param {Object} [options] - Configuration options.
 * @param {string} [options.activeTool] - Label of the currently active tool (used to highlight the nav link).
 * @param {string} [options.basePath] - Base path prefix for all navigation URLs.
 */
function renderHeader(container, options) {
    const activeTool = options?.activeTool ?? '';
    const base = options?.basePath ?? '';

    const links = [
        { label: 'Home', href: base + 'index.html' },
        { label: 'Watermark', href: base + 'tools/watermark/index.html' },
        { label: 'EXIF', href: base + 'tools/exif/index.html' },
    ];

    const nav = links.map(function (link) {
        const isActive = link.label.toLowerCase() === activeTool.toLowerCase();
        return '<a href="' + link.href + '"' + (isActive ? ' class="active"' : '') + '>' + link.label + '</a>';
    }).join('');

    container.innerHTML =
        '<div class="site-header">' +
            '<a href="' + base + 'index.html" class="site-header-brand">' +
                '<h1>Ixonae Utils</h1>' +
            '</a>' +
            '<nav>' +
                nav +
                '<a href="https://github.com/ixonae/utils" target="_blank" rel="noopener">GitHub</a>' +
            '</nav>' +
        '</div>';
}

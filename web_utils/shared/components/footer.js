/**
 * Render the site footer into the given container element.
 * Includes links to GitHub and ixonae.com, plus a privacy notice.
 * @param {HTMLElement} container - The element to inject the footer HTML into.
 */
function renderFooter(container) {
  container.innerHTML =
    '<footer class="site-footer">' +
    '<div class="footer-links">' +
    '<a href="https://github.com/ixonae/utils" target="_blank" rel="noopener">GitHub</a>' +
    '<a href="https://www.ixonae.com" target="_blank" rel="noopener">ixonae.com</a>' +
    "</div>" +
    '<div class="footer-note">Everything runs in your browser. No data is uploaded anywhere.</div>' +
    "</footer>";
}

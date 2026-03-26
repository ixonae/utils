/**
 * Loads a module's exports into globalThis so that downstream modules
 * (which reference those functions as globals) can find them.
 * @param {string} modulePath - Path to require()
 * @returns {object} The module's exports
 */
function loadIntoGlobal(modulePath) {
  const mod = require(modulePath);
  for (const [key, value] of Object.entries(mod)) {
    globalThis[key] = value;
  }
  return mod;
}

module.exports = { loadIntoGlobal };

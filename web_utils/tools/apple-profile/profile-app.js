(function () {
  const state = {
    providers: [],
    displayName: "DNS over HTTPS",
    identifier: "com.ixonae.doh-profile",
    description: "Routes DNS queries over HTTPS for privacy and security",
    // [{ name, providerIds }] where providerIds === null means "all providers"
    excludedSSIDs: [],
    // Identifiers carried over from an imported profile
    imported: {},
    generatedXml: null,
  };

  let nextId = 1;
  const els = {};

  function init() {
    els.presetSelect = document.getElementById("provider-preset");
    els.addPresetBtn = document.getElementById("btn-add-preset");
    els.customForm = document.getElementById("custom-form");
    els.customName = document.getElementById("custom-name");
    els.customUrl = document.getElementById("custom-url");
    els.customUrlField = document.getElementById("custom-url-field");
    els.customProtocol = document.getElementById("custom-protocol");
    els.customServerName = document.getElementById("custom-servername");
    els.customServerNameField = document.getElementById(
      "custom-servername-field",
    );
    els.customFailover = document.getElementById("custom-failover");
    els.customAddresses = document.getElementById("custom-addresses");
    els.addCustomBtn = document.getElementById("btn-add-custom");
    els.providerList = document.getElementById("provider-list");
    els.providerEmpty = document.getElementById("provider-empty");
    els.ssidInput = document.getElementById("ssid-input");
    els.ssidAddBtn = document.getElementById("ssid-add-btn");
    els.ssidList = document.getElementById("ssid-list");
    els.displayName = document.getElementById("profile-name");
    els.identifier = document.getElementById("profile-identifier");
    els.description = document.getElementById("profile-description");
    els.generateBtn = document.getElementById("btn-generate");
    els.previewContainer = document.getElementById("xml-preview");
    els.downloadBtn = document.getElementById("btn-download");
    els.copyBtn = document.getElementById("btn-copy");
    els.importInput = document.getElementById("import-file");
    els.importStatus = document.getElementById("import-status");

    populatePresets();

    els.addPresetBtn.addEventListener("click", addPreset);
    els.addCustomBtn.addEventListener("click", addCustom);
    els.customProtocol.addEventListener("change", syncCustomFormFields);
    syncCustomFormFields();
    els.providerList.addEventListener("input", onProviderEdit);
    els.providerList.addEventListener("change", onProviderEdit);
    els.ssidAddBtn.addEventListener("click", addSSID);
    els.ssidInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addSSID();
    });
    els.displayName.addEventListener("input", function () {
      state.displayName = els.displayName.value;
      clearPreview();
    });
    els.identifier.addEventListener("input", function () {
      state.identifier = els.identifier.value;
      clearPreview();
    });
    els.description.addEventListener("input", function () {
      state.description = els.description.value;
      clearPreview();
    });
    els.generateBtn.addEventListener("click", generate);
    els.downloadBtn.addEventListener("click", download);
    els.copyBtn.addEventListener("click", copyXml);
    els.importInput.addEventListener("change", function () {
      if (els.importInput.files.length > 0)
        importFile(els.importInput.files[0]);
      els.importInput.value = "";
    });
  }

  function populatePresets() {
    const keys = Object.keys(DNS_PRESETS);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === "custom") continue;
      const opt = document.createElement("option");
      opt.value = keys[i];
      opt.textContent = DNS_PRESETS[keys[i]].label;
      els.presetSelect.appendChild(opt);
    }
  }

  function addPreset() {
    const key = els.presetSelect.value;
    if (!key) return;
    const preset = DNS_PRESETS[key];
    state.providers.push({
      id: nextId++,
      type: "preset",
      key: key,
      label: preset.label,
      protocol: "HTTPS",
      url: preset.url,
      serverName: "",
      allowFailover: false,
      addresses: preset.addresses.slice(),
    });
    els.presetSelect.value = "";
    renderProviders();
    clearPreview();
  }

  function splitAddresses(text) {
    return text
      .split(/[\n,]+/)
      .map(function (a) {
        return a.trim();
      })
      .filter(function (a) {
        return a !== "";
      });
  }

  function syncCustomFormFields() {
    const isTLS = els.customProtocol.value === "TLS";
    els.customUrlField.hidden = isTLS;
    els.customServerNameField.hidden = !isTLS;
  }

  // Returns an error message, or null when the DoH URL / DoT hostname is acceptable
  function validateEndpoint(protocol, url, serverName) {
    if (protocol === "TLS") {
      if (!serverName) return "DoT server hostname is required.";
      if (/[\s/:]/.test(serverName))
        return "DoT server name must be a plain hostname (no scheme, port or path).";
      return null;
    }
    if (!url) return "DoH server URL is required.";
    try {
      if (new URL(url).protocol !== "https:") return "URL must use HTTPS.";
    } catch (e) {
      return "Invalid URL.";
    }
    return null;
  }

  function addCustom() {
    const name = els.customName.value.trim();
    const protocol = els.customProtocol.value;
    const url = els.customUrl.value.trim();
    const serverName = els.customServerName.value.trim();

    if (!name) {
      alert("Provider name is required.");
      return;
    }
    const error = validateEndpoint(protocol, url, serverName);
    if (error) {
      alert(error);
      return;
    }

    state.providers.push({
      id: nextId++,
      type: "custom",
      key: null,
      label: name,
      protocol: protocol,
      url: protocol === "HTTPS" ? url : "",
      serverName: protocol === "TLS" ? serverName : "",
      allowFailover: els.customFailover.checked,
      addresses: splitAddresses(els.customAddresses.value),
    });

    els.customName.value = "";
    els.customUrl.value = "";
    els.customServerName.value = "";
    els.customAddresses.value = "";
    els.customFailover.checked = false;
    els.customForm.open = false;
    renderProviders();
    clearPreview();
  }

  function removeProvider(id) {
    state.providers = state.providers.filter(function (p) {
      return p.id !== id;
    });
    state.excludedSSIDs.forEach(function (s) {
      if (s.providerIds) {
        s.providerIds = s.providerIds.filter(function (pid) {
          return pid !== id;
        });
      }
    });
    renderProviders();
    clearPreview();
  }

  function moveProvider(id, direction) {
    let idx = -1;
    for (let i = 0; i < state.providers.length; i++) {
      if (state.providers[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.providers.length) return;
    const temp = state.providers[idx];
    state.providers[idx] = state.providers[newIdx];
    state.providers[newIdx] = temp;
    renderProviders();
    clearPreview();
  }

  function findProvider(id) {
    for (let i = 0; i < state.providers.length; i++) {
      if (state.providers[i].id === id) return state.providers[i];
    }
    return null;
  }

  function onProviderEdit(e) {
    const field = e.target.dataset.edit;
    if (!field) return;
    const p = findProvider(Number.parseInt(e.target.dataset.id, 10));
    if (!p) return;

    switch (field) {
      case "label":
        p.label = e.target.value;
        break;
      case "url":
        p.url = e.target.value;
        break;
      case "serverName":
        p.serverName = e.target.value;
        break;
      case "addresses":
        p.addresses = splitAddresses(e.target.value);
        break;
      case "failover":
        p.allowFailover = e.target.checked;
        break;
      case "protocol":
        p.protocol = e.target.value;
        renderProviders();
        break;
    }
    clearPreview();
  }

  function providerEditHtml(p) {
    const id = p.id;
    const isTLS = p.protocol === "TLS";
    return (
      '<div class="provider-edit">' +
      '<div class="field"><label>Name</label>' +
      '<input type="text" data-edit="label" data-id="' +
      id +
      '" value="' +
      escapeHtml(p.label) +
      '"></div>' +
      '<div class="field"><label>Protocol</label>' +
      '<select data-edit="protocol" data-id="' +
      id +
      '">' +
      '<option value="HTTPS"' +
      (isTLS ? "" : " selected") +
      ">DNS over HTTPS (DoH)</option>" +
      '<option value="TLS"' +
      (isTLS ? " selected" : "") +
      ">DNS over TLS (DoT)</option>" +
      "</select></div>" +
      (isTLS
        ? '<div class="field"><label>Server hostname</label>' +
          '<input type="text" data-edit="serverName" data-id="' +
          id +
          '" value="' +
          escapeHtml(p.serverName) +
          '" placeholder="dns.example.com"></div>'
        : '<div class="field"><label>DoH server URL</label>' +
          '<input type="text" data-edit="url" data-id="' +
          id +
          '" value="' +
          escapeHtml(p.url) +
          '" placeholder="https://dns.example.com/dns-query"></div>') +
      '<div class="field"><label>Server IP addresses</label>' +
      '<textarea rows="2" data-edit="addresses" data-id="' +
      id +
      '" placeholder="One per line">' +
      escapeHtml(p.addresses.join("\n")) +
      "</textarea></div>" +
      '<div class="field field-check"><label><input type="checkbox" data-edit="failover" data-id="' +
      id +
      '"' +
      (p.allowFailover ? " checked" : "") +
      "> Allow failover to the system DNS resolver</label></div>" +
      "</div>"
    );
  }

  function toggleEdit(id) {
    const p = findProvider(id);
    if (!p) return;
    p.editing = !p.editing;
    renderProviders();
  }

  function providerTypeLabel(p) {
    if (p.type === "custom") return '<span class="provider-type">Custom</span>';
    if (p.type === "imported")
      return '<span class="provider-type">Imported</span>';
    return "";
  }

  function providerAddressesHtml(p) {
    if (p.addresses.length === 0) return "";
    return (
      '<div class="provider-addresses">' +
      p.addresses
        .map(function (a) {
          return "<span>" + escapeHtml(a) + "</span>";
        })
        .join("") +
      "</div>"
    );
  }

  function providerItemHtml(p, j) {
    const tags =
      (p.protocol === "TLS" ? '<span class="provider-type">DoT</span>' : "") +
      (p.allowFailover ? '<span class="provider-type">Failover</span>' : "");
    const rulesNote = p.rawOnDemandRules
      ? '<div class="provider-note">Custom on-demand rules kept as imported &mdash; Wi-Fi exclusions don\'t apply to this provider.</div>'
      : "";

    return (
      '<div class="provider-info">' +
      '<div class="provider-title">' +
      providerTypeLabel(p) +
      tags +
      '<span class="provider-label">' +
      escapeHtml(p.label) +
      "</span>" +
      "</div>" +
      '<div class="provider-url">' +
      escapeHtml(p.protocol === "TLS" ? p.serverName : p.url) +
      "</div>" +
      providerAddressesHtml(p) +
      rulesNote +
      "</div>" +
      '<div class="provider-actions">' +
      '<button class="btn-edit" data-id="' +
      p.id +
      '">' +
      (p.editing ? "Done" : "Edit") +
      "</button>" +
      '<button class="btn-move btn-up" data-id="' +
      p.id +
      '" title="Move up" ' +
      (j === 0 ? "disabled" : "") +
      ">&#9650;</button>" +
      '<button class="btn-move btn-down" data-id="' +
      p.id +
      '" title="Move down" ' +
      (j === state.providers.length - 1 ? "disabled" : "") +
      ">&#9660;</button>" +
      '<button class="btn-remove" data-id="' +
      p.id +
      '" aria-label="Remove ' +
      escapeHtml(p.label) +
      '">&times;</button>' +
      "</div>" +
      (p.editing ? providerEditHtml(p) : "")
    );
  }

  function bindProviderButtons(selector, handler) {
    els.providerList.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener("click", function () {
        handler(Number.parseInt(this.dataset.id, 10));
      });
    });
  }

  function renderProviders() {
    els.providerEmpty.style.display =
      state.providers.length === 0 ? "" : "none";

    els.providerList.querySelectorAll(".provider-item").forEach(function (el) {
      el.remove();
    });

    state.providers.forEach(function (p, j) {
      const li = document.createElement("li");
      li.className = "provider-item";
      li.innerHTML = providerItemHtml(p, j);
      els.providerList.appendChild(li);
    });

    renderSSIDList();

    bindProviderButtons(".btn-edit", toggleEdit);
    bindProviderButtons(".btn-up", function (id) {
      moveProvider(id, -1);
    });
    bindProviderButtons(".btn-down", function (id) {
      moveProvider(id, 1);
    });
    bindProviderButtons(".btn-remove", removeProvider);
  }

  function addSSID() {
    const value = els.ssidInput.value.trim();
    if (!value) return;
    const exists = state.excludedSSIDs.some(function (s) {
      return s.name === value;
    });
    if (!exists) {
      state.excludedSSIDs.push({ name: value, providerIds: null });
    }
    els.ssidInput.value = "";
    renderSSIDList();
    clearPreview();
  }

  function removeSSID(index) {
    state.excludedSSIDs.splice(index, 1);
    renderSSIDList();
    clearPreview();
  }

  // Providers that Wi-Fi exclusions can apply to (not those with kept custom rules)
  function eligibleProviders() {
    return state.providers.filter(function (p) {
      return !p.rawOnDemandRules;
    });
  }

  function resolveProviderSSIDs(provider) {
    if (provider.rawOnDemandRules) return [];
    return state.excludedSSIDs
      .filter(function (s) {
        return (
          s.providerIds === null || s.providerIds.indexOf(provider.id) !== -1
        );
      })
      .map(function (s) {
        return s.name;
      });
  }

  function ssidScopeProvidersHtml(s, i, eligible) {
    let html = '<div class="ssid-scope-providers">';
    for (const provider of eligible) {
      const checked = s.providerIds.includes(provider.id) ? " checked" : "";
      html +=
        '<label><input type="checkbox" class="ssid-scope-check" data-index="' +
        i +
        '" data-id="' +
        provider.id +
        '"' +
        checked +
        "> " +
        escapeHtml(provider.label) +
        "</label>";
    }
    return html + "</div>";
  }

  function ssidScopeHtml(s, i, eligible) {
    if (eligible.length <= 1 && s.providerIds === null) return "";
    const scoped = s.providerIds !== null;
    return (
      '<div class="ssid-scope">' +
      '<select class="ssid-scope-select" data-index="' +
      i +
      '" aria-label="Providers for ' +
      escapeHtml(s.name) +
      '">' +
      '<option value="all"' +
      (scoped ? "" : " selected") +
      ">All providers</option>" +
      '<option value="some"' +
      (scoped ? " selected" : "") +
      ">Only selected providers</option>" +
      "</select>" +
      (scoped ? ssidScopeProvidersHtml(s, i, eligible) : "") +
      "</div>"
    );
  }

  function ssidItemHtml(s, i, eligible) {
    return (
      '<li class="ssid-item">' +
      '<div class="ssid-row">' +
      '<span class="ssid-name">' +
      escapeHtml(s.name) +
      "</span>" +
      '<button class="btn-remove" data-index="' +
      i +
      '" aria-label="Remove ' +
      escapeHtml(s.name) +
      '">&times;</button>' +
      "</div>" +
      ssidScopeHtml(s, i, eligible) +
      "</li>"
    );
  }

  function ssidEntryFor(el) {
    return state.excludedSSIDs[Number.parseInt(el.dataset.index, 10)];
  }

  function onSSIDScopeChange() {
    ssidEntryFor(this).providerIds =
      this.value === "all"
        ? null
        : eligibleProviders().map(function (p) {
            return p.id;
          });
    renderSSIDList();
    clearPreview();
  }

  function onSSIDCheckChange() {
    const entry = ssidEntryFor(this);
    const id = Number.parseInt(this.dataset.id, 10);
    entry.providerIds = entry.providerIds.filter(function (pid) {
      return pid !== id;
    });
    if (this.checked) entry.providerIds.push(id);
    clearPreview();
  }

  function renderSSIDList() {
    if (state.excludedSSIDs.length === 0) {
      els.ssidList.innerHTML = "";
      return;
    }
    const eligible = eligibleProviders();
    els.ssidList.innerHTML = state.excludedSSIDs
      .map(function (s, i) {
        return ssidItemHtml(s, i, eligible);
      })
      .join("");

    els.ssidList.querySelectorAll(".btn-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        removeSSID(Number.parseInt(this.dataset.index, 10));
      });
    });
    els.ssidList.querySelectorAll(".ssid-scope-select").forEach(function (sel) {
      sel.addEventListener("change", onSSIDScopeChange);
    });
    els.ssidList.querySelectorAll(".ssid-scope-check").forEach(function (box) {
      box.addEventListener("change", onSSIDCheckChange);
    });
  }

  function getConfig() {
    const imp = state.imported;
    return {
      displayName: state.displayName || "DNS over HTTPS",
      identifier: state.identifier || "com.ixonae.doh-profile",
      description: state.description || "Routes DNS queries over HTTPS",
      profileUUID: imp.profileUUID,
      payloadUUID: imp.payloadUUID,
      payloadIdentifier: imp.payloadIdentifier,
      activations: imp.activations,
      extraDeclarations: imp.extraDeclarations,
      importedProviderIds: imp.providerIds,
      providers: state.providers.map(function (p) {
        return {
          label: p.label,
          protocol: p.protocol,
          url: p.url,
          serverName: p.serverName,
          allowFailover: p.allowFailover,
          addresses: p.addresses.slice(),
          dnsSettings: p.dnsSettings,
          payloadExtra: p.payloadExtra,
          rawOnDemandRules: p.rawOnDemandRules,
          identifier: p.identifier,
          serverToken: p.serverToken,
          originalPayload: p.originalPayload,
          excludedSSIDs: resolveProviderSSIDs(p),
        };
      }),
    };
  }

  function validate() {
    if (state.providers.length === 0) return "Add at least one DNS provider.";
    for (let i = 0; i < state.providers.length; i++) {
      const p = state.providers[i];
      if (!p.label.trim()) return "Every provider needs a name.";
      const error = validateEndpoint(
        p.protocol,
        p.url.trim(),
        p.serverName.trim(),
      );
      if (error) return p.label + ": " + error;
    }
    return null;
  }

  function setImportStatus(message, isError) {
    els.importStatus.textContent = message;
    els.importStatus.className =
      "import-status" + (isError ? " import-error" : "");
  }

  function importFile(file) {
    if (
      state.providers.length > 0 &&
      !confirm(
        "Importing replaces the providers, exclusions and details you have configured. Continue?",
      )
    ) {
      return;
    }
    file
      .arrayBuffer()
      .then(function (buffer) {
        applyImport(parseProfile(buffer), file.name);
      })
      .catch(function (err) {
        setImportStatus("Import failed: " + err.message, true);
      });
  }

  function applyImport(result, fileName) {
    state.providers = result.providers.map(function (p) {
      return {
        id: nextId++,
        type: "imported",
        key: null,
        label: p.label,
        protocol: p.protocol,
        url: p.url,
        serverName: p.serverName,
        allowFailover: p.allowFailover,
        addresses: p.addresses,
        dnsSettings: p.dnsSettings,
        payloadExtra: p.payloadExtra,
        rawOnDemandRules: p.rawOnDemandRules,
        identifier: p.identifier,
        serverToken: p.serverToken,
        originalPayload: null,
        importedSSIDs: p.excludedSSIDs,
      };
    });

    // Rebuild SSID exclusions: a name present on every eligible provider applies to all
    const eligible = eligibleProviders();
    // null prototype: SSIDs come from an untrusted file ("__proto__", "constructor", ...)
    const byName = Object.create(null);
    const order = [];
    state.providers.forEach(function (p) {
      p.importedSSIDs.forEach(function (name) {
        if (!byName[name]) {
          byName[name] = [];
          order.push(name);
        }
        if (byName[name].indexOf(p.id) === -1) byName[name].push(p.id);
      });
    });
    state.excludedSSIDs = order.map(function (name) {
      return {
        name: name,
        providerIds:
          byName[name].length === eligible.length ? null : byName[name],
      };
    });

    // Remember the generated form of each declaration so unchanged ones keep their ServerToken
    state.providers.forEach(function (p) {
      p.originalPayload = JSON.stringify(
        buildDNSPayloadObject(p, resolveProviderSSIDs(p)),
      );
      delete p.importedSSIDs;
    });

    state.imported = {
      profileUUID: result.profileUUID,
      payloadUUID: result.payloadUUID,
      payloadIdentifier: result.payloadIdentifier,
      activations: result.activations,
      extraDeclarations: result.extraDeclarations,
      providerIds: result.providers
        .map(function (p) {
          return p.identifier;
        })
        .filter(Boolean),
    };

    if (result.displayName) {
      state.displayName = result.displayName;
      els.displayName.value = result.displayName;
    }
    if (result.identifier) {
      state.identifier = result.identifier;
      els.identifier.value = result.identifier;
    }
    if (result.description) {
      state.description = result.description;
      els.description.value = result.description;
    }

    renderProviders();
    clearPreview();

    const notes = [];
    if (result.extraDeclarations.length > 0)
      notes.push(
        result.extraDeclarations.length + " other declaration(s) kept as-is",
      );
    if (result.ignoredPayloads > 0)
      notes.push(
        result.ignoredPayloads + " unrelated payload(s) not carried over",
      );
    setImportStatus(
      "Imported " +
        fileName +
        ": " +
        state.providers.length +
        " provider(s), " +
        state.excludedSSIDs.length +
        " Wi-Fi exclusion(s)" +
        (notes.length ? " (" + notes.join("; ") + ")" : "") +
        ". Identifiers are preserved.",
      false,
    );
  }

  function generate() {
    const error = validate();
    if (error) {
      alert(error);
      return;
    }

    const config = getConfig();
    const declarations = generateDeclarations(config);
    state.generatedXml = generateProfile(config, declarations);
    renderPreview(state.generatedXml, declarations);
    els.downloadBtn.disabled = false;
    els.copyBtn.disabled = false;
  }

  function renderPreview(xml, declarations) {
    const highlighted = highlightXml(xml);
    const json = declarations
      .map(function (d) {
        return JSON.stringify(d, null, 2);
      })
      .join("\n\n");
    els.previewContainer.innerHTML =
      '<h3 class="preview-heading">Declarations (embedded as Base64 in the profile)</h3>' +
      '<pre class="xml-preview">' +
      escapeHtml(json) +
      "</pre>" +
      '<h3 class="preview-heading">.mobileconfig</h3>' +
      '<pre class="xml-preview">' +
      highlighted +
      "</pre>";
  }

  function highlightXml(xml) {
    const escaped = xml
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    return escaped
      .replace(/(&lt;\?xml[^?]*\?&gt;)/g, '<span class="xml-decl">$1</span>')
      .replace(/(&lt;!DOCTYPE[^&]*&gt;)/g, '<span class="xml-decl">$1</span>')
      .replace(
        /(&lt;key&gt;)([^&]+)(&lt;\/key&gt;)/g,
        '<span class="xml-bracket">&lt;</span><span class="xml-tag">key</span><span class="xml-bracket">&gt;</span>' +
          '<span class="xml-key">$2</span>' +
          '<span class="xml-bracket">&lt;/</span><span class="xml-tag">key</span><span class="xml-bracket">&gt;</span>',
      )
      .replace(
        /(&lt;string&gt;)([^&]*)(&lt;\/string&gt;)/g,
        '<span class="xml-bracket">&lt;</span><span class="xml-tag">string</span><span class="xml-bracket">&gt;</span>' +
          '<span class="xml-value">$2</span>' +
          '<span class="xml-bracket">&lt;/</span><span class="xml-tag">string</span><span class="xml-bracket">&gt;</span>',
      )
      .replace(
        /(&lt;integer&gt;)([^&]*)(&lt;\/integer&gt;)/g,
        '<span class="xml-bracket">&lt;</span><span class="xml-tag">integer</span><span class="xml-bracket">&gt;</span>' +
          '<span class="xml-number">$2</span>' +
          '<span class="xml-bracket">&lt;/</span><span class="xml-tag">integer</span><span class="xml-bracket">&gt;</span>',
      )
      .replace(
        /(&lt;)(\/?)(\w[\w.-]*)(&gt;)/g,
        '<span class="xml-bracket">&lt;$2</span><span class="xml-tag">$3</span><span class="xml-bracket">&gt;</span>',
      );
  }

  function clearPreview() {
    state.generatedXml = null;
    els.previewContainer.innerHTML =
      '<div class="preview-placeholder">Configure your DNS settings and click Generate to preview the profile</div>';
    els.downloadBtn.disabled = true;
    els.copyBtn.disabled = true;
  }

  function download() {
    if (!state.generatedXml) return;
    const blob = new Blob([state.generatedXml], {
      type: "application/x-apple-aspen-config",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName =
      state.displayName.replace(/[^a-zA-Z0-9_-]/g, "_") || "dns-profile";
    a.download = safeName + ".mobileconfig";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyXml() {
    if (!state.generatedXml) return;
    navigator.clipboard
      .writeText(state.generatedXml)
      .then(function () {
        const original = els.copyBtn.textContent;
        els.copyBtn.textContent = "Copied!";
        setTimeout(function () {
          els.copyBtn.textContent = original;
        }, 1500);
      })
      .catch(function () {
        alert("Could not copy to the clipboard. Use Download instead.");
      });
  }

  // Also escapes quotes: values are interpolated into attributes (value="...", aria-label="...")
  // and may come from an imported profile, so they must not be able to break out of them.
  function escapeHtml(str) {
    return escapeXml(String(str));
  }

  document.addEventListener("DOMContentLoaded", init);
})();

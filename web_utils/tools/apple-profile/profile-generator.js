function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const DNS_PRESETS = {
  cloudflare: {
    label: "Cloudflare (1.1.1.1)",
    url: "https://cloudflare-dns.com/dns-query",
    addresses: [
      "1.1.1.1",
      "1.0.0.1",
      "2606:4700:4700::1111",
      "2606:4700:4700::1001",
    ],
  },
  "cloudflare-malware": {
    label: "Cloudflare Malware Blocking",
    url: "https://security.cloudflare-dns.com/dns-query",
    addresses: [
      "1.1.1.2",
      "1.0.0.2",
      "2606:4700:4700::1112",
      "2606:4700:4700::1002",
    ],
  },
  quad9: {
    label: "Quad9 (Security)",
    url: "https://dns.quad9.net/dns-query",
    addresses: ["9.9.9.9", "149.112.112.112", "2620:fe::fe", "2620:fe::9"],
  },
  "quad9-unfiltered": {
    label: "Quad9 (No Threat Blocking)",
    url: "https://dns10.quad9.net/dns-query",
    addresses: ["9.9.9.10", "149.112.112.10", "2620:fe::10", "2620:fe::fe:10"],
  },
  custom: {
    label: "Custom",
    url: "",
    addresses: [],
  },
};

function buildOnDemandRules(excludedSSIDs) {
  const rules = [];

  if (excludedSSIDs.length > 0) {
    rules.push({ Action: "Disconnect", SSIDMatch: excludedSSIDs.slice() });
  }
  rules.push({ Action: "Connect" });

  return rules;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// Builds the Payload of a com.apple.configuration.network.dns-settings declaration
// https://developer.apple.com/documentation/devicemanagement/networkdnssettings
function buildDNSPayloadObject(provider, excludedSSIDs) {
  // Start from any imported DNSSettings so keys the editor doesn't expose
  // (e.g. SupplementalMatchDomains) survive, then apply the editable fields.
  const dnsSettings = provider.dnsSettings
    ? cloneJson(provider.dnsSettings)
    : {};
  const isTLS = provider.protocol === "TLS";
  dnsSettings.DNSProtocol = isTLS ? "TLS" : "HTTPS";
  if (isTLS) {
    dnsSettings.ServerName = (provider.serverName || "").trim();
    delete dnsSettings.ServerURL;
  } else {
    dnsSettings.ServerURL = (provider.url || "").trim();
    delete dnsSettings.ServerName;
  }

  const addresses = (provider.addresses || [])
    .map(function (a) {
      return a.trim();
    })
    .filter(Boolean);
  if (addresses.length > 0) {
    dnsSettings.ServerAddresses = addresses;
  } else {
    delete dnsSettings.ServerAddresses;
  }

  if (provider.allowFailover) {
    dnsSettings.AllowFailover = true;
  } else if ("AllowFailover" in dnsSettings) {
    dnsSettings.AllowFailover = false; // was explicit in the imported profile
  }

  const payload = { VisibleName: provider.label };
  const extra = provider.payloadExtra || {};
  Object.keys(extra).forEach(function (key) {
    payload[key] = cloneJson(extra[key]);
  });
  payload.DNSSettings = dnsSettings;

  if (provider.rawOnDemandRules) {
    payload.OnDemandRules = cloneJson(provider.rawOnDemandRules);
  } else if (excludedSSIDs && excludedSSIDs.length > 0) {
    payload.OnDemandRules = buildOnDemandRules(excludedSSIDs);
  }
  return payload;
}

// ServerToken is kept when the declaration content did not change since import
function buildDNSConfiguration(provider, excludedSSIDs) {
  const payload = buildDNSPayloadObject(provider, excludedSSIDs);
  const unchanged =
    provider.identifier &&
    provider.serverToken &&
    provider.originalPayload === JSON.stringify(payload);

  return {
    Type: "com.apple.configuration.network.dns-settings",
    Identifier: provider.identifier || generateUUID(),
    ServerToken: unchanged ? provider.serverToken : generateUUID(),
    Payload: payload,
  };
}

// Builds a com.apple.activation.simple declaration activating the given configurations
// https://developer.apple.com/documentation/devicemanagement/activationsimple
function buildActivation(configurationIds) {
  return {
    Type: "com.apple.activation.simple",
    Identifier: generateUUID(),
    ServerToken: generateUUID(),
    Payload: { StandardConfigurations: configurationIds.slice() },
  };
}

function updateImportedActivations(activations, removedProviderIds) {
  return activations.flatMap(function (activation) {
    const copy = cloneJson(activation);
    const ids = copy.Payload?.StandardConfigurations;
    if (!Array.isArray(ids)) return [copy];

    const remainingIds = ids.filter(function (id) {
      return !removedProviderIds.has(id);
    });
    if (remainingIds.length === ids.length) return [copy];
    if (remainingIds.length === 0) return [];

    copy.Payload.StandardConfigurations = remainingIds;
    copy.ServerToken = generateUUID();
    return [copy];
  });
}

// Each provider carries its own excludedSSIDs list (config.excludedSSIDs is the fallback)
function generateDeclarations(config) {
  const providers = config.providers || [];
  const configurations = providers.map(function (provider) {
    const ssids = provider.excludedSSIDs || config.excludedSSIDs || [];
    return buildDNSConfiguration(provider, ssids);
  });

  const extras = (config.extraDeclarations || []).map(cloneJson);
  const ids = configurations.map(function (c) {
    return c.Identifier;
  });
  if (!config.importedProviderIds) {
    return configurations.concat(extras, [buildActivation(ids)]);
  }

  const currentIds = new Set(ids);
  const importedIds = new Set(config.importedProviderIds);
  const removedProviderIds = new Set(
    config.importedProviderIds.filter(function (id) {
      return !currentIds.has(id);
    }),
  );
  const activations = updateImportedActivations(
    config.activations || [],
    removedProviderIds,
  );
  const newIds = ids.filter(function (id) {
    return !importedIds.has(id);
  });
  if (newIds.length > 0) activations.push(buildActivation(newIds));

  return configurations.concat(extras, activations);
}

function base64Utf8(str) {
  let binary = "";
  new TextEncoder().encode(str).forEach(function (b) {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

// Wraps declarations in a com.apple.declarations profile, which installs them locally
// https://developer.apple.com/documentation/devicemanagement/declarations
function generateProfile(config, declarations) {
  const profileUUID = config.profileUUID || generateUUID();
  const identifier = config.identifier || "com.ixonae.doh-profile";
  const displayName = config.displayName || "DNS over HTTPS";
  const description = config.description || "Configures DNS over HTTPS";
  declarations = declarations || generateDeclarations(config);

  const dataXml = declarations
    .map(function (d) {
      return (
        "                <data>" +
        base64Utf8(JSON.stringify(d, null, 2)) +
        "</data>"
      );
    })
    .join("\n");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n' +
    "<dict>\n" +
    "    <key>PayloadContent</key>\n" +
    "    <array>\n" +
    "        <dict>\n" +
    "            <key>Declarations</key>\n" +
    "            <array>\n" +
    dataXml +
    "\n" +
    "            </array>\n" +
    "            <key>PayloadDescription</key>\n" +
    "            <string>" +
    escapeXml(description) +
    "</string>\n" +
    "            <key>PayloadDisplayName</key>\n" +
    "            <string>" +
    escapeXml(displayName) +
    "</string>\n" +
    "            <key>PayloadIdentifier</key>\n" +
    "            <string>" +
    escapeXml(config.payloadIdentifier || identifier + ".declarations") +
    "</string>\n" +
    "            <key>PayloadType</key>\n" +
    "            <string>com.apple.declarations</string>\n" +
    "            <key>PayloadUUID</key>\n" +
    "            <string>" +
    escapeXml(config.payloadUUID || generateUUID()) +
    "</string>\n" +
    "            <key>PayloadVersion</key>\n" +
    "            <integer>1</integer>\n" +
    "        </dict>\n" +
    "    </array>\n" +
    "    <key>PayloadDisplayName</key>\n" +
    "    <string>" +
    escapeXml(displayName) +
    "</string>\n" +
    "    <key>PayloadIdentifier</key>\n" +
    "    <string>" +
    escapeXml(identifier) +
    "</string>\n" +
    "    <key>PayloadUUID</key>\n" +
    "    <string>" +
    escapeXml(profileUUID) +
    "</string>\n" +
    "    <key>PayloadType</key>\n" +
    "    <string>Configuration</string>\n" +
    "    <key>PayloadVersion</key>\n" +
    "    <integer>1</integer>\n" +
    "    <key>PayloadDescription</key>\n" +
    "    <string>" +
    escapeXml(description) +
    "</string>\n" +
    "</dict>\n" +
    "</plist>"
  );
}

/* v8 ignore start -- the else branch only exists in the browser, where there is no CommonJS */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generateUUID,
    escapeXml,
    DNS_PRESETS,
    buildOnDemandRules,
    buildDNSPayloadObject,
    buildDNSConfiguration,
    generateDeclarations,
    base64Utf8,
    generateProfile,
  };
}
/* v8 ignore stop */

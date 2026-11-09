// Parses an existing .mobileconfig (as produced by this tool) back into an editable configuration.

const DNS_CONFIG_TYPE = "com.apple.configuration.network.dns-settings";

function plistNodeToValue(node) {
  const children = Array.prototype.filter.call(node.childNodes, function (n) {
    return n.nodeType === 1;
  });
  switch (node.tagName) {
    case "dict": {
      // null prototype so a "__proto__" key in an untrusted file is stored as plain data
      const obj = Object.create(null);
      for (let i = 0; i + 1 < children.length; i += 2) {
        obj[children[i].textContent] = plistNodeToValue(children[i + 1]);
      }
      return obj;
    }
    case "array":
      return children.map(plistNodeToValue);
    case "string":
    case "date":
      return node.textContent;
    case "data":
      return node.textContent.replace(/\s+/g, "");
    case "integer":
      return parseInt(node.textContent, 10);
    case "real":
      return parseFloat(node.textContent);
    case "true":
      return true;
    case "false":
      return false;
    default:
      return null;
  }
}

// Accepts the raw bytes; signed profiles (CMS) embed the plist as readable XML
function parsePlistBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  const head = String.fromCharCode.apply(null, bytes.subarray(0, 8));
  if (head.indexOf("bplist") === 0) {
    throw new Error(
      "Binary property lists are not supported. Export the profile as XML.",
    );
  }

  const text = new TextDecoder("utf-8").decode(bytes);
  let start = text.indexOf("<?xml");
  if (start === -1) start = text.indexOf("<plist");
  const end = text.lastIndexOf("</plist>");
  if (start === -1 || end === -1) {
    throw new Error(
      "This doesn't look like a .mobileconfig / property list file.",
    );
  }

  const doc = new DOMParser().parseFromString(
    text.slice(start, end + 8),
    "application/xml",
  );
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The file could not be parsed as XML.");
  }
  const root = Array.prototype.filter.call(
    doc.documentElement.childNodes,
    function (n) {
      return n.nodeType === 1;
    },
  )[0];
  return plistNodeToValue(root);
}

function decodeDeclaration(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, function (c) {
    return c.charCodeAt(0);
  });
  return JSON.parse(new TextDecoder("utf-8").decode(bytes));
}

// Splits OnDemandRules into SSID exclusions when they have the shape this tool writes
// (Disconnect + SSIDMatch rules, optionally ending with a bare Connect).
// Returns null when the rules are anything else, so they can be kept verbatim.
function extractSSIDExclusions(rules) {
  if (rules === undefined || rules === null) return [];
  if (!Array.isArray(rules)) return null;
  if (rules.length === 0) return [];
  let ssids = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule === null || typeof rule !== "object") return null;
    const keys = Object.keys(rule);
    if (
      rule.Action === "Disconnect" &&
      Array.isArray(rule.SSIDMatch) &&
      keys.length === 2
    ) {
      ssids = ssids.concat(rule.SSIDMatch);
    } else if (
      rule.Action === "Connect" &&
      keys.length === 1 &&
      i === rules.length - 1
    ) {
      // trailing catch-all, regenerated automatically
    } else {
      return null;
    }
  }
  return ssids;
}

function providerFromPayload(payload, identifier, serverToken) {
  const dnsSettings = payload.DNSSettings || {};
  const payloadExtra = {};
  Object.keys(payload).forEach(function (key) {
    if (
      key !== "VisibleName" &&
      key !== "DNSSettings" &&
      key !== "OnDemandRules"
    ) {
      payloadExtra[key] = payload[key];
    }
  });

  const ssids = extractSSIDExclusions(payload.OnDemandRules);
  return {
    label:
      payload.VisibleName ||
      dnsSettings.ServerURL ||
      dnsSettings.ServerName ||
      "DNS",
    protocol: dnsSettings.DNSProtocol === "TLS" ? "TLS" : "HTTPS",
    url: dnsSettings.ServerURL || "",
    serverName: dnsSettings.ServerName || "",
    allowFailover: dnsSettings.AllowFailover === true,
    addresses: (dnsSettings.ServerAddresses || []).slice(),
    dnsSettings: dnsSettings,
    payloadExtra: payloadExtra,
    rawOnDemandRules: ssids === null ? payload.OnDemandRules : null,
    excludedSSIDs: ssids || [],
    identifier: identifier,
    serverToken: serverToken || null,
  };
}

function parseProfile(buffer) {
  const plist = parsePlistBytes(buffer);
  if (
    !plist ||
    plist.PayloadType !== "Configuration" ||
    !Array.isArray(plist.PayloadContent)
  ) {
    throw new Error("Not a configuration profile (no PayloadContent).");
  }

  const result = {
    displayName: plist.PayloadDisplayName || "",
    identifier: plist.PayloadIdentifier || "",
    description: plist.PayloadDescription || "",
    profileUUID: plist.PayloadUUID || null,
    payloadUUID: null,
    payloadIdentifier: null,
    providers: [],
    extraDeclarations: [],
    activations: [],
    ignoredPayloads: 0,
  };

  plist.PayloadContent.forEach(function (payload) {
    if (payload.PayloadType === "com.apple.declarations") {
      if (!result.payloadUUID) {
        result.payloadUUID = payload.PayloadUUID || null;
        result.payloadIdentifier = payload.PayloadIdentifier || null;
      }
      (payload.Declarations || []).forEach(function (b64) {
        const decl = decodeDeclaration(b64);
        if (decl.Type === DNS_CONFIG_TYPE) {
          result.providers.push(
            providerFromPayload(
              decl.Payload || {},
              decl.Identifier,
              decl.ServerToken,
            ),
          );
        } else if (decl.Type === "com.apple.activation.simple") {
          result.activations.push(decl);
        } else {
          result.extraDeclarations.push(decl);
        }
      });
    } else {
      result.ignoredPayloads++;
    }
  });

  if (result.providers.length === 0) {
    throw new Error("No DNS settings found in this profile.");
  }

  return result;
}

/* v8 ignore start -- the else branch only exists in the browser, where there is no CommonJS */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    plistNodeToValue,
    parsePlistBytes,
    decodeDeclaration,
    extractSSIDExclusions,
    providerFromPayload,
    parseProfile,
  };
}
/* v8 ignore stop */

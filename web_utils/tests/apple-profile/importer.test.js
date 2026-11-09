// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const gen = require("../../tools/apple-profile/profile-generator.js");
const imp = require("../../tools/apple-profile/profile-importer.js");

const toBuffer = (text) => new TextEncoder().encode(text).buffer;
const b64 = (obj) => gen.base64Utf8(JSON.stringify(obj));

function plistProfile(content, extra = "") {
  return (
    `<?xml version="1.0"?><plist version="1.0"><dict>` +
    `<key>PayloadType</key><string>Configuration</string>` +
    `<key>PayloadContent</key><array>${content}</array>${extra}</dict></plist>`
  );
}

const dohDecl = (payload = {}, id = "DNS1", token = "T1") => ({
  Type: "com.apple.configuration.network.dns-settings",
  Identifier: id,
  ServerToken: token,
  Payload: {
    VisibleName: "P",
    DNSSettings: { DNSProtocol: "HTTPS", ServerURL: "https://x/dns-query" },
    ...payload,
  },
});

const declsPayload = (decls, extra = "") =>
  `<dict><key>PayloadType</key><string>com.apple.declarations</string>${extra}` +
  `<key>Declarations</key><array>${decls.map((d) => `<data>${b64(d)}</data>`).join("")}</array></dict>`;

describe("parsePlistBytes", () => {
  it("rejects binary plists", () => {
    expect(() => imp.parsePlistBytes(toBuffer("bplist00xxxx"))).toThrow(
      /Binary property lists/,
    );
  });

  it("rejects non-plist text", () => {
    expect(() => imp.parsePlistBytes(toBuffer("hello"))).toThrow(
      /doesn't look like/,
    );
    expect(() =>
      imp.parsePlistBytes(toBuffer("<plist version='1.0'>")),
    ).toThrow(/doesn't look like/);
  });

  it("rejects malformed XML", () => {
    expect(() =>
      imp.parsePlistBytes(toBuffer("<plist><dict></plist>")),
    ).toThrow(/could not be parsed/);
  });

  it("parses all value types, starting at <plist> when there is no xml declaration, ignoring CMS wrappers", () => {
    const xml =
      '\x30\x80junk<plist version="1.0"><dict>' +
      "<key>s</key><string>a</string><key>d</key><date>2020-01-01T00:00:00Z</date>" +
      "<key>b</key><data>QU\n JD</data><key>i</key><integer>42</integer><key>r</key><real>1.5</real>" +
      "<key>t</key><true/><key>f</key><false/><key>u</key><unknown/>" +
      "<key>a</key><array><string>x</string></array>" +
      "<key>__proto__</key><string>safe</string></dict></plist>trailing";
    const v = imp.parsePlistBytes(toBuffer(xml));
    expect(v.s).toBe("a");
    expect(v.d).toBe("2020-01-01T00:00:00Z");
    expect(v.b).toBe("QUJD");
    expect(v.i).toBe(42);
    expect(v.r).toBe(1.5);
    expect(v.t).toBe(true);
    expect(v.f).toBe(false);
    expect(v.u).toBeNull();
    expect(v.a).toEqual(["x"]);
    expect(Object.getPrototypeOf(v)).toBeNull();
    expect(v.__proto__).toBe("safe");
  });

  it("starts at <?xml when present", () => {
    expect(
      imp.parsePlistBytes(
        toBuffer('<?xml version="1.0"?><plist><string>hi</string></plist>'),
      ),
    ).toBe("hi");
  });
});

describe("extractSSIDExclusions", () => {
  it("returns an empty list for missing or empty rules", () => {
    expect(imp.extractSSIDExclusions(null)).toEqual([]);
    expect(imp.extractSSIDExclusions([])).toEqual([]);
  });

  it("rejects a Connect rule that is not last or has extra keys", () => {
    expect(
      imp.extractSSIDExclusions([
        { Action: "Connect" },
        { Action: "Disconnect", SSIDMatch: ["A"] },
      ]),
    ).toBeNull();
    expect(
      imp.extractSSIDExclusions([{ Action: "Connect", SSIDMatch: ["A"] }]),
    ).toBeNull();
  });
});

describe("providerFromPayload", () => {
  it("maps a DoH payload, with extras and SSIDs", () => {
    const p = imp.providerFromPayload(
      {
        VisibleName: "V",
        ProhibitDisablement: true,
        DNSSettings: {
          DNSProtocol: "HTTPS",
          ServerURL: "https://a",
          ServerAddresses: ["1.1.1.1"],
          AllowFailover: true,
        },
        OnDemandRules: [
          { Action: "Disconnect", SSIDMatch: ["W"] },
          { Action: "Connect" },
        ],
      },
      "ID",
      "TOK",
    );
    expect(p).toMatchObject({
      label: "V",
      protocol: "HTTPS",
      url: "https://a",
      allowFailover: true,
      addresses: ["1.1.1.1"],
      payloadExtra: { ProhibitDisablement: true },
      rawOnDemandRules: null,
      excludedSSIDs: ["W"],
      identifier: "ID",
      serverToken: "TOK",
    });
  });

  it("falls back for labels, protocol and keeps unrepresentable rules", () => {
    const rules = [{ Action: "Allow" }];
    const a = imp.providerFromPayload(
      {
        DNSSettings: { DNSProtocol: "TLS", ServerName: "h" },
        OnDemandRules: rules,
      },
      "I",
    );
    expect(a.label).toBe("h");
    expect(a.protocol).toBe("TLS");
    expect(a.rawOnDemandRules).toBe(rules);
    expect(a.excludedSSIDs).toEqual([]);
    expect(a.serverToken).toBeNull();
    expect(
      imp.providerFromPayload({ DNSSettings: { ServerURL: "https://u" } }, "I")
        .label,
    ).toBe("https://u");
    const bare = imp.providerFromPayload({}, "I");
    expect(bare.label).toBe("DNS");
    expect(bare.addresses).toEqual([]);
    expect(bare.url).toBe("");
  });
});

describe("parseProfile", () => {
  it("rejects things that are not configuration profiles", () => {
    expect(() =>
      imp.parseProfile(toBuffer("<plist><string>x</string></plist>")),
    ).toThrow(/Not a configuration profile/);
    expect(() =>
      imp.parseProfile(
        toBuffer(
          "<plist><dict><key>PayloadType</key><string>Configuration</string></dict></plist>",
        ),
      ),
    ).toThrow(/Not a configuration profile/);
  });

  it("rejects a profile without DNS settings", () => {
    expect(() => imp.parseProfile(toBuffer(plistProfile("")))).toThrow(
      /No DNS settings/,
    );
  });

  it("round-trips a profile generated by this tool", () => {
    const xml = gen.generateProfile({
      displayName: "Name",
      identifier: "com.x",
      description: "Desc",
      providers: [
        {
          label: "A",
          protocol: "HTTPS",
          url: "https://a/dns-query",
          addresses: ["1.1.1.1"],
          excludedSSIDs: ["W"],
        },
      ],
    });
    const r = imp.parseProfile(toBuffer(xml));
    expect(r.displayName).toBe("Name");
    expect(r.identifier).toBe("com.x");
    expect(r.description).toBe("Desc");
    expect(r.payloadIdentifier).toBe("com.x.declarations");
    expect(r.providers).toHaveLength(1);
    expect(r.providers[0].excludedSSIDs).toEqual(["W"]);
    expect(r.activations).toHaveLength(1);
    expect(r.activations[0].Payload).toEqual({
      StandardConfigurations: [r.providers[0].identifier],
    });
    expect(r.extraDeclarations).toEqual([]);
    expect(r.ignoredPayloads).toBe(0);
  });

  it("retains all simple activations and their configuration references", () => {
    const act1 = {
      Type: "com.apple.activation.simple",
      Identifier: "ACT1",
      ServerToken: "AT",
      Payload: { StandardConfigurations: ["DNS1", "OTHER"], Predicate: "pred" },
    };
    const act2 = {
      Type: "com.apple.activation.simple",
      Identifier: "ACT2",
      Payload: {},
    };
    const other = {
      Type: "com.apple.configuration.other",
      Identifier: "OTHER",
    };
    const xml = plistProfile(
      declsPayload(
        [dohDecl(), act1, other, act2],
        "<key>PayloadUUID</key><string>PU</string><key>PayloadIdentifier</key><string>PI</string>",
      ) +
        // a second declarations payload must not override the first's identifiers
        declsPayload(
          [
            {
              Type: "com.apple.configuration.network.dns-settings",
              Identifier: "DNS2",
            },
          ],
          "<key>PayloadUUID</key><string>PU2</string>",
        ) +
        "<dict><key>PayloadType</key><string>com.apple.wifi.managed</string></dict>",
    );
    const r = imp.parseProfile(toBuffer(xml));
    expect(r.payloadUUID).toBe("PU");
    expect(r.payloadIdentifier).toBe("PI");
    expect(r.providers.map((p) => p.identifier)).toEqual(["DNS1", "DNS2"]);
    expect(r.providers[1].label).toBe("DNS");
    expect(r.activations).toEqual([act1, act2]);
    expect(r.extraDeclarations).toEqual([other]);
    expect(r.ignoredPayloads).toBe(1);
  });

  it("handles declarations payloads without identifiers or Declarations, and activation without payload", () => {
    const act = { Type: "com.apple.activation.simple", Identifier: "A" };
    const noDecls =
      "<dict><key>PayloadType</key><string>com.apple.declarations</string></dict>";
    const noDnsPayload = {
      Type: "com.apple.configuration.network.dns-settings",
      Identifier: "D",
    };
    const r = imp.parseProfile(
      toBuffer(plistProfile(noDecls + declsPayload([noDnsPayload, act]))),
    );
    expect(r.payloadUUID).toBeNull();
    expect(r.payloadIdentifier).toBeNull();
    expect(r.activations).toEqual([act]);
    expect(r.displayName).toBe("");
    expect(r.profileUUID).toBeNull();
  });

  it("retains non-simple activations as extra declarations", () => {
    const act = { Type: "com.apple.activation.other", Identifier: "A" };
    const r = imp.parseProfile(
      toBuffer(plistProfile(declsPayload([dohDecl(), act]))),
    );
    expect(r.activations).toEqual([]);
    expect(r.extraDeclarations).toEqual([act]);
  });

  it("does not import the legacy dnsSettings.managed payload", () => {
    const legacy =
      `<dict><key>PayloadType</key><string>com.apple.dnsSettings.managed</string>` +
      `<key>DNSSettings</key><dict><key>ServerURL</key><string>https://o</string></dict></dict>`;
    expect(() => imp.parseProfile(toBuffer(plistProfile(legacy)))).toThrow(
      /No DNS settings/,
    );
  });
});

describe("decodeDeclaration", () => {
  it("decodes UTF-8 JSON", () => {
    expect(imp.decodeDeclaration(b64({ a: "é" }))).toEqual({ a: "é" });
  });
});

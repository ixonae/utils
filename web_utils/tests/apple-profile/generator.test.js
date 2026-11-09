import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const gen = require("../../tools/apple-profile/profile-generator.js");

const provider = {
  label: "Test",
  protocol: "HTTPS",
  url: "https://dns.example.com/dns-query",
  addresses: ["1.1.1.1"],
  allowFailover: false,
};

describe("generator helpers", () => {
  it("generates v4-shaped uppercase UUIDs", () => {
    expect(gen.generateUUID()).toMatch(
      /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/,
    );
  });

  it("exposes presets with a custom entry", () => {
    expect(gen.DNS_PRESETS.custom.url).toBe("");
    expect(gen.DNS_PRESETS.cloudflare.addresses.length).toBeGreaterThan(0);
  });

  it("builds on-demand rules without exclusions", () => {
    expect(gen.buildOnDemandRules([])).toEqual([{ Action: "Connect" }]);
  });
});

describe("buildDNSPayloadObject", () => {
  it("defaults missing fields", () => {
    const p = gen.buildDNSPayloadObject({ label: "X" }, undefined);
    expect(p.DNSSettings).toEqual({ DNSProtocol: "HTTPS", ServerURL: "" });
    expect(p.OnDemandRules).toBeUndefined();
  });

  it("defaults a missing TLS server name", () => {
    const p = gen.buildDNSPayloadObject({ label: "X", protocol: "TLS" }, []);
    expect(p.DNSSettings.ServerName).toBe("");
  });

  it("sets AllowFailover true, and keeps an explicit false from an import", () => {
    expect(
      gen.buildDNSPayloadObject({ ...provider, allowFailover: true }, [])
        .DNSSettings.AllowFailover,
    ).toBe(true);
    expect(
      gen.buildDNSPayloadObject(provider, []).DNSSettings,
    ).not.toHaveProperty("AllowFailover");
    const kept = gen.buildDNSPayloadObject(
      { ...provider, dnsSettings: { AllowFailover: true } },
      [],
    );
    expect(kept.DNSSettings.AllowFailover).toBe(false);
  });

  it("preserves imported DNSSettings keys, drops stale ones and extra payload keys are cloned", () => {
    const extra = { ProhibitDisablement: true, Nested: { a: 1 } };
    const p = gen.buildDNSPayloadObject(
      {
        ...provider,
        addresses: [],
        dnsSettings: {
          SupplementalMatchDomains: ["x"],
          ServerName: "old",
          ServerAddresses: ["9.9.9.9"],
        },
        payloadExtra: extra,
      },
      [],
    );
    expect(p.DNSSettings).toEqual({
      SupplementalMatchDomains: ["x"],
      DNSProtocol: "HTTPS",
      ServerURL: provider.url,
    });
    expect(p.ProhibitDisablement).toBe(true);
    expect(p.Nested).toEqual({ a: 1 });
    expect(p.Nested).not.toBe(extra.Nested);
  });

  it("uses raw on-demand rules over SSID exclusions, or builds rules from SSIDs", () => {
    const raw = [{ Action: "Allow" }];
    const a = gen.buildDNSPayloadObject(
      { ...provider, rawOnDemandRules: raw },
      ["Home"],
    );
    expect(a.OnDemandRules).toEqual(raw);
    expect(a.OnDemandRules).not.toBe(raw);
    const b = gen.buildDNSPayloadObject(provider, ["Home"]);
    expect(b.OnDemandRules[0].SSIDMatch).toEqual(["Home"]);
  });
});

describe("configurations and activation", () => {
  it("generates an identifier when none is imported", () => {
    const c = gen.buildDNSConfiguration(provider, []);
    expect(c.Type).toBe("com.apple.configuration.network.dns-settings");
    expect(c.Identifier).toMatch(/^[0-9A-F-]{36}$/);
  });

  it("generates declarations using per-provider or fallback SSIDs and retains extra declarations", () => {
    const extra = {
      Type: "com.apple.configuration.other",
      Identifier: "EXTRA",
      Payload: {},
    };
    const decls = gen.generateDeclarations({
      providers: [{ ...provider, excludedSSIDs: ["Own"] }, provider],
      excludedSSIDs: ["Fallback"],
      extraDeclarations: [extra],
    });
    expect(decls[0].Payload.OnDemandRules[0].SSIDMatch).toEqual(["Own"]);
    expect(decls[1].Payload.OnDemandRules[0].SSIDMatch).toEqual(["Fallback"]);
    expect(decls[2]).toEqual(extra);
    const act = decls[3];
    expect(act.Type).toBe("com.apple.activation.simple");
    expect(act.Payload.StandardConfigurations).toEqual([
      decls[0].Identifier,
      decls[1].Identifier,
    ]);
  });

  it("handles an empty config", () => {
    const decls = gen.generateDeclarations({});
    expect(decls).toHaveLength(1);
    expect(decls[0].Payload.StandardConfigurations).toEqual([]);
  });
});

describe("generateProfile", () => {
  it("applies defaults", () => {
    const xml = gen.generateProfile({ providers: [provider] });
    expect(xml).toContain("<string>DNS over HTTPS</string>");
    expect(xml).toContain("<string>com.ixonae.doh-profile</string>");
    expect(xml).toContain(
      "<string>com.ixonae.doh-profile.declarations</string>",
    );
    expect(xml).toContain("<string>Configures DNS over HTTPS</string>");
  });

  it("uses provided identifiers and precomputed declarations", () => {
    const xml = gen.generateProfile(
      {
        displayName: "N",
        identifier: "id",
        description: "D",
        payloadIdentifier: "pid",
        profileUUID: "P",
        payloadUUID: "U",
      },
      [{ a: 1 }],
    );
    [
      "<string>N</string>",
      "<string>id</string>",
      "<string>pid</string>",
      "<string>P</string>",
      "<string>U</string>",
    ].forEach((s) => expect(xml).toContain(s));
    expect(xml).toContain(gen.base64Utf8(JSON.stringify({ a: 1 }, null, 2)));
  });
});

import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const gen = require("../../tools/apple-profile/profile-generator.js");
const imp = require("../../tools/apple-profile/profile-importer.js");

const provider = {
  label: "Test",
  protocol: "HTTPS",
  url: "https://dns.example.com/dns-query",
  addresses: ["1.1.1.1", " "],
  allowFailover: false,
};

describe("profile generator", () => {
  it("escapes XML metacharacters including quotes", () => {
    expect(gen.escapeXml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;",
    );
  });

  it("builds a DoH payload and drops blank addresses", () => {
    const p = gen.buildDNSPayloadObject(provider, []);
    expect(p.DNSSettings).toEqual({
      DNSProtocol: "HTTPS",
      ServerURL: provider.url,
      ServerAddresses: ["1.1.1.1"],
    });
    expect(p.OnDemandRules).toBeUndefined();
  });

  it("builds a DoT payload without ServerURL", () => {
    const p = gen.buildDNSPayloadObject(
      { ...provider, protocol: "TLS", serverName: " dns.example.com " },
      [],
    );
    expect(p.DNSSettings.DNSProtocol).toBe("TLS");
    expect(p.DNSSettings.ServerName).toBe("dns.example.com");
    expect(p.DNSSettings.ServerURL).toBeUndefined();
  });

  it("adds Disconnect + Connect rules for excluded SSIDs", () => {
    expect(gen.buildOnDemandRules(["Home"])).toEqual([
      { Action: "Disconnect", SSIDMatch: ["Home"] },
      { Action: "Connect" },
    ]);
  });

  it("keeps the ServerToken only while the content is unchanged", () => {
    const payload = gen.buildDNSPayloadObject(provider, []);
    const imported = {
      ...provider,
      identifier: "ID",
      serverToken: "TOKEN",
      originalPayload: JSON.stringify(payload),
    };
    expect(gen.buildDNSConfiguration(imported, []).ServerToken).toBe("TOKEN");
    expect(
      gen.buildDNSConfiguration({ ...imported, label: "Changed" }, [])
        .ServerToken,
    ).not.toBe("TOKEN");
  });

  it("round-trips non-ASCII declarations through base64", () => {
    const text = JSON.stringify({ VisibleName: "Réseau ✓" });
    expect(imp.decodeDeclaration(gen.base64Utf8(text))).toEqual({
      VisibleName: "Réseau ✓",
    });
  });

  it("escapes imported UUIDs in the generated profile", () => {
    const xml = gen.generateProfile({
      providers: [provider],
      profileUUID: "a<b",
      payloadUUID: "c&d",
    });
    expect(xml).toContain("<string>a&lt;b</string>");
    expect(xml).toContain("<string>c&amp;d</string>");
  });
});

describe("profile importer", () => {
  it("extracts SSID exclusions from rules written by this tool", () => {
    expect(
      imp.extractSSIDExclusions([
        { Action: "Disconnect", SSIDMatch: ["A", "B"] },
        { Action: "Connect" },
      ]),
    ).toEqual(["A", "B"]);
  });

  it("returns null for rules it cannot represent", () => {
    expect(
      imp.extractSSIDExclusions([
        { Action: "Connect" },
        { Action: "Disconnect" },
      ]),
    ).toBeNull();
    expect(
      imp.extractSSIDExclusions([
        { Action: "Disconnect", SSIDMatch: ["A"], DNSDomainMatch: ["x"] },
      ]),
    ).toBeNull();
  });
});

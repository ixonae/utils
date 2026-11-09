// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const gen = require("../../tools/apple-profile/profile-generator.js");
const imp = require("../../tools/apple-profile/profile-importer.js");

const BODY = `
  <select id="provider-preset"><option value="" selected></option></select>
  <button id="btn-add-preset"></button>
  <details id="custom-form" open>
    <input id="custom-name"><input id="custom-url"><div id="custom-url-field"></div>
    <select id="custom-protocol"><option value="HTTPS">DoH</option><option value="TLS">DoT</option></select>
    <input id="custom-servername"><div id="custom-servername-field"></div>
    <input type="checkbox" id="custom-failover"><textarea id="custom-addresses"></textarea>
    <button id="btn-add-custom"></button>
  </details>
  <ul id="provider-list"><li id="provider-empty"></li></ul>
  <input id="ssid-input"><button id="ssid-add-btn"></button><ul id="ssid-list"></ul>
  <input id="profile-name"><input id="profile-identifier"><textarea id="profile-description"></textarea>
  <button id="btn-generate"></button>
  <div id="xml-preview"></div>
  <button id="btn-download" disabled></button><button id="btn-copy" disabled>Copy XML</button>
  <input type="file" id="import-file"><p id="import-status"></p>`;

const $ = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new Event("click", { bubbles: true }));
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const setValue = (el, value, type = "input") => {
  el.value = value;
  fire(el, type);
};
const flush = () => new Promise((r) => setTimeout(r, 0));

async function boot() {
  vi.resetModules();
  document.body.innerHTML = BODY;
  Object.assign(globalThis, gen, imp);
  globalThis.escapeXml = gen.escapeXml;
  globalThis.DNS_PRESETS = gen.DNS_PRESETS;
  // Capture this module instance's init handler instead of using the shared document,
  // so handlers registered by earlier instances don't also run against the new DOM.
  let init;
  const spy = vi
    .spyOn(document, "addEventListener")
    .mockImplementation((type, fn) => {
      if (type === "DOMContentLoaded") init = fn;
    });
  await import("../../tools/apple-profile/profile-app.js");
  spy.mockRestore();
  init();
}

function addPreset(key) {
  setValue($("provider-preset"), key, "change");
  click($("btn-add-preset"));
}

function addCustom({
  name = "Mine",
  protocol = "HTTPS",
  url = "https://d/dns-query",
  host = "",
  addrs = "",
  failover = false,
} = {}) {
  $("custom-name").value = name;
  setValue($("custom-protocol"), protocol, "change");
  $("custom-url").value = url;
  $("custom-servername").value = host;
  $("custom-addresses").value = addrs;
  $("custom-failover").checked = failover;
  click($("btn-add-custom"));
}

const items = () => [...document.querySelectorAll(".provider-item")];
const addSSID = (name) => {
  $("ssid-input").value = name;
  click($("ssid-add-btn"));
};

beforeEach(async () => {
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  await boot();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("presets", () => {
  it("lists the available provider presets", () => {
    const values = [...$("provider-preset").options].map((o) => o.value);
    expect(values).toEqual([
      "",
      "cloudflare",
      "cloudflare-malware",
      "quad9",
      "quad9-unfiltered",
    ]);
  });

  it("ignores Add with nothing selected, and adds a preset otherwise", () => {
    click($("btn-add-preset"));
    expect(items()).toHaveLength(0);
    expect($("provider-empty").style.display).toBe("");
    addPreset("cloudflare");
    expect(items()).toHaveLength(1);
    expect($("provider-empty").style.display).toBe("none");
    expect($("provider-preset").value).toBe("");
    expect(items()[0].textContent).toContain("Cloudflare");
    expect(items()[0].querySelectorAll(".provider-addresses span").length).toBe(
      4,
    );
  });
});

describe("custom providers", () => {
  it("shows no address block when addresses are omitted", () => {
    addCustom();
    expect(items()[0].querySelector(".provider-addresses")).toBeNull();
  });

  it("toggles the DoH/DoT fields", () => {
    expect($("custom-url-field").hidden).toBe(false);
    setValue($("custom-protocol"), "TLS", "change");
    expect($("custom-url-field").hidden).toBe(true);
    expect($("custom-servername-field").hidden).toBe(false);
  });

  it("validates the name and endpoint", () => {
    addCustom({ name: "" });
    expect(alert).toHaveBeenLastCalledWith("Provider name is required.");
    addCustom({ url: "" });
    expect(alert).toHaveBeenLastCalledWith("DoH server URL is required.");
    addCustom({ url: "not a url" });
    expect(alert).toHaveBeenLastCalledWith("Invalid URL.");
    addCustom({ url: "http://x" });
    expect(alert).toHaveBeenLastCalledWith("URL must use HTTPS.");
    addCustom({ protocol: "TLS", host: "" });
    expect(alert).toHaveBeenLastCalledWith("DoT server hostname is required.");
    addCustom({ protocol: "TLS", host: "a.b:853" });
    expect(alert).toHaveBeenLastCalledWith(
      expect.stringContaining("plain hostname"),
    );
    expect(items()).toHaveLength(0);
  });

  it("adds a DoH provider and resets the form", () => {
    addCustom({ addrs: "1.1.1.1, 2.2.2.2\n\n3.3.3.3", failover: true });
    expect(items()).toHaveLength(1);
    const text = items()[0].textContent;
    expect(text).toContain("Custom");
    expect(text).toContain("Failover");
    expect(
      items()[0].querySelectorAll(".provider-addresses span"),
    ).toHaveLength(3);
    expect($("custom-name").value).toBe("");
    expect($("custom-failover").checked).toBe(false);
    expect($("custom-form").open).toBe(false);
  });

  it("adds a DoT provider", () => {
    addCustom({ protocol: "TLS", host: "dns.example.com" });
    expect(items()[0].textContent).toContain("DoT");
    expect(items()[0].querySelector(".provider-url").textContent).toBe(
      "dns.example.com",
    );
  });
});

describe("provider list actions", () => {
  beforeEach(() => {
    addPreset("cloudflare");
    addPreset("quad9");
    addPreset("quad9-unfiltered");
  });

  const labels = () =>
    items().map((li) => li.querySelector(".provider-label").textContent);

  it("moves providers and disables the edge arrows", () => {
    expect(items()[0].querySelector(".btn-up").disabled).toBe(true);
    expect(items()[2].querySelector(".btn-down").disabled).toBe(true);
    click(items()[0].querySelector(".btn-down"));
    expect(labels()[1]).toContain("Cloudflare");
    click(items()[1].querySelector(".btn-up"));
    expect(labels()[0]).toContain("Cloudflare");
  });

  it("removes providers and drops them from SSID scopes", () => {
    addSSID("Home");
    setValue(document.querySelector(".ssid-scope-select"), "some", "change");
    click(items()[0].querySelector(".btn-remove"));
    expect(items()).toHaveLength(2);
    expect(document.querySelectorAll(".ssid-scope-check")).toHaveLength(2);
  });

  it("removes providers when exclusions apply to everything", () => {
    addSSID("Home");
    click(items()[1].querySelector(".btn-remove"));
    expect(items()).toHaveLength(2);
  });

  it("ignores moves past either end", () => {
    click(items()[0].querySelector(".btn-up"));
    click(items()[2].querySelector(".btn-down"));
    expect(labels()[0]).toContain("Cloudflare");
    expect(labels()[2]).toBe("Quad9 (No Threat Blocking)");
  });

  it("shows the empty placeholder again once every provider is removed", () => {
    items().forEach(() => click(items()[0].querySelector(".btn-remove")));
    expect(items()).toHaveLength(0);
    expect($("provider-empty").style.display).toBe("");
  });

  it("toggles the editor", () => {
    click(items()[0].querySelector(".btn-edit"));
    expect(items()[0].querySelector(".provider-edit")).not.toBeNull();
    expect(items()[0].querySelector(".btn-edit").textContent).toBe("Done");
    click(items()[0].querySelector(".btn-edit"));
    expect(items()[0].querySelector(".provider-edit")).toBeNull();
  });

  it("edits fields in place", () => {
    click(items()[0].querySelector(".btn-edit"));
    const field = (name) => items()[0].querySelector(`[data-edit="${name}"]`);
    setValue(field("label"), "Renamed");
    setValue(field("url"), "https://new/dns-query");
    setValue(field("addresses"), "9.9.9.9\n8.8.8.8");
    field("failover").checked = true;
    fire(field("failover"), "change");
    click($("btn-generate"));
    expect($("xml-preview").textContent).toContain("Renamed");
    expect($("xml-preview").textContent).toContain("https://new/dns-query");
    expect($("xml-preview").textContent).toContain("AllowFailover");

    setValue(field("protocol"), "TLS", "change");
    expect(items()[0].querySelector('[data-edit="serverName"]')).not.toBeNull();
    setValue(
      items()[0].querySelector('[data-edit="serverName"]'),
      "dns.example.com",
    );
    expect(items()[0].textContent).toContain("DoT");
    expect($("btn-download").disabled).toBe(true);
  });

  it("ignores edits for unknown fields or providers", () => {
    click(items()[0].querySelector(".btn-edit"));
    const input = items()[0].querySelector('[data-edit="label"]');
    input.setAttribute("data-id", "999");
    setValue(input, "x");
    input.setAttribute("data-edit", "");
    fire(input, "input");
    const other = document.createElement("input");
    other.setAttribute("data-edit", "label");
    other.setAttribute("data-id", "1");
    $("provider-list").appendChild(other);
    expect(() => fire(other, "input")).not.toThrow();
  });

  it("ignores moves or toggles for missing providers", () => {
    const btn = items()[0].querySelector(".btn-edit");
    btn.setAttribute("data-id", "999");
    click(btn);
    const up = items()[1].querySelector(".btn-up");
    up.setAttribute("data-id", "999");
    click(up);
    expect(labels()).toHaveLength(3);
  });
});

describe("Wi-Fi exclusions", () => {
  it("ignores blanks and duplicates, supports Enter and removal", () => {
    addSSID("  ");
    expect(document.querySelectorAll(".ssid-item")).toHaveLength(0);
    $("ssid-input").value = "Home";
    fire($("ssid-input"), "keydown");
    expect(document.querySelectorAll(".ssid-item")).toHaveLength(0);
    $("ssid-input").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter" }),
    );
    expect(document.querySelectorAll(".ssid-item")).toHaveLength(1);
    addSSID("Home");
    expect(document.querySelectorAll(".ssid-item")).toHaveLength(1);
    click(document.querySelector(".ssid-item .btn-remove"));
    expect(document.querySelectorAll(".ssid-item")).toHaveLength(0);
  });

  it("offers per-provider scoping only when relevant", () => {
    addPreset("cloudflare");
    addSSID("Home");
    expect(document.querySelector(".ssid-scope")).toBeNull();
    addPreset("quad9");
    click(document.querySelector(".ssid-item .btn-remove"));
    addSSID("Home");
    expect(document.querySelector(".ssid-scope")).not.toBeNull();
  });

  it("scopes to selected providers and back, and toggles checkboxes", () => {
    addPreset("cloudflare");
    addPreset("quad9");
    addSSID("Home");
    const select = () => document.querySelector(".ssid-scope-select");
    setValue(select(), "some", "change");
    const boxes = () => [...document.querySelectorAll(".ssid-scope-check")];
    expect(boxes().every((b) => b.checked)).toBe(true);
    boxes()[0].checked = false;
    fire(boxes()[0], "change");
    boxes()[0].checked = true;
    fire(boxes()[0], "change");
    boxes()[1].checked = false;
    fire(boxes()[1], "change");
    click($("btn-generate"));
    const xml = $("xml-preview").textContent;
    expect(xml).toContain("Home");
    setValue(select(), "all", "change");
    expect(document.querySelector(".ssid-scope-providers")).toBeNull();
  });
});

describe("profile details", () => {
  it.each([
    ["profile-name", "Updated Profile"],
    ["profile-identifier", "com.example.updated"],
    ["profile-description", "Updated description"],
  ])("invalidates the export when %s changes", (id, value) => {
    addPreset("cloudflare");
    click($("btn-generate"));
    expect($("btn-download").disabled).toBe(false);
    expect($("btn-copy").disabled).toBe(false);

    setValue($(id), value);
    expect($("xml-preview").querySelector("pre")).toBeNull();
    expect($("btn-download").disabled).toBe(true);
    expect($("btn-copy").disabled).toBe(true);

    click($("btn-generate"));
    expect($("xml-preview").textContent).toContain(value);
  });

  it("tracks the name, identifier and description", () => {
    addPreset("cloudflare");
    setValue($("profile-name"), "My Profile");
    setValue($("profile-identifier"), "com.me.p");
    setValue($("profile-description"), "D");
    click($("btn-generate"));
    const text = $("xml-preview").textContent;
    expect(text).toContain("My Profile");
    expect(text).toContain("com.me.p");
  });

  it("falls back to defaults when the fields are emptied", () => {
    addPreset("cloudflare");
    setValue($("profile-name"), "");
    setValue($("profile-identifier"), "");
    setValue($("profile-description"), "");
    click($("btn-generate"));
    expect($("xml-preview").textContent).toContain("com.ixonae.doh-profile");
  });
});

describe("generate / download / copy", () => {
  it("refuses to generate without providers", () => {
    click($("btn-generate"));
    expect(alert).toHaveBeenCalledWith("Add at least one DNS provider.");
  });

  it("reports invalid providers", () => {
    addPreset("cloudflare");
    click(items()[0].querySelector(".btn-edit"));
    setValue(
      items()[0].querySelector('[data-edit="protocol"]'),
      "TLS",
      "change",
    );
    click($("btn-generate"));
    expect(alert).toHaveBeenLastCalledWith(
      "Cloudflare (1.1.1.1): DoT server hostname is required.",
    );
    setValue(items()[0].querySelector('[data-edit="label"]'), "  ");
    click($("btn-generate"));
    expect(alert).toHaveBeenLastCalledWith("Every provider needs a name.");
  });

  it("renders a preview and enables the buttons, then does nothing on download before generation", () => {
    click($("btn-download"));
    click($("btn-copy"));
    addPreset("cloudflare");
    click($("btn-generate"));
    expect($("xml-preview").querySelectorAll("pre")).toHaveLength(2);
    expect($("xml-preview").innerHTML).toContain("xml-key");
    expect($("btn-download").disabled).toBe(false);
    expect($("btn-copy").disabled).toBe(false);
  });

  it("downloads with a sanitised file name, and a fallback name", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const names = [];
    const spy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function () {
        names.push(this.download);
      });
    addPreset("cloudflare");
    setValue($("profile-name"), "My DNS/Profile");
    click($("btn-generate"));
    click($("btn-download"));
    expect(names).toEqual(["My_DNS_Profile.mobileconfig"]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(document.querySelector("a[download]")).toBeNull();
    spy.mockRestore();
  });

  it("falls back to a default file name when the sanitised name is empty", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const names = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function () {
        names.push(this.download);
      },
    );
    addPreset("cloudflare");
    setValue($("profile-name"), "");
    click($("btn-generate"));
    click($("btn-download"));
    expect(names).toEqual(["dns-profile.mobileconfig"]);
  });

  it("copies to the clipboard and restores the label", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    addPreset("cloudflare");
    click($("btn-generate"));
    click($("btn-copy"));
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("<plist"));
    expect($("btn-copy").textContent).toBe("Copied!");
    await vi.advanceTimersByTimeAsync(1500);
    expect($("btn-copy").textContent).toBe("Copy XML");
  });
});

describe("import", () => {
  const fileOf = (text, name = "p.mobileconfig") => {
    const bytes = new TextEncoder().encode(text);
    return { name, arrayBuffer: () => Promise.resolve(bytes.buffer) };
  };
  const doImport = async (text, name) => {
    Object.defineProperty($("import-file"), "files", {
      value: [fileOf(text, name)],
      configurable: true,
    });
    fire($("import-file"), "change");
    await flush();
  };

  const rich = () => {
    const act = {
      Type: "com.apple.activation.simple",
      Identifier: "ACT",
      ServerToken: "AT",
      Payload: { StandardConfigurations: ["A", "B", "X"], Predicate: "p" },
    };
    const extra = { Type: "com.apple.configuration.other", Identifier: "X" };
    const dns = (id, ssids, extraPayload = {}) => ({
      Type: "com.apple.configuration.network.dns-settings",
      Identifier: id,
      ServerToken: "T" + id,
      Payload: {
        VisibleName: "Prov " + id,
        DNSSettings: {
          DNSProtocol: "HTTPS",
          ServerURL: "https://" + id + "/dns-query",
        },
        OnDemandRules: [
          ...ssids.map((s) => ({ Action: "Disconnect", SSIDMatch: [s] })),
          { Action: "Connect" },
        ],
        ...extraPayload,
      },
    });
    // Provider A: Home + Office, B: Home only, C: custom rules, so Office is scoped and Home is global to A,B
    const decls = [
      dns("A", ["Home", "Office"]),
      dns("B", ["Home"]),
      dns("C", [], { OnDemandRules: [{ Action: "Allow" }] }),
      act,
      extra,
    ];
    const b64 = decls
      .map((d) => `<data>${gen.base64Utf8(JSON.stringify(d))}</data>`)
      .join("");
    return (
      `<?xml version="1.0"?><plist version="1.0"><dict>` +
      `<key>PayloadType</key><string>Configuration</string><key>PayloadUUID</key><string>PU</string>` +
      `<key>PayloadDisplayName</key><string>Imported Name</string><key>PayloadIdentifier</key><string>com.imp</string>` +
      `<key>PayloadDescription</key><string>Imported Desc</string>` +
      `<key>PayloadContent</key><array>` +
      `<dict><key>PayloadType</key><string>com.apple.declarations</string><key>PayloadUUID</key><string>DU</string>` +
      `<key>PayloadIdentifier</key><string>com.imp.decl</string><key>Declarations</key><array>${b64}</array></dict>` +
      `<dict><key>PayloadType</key><string>com.apple.other</string></dict>` +
      `</array></dict></plist>`
    );
  };

  it("imports providers, exclusions, details and notes", async () => {
    await doImport(rich(), "rich.mobileconfig");
    expect(items()).toHaveLength(3);
    expect($("profile-name").value).toBe("Imported Name");
    expect($("profile-identifier").value).toBe("com.imp");
    expect($("profile-description").value).toBe("Imported Desc");
    expect(items()[0].textContent).toContain("Imported");
    expect(items()[2].querySelector(".provider-note")).not.toBeNull();
    const status = $("import-status");
    expect(status.textContent).toContain(
      "Imported rich.mobileconfig: 3 provider(s), 2 Wi-Fi exclusion(s)",
    );
    expect(status.textContent).toContain("1 other declaration(s) kept as-is");
    expect(status.textContent).toContain(
      "1 unrelated payload(s) not carried over",
    );
    expect(status.className).toBe("import-status");
    // Home applies to every eligible provider; Office only to A, so it is scoped
    const selects = [...document.querySelectorAll(".ssid-scope-select")].map(
      (s) => s.value,
    );
    expect(selects).toEqual(["all", "some"]);
  });

  it("keeps identifiers and tokens through re-generation", async () => {
    await doImport(rich());
    click($("btn-generate"));
    expect($("xml-preview").textContent).toContain('"ServerToken": "TA"');
    expect($("xml-preview").textContent).toContain('"ServerToken": "AT"');
    expect($("xml-preview").textContent).toContain('"Predicate": "p"');
  });

  it("preserves activation membership and updates only rules affected by provider edits", async () => {
    const dns = (id) => ({
      Type: "com.apple.configuration.network.dns-settings",
      Identifier: id,
      Payload: {
        VisibleName: id,
        DNSSettings: {
          DNSProtocol: "HTTPS",
          ServerURL: "https://" + id + ".example.com/dns-query",
        },
      },
    });
    const activation = (id, ids, family) => ({
      Type: "com.apple.activation.simple",
      Identifier: id,
      ServerToken: id + "-token",
      Payload: {
        Predicate: "@status(device.model.family) == '" + family + "'",
        StandardConfigurations: ids,
      },
    });
    const mac = activation("mac", ["cloudflare"], "Mac");
    const ipad = activation("ipad", ["quad9"], "iPad");
    const shared = activation("shared", ["quad9", "cloudflare"], "iPhone");
    await doImport(
      gen.generateProfile({}, [
        dns("cloudflare"),
        dns("quad9"),
        mac,
        ipad,
        shared,
      ]),
    );

    const generatedDeclarations = () => {
      click($("btn-generate"));
      return $("xml-preview")
        .querySelector("pre")
        .textContent.split("\n\n")
        .map(JSON.parse);
    };
    const importedActivations = () =>
      generatedDeclarations().filter((d) => d.Type === mac.Type);
    expect(importedActivations()).toEqual([mac, ipad, shared]);

    click(items()[0].querySelector(".btn-down"));
    expect(importedActivations()).toEqual([mac, ipad, shared]);

    click(items()[1].querySelector(".btn-remove"));
    addPreset("cloudflare-malware");
    const declarations = generatedDeclarations();
    const [, addedProvider, unchanged, updated, addedActivation] = declarations;
    expect(declarations).toHaveLength(5);
    expect(unchanged).toEqual(ipad);
    expect(updated.Identifier).toBe(shared.Identifier);
    expect(updated.ServerToken).not.toBe(shared.ServerToken);
    expect(updated.Payload).toEqual({
      ...shared.Payload,
      StandardConfigurations: ["quad9"],
    });
    expect(addedActivation.Payload).toEqual({
      StandardConfigurations: [addedProvider.Identifier],
    });
  });

  it("works without an activation or profile details", async () => {
    const decl = {
      Type: "com.apple.configuration.network.dns-settings",
      Identifier: "D",
      Payload: { DNSSettings: { ServerURL: "https://l/dns-query" } },
    };
    const xml =
      `<plist><dict><key>PayloadType</key><string>Configuration</string><key>PayloadContent</key><array>` +
      `<dict><key>PayloadType</key><string>com.apple.declarations</string><key>Declarations</key>` +
      `<array><data>${gen.base64Utf8(JSON.stringify(decl))}</data></array></dict></array></dict></plist>`;
    await doImport(xml);
    expect($("profile-name").value).toBe("");
    click($("btn-generate"));
    expect($("btn-download").disabled).toBe(false);
    expect($("xml-preview").textContent).not.toContain(
      "com.apple.activation.simple",
    );
  });

  it("imports a plain profile without notes and collapses repeated SSIDs", async () => {
    const xml = gen.generateProfile({
      providers: [
        {
          label: "A",
          protocol: "HTTPS",
          url: "https://a/dns-query",
          addresses: [],
          excludedSSIDs: ["Home", "Home"],
        },
      ],
    });
    await doImport(xml, "plain.mobileconfig");
    expect($("import-status").textContent).toBe(
      "Imported plain.mobileconfig: 1 provider(s), 1 Wi-Fi exclusion(s). Identifiers are preserved.",
    );
  });

  it("reports failures", async () => {
    await doImport("garbage");
    expect($("import-status").textContent).toContain("Import failed:");
    expect($("import-status").className).toContain("import-error");
  });

  it("asks before replacing existing providers", async () => {
    addPreset("cloudflare");
    confirm.mockReturnValueOnce(false);
    await doImport(rich());
    expect(items()).toHaveLength(1);
    await doImport(rich());
    expect(items()).toHaveLength(3);
  });

  it("does nothing when no file is chosen", () => {
    Object.defineProperty($("import-file"), "files", {
      value: [],
      configurable: true,
    });
    fire($("import-file"), "change");
    expect($("import-status").textContent).toBe("");
  });
});

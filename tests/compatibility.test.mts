import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { assertPluginCompatibility } from "@getpaseo/protocol/plugin-requirements";
import ts from "typescript";

const manifest = JSON.parse(readFileSync(new URL("../paseo-plugin.json", import.meta.url), "utf8"));

test("manifest admits daemon and Android app 0.13.2 independently of desktop build", () => {
  for (const runtime of ["daemon", "app"] as const) {
    for (const version of ["0.12.0", "0.13.2", "0.14.0"]) {
      assert.doesNotThrow(() => assertPluginCompatibility({ ...manifest, version, runtime }));
    }
    assert.throws(() => assertPluginCompatibility({ ...manifest, requirements: { paseo: ">=0.14.0 <0.14.1" }, version: "0.13.2", runtime }));
    assert.throws(() => assertPluginCompatibility({ ...manifest, version: "0.15.0", runtime }));
  }
});

const source = ts.transpileModule(readFileSync(new URL("../client/close-policy.web.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const bundle = "/_expo/static/js/web/index-4df2750168de94b9b8fdf3170859afa9.js";

function resolveUi(src: string | undefined, load: (id: number) => any) {
  return runInNewContext(`${source}\nhostCloseUi()`, { exports: {}, window: { __r: load }, document: { scripts: src ? [{ src }] : [] } });
}

test("unsupported desktop build is rejected before any numeric Metro lookup", () => {
  for (const src of [undefined, "paseo://app/_expo/static/js/web/index-other.js", `paseo://app/not-this-build.js?asset=${bundle}`]) {
    let lookups = 0;
    assert.throws(() => resolveUi(src, () => { lookups++; throw Error("Must not load"); }), /Unsupported Paseo desktop UI build/);
    assert.equal(lookups, 0);
  }
});

test("exact desktop entry with cache key admits host exports and validates their contract", () => {
  const component = () => {};
  const modules: Record<number, any> = {
    35: { createElement: component }, 87: { createRoot: component }, 90: { flushSync: component },
    3675: { AdaptiveModalSheet: component }, 3351: { Button: component },
    160: { useUnistyles: component, UnistylesRuntime: {} }, 480: { SafeAreaProvider: component },
    3679: { GestureHandlerRootView: component }, 3676: { BottomSheetModalProvider: component },
    187: { default: component }, 275: { default: component },
  };
  for (const suffix of ["", "?paseo-tabs-close=0.4.1-cache", "?paseo-tabs-close=0.4.2-cache"]) {
    assert.equal(resolveUi(`paseo://app${bundle}${suffix}`, id => modules[id]).Button, component);
  }
  assert.throws(() => resolveUi(`paseo://app${bundle}`, () => ({})), /Unsupported Paseo UI module contract/);
});

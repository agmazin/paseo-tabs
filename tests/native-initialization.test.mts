import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

test("Android/iOS contribute is safe with window=global and no DOM or addEventListener", () => {
  for (const platform of ["android", "ios"]) {
    const context = createContext({ console,
      setInterval: () => { throw new Error("Native initialization must not start DOM timers"); },
      setTimeout: () => { throw new Error("Native initialization must not defer DOM work"); },
    });
    runInContext("window=globalThis", context);
    const cache = new Map<string, any>();
    const load = (path: string): any => {
      if (cache.has(path)) return cache.get(path);
      const module = { exports: {} };
      cache.set(path, module.exports);
      const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
      } }).outputText;
      const evaluate = runInContext(`(function(require,module,exports){${source}\n})`, context);
      evaluate((id: string) => {
        if (id === "react-native") return { Platform: { OS: platform } };
        assert.ok(id.startsWith("."), `Unexpected native runtime dependency: ${id}`);
        return load(resolve(dirname(path), `${id}.ts`));
      }, module, module.exports);
      return module.exports;
    };
    const entry = load(resolve("index.client.ts"));
    const cleanup = entry.default({ paseo: {} });
    assert.equal(typeof cleanup, "function");
    assert.doesNotThrow(() => cleanup());
    assert.equal(runInContext("typeof document", context), "undefined");
    assert.equal(runInContext("typeof window.addEventListener", context), "undefined");
    assert.equal(runInContext("window.__paseoTabClosePolicy", context), undefined);
    assert.equal(runInContext("window.__paseoTabsClose", context), undefined);
  }
});

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const VERSION = "0.4.0";
export const BUNDLE = "_expo/static/js/web/index-4df2750168de94b9b8fdf3170859afa9.js";
export const ORIGINAL_SHA256 = "e34d305be181eda51066d03f7d1516b4603cc4661643e1ca3d818f2bba3e7363";
export const ORIGINAL_INDEX_SHA256 = "e43e6f3cb52d9affede68829baf465cc25d36692e720aa0ee57858637780316f";
const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (source: string | Buffer) => createHash("sha256").update(source).digest("hex");
const MARKER = `/* paseo-tabs native close policy ${VERSION} */`;

function replaceOnce(source: string, before: string, after: string) {
  if (source.split(before).length !== 2) throw new Error("Expected exactly one native close patch anchor");
  return source.replace(before, () => after);
}

export function patchSource(source: string) {
  if (hash(source) !== ORIGINAL_SHA256) throw new Error("Unsupported Paseo bundle; no files changed");
  const start = 'const{tabId:t,agentId:s}=e;await yr(t,async()=>{if(!te)return;';
  const end = '})},[Wt,yr,Tr,te,Ga,f,h])';
  if (source.split(start).length !== 2 || source.split(end).length !== 2) throw new Error("Native close callback contract changed");
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (to < from) throw new Error("Native close callback boundary changed");
  const callback = 'const{tabId:t,agentId:s}=e;await yr(t,async()=>{if(!te||!Ga)return;const a=re.useSessionStore.getState().sessions[te]?.agents?.get(s);if(!a||a.archivedAt)return;let c="cancel";try{c=await globalThis.__paseoTabClosePolicy?.choose({workspaceKey:Ga,tabId:t,agentId:s,title:a.title})}catch(e){console.warn("[paseo-tabs] Close dialog failed; action cancelled",e)}if(c==="archive"){try{await Wt({serverId:te,agentId:s})}catch(e){console.warn("[paseo-tabs] Explicit archive failed",e)}return}if(c!=="close")return;zr(e=>e===t?null:e);globalThis.__paseoTabClosePolicy?.close({workspaceKey:Ga,tabId:t,agentId:s})';
  let result = source.slice(0, from) + callback + source.slice(to);
  result = replaceOnce(result, 'const ue=ie();function le(){', 'const ue=ie();globalThis.__paseoTabClosePolicy?.attachStore(ue);function le(){');
  result = replaceOnce(result,
    'if(Ga&&or.some(t=>t.tab.tabId===e))return void(await ps(e)&&nr(Ga,e));',
    'const sheet=or.find(t=>t.tab.tabId===e);if(Ga&&sheet)return void(await ps(e)&&("agent"===sheet.tab.target.kind?await ds({tabId:e,agentId:sheet.tab.target.agentId}):nr(Ga,e)));');
  const runtime = ts.transpileModule(readFileSync(join(root, "client/close-policy.web.ts"), "utf8").replaceAll("export ", ""),
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText.replace(/export\s*\{\s*\};?\s*$/m, "");
  return `${MARKER}\n(function(){${runtime}\ninstallClosePolicy();globalThis.__paseoNativeTabCloseVersion="${VERSION}";})();\n${result}`;
}

export function deploy(directory: string, action = "check", backupDirectory = join(root, "..", "native-close-backups")) {
  const path = join(directory, BUNDLE);
  const installed = readFileSync(path, "utf8");
  const indexPath = join(directory, "index.html");
  const installedIndex = readFileSync(indexPath, "utf8");
  const recordPath = join(backupDirectory, `${ORIGINAL_SHA256}.json`);
  const originalPath = join(backupDirectory, `${ORIGINAL_SHA256}.js`);
  const originalIndexPath = join(backupDirectory, `${ORIGINAL_INDEX_SHA256}.html`);
  const patched = installed.startsWith(MARKER) ? installed : patchSource(installed);

  if (installed.startsWith(MARKER)) {
    if (!existsSync(recordPath) || JSON.parse(readFileSync(recordPath, "utf8")).patchedSha256 !== hash(installed) || JSON.parse(readFileSync(recordPath, "utf8")).patchedIndexSha256 !== hash(installedIndex))
      throw new Error("Installed patch has no matching deployment record; no files changed");
    if (action !== "rollback") return { status: "already-installed", path, sha256: hash(installed), version: VERSION };
  }
  if (!installed.startsWith(MARKER) && hash(installedIndex) !== ORIGINAL_INDEX_SHA256) throw new Error("Unsupported Paseo index; no files changed");
  const originalIndex = installed.startsWith(MARKER) ? readFileSync(originalIndexPath, "utf8") : installedIndex;
  const patchedIndex = replaceOnce(originalIndex, `src="/${BUNDLE}"`, `src="/${BUNDLE}?paseo-tabs-close=${VERSION}-${hash(patched).slice(0, 16)}"`);
  if (action === "check") return { status: "compatible", path, originalSha256: hash(installed), patchedSha256: hash(patched), version: VERSION };
  if (!["apply", "rollback"].includes(action)) throw new Error("Use check, apply, or rollback");
  if (action === "rollback") {
    const original = readFileSync(originalPath);
    if (hash(original) !== ORIGINAL_SHA256) throw new Error("Backup hash mismatch; no files changed");
    if (hash(originalIndex) !== ORIGINAL_INDEX_SHA256) throw new Error("Index backup hash mismatch; no files changed");
    writeFileSync(`${path}.tmp`, original);
    writeFileSync(`${indexPath}.tmp`, originalIndex);
  } else {
    mkdirSync(backupDirectory, { recursive: true });
    if (!existsSync(originalPath)) writeFileSync(originalPath, installed, { flag: "wx" });
    if (hash(readFileSync(originalPath)) !== ORIGINAL_SHA256) throw new Error("Backup hash mismatch; no files changed");
    if (!existsSync(originalIndexPath)) writeFileSync(originalIndexPath, installedIndex, { flag: "wx" });
    if (hash(readFileSync(originalIndexPath)) !== ORIGINAL_INDEX_SHA256) throw new Error("Index backup hash mismatch; no files changed");
    writeFileSync(recordPath, JSON.stringify({ version: VERSION, originalSha256: ORIGINAL_SHA256, patchedSha256: hash(patched), originalIndexSha256: ORIGINAL_INDEX_SHA256, patchedIndexSha256: hash(patchedIndex), path, replacements: 3, cacheKey: `${VERSION}-${hash(patched).slice(0, 16)}` }, null, 2) + "\n");
    writeFileSync(`${path}.tmp`, patched);
    writeFileSync(`${indexPath}.tmp`, patchedIndex);
  }
  try {
    renameSync(`${path}.tmp`, path);
    renameSync(`${indexPath}.tmp`, indexPath);
  } catch (error) {
    writeFileSync(path, installed);
    writeFileSync(indexPath, installedIndex);
    throw error;
  }
  return { status: action === "rollback" ? "rolled-back" : "installed", path, sha256: hash(readFileSync(path)), version: VERSION };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action = "check", directory, backupDirectory] = process.argv.slice(2);
  if (!directory) throw new Error("Pass the app-dist directory explicitly");
  console.log(JSON.stringify(deploy(resolve(directory), action, backupDirectory && resolve(backupDirectory)), null, 2));
}

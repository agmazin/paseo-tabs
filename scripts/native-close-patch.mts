import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const VERSION = "0.4.1";
export const PREVIOUS_SHA256 = "8408efbadbedc495b412ad1f2bb61d310d29878e7958f2792b79de705e379647";
export const PREVIOUS_INDEX_SHA256 = "7ce1fe368c8b087ee64b9e609ef6cf36fc5037b31cb2607e4268b902fa107d83";
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
  const callback = 'const{tabId:t,agentId:s}=e;await yr(t,async()=>{if(!te||!Ga||!Ga.startsWith(te+":"))return;const read=()=>re.useSessionStore.getState().sessions[te]?.agents?.get(s);let a=read();if(!a){try{a=(await re.useSessionStore.getState().sessions[te]?.client?.fetchAgent(s))?.agent}catch(e){console.warn("[paseo-tabs] Close status unavailable; action cancelled",e)}}if(!a)return;const p=globalThis.__paseoTabClosePolicy;const request={workspaceKey:Ga,tabId:t,agentId:s,title:a.title};const local=()=>{zr(e=>e===t?null:e);p?.close(request)};if(a.archivedAt){local();return}let invalidated=false;const active=()=>!invalidated&&!!read()&&!read().archivedAt;let c="cancel";const stop=re.useSessionStore.subscribe(()=>{if(!active()){invalidated=true;p?.cancel()}});try{c=await p?.choose({...request,isCurrent:active})}catch(e){console.warn("[paseo-tabs] Close dialog failed; action cancelled",e)}finally{stop()}if(!active())return;if(c==="archive"){try{await Wt({serverId:te,agentId:s})}catch(e){console.warn("[paseo-tabs] Explicit archive failed",e)}return}if(c!=="close")return;local()';
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
  if (!["check", "apply", "rollback"].includes(action)) throw new Error("Use check, apply, or rollback");
  const recordPath = join(backupDirectory, `${ORIGINAL_SHA256}-${VERSION}.json`);
  const backup = (sha: string, extension: string) => join(backupDirectory, `${sha}.${extension}`);
  const verified = (sha: string, extension: string) => {
    const value = readFileSync(backup(sha, extension), "utf8");
    if (hash(value) !== sha) throw new Error("Backup hash mismatch; no files changed");
    return value;
  };
  const currentSha = hash(installed), currentIndexSha = hash(installedIndex);
  const isOriginal = currentSha === ORIGINAL_SHA256 && currentIndexSha === ORIGINAL_INDEX_SHA256;
  const isPrevious = currentSha === PREVIOUS_SHA256 && currentIndexSha === PREVIOUS_INDEX_SHA256;
  if (!isOriginal && !isPrevious && !installed.startsWith(MARKER)) throw new Error("Unsupported Paseo bundle/index; no files changed");
  const original = isOriginal ? installed : verified(ORIGINAL_SHA256, "js");
  const originalIndex = isOriginal ? installedIndex : verified(ORIGINAL_INDEX_SHA256, "html");
  const patched = patchSource(original);
  const patchedIndex = replaceOnce(originalIndex, `src="/${BUNDLE}"`, `src="/${BUNDLE}?paseo-tabs-close=${VERSION}-${hash(patched).slice(0, 16)}"`);
  const isCurrent = installed === patched && installedIndex === patchedIndex;
  if (!isOriginal && !isPrevious && !isCurrent) throw new Error("Unsupported Paseo bundle/index or matching deployment record; no files changed");
  if (isCurrent) {
    if (!existsSync(recordPath)) throw new Error("Installed patch has no matching deployment record; no files changed");
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    if (record.patchedSha256 !== currentSha || record.patchedIndexSha256 !== currentIndexSha) throw new Error("Installed patch has no matching deployment record; no files changed");
  }
  if (isCurrent && action !== "rollback") return { status: "already-installed", path, sha256: currentSha, indexSha256: currentIndexSha, version: VERSION };
  if (action === "check") return { status: "compatible", path, originalSha256: currentSha, patchedSha256: hash(patched), patchedIndexSha256: hash(patchedIndex), version: VERSION };
  let nextBundle = patched, nextIndex = patchedIndex;
  if (action === "rollback") {
    if (!isCurrent) throw new Error("Only the exact current patch can be rolled back; no files changed");
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    if (record.patchedSha256 !== currentSha || record.patchedIndexSha256 !== currentIndexSha ||
      ![[ORIGINAL_SHA256, ORIGINAL_INDEX_SHA256], [PREVIOUS_SHA256, PREVIOUS_INDEX_SHA256]].some(([bundle, index]) => bundle === record.previousSha256 && index === record.previousIndexSha256))
      throw new Error("Invalid rollback record; no files changed");
    nextBundle = verified(record.previousSha256, "js");
    nextIndex = verified(record.previousIndexSha256, "html");
  } else {
    mkdirSync(backupDirectory, { recursive: true });
    for (const [sha, extension, value] of [[currentSha, "js", installed], [currentIndexSha, "html", installedIndex]]) {
      if (!existsSync(backup(sha, extension))) writeFileSync(backup(sha, extension), value, { flag: "wx" });
      verified(sha, extension);
    }
    writeFileSync(recordPath, JSON.stringify({ version: VERSION, previousSha256: currentSha, previousIndexSha256: currentIndexSha,
      patchedSha256: hash(patched), patchedIndexSha256: hash(patchedIndex), path }, null, 2) + "\n");
  }
  writeFileSync(`${path}.tmp`, nextBundle);
  writeFileSync(`${indexPath}.tmp`, nextIndex);
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

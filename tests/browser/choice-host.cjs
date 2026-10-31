const { app, BrowserWindow, protocol, net, ipcMain } = require("electron");
const { readFileSync } = require("node:fs");
const { join, extname } = require("node:path");
const { pathToFileURL } = require("node:url");
const base = process.env.CLOSE_FIXTURE_BASE;
if (!base) throw new Error("CLOSE_FIXTURE_BASE must point to a disposable fixture directory");
app.setPath("userData", join(base, process.env.CLOSE_PROFILE || "profile"));
protocol.registerSchemesAsPrivileged([{ scheme: "paseo", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.whenReady().then(async () => {
  app.dock?.hide();
  protocol.handle("paseo", request => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    return net.fetch(pathToFileURL(join(base, "app-dist", !path || !extname(path) ? "index.html" : path)).toString());
  });
  for (const name of ["paseo:get-pending-open-project", "paseo:agent-navigation:ready", "paseo:window:updateChrome", "paseo:window:setBadgeCount", "paseo:window:isMaximized", "paseo:window:isFullscreen", "paseo:menu:set-capturing-shortcut", "paseo:browser:set-shortcut-policy", "paseo:browser:set-workspace-active-browser"]) ipcMain.handle(name, () => null);
  ipcMain.handle("paseo:invoke", (_event, command) => {
    const home = join(base, "home");
    const pid = JSON.parse(readFileSync(join(home, "paseo.pid")));
    if (pid.listen !== "127.0.0.1:6812") throw new Error("Fixture host must use 6812");
    if (command === "desktop_daemon_status" || command === "start_desktop_daemon") return { ...pid, status: "running", home, version: "0.14.0", desktopManaged: true, ownedByDesktop: true };
    if (command === "desktop_local_credential") return readFileSync(join(home, "local-credential"), "utf8").trim();
    if (command === "get_local_daemon_version") return "0.14.0";
    return null;
  });
  ipcMain.handle("paseo:dialog:ask", () => false);
  const window = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: {
    preload: "/Applications/Paseo.app/Contents/Resources/app.asar/dist/preload.js", sandbox: true, contextIsolation: true,
  } });
  await window.loadURL("paseo://app/");
});

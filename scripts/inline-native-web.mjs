import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const dist = path.join(root, "dist");
const webApp = path.join(root, "native", "Shared", "WebApp");
const sourceIndex = path.join(dist, "index.html");

if (!fs.existsSync(sourceIndex)) {
  throw new Error(`dist/index.html is missing at ${sourceIndex}. Run the web build first.`);
}

fs.rmSync(webApp, { recursive: true, force: true });
fs.mkdirSync(webApp, { recursive: true });
fs.cpSync(dist, webApp, { recursive: true });

let html = fs.readFileSync(sourceIndex, "utf8");

const readLocalAsset = (url) => {
  const clean = url.replace(/^\.\//, "").replace(/^\//, "");
  const file = path.join(dist, clean);
  if (!fs.existsSync(file)) {
    throw new Error(`Native bundle asset not found: ${url} -> ${file}`);
  }
  return fs.readFileSync(file, "utf8");
};

html = html.replace(
  /<link\s+rel=["']stylesheet["']\s+crossorigin\s+href=["']([^"']+)["']\s*\/?\s*>/g,
  (_match, href) => `<style>\n${readLocalAsset(href)}\n</style>`
);

html = html.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?\s*>/g,
  (_match, href) => `<style>\n${readLocalAsset(href)}\n</style>`
);

html = html.replace(
  /<script\s+type=["']module["']\s+crossorigin\s+src=["']([^"']+)["']\s*><\/script>/g,
  (_match, src) => `<script type="module">\n${readLocalAsset(src)}\n</script>`
);

html = html.replace(
  /<script\s+type=["']module["']\s+src=["']([^"']+)["']\s*><\/script>/g,
  (_match, src) => `<script type="module">\n${readLocalAsset(src)}\n</script>`
);

// Native WKWebView does not need PWA metadata or external local-file resources.
html = html.replace(/<link\s+rel=["']manifest["'][^>]*>/g, "");
html = html.replace(/<link\s+rel=["']icon["'][^>]*>/g, "");
html = html.replace(/<link\s+rel=["']apple-touch-icon["'][^>]*>/g, "");
html = html.replace(/<script[^>]*id=["']vite-plugin-pwa:register-sw["'][^>]*><\/script>/g, "");
html = html.replace(/<script[^>]*src=["'][^"']*registerSW\.js["'][^>]*><\/script>/g, "");

if (/src=["'][^"']+["']/.test(html) || /rel=["']stylesheet["']/.test(html)) {
  throw new Error("Native index.html still contains an external script or stylesheet.");
}

fs.writeFileSync(path.join(webApp, "index.html"), html);

console.log(`Created self-contained native WebApp/index.html (${Buffer.byteLength(html)} bytes)`);

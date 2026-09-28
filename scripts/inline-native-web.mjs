import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname, "..");
const dist = path.join(root, "dist");
const webApp = path.join(root, "native", "Shared", "WebApp");
const sourceIndex = path.join(dist, "index.html");

if (!fs.existsSync(sourceIndex)) {
  throw new Error("dist/index.html is missing. Run the web build first.");
}

fs.rmSync(webApp, { recursive: true, force: true });
fs.mkdirSync(webApp, { recursive: true });
fs.cpSync(dist, webApp, { recursive: true });

let html = fs.readFileSync(sourceIndex, "utf8");

const readLocalAsset = (url) => {
  const clean = url.replace(/^\.\//, "").replace(/^\//, "");
  const file = path.join(dist, clean);
  if (!fs.existsSync(file)) {
    throw new Error(`Native bundle asset not found: ${url}`);
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

// The native shell does not use the PWA service worker or web manifest.
html = html.replace(/<link\s+rel=["']manifest["'][^>]*>/g, "");
html = html.replace(/<script[^>]*id=["']vite-plugin-pwa:register-sw["'][^>]*><\/script>/g, "");
html = html.replace(/<script[^>]*src=["'][^"']*registerSW\.js["'][^>]*><\/script>/g, "");

fs.writeFileSync(path.join(webApp, "index.html"), html);

console.log("Created self-contained native WebApp/index.html");

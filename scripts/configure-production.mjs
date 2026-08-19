import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const rawUrl = process.argv[2];
if (!rawUrl) {
  console.error("Usage: npm run production:configure -- https://your-domain.com");
  process.exit(1);
}

const productionUrl = new URL(rawUrl);
if (productionUrl.protocol !== "https:") throw new Error("Production URL must use HTTPS");
if (productionUrl.hostname.endsWith(".example")) throw new Error("Production URL cannot use a reserved .example domain");
productionUrl.pathname = "/";
productionUrl.search = "";
productionUrl.hash = "";

const root = process.cwd();
const configPath = path.join(root, "site.config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
config.siteUrl = productionUrl.href;
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
await runNode("scripts/build.mjs");
await runNode("scripts/check-build.mjs");

const generatedFiles = ["dist/index.html", "dist/sitemap.xml", "dist/robots.txt", "dist/feed.xml"];
for (const file of generatedFiles) {
  const content = await readFile(path.join(root, file), "utf8");
  if (content.includes(".example")) throw new Error(`${file} still contains a reserved .example URL`);
}

console.log(`Production URL configured: ${productionUrl.href}`);
console.log(`IndexNow key file: ${new URL(`/${config.indexNowKey}.txt`, productionUrl).href}`);
console.log("Next: deploy dist/, verify the domain in Google Search Console and Bing Webmaster Tools, then submit the sitemaps.");

function runNode(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)));
  });
}

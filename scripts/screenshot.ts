/**
 * Captures d'écran des pages de l'app (serveur local requis).
 * Usage : npm run screenshot -- [baseUrl]   → screenshots/*.png
 */
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const base = process.argv[2] ?? "http://localhost:3100";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pages: [string, string, number?][] = [
  ["questionnaire", "/"],
  ["knowledge", "/knowledge"],
  ["doc", "/knowledge/04-identity-access#audit-logs"],
  ["quality", "/evaluation"],
  ["questionnaire-mobile", "/", 390],
];

mkdirSync("screenshots", { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
for (const [name, path, width] of pages) {
  const page = await browser.newPage();
  await page.setViewport({ width: width ?? 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(base + path, { waitUntil: "networkidle0" });
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("screenshots/ ok");

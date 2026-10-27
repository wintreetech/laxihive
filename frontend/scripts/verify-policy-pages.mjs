import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Run against a running frontend: node scripts/verify-policy-pages.mjs [baseURL]
// The import script separately compares these paragraphs to the original DOCX XML.
const policies = JSON.parse(await readFile(new URL("../src/content/policies.json", import.meta.url), "utf8"));
const baseURL = process.argv[2] || "http://localhost:5174";
const browser = await chromium.launch({ channel: "chrome", headless: true });
let paragraphsChecked = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Public policies and contact details must work even during an API outage.
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Temporarily unavailable"}' }));
  for (const policy of policies) {
    await page.goto(new URL(policy.path, baseURL).href, { waitUntil: "domcontentloaded" });
    const paragraphs = page.locator(".policy-document [data-policy-source]");
    await paragraphs.last().waitFor();
    assert.deepEqual(await paragraphs.allTextContents(), policy.sourceText, `${policy.title}: all source paragraphs must match exactly`);
    assert(!/LAST UPDATED|27 October 2026/.test(await page.locator('.policy-document').innerText()), 'Requested policy date must not be published');
    assert.equal(await page.locator("main h1").textContent(), policy.title);
    assert.equal(await page.title(), `${policy.title} · LexiHive`);
    assert.equal(await page.locator('.footer-policies a[href="' + policy.path + '"]').count(), 1);
    assert.equal(await page.locator(".legal-review").count(), 0);
    paragraphsChecked += policy.sourceText.length;
    const contents = page.locator(".policy-contents");
    await contents.locator("summary").click();
    const firstSection = contents.locator("a").first();
    const target = await firstSection.getAttribute("href");
    await firstSection.click();
    assert.equal(new URL(page.url()).hash, target);
    assert(await page.locator(target).isVisible());
    console.log(`PASS ${policy.path}: ${policy.sourceText.length} exact paragraphs, title, footer link and section navigation`);
  }
  for (const width of [320, 375, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(new URL("/privacy", baseURL).href, { waitUntil: "domcontentloaded" });
    await page.locator(".policy-document-footer").waitFor();
    assert.deepEqual(await page.locator(".policy-document [data-policy-source]").allTextContents(), policies.find((item) => item.path === "/privacy").sourceText);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow at ${width}px`);
    for (const text of ["KYMORA DIGITAL LTD", "16889468", "England and Wales", "115-116 Spon End, Coventry, West Midlands, England, CV1 3HF"]) {
      assert((await page.locator(".site-footer").innerText()).includes(text), `Missing footer company information at ${width}px: ${text}`);
    }
    assert(await page.locator('.site-footer a[href="tel:+447874402826"]').isVisible());
    assert(await page.locator('.site-footer a[href="mailto:support@lexihive.com"]').isVisible());
    assert(await page.locator('.site-footer a[href="http://www.lexihive.com"]').isVisible());
    assert.equal(await page.locator(".footer-policies a").count(), 9);
    await page.locator('.footer-payments img').scrollIntoViewIfNeeded();
    await page.locator('.footer-payments img').evaluate((img) => img.decode());
    assert(await page.locator('.footer-payments img').evaluate((img) => img.complete && img.naturalWidth > 0));
    console.log(`PASS ${width}px: readable document, complete company footer, eight policy links and payment image; no horizontal overflow`);
  }
  await page.goto(new URL("/policies", baseURL).href, { waitUntil: "domcontentloaded" });
  await page.locator(".policy-cards").waitFor();
  assert.deepEqual(await page.locator(".policy-cards > a").evaluateAll((links) => links.map((link) => link.getAttribute("href"))), policies.map((policy) => policy.path));
  await page.goto(new URL("/contact", baseURL).href, { waitUntil: "domcontentloaded" });
  await page.locator(".contact-card").waitFor();
  assert(await page.locator('.contact-card a[href="mailto:support@lexihive.com"]').isVisible(), "Contact email must be available during API outage");
  await page.goto(new URL("/terms", baseURL).href, { waitUntil: "domcontentloaded" });
  await page.locator(".policy-document").waitFor();
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".topbar").isVisible(), false);
  assert.equal(await page.locator(".site-footer").isVisible(), false);
  assert.equal(await page.locator(".policy-navigation").isVisible(), false);
  assert(await page.locator(".policy-document").isVisible());
  assert.deepEqual(await page.locator(".policy-document [data-policy-source]").allTextContents(), policies.find((policy) => policy.path === "/terms").sourceText);
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(`PASS all ${policies.length} policies, ${paragraphsChecked} exact paragraphs; hub, contact fallback, print and no browser runtime errors`);
} finally {
  await browser.close();
}

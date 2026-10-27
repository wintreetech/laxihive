import { test, expect } from "@playwright/test";

test("theme defaults to light, toggles by keyboard and survives navigation and reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const toggle = page.getByRole("button", { name: "Switch to dark mode" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0b101b",
  );
  expect(await page.evaluate(() => localStorage.getItem("lexi-theme"))).toBe(
    "dark",
  );
  await page.goto("/privacy");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f8f8f5",
  );
});

test("saved appearance loads before the app and synchronizes between tabs", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("lexi-theme", "dark");
  });
  await page.goto("/games");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const other = await context.newPage();
  await other.goto("/contact");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await other.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  await other.close();
});

test("theme toggle still works when browser storage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "lexi-theme")
        throw new DOMException("Storage blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "lexi-theme")
        throw new DOMException("Storage blocked", "SecurityError");
      return set.call(this, key, value);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

test("both palettes keep the header controls visible and public pages within mobile and desktop widths", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.goto("/");
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", { name: `Switch to ${theme} mode` })
          .click();
      for (const route of ["/", "/games", "/store", "/signup", "/privacy"]) {
        await page.goto(route);
        await expect(
          page.getByRole("button", {
            name: `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
          }),
        ).toBeVisible();
        const layout = await page.locator(".topbar").evaluate((header) => {
          const boxes = [
            header.querySelector(".topbar-left"),
            ...header.querySelectorAll(".topbar-actions > *"),
          ]
            .filter(
              (node): node is HTMLElement =>
                node instanceof HTMLElement && node.getClientRects().length > 0,
            )
            .map((node) => node.getBoundingClientRect());
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            controlsFit: boxes.every(
              (box) => box.left >= 0 && box.right <= innerWidth,
            ),
            overlap: boxes.some(
              (box, index) =>
                index > 0 && box.left < boxes[index - 1].right - 1,
            ),
            light:
              getComputedStyle(document.documentElement).colorScheme ===
              "light",
          };
        });
        expect(layout.overflow, `${route}, ${theme}, ${width}px`).toBe(false);
        expect(layout.controlsFit, `header controls, ${width}px`).toBe(true);
        expect(layout.overlap, `header overlap, ${width}px`).toBe(false);
        expect(layout.light).toBe(theme === "light");
      }
    }
  }
});

import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { solve } from "../../backend/shared/solve.fixture";
const origin = "http://localhost:5185";
async function signIn(context: APIRequestContext, email: string) {
  expect((await context.get("/api/__fixture")).ok()).toBe(true);
  const marker = await (await context.get("/api/__fixture")).json();
  expect(marker.database).toBe("lexihive_browser_test");
  const current = await (await context.get("/api/auth/session")).json();
  if (current.user?.email === email) return current;
  const response = await context.post("/api/auth/login", {
    headers: {
      Origin: origin,
      ...(current.csrf ? { "X-CSRF-Token": current.csrf } : {}),
    },
    data: { email, password: "browser fixture password" },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function publish(context: APIRequestContext, slug: string, free = false) {
  const session = await signIn(context, "admin@fixture.invalid");
  const current = await (await context.get(`/api/games/${slug}`)).json();
  const response = await context.put(
    `/api/admin/game-pricing/${slug}/starter`,
    {
      headers: { Origin: origin, "X-CSRF-Token": session.csrf },
      data: {
        config: {
          accessType: free ? "FREE_FULL" : "FREE_TRIAL_THEN_PAID",
          coinPrice: free ? 0 : 50,
          trialSeconds: 30,
          sessionSeconds: 600,
          active: true,
        },
        publish: true,
        expectedVersion: current.access.version,
        reason: "Isolated browser pricing fixture",
      },
    },
  );
  expect(response.ok()).toBe(true);
}
async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
}
test("30-second preview pauses without charging; explicit purchase survives refresh and saves a result", async ({
  page,
  playwright,
}) => {
  const admin = await playwright.request.newContext({
    baseURL: origin,
    timeout: 10000,
  });
  await publish(admin, "word-search");
  try {
    await signIn(page.request, "player@fixture.invalid");
    const before = await (await page.request.get("/api/wallet")).json();
    await page.goto("/games/word-search");
    await expect(page.locator(".access-explainer")).toContainText(
      "30s free preview",
    );
    await page.getByRole("button", { name: "Try free for 30 seconds" }).click();
    await expect(page.locator(".game-scorebar")).toContainText(
      "Practice preview",
    );
    await expect(
      page.getByRole("dialog", { name: "Game session access" }),
    ).toBeVisible({ timeout: 35000 });
    await expect(
      page.getByRole("heading", { name: "Your free trial has ended." }),
    ).toBeVisible();
    expect((await (await page.request.get("/api/wallet")).json()).balance).toBe(
      before.balance,
    );
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Continue for 50 coins" }).click();
    await expect(page.locator(".session-gate")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/wallet")).json()).balance,
      )
      .toBe(before.balance - 50);
    await page.reload();
    await expect(page.locator(".game-board-wrap")).toBeVisible();
    const saved = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(
        (k) =>
          k.startsWith("lexi-attempt:") && k.endsWith(":word-search:starter"),
      );
      return JSON.parse(localStorage.getItem(key!)!);
    });
    const record = await (
      await page.request.get(`/api/games/word-search/sessions/${saved.id}`)
    ).json();
    expect(record.coinPrice).toBe(50);
    expect((await (await page.request.get("/api/wallet")).json()).balance).toBe(
      before.balance - 50,
    );
    await page.waitForTimeout(2100);
    for (const action of solve("word-search", record.seed)) {
      if (action.type === "select")
        await page
          .locator(".game-grid button")
          .nth(Number(action.value))
          .click();
      if (action.type === "submit")
        await page
          .getByRole("button", { name: "Check word", exact: true })
          .click();
    }
    await expect(page.locator(".save-status")).toContainText(
      "Your progress is saved to your account.",
    );
    const tx = await (
      await page.request.get("/api/wallet/transactions")
    ).json();
    expect(
      tx.filter((r: any) => r.reference === `game-session:${saved.id}`),
    ).toHaveLength(1);
  } finally {
    try {
      await publish(admin, "word-search", true);
    } finally {
      await admin.dispose();
    }
  }
});
test("admin user details and wallet adjustment show the recorded balance", async ({
  page,
}) => {
  await signIn(page.request, "admin@fixture.invalid");
  await page.goto("/admin?tab=users");
  await page
    .getByLabel("Search", { exact: true })
    .fill("player@fixture.invalid");
  await page.getByRole("button", { name: "View user", exact: true }).click();
  await page.getByRole("button", { name: "Adjust coins", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "USER browser fixture's wallet" }),
  ).toBeVisible();
  await page.getByLabel("Coins", { exact: true }).fill("50");
  await page
    .getByLabel("Mandatory reason")
    .fill("Browser support adjustment test");
  await expect(page.getByText(/Preview:.*Change: \+50 coins/)).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Confirm recorded adjustment" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Audited adjustment recorded.",
  );
  await page
    .getByRole("button", { name: "Wallet transactions", exact: true })
    .click();
  await page
    .getByLabel("Search", { exact: true })
    .fill("Browser support adjustment test");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("+50");
});
test("admin pricing drafts do not charge until explicitly published", async ({
  page,
  playwright,
}) => {
  const admin = await playwright.request.newContext({
    baseURL: origin,
    timeout: 10000,
  });
  try {
    await signIn(page.request, "admin@fixture.invalid");
    await page.goto("/admin?tab=game-pricing");
    const card = page.locator(".admin-content > .panel").filter({
      has: page.getByRole("heading", { name: "Hive Lock", exact: true }),
    });
    const mode = card.locator(".pricing-mode").first();
    await mode
      .getByRole("combobox", { name: "Access type", exact: true })
      .selectOption("FREE_TRIAL_THEN_PAID");
    await mode.getByLabel("Coin price", { exact: true }).fill("75");
    await mode
      .getByLabel("Reason", { exact: true })
      .fill("Browser review of draft prices");
    await mode.getByRole("button", { name: "Save unpublished draft" }).click();
    await expect(page.getByRole("status")).toContainText("Saved and recorded");
    expect(
      (await (await page.request.get("/api/games/hive-lock")).json()).access
        .accessType,
    ).toBe("FREE_FULL");
    page.on("dialog", (dialog) => dialog.accept());
    await mode
      .getByLabel("Reason", { exact: true })
      .fill("Approved browser fixture publication");
    await mode.getByRole("button", { name: "Publish this mode" }).click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/games/hive-lock")).json()).access
            .coinPrice,
      )
      .toBe(75);
  } finally {
    try {
      await publish(admin, "hive-lock", true);
    } finally {
      await admin.dispose();
    }
  }
});
test("admin and player navigation remain reachable on narrow, short and zoom-equivalent layouts", async ({
  page,
}) => {
  await signIn(page.request, "admin@fixture.invalid");
  for (const width of [320, 375, 768, 1024, 1366, 683]) {
    await page.setViewportSize({ width, height: width === 683 ? 384 : 600 });
    await page.goto("/admin?tab=users");
    await expect(
      page.getByRole("heading", { name: "Manage your platform." }),
    ).toBeVisible();
    expect(await overflow(page), `admin overflow at ${width}`).toBe(false);
    const mobile = page.getByRole("button", { name: "Open navigation" });
    if (await mobile.isVisible()) await mobile.click();
    const sidebar = page.locator(".sidebar");
    await sidebar
      .getByRole("button", { name: "Log out", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      sidebar.getByRole("button", { name: "Log out", exact: true }),
    ).toBeVisible();
    if (await mobile.isVisible())
      await sidebar
        .getByRole("button", { name: "Close navigation", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Site settings", exact: true })
      .scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: "Site settings", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Public support settings" }),
    ).toBeVisible();
    expect(await overflow(page)).toBe(false);
    for (const route of ["/wallet", "/games/number-rush"]) {
      await page.goto(route);
      await expect(page.locator("#main h1")).toBeVisible();
      await page.waitForTimeout(100);
      expect(await overflow(page), `${route} overflow at ${width}`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 1366, height: 600 });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Manage your platform." })).toBeVisible();
  await expect(page.locator(".admin-metrics strong").first()).toBeVisible();
  await page.screenshot({ path: "../backend/.local/admin-platform.png", fullPage: true });
});

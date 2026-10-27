import { test, expect, type APIRequestContext } from "@playwright/test";
const origin = "http://localhost:5185";
async function login(
  context: APIRequestContext,
  email = "admin@fixture.invalid",
) {
  expect((await (await context.get("/api/__fixture")).json()).database).toBe(
    "lexihive_browser_test",
  );
  const session = await (await context.get("/api/auth/session")).json();
  if (session.user?.email === email) return session;
  const r = await context.post("/api/auth/login", {
    headers: {
      Origin: origin,
      ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
    },
    data: { email, password: "browser fixture password" },
  });
  expect(r.ok()).toBe(true);
  return r.json();
}
test("desktop sidebar collapses, persists, exposes tooltips and leaves all admin sections reachable", async ({
  page,
}) => {
  await login(page.request);
  await page.setViewportSize({ width: 1366, height: 650 });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Manage your platform." }),
  ).toBeVisible();
  const before = await page.locator(".workspace").boundingBox();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(page.locator(".app-layout")).toHaveClass(/is-collapsed/);
  await page.waitForTimeout(250);
  expect(
    (await page.locator(".workspace").boundingBox())!.width,
  ).toBeGreaterThan(before!.width + 100);
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "All games", exact: true })
    .focus();
  await expect(page.getByRole("tooltip")).toHaveText("All games");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse administration menu", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Expand administration menu",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Site settings", exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Site settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Public support settings" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand administration menu", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await page.setViewportSize({ width: 1366, height: 400 });
  const help = page
    .locator(".sidebar")
    .getByRole("link", { name: "Help & feedback", exact: true });
  await help.scrollIntoViewIfNeeded();
  await expect(help).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  for (const width of [683, 1366]) {
    await page.setViewportSize({ width, height: 650 });
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Manage your platform." }),
    ).toBeVisible();
    if (width === 1366) {
      const workspace = await page.locator(".workspace").boundingBox();
      const navigation = await page.locator(".sidebar").boundingBox();
      expect(workspace!.x).toBeGreaterThanOrEqual(
        navigation!.x + navigation!.width - 1,
      );
      await page.screenshot({
        path: "../backend/.local/admin-platform.png",
        fullPage: true,
      });
    }
  }
});
test("mobile drawer traps focus, dismisses with Escape and backdrop, and closes after navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 640 });
  await page.goto("/");
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await toggle.click();
  const drawer = page.getByRole("dialog", { name: "Site navigation" });
  await expect(drawer).toBeVisible();
  expect(
    await page.locator(".workspace").evaluate((el) => el.hasAttribute("inert")),
  ).toBe(true);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(
      await drawer.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.locator(".nav-scrim").click({ position: { x: 365, y: 300 } });
  await expect(
    page.getByRole("dialog", { name: "Site navigation" }),
  ).toHaveCount(0);
  await toggle.click();
  await page
    .getByRole("dialog", { name: "Site navigation" })
    .getByRole("link", { name: "All games", exact: true })
    .click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(
    page.getByRole("dialog", { name: "Site navigation" }),
  ).toHaveCount(0);
});
test("footer card-brand image loads without overflow on narrow and desktop screens", async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/contact");
    const image = page.getByRole("img", {
      name: "Visa and Mastercard",
      exact: true,
    });
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((el: HTMLImageElement) => el.decode());
    expect(
      await image.evaluate((el: HTMLImageElement) => el.naturalWidth),
    ).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});
test("optional email signup reaches checkout without falsely verifying the account; reenabling restores the gate", async ({
  page,
}) => {
  await page.request.post("/api/__fixture/account-policy", {
    headers: { "X-Lexihive-Fixture": "launch-policy-tests" },
    data: { required: false },
  });
  try {
    await page.goto("/signup");
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Optional email QA");
    await page
      .getByLabel("Email address")
      .fill(`optional-${Date.now()}@fixture.invalid`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("optional browser password");
    await page.getByLabel("Confirm password").fill("optional browser password");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Create your free account" })
      .click();
    await expect(
      page.getByRole("heading", { name: /Good to see you/ }),
    ).toBeVisible();
    await expect(page.locator(".verification-banner")).toHaveCount(0);
    await page.goto("/store?currency=EUR&amount=500");
    await expect(
      page.getByRole("button", { name: /Review coins/ }),
    ).toBeEnabled();
    await expect(
      page.getByText("Verify your email to continue", { exact: true }),
    ).toHaveCount(0);
    const session = await (await page.request.get("/api/auth/session")).json();
    expect(session.user.verified).toBe(false);
    await page.request.post("/api/__fixture/account-policy", {
      headers: { "X-Lexihive-Fixture": "launch-policy-tests" },
      data: { required: true },
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Review coins/ }),
    ).toBeDisabled();
    await expect(
      page.getByText("Verify your email to continue", { exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.post("/api/__fixture/account-policy", {
      headers: { "X-Lexihive-Fixture": "launch-policy-tests" },
      data: { required: true },
    });
  }
});
test("two administrator browsers review one evidenced settlement and credit its customer once", async ({
  page,
  browser,
}) => {
  const customer = await browser.newContext({ baseURL: origin }),
    second = await browser.newContext({ baseURL: origin });
  try {
    const cs = await login(customer.request, "player@fixture.invalid");
    const before = await (await customer.request.get("/api/wallet")).json();
    const headers = { Origin: origin, "X-CSRF-Token": cs.csrf };
    const quote = await (
      await customer.request.post("/api/coins/quote", {
        headers,
        data: { currency: "EUR", cents: 500 },
      })
    ).json();
    const init = await customer.request.post("/api/payments/init", {
      headers,
      data: { quoteId: quote.id },
    });
    expect(init.ok()).toBe(true);
    const payments = await (await customer.request.get("/api/payments")).json();
    const order = payments.find(
      (p: any) => p.status === "pending" && p.coins === quote.coins,
    );
    expect(order).toBeTruthy();
    await login(page.request);
    await page.goto("/admin?tab=payments");
    const row = page.getByRole("row").filter({ hasText: order.id });
    await row.getByText("Review external settlement", { exact: true }).click();
    await row
      .getByLabel("External transaction / settlement reference")
      .fill(`browser-evidence-${Date.now()}`);
    await row
      .getByLabel("Evidence document reference")
      .fill("merchant-statement:browser-fixture-only");
    await row
      .getByLabel("Evidence and order matching explanation")
      .fill(
        "Merchant fixture statement matches the exact customer, amount and currency.",
      );
    await row
      .getByLabel("Administrator password", { exact: true })
      .fill("browser fixture password");
    await row.getByRole("checkbox").check();
    await row
      .getByRole("button", { name: "Submit for independent review" })
      .click();
    await expect(row).toContainText("waiting for independent approval");
    await login(second.request, "reviewer@fixture.invalid");
    const reviewer = await second.newPage();
    await reviewer.goto("/admin?tab=settlement-reviews");
    const review = reviewer.getByRole("row").filter({ hasText: order.id });
    await review
      .getByText("Independently review evidence", { exact: true })
      .click();
    await review
      .getByLabel("Independent review explanation")
      .fill(
        "Independently checked the fixture merchant settlement and matching order details.",
      );
    await review
      .getByLabel("Administrator password", { exact: true })
      .fill("browser fixture password");
    await review.getByRole("checkbox").check();
    await review
      .getByRole("button", { name: "Confirm independent decision" })
      .click();
    await expect(review).toContainText("APPROVED");
    const after = await (await customer.request.get("/api/wallet")).json();
    expect(after.balance).toBe(before.balance + quote.coins);
    const status = await (
      await customer.request.get(`/api/payments/${order.id}/status`)
    ).json();
    expect(status.fulfillmentSource).toBe("MANUAL_SETTLEMENT");
    expect(status.gatewayVerifiedAt).toBeNull();
  } finally {
    await Promise.allSettled([customer.close(), second.close()]);
  }
});
test("success page does not claim credit from a status label without fulfillment confirmation", async ({
  page,
}) => {
  await login(page.request, "player@fixture.invalid");
  const before = await (await page.request.get("/api/wallet")).json();
  let credited = false;
  await page.route("**/api/payments/display-only-fixture/status", (route) =>
    route.fulfill({
      json: {
        id: "display-only-fixture",
        status: "paid",
        credited,
        coins: 500,
        cents: 500,
        currency: "eur",
        provider: "transactworld",
        canReconcile: false,
        fulfillmentSource: credited ? "MANUAL_SETTLEMENT" : null,
      },
    }),
  );
  await page.goto("/purchase/success?payment=display-only-fixture");
  await expect(
    page.getByRole("heading", { name: "Waiting for payment verification." }),
  ).toBeVisible();
  await expect(
    page.getByText("paid · fulfillment unverified", { exact: true }),
  ).toBeVisible();
  credited = true;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your next adventure is funded." }),
  ).toBeVisible();
  await expect(
    page.getByText(/an independently approved settlement review/),
  ).toBeVisible();
  expect((await (await page.request.get("/api/wallet")).json()).balance).toBe(
    before.balance,
  );
});

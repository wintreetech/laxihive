import { test, expect } from "@playwright/test";
test("guest discovery, real Number Rush gameplay, and device record", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Train your mind/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Explore games", exact: true })
    .first()
    .click();
  await expect(page.locator(".game-card")).toHaveCount(20);
  await page.getByRole("textbox", { name: "Search games" }).fill("Number Rush");
  await expect(page.locator(".game-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Play Number Rush" }).click();
  await page.getByRole("button", { name: /Let’s play/ }).click();
  for (let i = 1; i <= 16; i++)
    await page
      .locator(".game-grid")
      .getByRole("button", { name: String(i), exact: true })
      .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Look at you go." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("lexi-progress") || "[]").length,
    ),
  ).toBeGreaterThan(0);
});
test("signup, persisted session, dashboard, settings, store slider, logout", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Display name", { exact: true }).fill("Browser player");
  await page
    .getByLabel("Email address")
    .fill(`browser-${Date.now()}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a secure browser password");
  await page.getByLabel("Confirm password").fill("a secure browser password");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create your free account" }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
  await page.goto("/games/number-rush");
  await page.getByRole("button", { name: /Let.s play/ }).click();
  // The real API rejects impossibly short sessions; exercise an actual timed attempt.
  await page.waitForTimeout(2100);
  for (let i = 1; i <= 16; i++)
    await page
      .locator(".game-grid")
      .getByRole("button", { name: String(i), exact: true })
      .click();
  await expect(page.locator(".save-status")).toContainText(
    "saved to your account",
  );
  await page.goto("/dashboard");
  await expect(page.locator(".personal-bests")).toContainText("Number Rush");
  await expect(page.locator(".player-level")).toContainText("40 XP");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
  await page.goto("/store");
  const review = page.getByRole("button", { name: /Review coins/ });
  await expect(review).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send verification link" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Payment currency" })
    .selectOption("USD");
  const slider = page.getByRole("slider", {
    name: "Purchase amount in US dollars",
  });
  await slider.fill("10000");
  await expect(page.locator(".slider-amounts")).toContainText("$100.00");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("10500");
  await expect(page.locator(".slider-amounts")).toContainText("$105.00");
  await page.goto("/settings");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Curious browser");
  await page.getByRole("button", { name: "Save my profile" }).click();
  await expect(page.locator(".toast")).toContainText("up to date");
  await page.getByRole("button", { name: "Sign out of this device" }).click();
  await expect(
    page.getByRole("heading", { name: "A little space of your own." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => /token|password|session/i.test(k)),
    ),
  ).toBe(false);
});
test("Transactworld hosted form submits only generated fields by POST", async ({
  page,
}) => {
  await page.goto("/store");
  await page.route(
    "https://sandbox.transactworld.com/transaction/Checkout",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Hosted gateway test transport</h1>",
      }),
  );
  const captured = page.waitForRequest(
    "https://sandbox.transactworld.com/transaction/Checkout",
  );
  await page.evaluate(async () => {
    // Test only the browser form handoff. No charge or fake success is performed.
    const module = await import("/src/lib/checkout.ts");
    module.submitGatewayForm({
      forwardUrl: "https://sandbox.transactworld.com/transaction/Checkout",
      paymentData: {
        memberId: "test",
        amount: "25.00",
        currency: "USD",
        merchantTransactionId: "fixture",
        checksum: "fixture-signature",
      },
    });
  });
  const submitted = await captured;
  expect(submitted.method()).toBe("POST");
  const fields = new URLSearchParams(submitted.postData() || "");
  expect(fields.get("amount")).toBe("25.00");
  expect(fields.get("currency")).toBe("USD");
  expect(fields.has("WORKING_KEY")).toBe(false);
});
test("coin store switches between USD and EUR prices on mobile and desktop", async ({
  page,
}) => {
  await page.goto("/store?currency=EUR");
  await expect(
    page.getByRole("combobox", { name: "Payment currency" }),
  ).toHaveValue("EUR");
  await expect(page.locator(".slider-amounts")).toContainText("€25.00");
  await expect(
    page.getByRole("slider", { name: "Purchase amount in euros" }),
  ).toHaveValue("2500");
  await page
    .getByRole("combobox", { name: "Payment currency" })
    .selectOption("USD");
  await expect(page.locator(".slider-amounts")).toContainText("$25.00");
  await expect(
    page.getByRole("slider", { name: "Purchase amount in US dollars" }),
  ).toHaveValue("2500");
  await page
    .getByRole("combobox", { name: "Payment currency" })
    .selectOption("EUR");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Sign in to buy coins" }).click();
  expect(new URL(page.url()).searchParams.get("redirect")).toContain(
    "currency=EUR",
  );
});
test("every game starts with working controls and instructions", async ({
  page,
}) => {
  const slugs = [
    "hive-quest",
    "orbit-recall",
    "number-rush",
    "daily-hive",
    "word-scramble",
    "word-guess",
    "memory-match",
    "word-search",
    "letter-rescue",
    "word-ladder",
    "missing-letters",
    "synonym-match",
    "odd-one-out",
    "category-shuffle",
    "number-trail",
    "code-breaker",
    "word-blitz",
    "sequence-surge",
    "hive-lock",
    "slide-rush",
  ];
  for (const slug of slugs) {
    await page.goto(`/games/${slug}`);
    await expect(
      page.getByRole("heading", { name: "How to play" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Let’s play/ }).click();
    await expect(page.locator(".game-scorebar")).toBeVisible();
    await expect(page.locator(".game-board-wrap")).toBeVisible();
    expect(
      await page
        .locator(".game-board-wrap button,.game-board-wrap input")
        .count(),
    ).toBeGreaterThan(0);
  }
});
for (const width of [320, 375, 430, 768, 1024, 1440, 1920])
  test(`responsive layouts at ${width}px have no page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    for (const route of [
      "/",
      "/games",
      "/store",
      "/signup",
      "/games/number-rush",
      "/daily",
      "/leaderboards",
      "/expansions",
      "/privacy",
    ]) {
      await page.goto(route);
      await page.locator("#main").waitFor();
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      expect(overflow, `${route} overflows at ${width}px`).toBe(false);
    }
    if (width === 1440) {
      await page.goto("/");
      await page.screenshot({
        path: "../backend/.local/home-desktop.png",
        fullPage: true,
      });
    }
    if (width === 375) {
      await page.goto("/");
      await page.screenshot({ path: "../backend/.local/home-mobile.png", fullPage: true });
    }
  });

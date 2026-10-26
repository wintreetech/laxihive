import { test, expect } from "@playwright/test";

test("local email verification returns to EUR checkout and opens the hosted form", async ({
  page,
}) => {
  await page.goto("/signup");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Verification QA");
  await page
    .getByLabel("Email address")
    .fill(`verify-qa-${Date.now()}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a local verification password");
  await page
    .getByLabel("Confirm password")
    .fill("a local verification password");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create your free account" }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
  await page.goto("/store?amount=500&currency=EUR");
  await expect(
    page.getByRole("button", { name: /Review coins/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Send verification link" }).click();
  await page.getByRole("button", { name: "Verify my email" }).click();
  await expect(page.locator(".auth-success")).toContainText(
    "Your email is verified",
  );
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("currency")).toBe("EUR");
  expect(new URL(page.url()).searchParams.get("amount")).toBe("500");
  await expect(
    page.getByRole("button", { name: /Review coins/ }),
  ).toBeEnabled();
  const gateway =
    /^https:\/\/(secure|sandbox)\.transactworld\.com\/transaction\/Checkout$/;
  await page.route(gateway, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Local hosted-form verification</h1>",
    }),
  );
  await page.getByRole("button", { name: /Review coins/ }).click();
  await expect(page.locator(".quote-summary")).toContainText("€5.00");
  const submitted = page.waitForRequest(gateway);
  await page.getByRole("button", { name: /Continue to Transactworld/ }).click();
  const request = await submitted;
  expect(request.method()).toBe("POST");
  const fields = new URLSearchParams(request.postData() || "");
  expect(fields.get("currency")).toBe("EUR");
  expect(fields.get("amount")).toBe("5.00");
  expect(fields.has("accountid")).toBe(false);
  expect(fields.get("paymentType")).toBe("DB");
  expect(fields.get("paymentMode")).toBe("CC");
  expect(fields.get("paymentBrand")).toBe("VISA");
  expect(fields.has("WORKING_KEY")).toBe(false);
});

test("store defaults to an available merchant currency and guards unavailable checkout", async ({
  page,
}) => {
  await page.goto("/store");
  const config = await (await page.request.get("/api/coins/config")).json();
  const defaultCurrency = config.currencies.includes("USD")
    ? "USD"
    : config.currencies[0];
  await expect(
    page.getByRole("combobox", { name: "Payment currency" }),
  ).toHaveValue(defaultCurrency);
  if (!config.currencies.includes("USD")) {
    await page
      .getByRole("combobox", { name: "Payment currency" })
      .selectOption("USD");
    await expect(page.getByRole("status")).toContainText(
      "USD checkout is currently unavailable",
    );
    await expect(
      page.getByRole("button", { name: "Sign in to buy coins" }),
    ).toBeDisabled();
    await page
      .getByRole("combobox", { name: "Payment currency" })
      .selectOption(defaultCurrency);
    await expect(
      page.getByRole("button", { name: "Sign in to buy coins" }),
    ).toBeEnabled();
  }
});

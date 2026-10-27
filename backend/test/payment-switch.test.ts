import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { initTransactworld } from "../src/controllers/transactworld.controller.js";
import { HttpError } from "../src/config/database.js";

test("checkout switch blocks orders independently of credentials and cannot bypass missing merchant settings", async () => {
  const settings = {
    NODE_ENV: "test",
    PAYMENTS_ENABLED: "false",
    TW_ENVIRONMENT: "sandbox",
    PUBLIC_API_URL: "http://localhost:4000",
    MEMBER_ID: "test-merchant",
    WORKING_KEY: "test-only-working-key",
    TW_AUTH_TOKEN: "test-token",
    TW_SUPPORTED_CURRENCIES: "USD,EUR",
    REQUIRE_EMAIL_VERIFICATION: "false",
    MERCHANT_REDIRECT_URL: "",
    NOTIFICATION_URL: "",
  };
  const previous = Object.fromEntries(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  const req = {
    auth: { userId: "test-user", verified: true },
    body: {},
  } as unknown as Request;
  const res = {} as Response;
  try {
    Object.assign(process.env, settings);
    const unavailable = (error: unknown) =>
      error instanceof HttpError && error.status === 503;
    await assert.rejects(initTransactworld(req, res), unavailable);
    delete process.env.PAYMENTS_ENABLED;
    await assert.rejects(initTransactworld(req, res), unavailable);
    process.env.PAYMENTS_ENABLED = "true";
    process.env.MEMBER_ID = "";
    process.env.WORKING_KEY = "";
    await assert.rejects(initTransactworld(req, res), unavailable);
    Object.assign(process.env, settings, { PAYMENTS_ENABLED: "true" });
    // Once enabled and configured, request validation is reached; no database or gateway request is made.
    await assert.rejects(
      initTransactworld(req, res),
      (error: unknown) => error instanceof ZodError,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

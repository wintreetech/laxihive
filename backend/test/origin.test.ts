import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { csrf } from "../src/middleware/auth.middleware.js";

test("Origin validation honors a changed frontend port and rejects other origins", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://localhost:5174";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const app = express();
  app.use(csrf);
  app.post("/signup", (_req, res) => res.sendStatus(204));
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.status || 500).json({ message: error.message });
    },
  );
  assert.equal(
    (await request(app).post("/signup").set("Origin", "http://localhost:5174"))
      .status,
    204,
  );
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "https://attacker.invalid",
    "null",
  ]) {
    assert.equal(
      (await request(app).post("/signup").set("Origin", origin)).status,
      403,
      origin,
    );
  }
  assert.equal((await request(app).post("/signup")).status, 403);
});

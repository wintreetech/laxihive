import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
// @ts-expect-error JavaScript launcher deliberately has no generated declarations.
import { checkDevServer } from "../scripts/dev-ports.mjs";

test("development launcher reuses LexiHive and rejects unrelated occupied ports", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok", service: "lexihive-frontend" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal(await checkDevServer(origin, "frontend"), "running");
    await assert.rejects(checkDevServer(origin, "backend"), /occupied/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  assert.equal(await checkDevServer(origin, "frontend"), "available");
});

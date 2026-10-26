import { createServer } from "node:net";

export async function checkDevServer(origin, kind) {
  const url = new URL(origin);
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  const occupied = () =>
    new Error(
      `Port ${port} is occupied by another process or an unhealthy server. Stop the terminal using it, then retry. Frontend address: APP_ORIGIN; API port: PORT in backend/.env.`,
    );
  let answered = false;
  try {
    const response = await fetch(
      new URL(kind === "frontend" ? "/__lexihive_dev" : "/api/health", origin),
      { signal: AbortSignal.timeout(3000) },
    );
    answered = true;
    const body = await response.json();
    if (
      response.ok &&
      body.service === `lexihive-${kind}` &&
      body.status === "ok"
    )
      return "running";
  } catch (error) {
    if (error.name === "TimeoutError") answered = true;
  }
  if (answered) throw occupied();
  const available = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (["EADDRINUSE", "EACCES"].includes(error.code)) resolve(false);
      else reject(error);
    });
    // Match the API's IPv4 wildcard binding; localhost may otherwise probe only ::1.
    probe.listen(port, kind === "backend" ? "0.0.0.0" : url.hostname, () =>
      probe.close(() => resolve(true)),
    );
  });
  if (available) return "available";
  // An occupied port is never silently reassigned: that would break auth/callback URLs.
  throw occupied();
}

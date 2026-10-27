import { createHash } from "node:crypto";
import { assert, HttpError } from "../config/database.js";

type Credentials = {
  memberId: string;
  workingKey: string;
  origin: string;
  authToken: string;
};

// The merchant authentication API issues one-hour tokens. Keep them only in memory
// and refresh early; never expose them or persist the merchant secret in a cache key.
export function createGatewayTokenManager(
  fetcher: typeof fetch = (...args) => fetch(...args),
  now = Date.now,
) {
  const cache = new Map<
    string,
    { token?: string; expiresAt: number; pending?: Promise<string> }
  >();
  return async (credentials: Credentials, refresh = false): Promise<string> => {
    if (credentials.authToken.trim()) return credentials.authToken.trim();
    assert(
      credentials.memberId.trim() && credentials.workingKey.trim(),
      503,
      "Merchant credentials are not configured.",
    );
    assert(
      [
        "https://secure.transactworld.com",
        "https://sandbox.transactworld.com",
      ].includes(credentials.origin),
      503,
      "Invalid payment gateway origin.",
    );
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          credentials.origin,
          credentials.memberId,
          credentials.workingKey,
        ]),
      )
      .digest("hex");
    const cached = cache.get(key);
    if (cached?.pending) return cached.pending;
    if (!refresh && cached?.token && cached.expiresAt > now())
      return cached.token;
    const row: {
      token?: string;
      expiresAt: number;
      pending?: Promise<string>;
    } = { expiresAt: 0 };
    cache.set(key, row);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    row.pending = (async () => {
      try {
        const response = await fetcher(
          `${credentials.origin}/transactionServices/REST/v1/authToken`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              "authentication.memberId": credentials.memberId,
              "authentication.sKey": credentials.workingKey,
            }),
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          },
        );
        assert(
          response.ok,
          503,
          "Payment gateway authentication is unavailable.",
        );
        const data = await response.json().catch(() => null);
        const token = data?.AuthToken ?? data?.authToken;
        assert(
          typeof token === "string" &&
            /^[A-Za-z0-9._~+/-]+=*$/.test(token) &&
            token.length <= 8192,
          503,
          "Payment gateway did not issue an authentication token.",
        );
        row.token = token;
        row.expiresAt = now() + 55 * 60000;
        return token;
      } catch {
        if (cache.get(key) === row) cache.delete(key);
        // Do not include provider response bodies, supplied keys or returned tokens in errors.
        throw new HttpError(
          503,
          "Payment verification is temporarily unavailable. The server could not authenticate the merchant; your payment remains pending.",
        );
      } finally {
        row.pending = undefined;
      }
    })();
    return row.pending;
  };
}

export const gatewayAuthToken = createGatewayTokenManager();

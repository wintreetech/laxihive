// Log fixed diagnostic labels and numeric provider codes only. Database messages
// can contain connection strings or credentials, so never copy them into output.
export function databaseDiagnostic(error: unknown) {
  const value = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown; message?: unknown };
  } | null;
  const code =
    typeof value?.code === "string" && /^P\d{4}$/.test(value.code)
      ? value.code
      : null;
  const provider = String(value?.meta?.code ?? value?.code ?? "");
  const providerCode = /^\d{1,6}$/.test(provider) ? provider : null;
  const message = [value?.message, value?.meta?.message]
    .filter((item): item is string => typeof item === "string")
    .join(" ");
  let reason = "database_operation_failed";
  let hint =
    "Run npm run db:check on the backend host to compare native MongoDB and Prisma connectivity.";
  if (
    /empty database|database name.*(?:empty|missing|invalid)|invalid namespace/i.test(
      message,
    )
  ) {
    reason = "database_name_invalid";
    hint =
      "Include the existing database name in Render DATABASE_URL, before the query string.";
  } else if (
    providerCode === "18" ||
    code === "P1000" ||
    /authentication failed|bad auth|SCRAM|SASL/i.test(message)
  ) {
    reason = "database_authentication_failed";
    hint =
      "Check the live DATABASE_URL database-user credentials, password encoding and authSource.";
  } else if (
    providerCode === "13" ||
    /not authorized|unauthorized/i.test(message)
  ) {
    reason = "database_permission_denied";
    hint =
      "Grant the application database user readWrite access to the intended database in Atlas.";
  } else if (/TLS|SSL|certificate|handshake/i.test(message)) {
    reason = "database_tls_failed";
    hint =
      "Check Atlas connectivity and TLS configuration. Keep certificate verification enabled.";
  } else if (/ENOTFOUND|EAI_AGAIN|querySrv|DNS/i.test(message)) {
    reason = "database_dns_failed";
    hint =
      "Check the Atlas connection hostname and DNS resolution from the backend host.";
  } else if (
    ["P1001", "P1002", "P1008", "P1017"].includes(code || "") ||
    /server selection|timed? ?out|ECONNREFUSED|ETIMEDOUT|network|IP.*(?:access list|allowlist|whitelist)/i.test(
      message,
    )
  ) {
    reason = "database_network_unavailable";
    hint =
      "Add every outbound IP range from Render laxihive-backend > Connect > Outbound to Atlas Network Access; confirm the cluster is running.";
  } else if (
    code === "P2031" ||
    /replica set|transactions.*not supported/i.test(message)
  ) {
    reason = "database_replica_set_required";
    hint =
      "Use an available MongoDB replica set and its correct connection settings.";
  }
  return { code, providerCode, reason, hint };
}

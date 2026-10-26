// Work around Windows SRV resolver failures without weakening TLS or exposing credentials.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { MongoClient } from "mongodb";
import { backendEnvFile, readBackendEnv } from "./env.mjs";
const require = createRequire(
  new URL("../package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const original = readBackendEnv().DATABASE_URL;
let native, prisma;
try {
  if (!original?.startsWith("mongodb+srv://")) throw new Error("Use db:check for an already-standard connection.");
  const uri = new URL(original);
  if (uri.protocol !== "mongodb+srv:" || !uri.hostname.endsWith(".mongodb.net"))
    throw new Error("This helper requires an Atlas SRV connection.");
  native = new MongoClient(original, { serverSelectionTimeoutMS: 10000 });
  if (
    native.options.tlsInsecure ||
    native.options.tlsAllowInvalidCertificates ||
    native.options.tlsAllowInvalidHostnames
  )
    throw new Error("Insecure TLS options are not accepted.");
  await native.connect();
  const hello = await native.db().command({ hello: 1 });
  if (!hello.setName || !hello.hosts?.length || native.options.tls !== true)
    throw new Error("A TLS-authenticated replica set is required.");
  if (!hello.hosts.every((host) => /^[a-zA-Z0-9.-]+:\d+$/.test(host)))
    throw new Error("Unsupported server hostname format.");
  const options = new URLSearchParams(uri.searchParams);
  options.set("tls", "true");
  options.delete("ssl");
  options.delete("srvMaxHosts");
  options.delete("srvServiceName");
  options.set("replicaSet", hello.setName);
  if (!options.has("authSource"))
    options.set("authSource", native.options.credentials?.source || "admin");
  const credentials = uri.username
    ? `${uri.username}${uri.password ? ":" + uri.password : ""}@`
    : "";
  const standard = `mongodb://${credentials}${hello.hosts.join(",")}${uri.pathname}?${options}`;
  prisma = new PrismaClient({ datasources: { db: { url: standard } } });
  await prisma.$runCommandRaw({ ping: 1 });
  if (process.argv.includes("--apply")) {
    const contents = readFileSync(backendEnvFile, "utf8");
    if (parseEnv(contents).DATABASE_URL !== original)
      throw new Error(
        "The connection came from an environment override; update it there instead.",
      );
    writeFileSync(
      backendEnvFile,
      contents.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${standard}`),
    );
  }
  console.log(
    JSON.stringify(
      {
        prismaConnected: true,
        tls: true,
        certificateVerification: "enabled",
        database: native.db().databaseName,
        memberCount: hello.hosts.length,
        configurationUpdated: process.argv.includes("--apply"),
        dataChanged: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      prismaConnected: false,
      error: error.name,
      code: error.code ?? null,
      diagnosis: /DNS|resolution/i.test(error.message)
        ? "DNS resolution failed"
        : /TLS|SSL|certificate/i.test(error.message)
          ? "TLS connection failed"
          : "Connection validation failed; original configuration retained",
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
  await native?.close();
}

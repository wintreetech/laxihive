import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { backend, readBackendEnv } from "./env.mjs";

async function mongoExecutable(env) {
  if (env.MONGOD_PATH) return env.MONGOD_PATH;
  if (process.platform !== "win32") return "mongod";
  const base = join(
    process.env.ProgramFiles || "C:/Program Files",
    "MongoDB/Server",
  );
  const versions = await readdir(base).catch(() => []);
  versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const path = join(base, version, "bin/mongod.exe");
    if (existsSync(path)) return path;
  }
  throw new Error(
    "MongoDB Server was not found. Install MongoDB Server, set MONGOD_PATH in backend/.env, or use an Atlas DATABASE_URL.",
  );
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ensureDatabase(options = {}) {
  const env = readBackendEnv();
  const url = options.databaseUrl || env.DATABASE_URL;
  if (!url)
    throw new Error(
      "Missing DATABASE_URL in backend/.env. Run npm run setup in backend first.",
    );
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    /* The MongoDB driver handles multi-host URLs. */
  }
  // Only manage this project's dedicated instance; other servers stay operator-managed.
  const managed =
    parsed?.hostname === "127.0.0.1" &&
    parsed.port === "27018" &&
    parsed.searchParams.get("replicaSet") === "lexihive-local";
  const connect = async () => {
    const client = new MongoClient(
      managed ? "mongodb://127.0.0.1:27018/?directConnection=true" : url,
      { serverSelectionTimeoutMS: managed ? 1000 : 10000 },
    );
    try {
      await client.connect();
      await client.db("admin").command({ ping: 1 });
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  };
  let client;
  try {
    client = await connect();
  } catch {
    if (!managed)
      throw new Error(
        "Cannot connect to DATABASE_URL in backend/.env. Check that your MongoDB replica set or Atlas cluster is available.",
      );
    const executable = await mongoExecutable(env);
    const data = join(backend, ".local/mongo");
    await mkdir(data, { recursive: true });
    console.log("Starting local MongoDB on port 27018...");
    const child = spawn(
      executable,
      [
        "--dbpath",
        data,
        "--port",
        "27018",
        "--bind_ip",
        "127.0.0.1",
        "--replSet",
        "lexihive-local",
        "--logpath",
        join(backend, ".local/mongo.log"),
        "--logappend",
      ],
      { detached: true, windowsHide: true, stdio: "ignore" },
    );
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () =>
        reject(
          new Error(
            "Could not start MongoDB. Check MONGOD_PATH in backend/.env.",
          ),
        ),
      );
    });
    child.unref();
    for (let attempt = 0; attempt < 25; attempt++) {
      try {
        client = await connect();
        break;
      } catch {
        await pause(400);
      }
    }
    if (!client)
      throw new Error(
        "MongoDB did not start. See backend/.local/mongo.log for details.",
      );
  }
  try {
    const admin = client.db("admin");
    if (managed) {
      try {
        await admin.command({ replSetGetStatus: 1 });
      } catch (error) {
        if (error.code !== 94)
          throw new Error(
            "Port 27018 must run this project's MongoDB replica set. Check backend/.local/mongo.log.",
          );
        await admin.command({
          replSetInitiate: {
            _id: "lexihive-local",
            members: [{ _id: 0, host: "127.0.0.1:27018" }],
          },
        });
      }
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      const hello = await admin.command({ hello: 1 });
      if (hello.setName && hello.isWritablePrimary) {
        if (managed && hello.setName !== "lexihive-local")
          throw new Error("Unexpected MongoDB replica set on port 27018.");
        console.log(
          managed
            ? "MongoDB ready on port 27018."
            : "Configured MongoDB replica set is ready.",
        );
        return;
      }
      if (!managed && !hello.setName)
        throw new Error(
          "MongoDB must run as a replica set. Use MongoDB Atlas or the default local DATABASE_URL.",
        );
      await pause(500);
    }
    throw new Error(
      "MongoDB is not ready for writes. Check its replica set configuration.",
    );
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  ensureDatabase().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

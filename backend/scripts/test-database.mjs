import { ensureDatabase } from "./database.mjs";
import { readBackendEnv } from "./env.mjs";
await ensureDatabase({
  databaseUrl:
    readBackendEnv().TEST_DATABASE_URL ||
    "mongodb://127.0.0.1:27018/lexihive_test?replicaSet=lexihive-local",
});

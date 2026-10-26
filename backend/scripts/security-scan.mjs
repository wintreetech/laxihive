import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { root, readBackendEnv } from "./env.mjs";
process.chdir(root);
const settings = readBackendEnv();
const secrets = [
  "WORKING_KEY",
  "SESSION_SECRET",
  "TW_AUTH_TOKEN",
  "SMTP_PASSWORD",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]
  .map((name) => [name, settings[name]])
  .filter(
    ([, value]) =>
      value?.length >= 12 &&
      !/replace|example|placeholder|fixture/i.test(value),
  );
const databaseAuth = settings.DATABASE_URL?.match(
  /^mongodb(?:\+srv)?:\/\/([^/@]+)@/,
);
if (databaseAuth) {
  secrets.push(["DATABASE_URL", settings.DATABASE_URL]);
  const password = databaseAuth[1].slice(databaseAuth[1].indexOf(":") + 1);
  if (password.length >= 8) {
    secrets.push(["DATABASE_PASSWORD", password]);
    try {
      const decoded = decodeURIComponent(password);
      if (decoded !== password && decoded.length >= 8)
        secrets.push(["DATABASE_PASSWORD", decoded]);
    } catch {
      /* The database driver validates URI encoding. */
    }
  }
}
const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
const findings = [];
function inspect(label, text) {
  for (const [name, value] of secrets)
    if (text.includes(value))
      findings.push({ file: label, issue: `Contains configured ${name}` });
  if (
    /\bsk_live_[A-Za-z0-9]{16,}|\bAKIA[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
      text,
    )
  )
    findings.push({
      file: label,
      issue: "Possible live credential/private key",
    });
}
const candidates = git([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .split("\0")
  .filter(Boolean);
for (const name of new Set(candidates)) {
  if (
    /(?:^|\/)(?:package-lock\.json)$|\.(?:png|jpe?g|woff2?|zip|ico)$/i.test(
      name,
    )
  )
    continue;
  try {
    if (statSync(name).size < 2 * 1024 * 1024)
      inspect(name, readFileSync(name, "utf8"));
  } catch {
    /* Deleted tracked files are expected during cleanup. */
  }
}
const revisions = git(["rev-list", "--all"]).trim().split("\n").filter(Boolean);
for (const revision of revisions) {
  const files = git(["ls-tree", "-r", "--name-only", revision])
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const file of files) {
    if (
      /\.(?:png|jpe?g|woff2?|zip|ico)$/i.test(file) ||
      file.endsWith("package-lock.json")
    )
      continue;
    inspect(
      `${revision.slice(0, 8)}:${file}`,
      git(["show", `${revision}:${file}`]),
    );
  }
}
console.log(
  JSON.stringify(
    {
      candidateFilesChecked: candidates.length,
      historyRevisionsChecked: revisions.length,
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
console.log(
  "This targeted scan does not replace a full secret scanner. Rotate merchant keys disclosed outside the repository before public launch.",
);

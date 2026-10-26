import { writeFile } from "node:fs/promises";
// A same-origin proxy keeps HttpOnly SameSite=Lax sessions usable across Netlify and a Node host.
const target = process.env.API_PROXY_TARGET;
if (target) {
  const url = new URL(target);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("API_PROXY_TARGET must be a plain HTTPS backend origin.");
  await writeFile(
    new URL("../dist/_redirects", import.meta.url),
    `/api/* ${url.origin}/api/:splat 200\n/* /index.html 200\n`,
  );
  console.log("Created same-origin Netlify API proxy.");
}

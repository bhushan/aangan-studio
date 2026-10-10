// Loads env files for local scripts if present. Never prints values.
// .env holds your own secrets; .env.local comes from `vercel env pull` (DATABASE_URL, VERCEL_OIDC_TOKEN).
// The first non-empty value wins, so an empty placeholder in .env does not hide one in .env.local.
import fs from "node:fs";
import { parseEnv } from "node:util";

for (const file of [".env", ".env.local"]) {
  if (!fs.existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, "utf8")))) {
    if (value && !process.env[key]) process.env[key] = value;
  }
}

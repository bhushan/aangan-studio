// Copies the variables listed in .env.example from your local .env into the linked Vercel project
// (production + preview). Prints names only, never values. Usage: npm run push-env
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { parseEnv } from "node:util";

const wanted = Object.keys(parseEnv(fs.readFileSync(".env.example", "utf8")));
const local = parseEnv(fs.readFileSync(".env", "utf8"));
// DATABASE_URL comes from the Neon integration.
const managedByVercel = new Set(["DATABASE_URL"]);

for (const key of wanted) {
  const value = local[key];
  if (managedByVercel.has(key) || !value) {
    console.log(`skip  ${key}${value ? " (managed by Vercel)" : " (empty in .env)"}`);
    continue;
  }
  const res = spawnSync("vercel", ["env", "add", key, "production,preview", "--force", "--sensitive", "--yes"], {
    input: value,
    encoding: "utf8",
  });
  console.log(`${res.status === 0 ? "set " : "FAIL"}  ${key}`);
  if (res.status !== 0) console.error(`      ${(res.stderr || res.stdout).split("\n").find((l) => /error/i.test(l)) ?? "see vercel output"}`);
}

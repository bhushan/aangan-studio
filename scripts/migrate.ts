// Applies migrations/*.sql in order, once each. Usage: npm run migrate
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { env } from "../lib/env";

async function main() {
  const sql = neon(env("DATABASE_URL"));
  await sql.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set(((await sql.query("select name from schema_migrations")) as { name: string }[]).map((r) => r.name));
  const dir = path.join(process.cwd(), "migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const statements = fs.readFileSync(path.join(dir, file), "utf8").split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
    await sql.transaction([...statements.map((s) => sql.query(s)), sql.query("insert into schema_migrations (name) values ($1)", [file])]);
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

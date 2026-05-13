#!/usr/bin/env node
/**
 * One-shot D1 setup (requires CLOUDFLARE_API_TOKEN in the environment):
 * 1. Ensure remote database "product-rating-db" exists (create if missing).
 * 2. Write its UUID into wrangler.toml (replaces REPLACE_WITH_YOUR_D1_ID or stale id for that DB name).
 * 3. Apply SQL migrations to the remote database.
 *
 * Usage:
 *   export CLOUDFLARE_API_TOKEN=...
 *   npm run setup:d1
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WRANGLER_PATH = path.join(ROOT, "wrangler.toml");
const DB_NAME = "product-rating-db";
const BINDING = "DB";

function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : "pipe",
    ...opts,
  });
}

function requireToken() {
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    console.error(`
Missing CLOUDFLARE_API_TOKEN.

  export CLOUDFLARE_API_TOKEN="your_api_token"
  npm run setup:d1

Or load from a gitignored file (example):

  set -a && source .env.cf && set +a && npm run setup:d1
`);
    process.exit(1);
  }
}

function listDatabases() {
  const raw = run("npx wrangler d1 list --json");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [];
}

function pickDatabaseId(rows) {
  const row = rows.find((r) => r.name === DB_NAME);
  if (!row) return null;
  return row.uuid ?? row.database_id ?? row.id ?? null;
}

function ensureDatabase() {
  let rows = listDatabases();
  let id = pickDatabaseId(rows);
  if (id) {
    console.log(`Found existing D1 database "${DB_NAME}" → ${id}`);
    return id;
  }
  console.log(`Creating D1 database "${DB_NAME}"…`);
  try {
    run(`npx wrangler d1 create ${DB_NAME} --binding ${BINDING} --update-config`, { inherit: true });
  } catch {
    console.log("Create returned non-zero (database may already exist); refreshing list…");
  }
  rows = listDatabases();
  id = pickDatabaseId(rows);
  if (!id) {
    console.error("Could not resolve database id after create. Run: npx wrangler d1 list --json");
    process.exit(1);
  }
  console.log(`Created "${DB_NAME}" → ${id}`);
  return id;
}

function patchWranglerToml(databaseId) {
  let toml = fs.readFileSync(WRANGLER_PATH, "utf8");
  const blockNeedle = `database_name = "${DB_NAME}"`;
  if (!toml.includes(blockNeedle)) {
    console.warn(`wrangler.toml has no database_name = "${DB_NAME}" — check [[d1_databases]] manually.`);
  }
  // Replace placeholder
  if (toml.includes("REPLACE_WITH_YOUR_D1_ID")) {
    toml = toml.replace("REPLACE_WITH_YOUR_D1_ID", databaseId);
  } else {
    // Replace database_id on the line following database_name for this DB (simple heuristic)
    toml = toml.replace(
      new RegExp(`(database_name = "${DB_NAME}"\\s*\\n)database_id = "[^"]+"`, "m"),
      `$1database_id = "${databaseId}"`,
    );
  }
  fs.writeFileSync(WRANGLER_PATH, toml, "utf8");
  console.log(`Updated ${path.relative(ROOT, WRANGLER_PATH)} with database_id.`);
}

function applyMigrations() {
  console.log("Applying migrations to remote D1…");
  run(`npx wrangler d1 migrations apply ${DB_NAME} --remote`, { inherit: true });
}

function main() {
  requireToken();
  const id = ensureDatabase();
  patchWranglerToml(id);
  applyMigrations();
  console.log(`
Done. Next:
  • Commit wrangler.toml if database_id changed: git add wrangler.toml && git commit -m "chore: set D1 database_id" && git push
  • Deploy: npm run deploy   (or push to main if GitHub Actions deploy is configured)
`);
}

main();

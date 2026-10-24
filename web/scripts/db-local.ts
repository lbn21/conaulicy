// npm run db:local [-- reset | stop]: the local development database
// (docker-compose.yml), with the CI fixture only. Starts Postgres, waits for
// it, runs the migrations and scripts/ci-fixture.ts, then prints the row
// counts; safe to run again. `reset` drops the volume first, `stop` stops it.
// The URL is fixed here and every database variable is set to it, so neither
// .env.local nor the shell can point this at another database.
import { execFileSync } from "node:child_process";
import pg from "pg";
import { localDatabaseUrl } from "./lib/local-db.ts";

const LOCAL_URL = "postgres://ci:ci@127.0.0.1:5432/conaulicy";

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { stdio: "inherit" });

const action = process.argv[2] ?? "up";
if (action === "stop") {
  run("docker", ["compose", "down"]);
  process.exit(0);
}
if (action === "reset") run("docker", ["compose", "down", "--volumes"]);
else if (action !== "up") throw new Error(`Unknown action: ${action}`);

process.env.IMPORT_DATABASE_URL = LOCAL_URL;
process.env.DATABASE_URL_UNPOOLED = LOCAL_URL;
process.env.DATABASE_URL = LOCAL_URL;
const url = localDatabaseUrl();

run("docker", ["compose", "up", "--detach", "--wait"]);
run("node", ["node_modules/drizzle-kit/bin.cjs", "migrate"]);
run("node", ["scripts/ci-fixture.ts"]);

const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows: tables } = await client.query<{ name: string }>(
  "select table_name as name from information_schema.tables where table_schema = 'public' order by 1",
);
for (const { name } of tables) {
  const { rows } = await client.query(
    `select count(*)::int as n from "${name}"`,
  );
  console.log(`${name}: ${rows[0].n}`);
}
await client.end();

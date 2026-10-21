// Tests only (check-import-run.mjs loads it with node --import): before a
// query whose text matches DROP_QUERY, the server terminates that client's
// connection, as Neon closes an idle one; DROP_TIMES times (default: always).
import pg from "pg";

const pattern = new RegExp(process.env.DROP_QUERY);
let left = Number(process.env.DROP_TIMES || Number.POSITIVE_INFINITY);
const query = pg.Client.prototype.query;

pg.Client.prototype.query = async function (text, ...rest) {
  if (typeof text === "string" && pattern.test(text) && left > 0) {
    left--;
    const killer = new pg.Client({
      connectionString: process.env.IMPORT_DATABASE_URL,
    });
    await killer.connect();
    await query.call(killer, "select pg_terminate_backend($1)", [
      this.processID,
    ]);
    await killer.end();
    // Let the closed socket arrive first ('error' event), as it would after
    // minutes of vision passes.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return query.call(this, text, ...rest);
};

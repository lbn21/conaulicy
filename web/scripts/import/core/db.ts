// The import's Postgres connection. It is opened by the first query and
// closed with close() before long work without the database (the vision
// passes take minutes, and Neon drops an idle connection), so no connection
// sits idle. A dropped connection never kills the process (every client has
// an 'error' listener): outside a transaction it is opened again and the
// query retried once; inside one the transaction is lost, so the query
// fails, and the caller's rollback is a no-op (the server has rolled back).
import pg from "pg";

/** What the import's queries need: a Db, or a plain pg client. */
export type Queryable = {
  query(text: string, params?: unknown[]): Promise<pg.QueryResult>;
};

// admin_shutdown, crash_shutdown, cannot_connect_now; class 08 is
// connection_exception.
const DROPPED_CODES = new Set(["57P01", "57P02", "57P03"]);

/** True if the error means the connection is gone (not a bad query). */
export function droppedConnection(error: unknown): boolean {
  const { code, message } = error as { code?: string; message?: string };
  return (
    (code !== undefined &&
      (DROPPED_CODES.has(code) ||
        code.startsWith("08") ||
        ["ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(code))) ||
    /Connection terminated|not queryable|ECONNRESET|EPIPE/.test(message ?? "")
  );
}

export class Db implements Queryable {
  #url: string;
  #readOnly: boolean;
  #client: pg.Client | null = null;
  #inTransaction = false;
  // The connection dropped inside the open transaction.
  #lost = false;

  constructor(url: string, { readOnly = false } = {}) {
    this.#url = url;
    this.#readOnly = readOnly;
  }

  async #connect(): Promise<pg.Client> {
    if (this.#client) return this.#client;
    const client = new pg.Client({ connectionString: this.#url });
    // Without a listener, a connection the server closes ('error' event)
    // throws out of the event loop and kills the process.
    client.on("error", (error) => {
      console.log(`Database connection dropped: ${error.message}`);
      if (this.#client === client) this.#client = null;
    });
    await client.connect();
    if (this.#readOnly)
      await client.query("SET default_transaction_read_only = on");
    this.#client = client;
    return client;
  }

  #discard(client: pg.Client) {
    if (this.#client === client) this.#client = null;
    client.end().catch(() => {});
  }

  async query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
    const statement = text.trim().toLowerCase();
    if (statement === "rollback" && this.#lost) {
      this.#lost = false;
      this.#inTransaction = false;
      return { command: "ROLLBACK", rowCount: 0, oid: 0, rows: [], fields: [] };
    }
    for (let attempt = 1; ; attempt++) {
      const client = await this.#connect();
      try {
        const result = await client.query(text, params);
        if (statement === "begin") this.#inTransaction = true;
        else if (statement === "commit" || statement === "rollback")
          this.#inTransaction = false;
        return result;
      } catch (error) {
        if (!droppedConnection(error)) throw error;
        this.#discard(client);
        if (this.#inTransaction) {
          this.#lost = true;
          throw error;
        }
        if (attempt > 1) throw error;
        console.log(
          `Database connection dropped (${(error as Error).message}); reconnecting and retrying once.`,
        );
      }
    }
  }

  /** Closes the connection; the next query opens a new one. */
  async close() {
    if (this.#inTransaction) throw new Error("close() inside a transaction");
    const client = this.#client;
    this.#client = null;
    await client?.end().catch(() => {});
  }
}

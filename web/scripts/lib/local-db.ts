// The database URL, only when it is a throwaway local one (CI's service
// container, a local Docker Postgres). Scripts that wipe or fill the
// database with made-up rows use it, so they can never reach Neon or any
// other shared database.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function localDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not a local database (only CI or a local container).",
    );
  }
  return url;
}

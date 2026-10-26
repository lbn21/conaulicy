// The database URL scripts read: IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED
// or DATABASE_URL, the first that is set and not empty; undefined when none.
// Each caller says what is missing and guards production itself.
export function databaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return (
    env.IMPORT_DATABASE_URL ||
    env.DATABASE_URL_UNPOOLED ||
    env.DATABASE_URL ||
    undefined
  );
}

// The database URL, only when it is a throwaway local one (CI's service
// container, a local Docker Postgres). Scripts that wipe or fill the
// database with made-up rows use it, so they can never reach Neon or any
// other shared database.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** The URL's host is this machine (localhost, 127.0.0.1, ::1). */
export const isLocalDatabaseUrl = (url: string) =>
  LOCAL_HOSTS.has(new URL(url).hostname);

export function localDatabaseUrl(): string {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!isLocalDatabaseUrl(url)) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not a local database (only CI or a local container).",
    );
  }
  return url;
}

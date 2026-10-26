// Where scripts/districts-seed.ts may run: a local database (db:local, CI's
// service container) always; any other only inside GitHub Actions (the
// prod-db workflow, approved by Jakub), and --apply there only with
// --yes-production. describeTarget cannot tell production inside the
// workflow, so this does not rely on it. Pure, for the tests.
import { isLocalDatabaseUrl } from "./local-db.ts";

/** Why the seed must not run against `url`; undefined: it may. */
export function districtsTargetRefusal(
  url: string,
  args: { apply: boolean; "yes-production": boolean },
  env: Record<string, string | undefined>,
): string | undefined {
  if (isLocalDatabaseUrl(url)) return undefined;
  if (env.GITHUB_ACTIONS !== "true")
    return "Refusing to run: not a local database. Production runs only through the prod-db workflow (task migrate-districts).";
  if (args.apply && !args["yes-production"])
    return "Refusing to write: not a local database. Add --yes-production to write.";
  return undefined;
}

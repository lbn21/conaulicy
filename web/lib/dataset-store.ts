// Where the dataset snapshot lives in the private Blob store, as the
// water, IMGW and PGE files (lib/live-store.ts): every version an
// immutable file of its own, dataset/v/<version>.json, never overwritten,
// and a small pointer, dataset/current.json, naming the current one. The
// import writes the version first and moves the pointer last
// (scripts/lib/dataset.ts), so a failed write leaves the old snapshot
// live; a rollback only moves the pointer back (npm run dataset --
// rollback). The site reads the pointer, then its version (lib/dataset.ts).

export const DATASET_POINTER = "dataset/current.json";

/** "20261113T140221Z-1a2b3c4d5e6f": when it was built, then its content's hash. */
export const datasetPath = (version: string) => `dataset/v/${version}.json`;

export type DatasetPointer = {
  version: string;
  path: string;
  /** sha256 of the version's content without generatedAt: unchanged data, no new version. */
  sha256: string;
  generatedAt: string;
  /** The version it replaced, for a rollback; null for the first. */
  previous: string | null;
};

const VERSION = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;

export function isDatasetVersion(value: string): boolean {
  return VERSION.test(value);
}

/** The pointer's JSON, checked; throws on anything else. */
export function parsePointer(json: string): DatasetPointer {
  const value = JSON.parse(json) as Partial<DatasetPointer>;
  const { version, sha256, generatedAt, previous } = value;
  if (
    typeof version !== "string" ||
    !isDatasetVersion(version) ||
    value.path !== datasetPath(version) ||
    typeof sha256 !== "string" ||
    typeof generatedAt !== "string" ||
    !(
      previous === null ||
      (typeof previous === "string" && isDatasetVersion(previous))
    )
  )
    throw new Error(`Dataset: ${DATASET_POINTER} is not a pointer.`);
  return { version, path: value.path, sha256, generatedAt, previous };
}

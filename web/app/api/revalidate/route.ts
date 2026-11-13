import { revalidateTag } from "next/cache";
import { after } from "next/server";
import {
  DEPLOY_MARKER_PATH,
  MissingDeployHook,
  syncDataset,
} from "@/lib/dataset-sync";
import { NO_STORE } from "@/lib/headers";
import { readBlobFile, writeBlobFile } from "@/lib/live-store";
import { SOURCE_TAGS } from "@/lib/page-cache";
import { prewarm } from "@/lib/prewarm";
import { placeParams } from "@/lib/schedule";
import { sameSecret } from "@/lib/secret";

// Called by every publisher of the dataset snapshot (the import, a
// rollback), at least 65 s after the pointer moved (the Blob's CDN): one
// decision, syncDataset (lib/dataset-sync.ts). The same place set as this
// deployment's: the dataset tag revalidated with the "max" profile (every
// page built from the snapshot served stale at once, re-rendered in the
// background), then the pages pre-warmed, the home page first. Another
// place set: the Vercel Deploy Hook, no revalidation, at most once per
// place set and 6 hours (the deploy marker). Answers 500 when the
// place set changed and DEPLOY_HOOK_URL is not set, or the hook failed, so
// the import fails loudly.
//
//   curl -X POST -H "Authorization: Bearer $REVALIDATE_SECRET" \
//     https://conaulicy.pl/api/revalidate

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret || !sameSecret(given, `Bearer ${secret}`)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: NO_STORE,
    });
  }
  const origin = new URL(request.url).origin;
  try {
    const result = await syncDataset({
      fetch,
      hookUrl: process.env.DEPLOY_HOOK_URL,
      marker: {
        read: () => readBlobFile(DEPLOY_MARKER_PATH),
        write: (body) => writeBlobFile(DEPLOY_MARKER_PATH, body),
      },
      mode: "publish",
      log: (line) => console.log(JSON.stringify(line)),
      revalidate: () => {
        revalidateTag(SOURCE_TAGS.dataset, "max");
        after(async () => {
          const pages = (await placeParams()).map(({ id }) => `/adres/${id}`);
          console.log(
            JSON.stringify({
              prewarm: await prewarm(origin, ["/", "/ulice", ...pages]),
            }),
          );
        });
      },
    });
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    const message = (error as Error).message;
    console.error(message);
    return Response.json(
      { error: message, missingHook: error instanceof MissingDeployHook },
      { status: 500, headers: NO_STORE },
    );
  }
}

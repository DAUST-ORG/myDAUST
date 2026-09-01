import { createHash } from "node:crypto";
import { lstat, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { z } from "zod";
import {
  parseWorkbookCutoverProductionSnapshot,
  parseWorkbookCutoverTrustedExtraction,
} from "./workbook-cutover.extraction.js";
import { workbookCutoverManifestDigest } from "./workbook-cutover.manifest.js";
import { buildWorkbookCutoverManifestFromReview } from "./workbook-cutover.review-import.js";

const MAX_JSON_BYTES = 50 * 1024 * 1024;
const MAX_XLSX_BYTES = 100 * 1024 * 1024;

const EnvironmentSchema = z
  .object({
    REVIEW_WORKBOOK_PATH: z.string().trim().min(1),
    CUTOVER_EXTRACTION_PATH: z.string().trim().min(1),
    CUTOVER_PRODUCTION_SNAPSHOT_PATH: z.string().trim().min(1),
    CUTOVER_MANIFEST_OUTPUT_PATH: z.string().trim().min(1),
  })
  .strict();

async function readPrivateBounded(
  path: string,
  maxBytes: number,
  label: string,
): Promise<Buffer> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file, not a link`);
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must be mode 0600 or stricter`);
  }
  if (metadata.size > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
  }
  return readFile(path);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const env = EnvironmentSchema.parse({
    REVIEW_WORKBOOK_PATH: process.env.REVIEW_WORKBOOK_PATH,
    CUTOVER_EXTRACTION_PATH: process.env.CUTOVER_EXTRACTION_PATH,
    CUTOVER_PRODUCTION_SNAPSHOT_PATH:
      process.env.CUTOVER_PRODUCTION_SNAPSHOT_PATH,
    CUTOVER_MANIFEST_OUTPUT_PATH: process.env.CUTOVER_MANIFEST_OUTPUT_PATH,
  });
  const paths = {
    reviewWorkbook: resolve(env.REVIEW_WORKBOOK_PATH),
    extraction: resolve(env.CUTOVER_EXTRACTION_PATH),
    productionSnapshot: resolve(env.CUTOVER_PRODUCTION_SNAPSHOT_PATH),
    output: resolve(env.CUTOVER_MANIFEST_OUTPUT_PATH),
  };
  if (
    new Set([paths.reviewWorkbook, paths.extraction, paths.productionSnapshot])
      .size !== 3 ||
    [paths.reviewWorkbook, paths.extraction, paths.productionSnapshot].includes(
      paths.output,
    )
  ) {
    throw new Error("Cutover review inputs and output must be distinct files");
  }
  const [reviewWorkbookBytes, extractionBytes, productionSnapshotBytes] =
    await Promise.all([
      readPrivateBounded(
        paths.reviewWorkbook,
        MAX_XLSX_BYTES,
        "Signed review workbook",
      ),
      readPrivateBounded(
        paths.extraction,
        MAX_JSON_BYTES,
        "Trusted extraction",
      ),
      readPrivateBounded(
        paths.productionSnapshot,
        MAX_JSON_BYTES,
        "Frozen production snapshot",
      ),
    ]);
  const extraction = parseWorkbookCutoverTrustedExtraction(extractionBytes);
  const productionSnapshot = parseWorkbookCutoverProductionSnapshot(
    productionSnapshotBytes,
  );
  const reviewWorkbookSha256 = sha256(reviewWorkbookBytes);
  const extractionSha256 = sha256(extractionBytes);
  const productionSnapshotSha256 = sha256(productionSnapshotBytes);
  const manifest = await buildWorkbookCutoverManifestFromReview({
    reviewWorkbookBytes,
    reviewWorkbookSha256,
    reviewWorkbookFileName: basename(paths.reviewWorkbook),
    extraction,
    extractionSha256,
    extractionFileName: basename(paths.extraction),
    productionSnapshot,
    productionSnapshotSha256,
    productionSnapshotFileName: basename(paths.productionSnapshot),
  });
  const manifestSha256 = workbookCutoverManifestDigest(manifest);
  await writeFile(paths.output, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  const metadata = await stat(paths.output);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("Manifest output did not retain private file permissions");
  }
  console.log(
    JSON.stringify(
      {
        event: "workbook-cutover-reviewed-manifest-built",
        ok: true,
        offline: true,
        manifestSha256,
        reviewWorkbookSha256,
        sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
        extractionSha256,
        productionSnapshotSha256,
        controls: manifest.controls,
        dispositionControls: manifest.dispositionControls,
        output: "<private-mode-0600-file>",
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    const issueCounts = error.issues.reduce<Record<string, number>>(
      (counts, issue) => {
        counts[issue.code] = (counts[issue.code] ?? 0) + 1;
        return counts;
      },
      {},
    );
    console.error(
      JSON.stringify(
        {
          event: "workbook-cutover-reviewed-manifest-built",
          ok: false,
          blocked: true,
          error: "Signed review workbook or frozen source is invalid",
          issueCounts,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(
      JSON.stringify(
        {
          event: "workbook-cutover-reviewed-manifest-built",
          ok: false,
          blocked: true,
          error:
            "Signed review manifest build failed; inspect the private inputs locally",
          failureCode: "review_manifest_build_failed",
        },
        null,
        2,
      ),
    );
  }
  process.exitCode = 1;
});

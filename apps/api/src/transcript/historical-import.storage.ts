import { createHash } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { TranscriptImportObjectKeySchema } from "./historical-import.manifest.js";

export const MAX_TRANSCRIPT_MANIFEST_BYTES = 25 * 1024 * 1024;
export const MAX_TRANSCRIPT_WORKBOOK_BYTES = 250 * 1024 * 1024;

export class HistoricalImportStorage {
  private readonly s3: S3Client;

  constructor(
    private readonly bucket: string,
    region: string,
    s3?: S3Client,
  ) {
    if (bucket.trim().length < 3) {
      throw new Error("TRANSCRIPT_IMPORT_BUCKET is not configured");
    }
    this.s3 = s3 ?? new S3Client({ region });
  }

  async getManifest(keyInput: string): Promise<Buffer> {
    return this.getObject(keyInput, MAX_TRANSCRIPT_MANIFEST_BYTES, "manifest");
  }

  async verifyWorkbook(
    keyInput: string,
    expectedSha256Input: string,
  ): Promise<{ sha256: string; byteLength: number }> {
    const workbook = await this.getObject(
      keyInput,
      MAX_TRANSCRIPT_WORKBOOK_BYTES,
      "source workbook",
    );
    const sha256 = createHash("sha256").update(workbook).digest("hex");
    const expectedSha256 = expectedSha256Input.trim().toLowerCase();
    if (sha256 !== expectedSha256) {
      throw new Error(
        `Source workbook SHA-256 mismatch: expected ${expectedSha256}, received ${sha256}`,
      );
    }
    return { sha256, byteLength: workbook.byteLength };
  }

  private async getObject(
    keyInput: string,
    maxBytes: number,
    label: string,
  ): Promise<Buffer> {
    const key = TranscriptImportObjectKeySchema.parse(keyInput);
    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
    }
    if (!object.Body) throw new Error(`${label} object is empty`);
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (bytes.byteLength > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
    }
    return bytes;
  }
}

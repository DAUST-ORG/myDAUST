import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { loadEnv } from "../config/env.js";
import { UPLOADS_DIR } from "./uploads.constants.js";

const SAFE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;

/**
 * Types accepted here, keyed by the bytes that actually prove the type.
 *
 * Deliberately no SVG. An SVG is a script-capable document, and these objects are served
 * from the API origin at a public URL, so an uploaded `<svg><script>` would execute in
 * that origin for anyone who opens the link — a stored-XSS hole reachable by any
 * authenticated user (students included) against any staff member they can send a link to.
 * Sniffing the bytes rather than trusting `Content-Type` also stops a script being
 * relabelled as an image on the way in.
 */
const ALLOWED_UPLOAD_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

/** Content types safe to render inline; everything else downloads instead. */
const INLINE_SAFE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

/** Identify a file by its magic bytes. Returns null when nothing matches. */
export function detectedUploadMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  const head = buffer.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  // RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO-BMFF brand box: ....ftypavif / ftypavis
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

/**
 * Accept a file only when its real bytes are an allowed type. The sniffed type is
 * authoritative — the client's `Content-Type` and the filename extension are both
 * attacker-controlled.
 */
export function validateUpload(
  file?: Pick<Express.Multer.File, "buffer" | "size" | "mimetype">,
): string {
  if (!file?.buffer) throw new BadRequestException("No file provided");
  const mime = detectedUploadMime(file.buffer);
  if (!mime || !ALLOWED_UPLOAD_MIME.has(mime)) {
    throw new BadRequestException(
      "Unsupported file type. Upload a PNG, JPG, GIF, WEBP, AVIF or PDF.",
    );
  }
  return mime;
}

/** Whether a stored object may be rendered inline rather than downloaded. */
export function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE.has(contentType);
}

export function createUploadFilename(originalName: string): string {
  const extension = extname(originalName).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
  return `${randomUUID()}${safeExtension}`;
}

export function validUploadFilename(filename: string): boolean {
  return SAFE_FILENAME.test(filename) && filename !== "." && filename !== "..";
}

export function contentTypeForFilename(filename: string): string {
  const extension = extname(filename).toLowerCase();
  return (
    {
      ".avif": "image/avif",
      ".gif": "image/gif",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".webp": "image/webp",
      // No ".svg" entry on purpose — see ALLOWED_UPLOAD_MIME. Anything already stored
      // with that extension now falls through to octet-stream and downloads instead of
      // rendering, which defuses previously uploaded files too.
    }[extension] ?? "application/octet-stream"
  );
}

@Injectable()
export class UploadsStorage {
  private readonly env = loadEnv();
  private readonly s3 = new S3Client({ region: this.env.AWS_REGION });

  async put(file: Express.Multer.File) {
    // Sniffed type wins over anything the client claimed, and is what gets stored — so a
    // file can never be served back under a type its bytes do not support.
    const mime = validateUpload(file);
    const filename = createUploadFilename(file.originalname);
    if (this.env.MEDIA_BUCKET) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.MEDIA_BUCKET,
          Key: `uploads/${filename}`,
          Body: file.buffer,
          ContentType: mime,
          CacheControl: "public, max-age=31536000, immutable",
          ServerSideEncryption: "AES256",
        }),
      );
    } else {
      await mkdir(UPLOADS_DIR, { recursive: true });
      await writeFile(resolve(UPLOADS_DIR, filename), file.buffer);
    }
    return filename;
  }

  async get(filename: string): Promise<{ body: Buffer; contentType: string }> {
    if (!validUploadFilename(filename))
      throw new NotFoundException("Upload not found");
    try {
      if (this.env.MEDIA_BUCKET) {
        const result = await this.s3.send(
          new GetObjectCommand({
            Bucket: this.env.MEDIA_BUCKET,
            Key: `uploads/${filename}`,
          }),
        );
        if (!result.Body) throw new NotFoundException("Upload not found");
        return {
          body: Buffer.from(await result.Body.transformToByteArray()),
          contentType: result.ContentType || contentTypeForFilename(filename),
        };
      }
      return {
        body: await readFile(resolve(UPLOADS_DIR, filename)),
        contentType: contentTypeForFilename(filename),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      const detail = error as { name?: string; code?: string };
      if (
        ["ENOENT", "NoSuchKey", "NotFound"].includes(
          detail.name ?? detail.code ?? "",
        )
      ) {
        throw new NotFoundException("Upload not found");
      }
      throw error;
    }
  }
}

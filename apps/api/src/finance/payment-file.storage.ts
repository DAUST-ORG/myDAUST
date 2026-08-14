import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BadRequestException, Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env.js";

export const MAX_PAYMENT_FILE_BYTES = 10 * 1024 * 1024;
const LOCAL_DIR = resolve(process.cwd(), ".data/payment-files");
const ALLOWED = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
]);

export function detectedPaymentFileMime(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-")
    return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "image/jpeg";
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  return null;
}

export function validatePaymentFile(
  file?: Pick<Express.Multer.File, "buffer" | "size" | "mimetype">,
  options: { imageOnly?: boolean } = {},
) {
  if (!file) throw new BadRequestException("A payment file is required");
  if (file.size > MAX_PAYMENT_FILE_BYTES)
    throw new BadRequestException("Payment files must be 10 MB or smaller");
  const mime = detectedPaymentFileMime(file.buffer);
  if (!mime || !ALLOWED.has(mime) || mime !== file.mimetype) {
    throw new BadRequestException("File must be a valid PDF, JPG, or PNG");
  }
  if (options.imageOnly && mime === "application/pdf") {
    throw new BadRequestException("QR codes must be JPG or PNG images");
  }
  return mime;
}

@Injectable()
export class PaymentFileStorage {
  private readonly env = loadEnv();
  private readonly s3 = new S3Client({ region: this.env.AWS_REGION });

  async put(
    file: Express.Multer.File,
    purpose: "payer-proofs" | "verification-proofs" | "qr-codes",
  ) {
    const mime = validatePaymentFile(file, {
      imageOnly: purpose === "qr-codes",
    });
    const now = new Date();
    const ext = ALLOWED.get(mime)!;
    const key = `payment-files/${purpose}/${now.getUTCFullYear()}/${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}/${randomUUID()}${ext}`;
    if (this.env.WIRE_PROOFS_BUCKET) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.WIRE_PROOFS_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: mime,
          ServerSideEncryption: "AES256",
        }),
      );
    } else {
      await mkdir(LOCAL_DIR, { recursive: true });
      await writeFile(
        resolve(LOCAL_DIR, key.replaceAll("/", "__")),
        file.buffer,
      );
    }
    return {
      objectKey: key,
      fileName: file.originalname,
      mimeType: mime as "application/pdf" | "image/jpeg" | "image/png",
      size: file.size,
    };
  }

  async get(key: string): Promise<Buffer> {
    if (this.env.WIRE_PROOFS_BUCKET) {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.env.WIRE_PROOFS_BUCKET,
          Key: key,
        }),
      );
      if (!result.Body) throw new Error("Payment file is empty");
      return Buffer.from(await result.Body.transformToByteArray());
    }
    if (key.startsWith("wire-proofs/")) {
      const legacyDir = resolve(process.cwd(), ".data/wire-proofs");
      return readFile(resolve(legacyDir, key.replaceAll("/", "__")));
    }
    return readFile(resolve(LOCAL_DIR, key.replaceAll("/", "__")));
  }
}

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BadRequestException, Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env.js";

export const MAX_WIRE_PROOF_BYTES = 10 * 1024 * 1024;
const LOCAL_DIR = resolve(process.cwd(), ".data/wire-proofs");
const ALLOWED = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
]);

export function detectedWireProofMime(buffer: Buffer): string | null {
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

export function validateWireProof(
  file?: Pick<Express.Multer.File, "buffer" | "size" | "mimetype">,
) {
  if (!file) throw new BadRequestException("A transfer proof is required");
  if (file.size > MAX_WIRE_PROOF_BYTES)
    throw new BadRequestException("Proof must be 10 MB or smaller");
  const mime = detectedWireProofMime(file.buffer);
  if (!mime || !ALLOWED.has(mime) || mime !== file.mimetype) {
    throw new BadRequestException(
      "Proof must be a valid PDF, JPG, or PNG file",
    );
  }
  return mime;
}

@Injectable()
export class WireProofStorage {
  private readonly env = loadEnv();
  private readonly s3 = new S3Client({ region: this.env.AWS_REGION });

  validate(file?: Express.Multer.File) {
    return validateWireProof(file);
  }

  async put(file: Express.Multer.File) {
    const mime = this.validate(file);
    const now = new Date();
    const ext = ALLOWED.get(mime) ?? extname(file.originalname).toLowerCase();
    const key = `wire-proofs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${ext}`;
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
    return { key, mime };
  }

  async get(key: string): Promise<Buffer> {
    if (this.env.WIRE_PROOFS_BUCKET) {
      const result = await this.s3.send(
        new GetObjectCommand({ Bucket: this.env.WIRE_PROOFS_BUCKET, Key: key }),
      );
      if (!result.Body) throw new Error("Proof object is empty");
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFile(resolve(LOCAL_DIR, key.replaceAll("/", "__")));
  }
}

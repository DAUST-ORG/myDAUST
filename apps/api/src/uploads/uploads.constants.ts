import { resolve } from "node:path";

// Local disk store for now (Track P starter). The S3 seam is the same controller
// returning a relative `/uploads/<file>` URL; swap diskStorage for an S3 client later.
// __dirname at runtime is apps/api/dist/uploads -> ../../uploads = apps/api/uploads.
export const UPLOADS_DIR = resolve(__dirname, "../../uploads");
export const UPLOADS_ROUTE = "/uploads";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

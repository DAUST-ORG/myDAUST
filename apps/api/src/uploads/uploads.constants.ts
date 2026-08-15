import { resolve } from "node:path";

// Local development falls back to disk. Production configures MEDIA_BUCKET so
// uploaded files survive ECS task replacements.
export const UPLOADS_DIR = resolve(__dirname, "../../uploads");
export const UPLOADS_ROUTE = "/uploads";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_SITE_VIDEO_BYTES = 25 * 1024 * 1024;

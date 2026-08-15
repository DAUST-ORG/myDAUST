import { describe, expect, it } from "vitest";
import {
  contentTypeForFilename,
  createUploadFilename,
  detectedUploadMime,
  detectedSiteVideoMime,
  isInlineSafe,
  validUploadFilename,
  validateUpload,
  validateSiteVideo,
} from "./uploads.storage.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PDF = Buffer.from("%PDF-1.7\nrest of file");
const GIF = Buffer.from("GIF89a________");
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
]);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const MP4 = Buffer.concat([
  Buffer.alloc(4),
  Buffer.from("ftypmp42"),
  Buffer.alloc(12),
]);
const WEBM_VIDEO = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(12),
]);

const asFile = (buffer: Buffer, mimetype: string) => ({
  buffer,
  size: buffer.length,
  mimetype,
});

describe("site hero video validation", () => {
  it("accepts MP4 and WebM by signature", () => {
    expect(detectedSiteVideoMime(MP4)).toBe("video/mp4");
    expect(detectedSiteVideoMime(WEBM_VIDEO)).toBe("video/webm");
    expect(validateSiteVideo(asFile(MP4, "application/octet-stream"))).toBe(
      "video/mp4",
    );
  });

  it("rejects an image or script renamed as video", () => {
    expect(() => validateSiteVideo(asFile(PNG, "video/mp4"))).toThrow(
      /valid MP4 or WebM/,
    );
    expect(() => validateSiteVideo(asFile(HTML, "video/webm"))).toThrow();
  });
});

describe("uploads storage", () => {
  it("creates randomized filenames while retaining a safe extension", () => {
    expect(createUploadFilename("Professor Portrait.JPG")).toMatch(
      /^[0-9a-f-]{36}\.jpg$/,
    );
    expect(createUploadFilename("unsafe.reallylongextension")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("rejects paths and accepts stored filenames", () => {
    expect(validUploadFilename("f8b23dc1-88e-4ab1-a979-05a83caac35e.png")).toBe(
      true,
    );
    expect(validUploadFilename("../secret.png")).toBe(false);
    expect(validUploadFilename("folder/secret.png")).toBe(false);
  });

  it("derives safe response content types", () => {
    expect(contentTypeForFilename("photo.jpeg")).toBe("image/jpeg");
    expect(contentTypeForFilename("document.unknown")).toBe(
      "application/octet-stream",
    );
  });
});

describe("upload content validation", () => {
  it("identifies allowed types by their magic bytes", () => {
    expect(detectedUploadMime(PNG)).toBe("image/png");
    expect(detectedUploadMime(JPEG)).toBe("image/jpeg");
    expect(detectedUploadMime(PDF)).toBe("application/pdf");
    expect(detectedUploadMime(GIF)).toBe("image/gif");
    expect(detectedUploadMime(WEBP)).toBe("image/webp");
  });

  it("rejects an SVG even when it claims to be an image", () => {
    // The stored-XSS case: an SVG is a script-capable document served from our origin.
    expect(detectedUploadMime(SVG)).toBeNull();
    expect(() => validateUpload(asFile(SVG, "image/svg+xml"))).toThrow(
      /Unsupported file type/,
    );
    expect(() => validateUpload(asFile(SVG, "image/png"))).toThrow(
      /Unsupported file type/,
    );
  });

  it("rejects a script disguised with an image content type", () => {
    expect(() => validateUpload(asFile(HTML, "image/png"))).toThrow(
      /Unsupported file type/,
    );
  });

  it("trusts the bytes, not the declared type, for allowed files", () => {
    // Real PNG mislabelled by the client is still accepted, as its true type.
    expect(validateUpload(asFile(PNG, "application/octet-stream"))).toBe(
      "image/png",
    );
  });

  it("rejects an empty or missing file", () => {
    expect(() => validateUpload(undefined)).toThrow(/No file provided/);
    expect(() =>
      validateUpload(asFile(Buffer.alloc(0), "image/png")),
    ).toThrow();
  });

  it("no longer maps .svg to a renderable type", () => {
    expect(contentTypeForFilename("logo.svg")).toBe("application/octet-stream");
  });

  it("only renders known-safe types inline", () => {
    expect(isInlineSafe("image/png")).toBe(true);
    expect(isInlineSafe("application/pdf")).toBe(true);
    expect(isInlineSafe("image/svg+xml")).toBe(false);
    expect(isInlineSafe("application/octet-stream")).toBe(false);
    expect(isInlineSafe("text/html")).toBe(false);
  });
});

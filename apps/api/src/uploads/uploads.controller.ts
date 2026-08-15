import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { Public, Roles } from "../auth/decorators.js";
import {
  MAX_SITE_VIDEO_BYTES,
  MAX_UPLOAD_BYTES,
  UPLOADS_ROUTE,
} from "./uploads.constants.js";
import { isInlineSafe, UploadsStorage } from "./uploads.storage.js";

@Controller("uploads")
export class UploadsController {
  constructor(private readonly storage: UploadsStorage) {}

  @Public()
  @Get("site-media/:filename")
  async siteVideo(
    @Param("filename") filename: string,
    @Headers("range") range: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.storage.streamSiteVideo(filename, range);
    response.status(file.partial ? 206 : 200);
    response.set({
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": file.contentType,
      "Content-Length": String(file.end - file.start + 1),
      "X-Content-Type-Options": "nosniff",
      ...(file.partial
        ? { "Content-Range": `bytes ${file.start}-${file.end}/${file.size}` }
        : {}),
    });
    file.body.on("error", () => response.destroy());
    file.body.pipe(response);
  }

  @Public()
  @Get(":filename")
  async download(
    @Param("filename") filename: string,
    @Res() response: Response,
  ) {
    const file = await this.storage.get(filename);
    response.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.length),
      "X-Content-Type-Options": "nosniff",
      // Anything not on the inline allowlist downloads rather than rendering. `nosniff`
      // alone would not help against a type the browser is willing to execute (an SVG
      // served as image/svg+xml runs its scripts), so the disposition is the real guard
      // for legacy objects stored before upload validation existed.
      ...(isInlineSafe(file.contentType)
        ? {}
        : { "Content-Disposition": `attachment; filename="${filename}"` }),
    });
    response.send(file.body);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    const filename = await this.storage.put(file);
    return {
      url: `${UPLOADS_ROUTE}/${filename}`,
      name: file.originalname,
      size: file.size,
    };
  }

  @Post("site-video")
  @Roles("communications", "admin")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SITE_VIDEO_BYTES },
    }),
  )
  async uploadSiteVideo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("No video provided");
    const filename = await this.storage.putSiteVideo(file);
    return {
      url: `${UPLOADS_ROUTE}/site-media/${filename}`,
      name: file.originalname,
      size: file.size,
    };
  }
}

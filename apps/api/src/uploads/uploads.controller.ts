import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { MAX_UPLOAD_BYTES, UPLOADS_DIR, UPLOADS_ROUTE } from "./uploads.constants.js";

@Controller("uploads")
export class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return {
      url: `${UPLOADS_ROUTE}/${file.filename}`,
      name: file.originalname,
      size: file.size,
    };
  }
}

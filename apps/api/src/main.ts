import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextFunction, Request, Response } from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ZodExceptionFilter } from "./common/zod-exception.filter.js";
import { loadEnv } from "./config/env.js";
import { UPLOADS_ROUTE } from "./uploads/uploads.constants.js";

// Load the monorepo-root .env (gitignored) before anything reads process.env.
loadDotenv({ path: resolve(__dirname, "../../../.env") });
loadDotenv();

async function bootstrap() {
  const env = loadEnv();
  // rawBody keeps the exact bytes of the request available alongside the parsed body.
  // Signed webhooks (PI-SPI signs an HMAC over the body) cannot be verified from the
  // parsed object: re-serialising JSON changes key order and spacing, so the signature
  // would never match.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ZodExceptionFilter(app.getHttpAdapter()));
  // Keep legacy `/uploads/<file>` URLs stable while the controller streams the
  // object from persistent storage at `/api/uploads/<file>`.
  app.use(
    UPLOADS_ROUTE,
    (request: Request, response: Response, next: NextFunction) => {
      if (!["GET", "HEAD"].includes(request.method)) return next();
      const filename = request.path.replace(/^\/+/, "");
      if (!filename || filename.includes("/")) return next();
      return response.redirect(
        307,
        `/api/uploads/${encodeURIComponent(filename)}`,
      );
    },
  );
  app.enableCors({
    origin: [
      ...new Set([env.PORTAL_ORIGIN, env.VITRINE_ORIGIN, env.PAYMENT_ORIGIN]),
    ],
    credentials: true, // session cookie flows cross-origin (same-site localhost)
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "sentry-trace",
      "baggage",
    ],
  });

  await app.listen(env.PORT);
  console.log(`api listening on :${env.PORT}`);
}

void bootstrap();

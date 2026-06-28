import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ZodExceptionFilter } from "./common/zod-exception.filter.js";
import { loadEnv } from "./config/env.js";
import { UPLOADS_DIR, UPLOADS_ROUTE } from "./uploads/uploads.constants.js";

// Load the monorepo-root .env (gitignored) before anything reads process.env.
loadDotenv({ path: resolve(__dirname, "../../../.env") });
loadDotenv();

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ZodExceptionFilter(app.getHttpAdapter()));
  // Serve uploaded files (Track P: local disk now, S3 later) outside the /api prefix.
  app.use(UPLOADS_ROUTE, express.static(UPLOADS_DIR));
  app.enableCors({
    origin: [env.PORTAL_ORIGIN, env.VITRINE_ORIGIN],
    credentials: true, // session cookie flows cross-origin (same-site localhost)
    allowedHeaders: ["Content-Type", "Authorization", "sentry-trace", "baggage"],
  });

  await app.listen(env.PORT);
  console.log(`api listening on :${env.PORT}`);
}

void bootstrap();

import { type ArgumentsHost, Catch, HttpStatus } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Response } from "express";

interface ZodIssue {
  path: (string | number)[];
  message: string;
}

// Controllers validate request bodies with `Schema.parse(body)`. A parse failure throws a
// ZodError, which Nest would otherwise render as a 500 — a client input problem must be a 400.
// We duck-type the error rather than `instanceof ZodError`: @mydaust/shared is ESM and imports
// zod's ESM build while this CJS app imports zod's CJS build, so the two ZodError classes are
// distinct instances (dual-package hazard) and instanceof would never match. Everything that
// isn't a Zod error is delegated to Nest's default handling.
@Catch()
export class ZodExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const issues = (exception as { issues?: unknown })?.issues;
    const isZodError =
      (exception as { name?: string })?.name === "ZodError" && Array.isArray(issues);
    if (!isZodError) return super.catch(exception, host);

    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: "Bad Request",
      message: "Validation failed",
      issues: (issues as ZodIssue[]).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
}

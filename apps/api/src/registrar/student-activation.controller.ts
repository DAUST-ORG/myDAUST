import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Public } from "../auth/decorators.js";
import { StudentActivationService } from "./student-activation.service.js";
import { StudentActivationStartThrottleGuard } from "./student-activation-throttle.guard.js";

// Identity mismatches deliberately enter the service as ordinary strings so
// they receive the same accepted response. Only the browser-generated 256-bit
// completion capability has a strict wire format.
const StartInput = z
  .object({
    studentNo: z.string().max(128),
    dob: z.string().max(32),
    requestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

/** First-time student activation using an exact student ID and birth date. */
@Controller("student-activation")
export class StudentActivationPublicController {
  constructor(private readonly activation: StudentActivationService) {}

  @Public()
  @Post("requests")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(StudentActivationStartThrottleGuard)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  @Header("X-Robots-Tag", "noindex, nofollow, noarchive")
  start(@Body() body: unknown) {
    const input = StartInput.parse(body);
    return this.activation.start(input);
  }
}

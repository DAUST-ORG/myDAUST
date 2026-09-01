import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { StudentActivationService } from "./student-activation.service.js";
import {
  StudentActivationStaffThrottleGuard,
  StudentActivationStartThrottleGuard,
  StudentActivationStatusThrottleGuard,
} from "./student-activation-throttle.guard.js";

// Keep public syntax failures inside the same non-enumerating service contract.
// Strict calendar validation is performed with a UTC round trip in the service.
const StartInput = z.object({
  studentNo: z.string().max(128),
  dob: z.string().max(32),
}).strict();
const StatusInput = z.object({
  requestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
const ResolveInput = z.object({
  studentNo: z.string().trim().min(1).max(40),
  approvalCode: z.string().regex(/^\d{6}$/),
}).strict();
const ApproveInput = z.object({
  approvalCode: z.string().regex(/^\d{6}$/),
  identityVerified: z.literal(true),
}).strict();

/** Anonymous half of the paired, in-person student activation ceremony. */
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
    return this.activation.start(input.studentNo, input.dob);
  }

  @Public()
  @Post("status")
  @HttpCode(HttpStatus.OK)
  @UseGuards(StudentActivationStatusThrottleGuard)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  @Header("X-Robots-Tag", "noindex, nofollow, noarchive")
  status(@Body() body: unknown) {
    const { requestToken } = StatusInput.parse(body);
    return this.activation.status(requestToken);
  }
}

/** Authenticated registrar half. There is deliberately no list or GET route. */
@Controller("registrar/student-activation-requests")
@Roles("admin", "registrar")
export class StudentActivationStaffController {
  constructor(private readonly activation: StudentActivationService) {}

  @Post("resolve")
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "registrar")
  @UseGuards(StudentActivationStaffThrottleGuard)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  resolve(@Body() body: unknown) {
    const input = ResolveInput.parse(body);
    return this.activation.resolveForStaff(
      input.studentNo,
      input.approvalCode,
    );
  }

  @Post(":requestId/approve")
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "registrar")
  @UseGuards(StudentActivationStaffThrottleGuard)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  approve(
    @CurrentUser() user: AuthUser,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    const id = z.string().uuid().parse(requestId);
    const { approvalCode } = ApproveInput.parse(body);
    return this.activation.approve(user.personId, id, approvalCode, {
      identityVerification: "official_photo_credential_checked_in_person",
    });
  }
}

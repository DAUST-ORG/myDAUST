import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { PaymentMethodsConfig, ProofPaymentMethod } from "@mydaust/shared";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";
import { FinanceService } from "./finance.service.js";
import { MAX_PAYMENT_FILE_BYTES } from "./payment-file.storage.js";
import { PaymentSubmissionsService } from "./payment-submissions.service.js";

const StudentAttemptInput = z.object({
  invoiceId: z.string().min(1).max(64),
  amountXof: z.number().int().positive().max(100_000_000),
  method: ProofPaymentMethod,
});
const LinkAttemptInput = z.object({
  method: ProofPaymentMethod,
  contactEmail: z.string().trim().email().max(160),
});
const PublicBillCapability = z.object({
  studentNo: z.string().trim().min(3).max(64),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const MethodInput = z.object({ method: ProofPaymentMethod });
const VerifyInput = z.object({
  transactionReference: z.string().trim().min(1).max(160),
  note: z.string().trim().max(1000).optional(),
});
const RejectInput = z.object({ reason: z.string().trim().min(1).max(1000) });
const QrMethod = z.enum(["wave", "orange_money"]);
const Status = z.enum([
  "awaiting_proof",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
]);

@Controller("finance")
export class PaymentSubmissionsController {
  constructor(
    private readonly submissions: PaymentSubmissionsService,
    private readonly finance: FinanceService,
  ) {}

  @Public()
  @Get("payment-methods")
  methods() {
    return this.submissions.publicMethods();
  }

  @Public()
  @Get("payment-methods/:method/qr")
  async qr(@Param("method") rawMethod: string) {
    const qr = await this.submissions.getConfiguredQr(
      QrMethod.parse(rawMethod),
    );
    return new StreamableFile(qr.data, {
      type: qr.mimeType,
      disposition: `inline; filename="${qr.fileName.replace(/[\r\n"]/g, "")}"`,
    });
  }

  @Roles("student")
  @Get("my/payment-attempts")
  listMine(@CurrentUser() user: AuthUser) {
    return this.submissions.listForStudent(user.studentId!);
  }

  @Roles("student")
  @Post("my/payment-attempts")
  createMine(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = StudentAttemptInput.parse(body);
    return this.submissions.createForStudent({
      ...input,
      studentId: user.studentId!,
      source: "student_portal",
      actor: user,
    });
  }

  @Roles("student")
  @Get("my/payment-attempts/:id")
  getMine(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.submissions.getForStudent(id, user.studentId!);
  }

  @Roles("student")
  @Patch("my/payment-attempts/:id")
  changeMine(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { method } = MethodInput.parse(body);
    return this.submissions.changeMethod(id, method, {
      studentId: user.studentId!,
    });
  }

  @Roles("student")
  @Post("my/payment-attempts/:id/proof")
  @UseInterceptors(
    FileInterceptor("proof", { limits: { fileSize: MAX_PAYMENT_FILE_BYTES } }),
  )
  submitMine(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    return this.submissions.submitProof(id, proof, {
      studentId: user.studentId!,
    });
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Get("payment-attempts/:id/qr")
  async attemptQr(
    @Param("id") id: string,
    @Query("resumeToken") resumeToken: string,
  ) {
    const qr = await this.submissions.getAttemptQr(id, resumeToken);
    return new StreamableFile(qr.data, {
      type: qr.mimeType,
      disposition: `inline; filename="${qr.fileName.replace(/[\r\n"]/g, "")}"`,
    });
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Get("payment-attempts/resume/:token")
  resume(@Param("token") token: string) {
    return this.submissions.getByResumeToken(token);
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Patch("payment-attempts/resume/:token/:id")
  changeResumed(
    @Param("token") token: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { method } = MethodInput.parse(body);
    return this.submissions.changeMethod(id, method, { resumeToken: token });
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Post("payment-attempts/resume/:token/:id/proof")
  @UseInterceptors(
    FileInterceptor("proof", { limits: { fileSize: MAX_PAYMENT_FILE_BYTES } }),
  )
  submitResumed(
    @Param("token") token: string,
    @Param("id") id: string,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    return this.submissions.submitProof(id, proof, { resumeToken: token });
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Post("links/:token/payment-attempts")
  createForLink(@Param("token") token: string, @Body() body: unknown) {
    const input = LinkAttemptInput.parse(body);
    return this.submissions.createForPaymentLink(
      token,
      input.method,
      input.contactEmail,
    );
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Get("links/:token/payment-attempts")
  listForLink(@Param("token") token: string) {
    return this.submissions.listForPaymentLinkToken(token);
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Get("applications/:id/payment-attempts")
  listForApplicant(@Param("id") id: string) {
    return this.submissions.listForApplicant(id);
  }

  @Public()
  @UseGuards(BillThrottleGuard)
  @Post("public/bill/payment-attempts/history")
  async listForPublicBill(@Body() body: unknown) {
    const input = PublicBillCapability.parse(body);
    const studentId = await this.finance.publicBillStudentId(
      input.studentNo,
      input.dob,
    );
    return this.submissions.listForStudent(studentId);
  }

  @Roles("bursar", "admin")
  @Get("admin/payment-methods")
  adminConfig() {
    return this.submissions.getConfig();
  }

  @Roles("bursar", "admin")
  @Patch("admin/payment-methods")
  updateAdminConfig(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.submissions.updateConfig(
      PaymentMethodsConfig.parse(body),
      user.personId,
    );
  }

  @Roles("bursar", "admin")
  @Post("admin/payment-methods/:method/qr")
  @UseInterceptors(
    FileInterceptor("qr", { limits: { fileSize: MAX_PAYMENT_FILE_BYTES } }),
  )
  uploadAdminQr(
    @CurrentUser() user: AuthUser,
    @Param("method") rawMethod: string,
    @UploadedFile() qr: Express.Multer.File,
  ) {
    return this.submissions.uploadQr(
      QrMethod.parse(rawMethod),
      qr,
      user.personId,
    );
  }

  @Roles("bursar", "admin")
  @Get("admin/payment-submissions")
  listAdmin(@Query("status") rawStatus?: string) {
    return this.submissions.listAdmin(
      rawStatus ? Status.parse(rawStatus) : undefined,
    );
  }

  @Roles("bursar", "admin")
  @Get("admin/payment-submissions/:id/files/:kind")
  async adminFile(@Param("id") id: string, @Param("kind") rawKind: string) {
    const kind = z.enum(["payer", "verification"]).parse(rawKind);
    const file = await this.submissions.getFile(id, kind);
    return new StreamableFile(file.data, {
      type: file.mimeType,
      disposition: `inline; filename="${file.fileName}"`,
    });
  }

  @Roles("bursar")
  @Post("admin/payment-submissions/:id/verify")
  @UseInterceptors(
    FileInterceptor("verificationProof", {
      limits: { fileSize: MAX_PAYMENT_FILE_BYTES },
    }),
  )
  verify(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    return this.submissions.verify(id, VerifyInput.parse(body), proof, user);
  }

  @Roles("bursar")
  @Post("admin/payment-submissions/:id/reject")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.submissions.reject(id, RejectInput.parse(body).reason, user);
  }
}

const AuditInput = z.object({
  outcome: z.enum(["reviewed", "flagged"]),
  note: z.string().trim().max(1000).optional(),
});

@Controller("director/payment-verifications")
@Roles("admin")
export class DirectorPaymentVerificationsController {
  constructor(private readonly submissions: PaymentSubmissionsService) {}

  @Get()
  list() {
    return this.submissions.listDirector();
  }

  @Get("unaudited-count")
  count() {
    return this.submissions.unauditedCount().then((count) => ({ count }));
  }

  @Post(":id/audit")
  audit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = AuditInput.parse(body);
    return this.submissions.audit(id, input.outcome, input.note, user);
  }

  @Get(":id/files/:kind")
  async file(@Param("id") id: string, @Param("kind") rawKind: string) {
    const kind = z.enum(["payer", "verification"]).parse(rawKind);
    const file = await this.submissions.getFile(id, kind);
    return new StreamableFile(file.data, {
      type: file.mimeType,
      disposition: `inline; filename="${file.fileName}"`,
    });
  }
}

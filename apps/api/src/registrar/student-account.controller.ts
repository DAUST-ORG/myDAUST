import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { StudentAccountService } from "./student-account.service.js";

const ContactEmailInput = z
  .object({
    contactEmail: z.string().trim().email().max(160).nullable(),
  })
  .strict();

const CredentialInput = z
  .object({ method: z.enum(["temporary_password", "setup_link"]) })
  .strict();

@Controller("registrar/students/:id/account")
@Roles("admin", "registrar")
export class StudentAccountController {
  constructor(private readonly accounts: StudentAccountService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  get(@Param("id") studentId: string) {
    return this.accounts.getAccount(studentId);
  }

  @Patch("contact-email")
  @Header("Cache-Control", "private, no-store")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  updateContactEmail(
    @CurrentUser() user: AuthUser,
    @Param("id") studentId: string,
    @Body() body: unknown,
  ) {
    const input = ContactEmailInput.parse(body);
    return this.accounts.updateContactEmail(
      user.personId,
      studentId,
      input.contactEmail,
    );
  }

  @Post("credentials")
  @Header("Cache-Control", "private, no-store")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  issueCredentials(
    @CurrentUser() user: AuthUser,
    @Param("id") studentId: string,
    @Body() body: unknown,
  ) {
    const input = CredentialInput.parse(body);
    return this.accounts.issueCredentials(
      user.personId,
      studentId,
      input.method,
    );
  }

  @Post("sign-out-all")
  @Header("Cache-Control", "private, no-store")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  signOutAll(@CurrentUser() user: AuthUser, @Param("id") studentId: string) {
    return this.accounts.signOutAll(user.personId, studentId);
  }
}

import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import {
  WORKBOOK_CUTOVER_ATTESTATION_REVOCATION_REASONS,
  WorkbookCutoverAttestationService,
} from "./workbook-cutover-attestation.service.js";

const ManifestSha256 = z.string().regex(/^[0-9a-f]{64}$/);
const AttestInput = z
  .object({
    manifestSha256: ManifestSha256,
    affirmed: z.literal(true),
  })
  .strict();
const RevokeInput = z
  .object({
    reasonCode: z.enum(WORKBOOK_CUTOVER_ATTESTATION_REVOCATION_REASONS),
  })
  .strict();

@Controller("finance/workbook-cutover-attestations")
@Roles("admin", "bursar", "registrar", "admissions")
export class WorkbookCutoverAttestationController {
  constructor(
    private readonly attestations: WorkbookCutoverAttestationService,
  ) {}

  @Get(":manifestSha256")
  status(
    @CurrentUser() user: AuthUser,
    @Param("manifestSha256") manifestSha256: string,
  ) {
    return this.attestations.status(user, ManifestSha256.parse(manifestSha256));
  }

  @Post()
  attest(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = AttestInput.parse(body);
    return this.attestations.attest(user, input.manifestSha256);
  }

  @Post(":manifestSha256/revoke")
  revoke(
    @CurrentUser() user: AuthUser,
    @Param("manifestSha256") manifestSha256: string,
    @Body() body: unknown,
  ) {
    const input = RevokeInput.parse(body);
    return this.attestations.revoke(
      user,
      ManifestSha256.parse(manifestSha256),
      input.reasonCode,
    );
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  type AppRole,
  type CreateUserInput,
  type ManagedUser,
  type ManagedUserPage,
  type SuspendUserInput,
  type UpdateUserInput,
  type UserListQuery,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { FacultyService } from "../faculty/faculty.service.js";
import { RegistrarService } from "../registrar/registrar.service.js";
import type { AuthUser } from "../auth/current-user.js";
import {
  ROLES_NEEDING_A_RECORD,
  canAdminister,
  canGrantRole,
  normalizeRoles,
  roleDelta,
} from "./user-authority.js";

/** Student logins stay on mydaust.com, where the existing cohort already lives. */
const DOMAINS_BY_KIND: Record<string, readonly string[]> = {
  student: ["mydaust.com"],
  faculty: ["daust.org", "mydaust.com"],
  staff: ["daust.org", "mydaust.com"],
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faculty: FacultyService,
    private readonly registrar: RegistrarService,
  ) {}

  /**
   * The last-admin guard reads a count and then writes a different row, which is textbook
   * write skew: two concurrent demotions each see two admins, each commits, and nobody is
   * left. Serializable makes PostgreSQL detect the conflict; P2034 is retried.
   */
  private async serializableTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Serializable transaction retry limit exhausted");
  }

  /** Readable temp password, no ambiguous characters. Returned once, never stored or audited. */
  private randomTempPassword(): string {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = randomBytes(14);
    let out = "";
    for (let i = 0; i < 14; i += 1) out += alphabet[bytes[i]! % alphabet.length];
    return out;
  }

  private async mustFind(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException("User not found");
    return person;
  }

  /** The ceiling: refuse to act on anyone holding a role the caller could not grant. */
  private assertMayAdminister(actor: AuthUser, targetRoles: readonly string[]) {
    if (!canAdminister(actor.roles, targetRoles)) {
      throw new ForbiddenException(
        "This account holds a role you are not permitted to assign, so you cannot administer it",
      );
    }
  }

  private assertNotSelf(actor: AuthUser, id: string, action: string) {
    if (actor.personId === id) {
      throw new BadRequestException(`You cannot ${action} your own account`);
    }
  }

  private composeEmail(local: string, domain: string, kind: string): string {
    const allowed = DOMAINS_BY_KIND[kind] ?? [];
    if (!allowed.includes(domain)) {
      throw new BadRequestException(
        `A ${kind} login must use ${allowed.join(" or ")}`,
      );
    }
    return `${local}@${domain}`.toLowerCase();
  }

  // --- Reads ---------------------------------------------------------------

  async list(query: UserListQuery): Promise<ManagedUserPage> {
    const where: Prisma.PersonWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.status) where.status = query.status;
    if (query.role) where.roles = { has: query.role };
    // Deliberately NOT filtered to role-holders: an account with no role can still sign in,
    // and this is the only screen that can find it and fix it.
    if (query.roleless) where.roles = { isEmpty: true };
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { student: { is: { studentNo: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [total, people] = await Promise.all([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { student: { select: { id: true, studentNo: true } } },
      }),
    ]);

    const rows: ManagedUser[] = people.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      kind: p.kind,
      roles: p.roles,
      status: p.status,
      suspendedAt: p.suspendedAt?.toISOString() ?? null,
      hasLogin: p.passwordHash !== null,
      mustChangePassword: p.mustChangePassword,
      studentId: p.student?.id ?? null,
      studentNo: p.student?.studentNo ?? null,
      createdAt: p.createdAt.toISOString(),
    }));

    return { rows, total, page: query.page, pageSize: query.pageSize };
  }

  // --- Create --------------------------------------------------------------

  async create(actor: AuthUser, input: CreateUserInput) {
    const roles = normalizeRoles(input.roles as AppRole[]);
    // Same ceiling as editing: otherwise an it_admin creates a ["registrar","bursar"] account
    // and reads its temp password straight off the screen.
    for (const role of roles) {
      if (!canGrantRole(actor.roles, role)) {
        throw new ForbiddenException(`You are not permitted to assign ${role}`);
      }
    }
    const email = this.composeEmail(
      input.emailLocal,
      input.emailDomain,
      input.kind,
    );
    if (await this.prisma.person.findUnique({ where: { email } })) {
      throw new ConflictException(`${email} is already in use`);
    }

    if (input.kind === "student") return this.createStudent(actor, input, email);
    if (input.kind === "faculty") return this.createFaculty(actor, input, email);
    return this.createStaff(actor, input, email, roles);
  }

  /**
   * Delegated so a student is never a bare Person with a student role: createStudent builds
   * the Student row, the billing assignment and the roster membership every student screen
   * assumes. Then provisionLogin issues the credential, because createStudent alone leaves
   * passwordHash null and sends a setup email that cannot arrive -- there is no mailbox behind
   * a mydaust.com address, and PUBLIC_URL is unset in production.
   */
  private async createStudent(
    actor: AuthUser,
    input: CreateUserInput,
    email: string,
  ) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException(
        "Creating a student record is a registrar action; ask an administrator",
      );
    }
    const s = input.student!;
    const created = await this.registrar.createStudent(actor.personId, {
      studentNo: s.studentNo,
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      programCode: s.programCode,
      cohort: s.cohort,
      catalogYear: s.catalogYear,
      yearLevel: s.yearLevel,
      dateOfBirth: s.dateOfBirth,
      phone: s.phone,
    });

    if (!input.provisionLogin) return { id: created.id, email, tempPassword: null };

    const provisioned = await this.registrar.provisionLogin(
      actor.personId,
      created.id,
    );
    return {
      id: created.id,
      email: provisioned.email ?? email,
      tempPassword: provisioned.tempPassword,
    };
  }

  private async createFaculty(
    actor: AuthUser,
    input: CreateUserInput,
    email: string,
  ) {
    const created = await this.faculty.createFaculty(
      {
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        provisionLogin: input.provisionLogin,
      },
      actor.personId,
    );
    return { id: created.id, email: created.email, tempPassword: created.tempPassword };
  }

  private async createStaff(
    actor: AuthUser,
    input: CreateUserInput,
    email: string,
    roles: AppRole[],
  ) {
    const tempPassword = input.provisionLogin ? this.randomTempPassword() : null;
    const person = await this.prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          kind: "staff",
          roles,
          // session-revocation-exempt: written while creating the Person, so there is no
          // earlier session to end.
          ...(tempPassword
            ? {
                passwordHash: await bcrypt.hash(tempPassword, 10),
                mustChangePassword: true,
              }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: created.id,
          action: "user-created",
          actorId: actor.personId,
          // The address and the roles, never the password.
          data: { email, roles, kind: "staff" },
        },
      });
      return created;
    });
    return { id: person.id, email, tempPassword };
  }

  // --- Roles ---------------------------------------------------------------

  async setRoles(actor: AuthUser, id: string, next: readonly AppRole[]) {
    this.assertNotSelf(actor, id, "change the roles on");
    const roles = normalizeRoles(next);
    const person = await this.mustFind(id);
    this.assertMayAdminister(actor, person.roles);

    const { added, removed } = roleDelta(person.roles, roles);
    for (const role of [...added, ...removed]) {
      if (!canGrantRole(actor.roles, role)) {
        throw new ForbiddenException(`You are not permitted to assign ${role}`);
      }
    }

    // A role that needs a backing record must have one, or the account authenticates into
    // queries that widen instead of failing.
    for (const role of added) {
      const requirement = ROLES_NEEDING_A_RECORD[role];
      if (!requirement) continue;
      const ok =
        role === "student"
          ? (await this.prisma.student.count({
              where: { personId: id, recordStatus: "active" },
            })) > 0
          : (await this.prisma.guardianStudent.count({
              where: { guardianId: id },
            })) > 0;
      if (!ok) {
        throw new BadRequestException(
          `Before granting ${role} this account needs ${requirement}`,
        );
      }
    }

    return this.serializableTransaction(async (tx) => {
      await this.assertAdminsRemain(tx, id, roles.includes("admin"));
      const updated = await tx.person.update({
        where: { id },
        data: { roles: [...roles] },
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: id,
          action: "roles-changed",
          actorId: actor.personId,
          data: { from: person.roles, to: roles },
        },
      });
      return { id: updated.id, email: updated.email, roles: updated.roles };
    });
  }

  /**
   * Refuse the change that leaves nobody able to administer anything. Counting inside the
   * serializable transaction is what makes it hold under concurrency; counting outside would
   * let two demotions of different people both pass.
   */
  private async assertAdminsRemain(
    tx: Prisma.TransactionClient,
    id: string,
    targetKeepsAdmin: boolean,
  ) {
    if (targetKeepsAdmin) return;
    const remaining = await tx.person.count({
      where: {
        id: { not: id },
        roles: { has: "admin" },
        status: "active",
        passwordHash: { not: null },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        "This is the last administrator who can sign in; grant admin to someone else first",
      );
    }
  }

  // --- Credentials ---------------------------------------------------------

  async resetPassword(actor: AuthUser, id: string) {
    const person = await this.mustFind(id);
    this.assertMayAdminister(actor, person.roles);
    if (!person.email) {
      throw new BadRequestException(
        "This account has no login address, so it has no password to reset",
      );
    }
    const tempPassword = this.randomTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          // Ends every session signed with the replaced password.
          sessionVersion: { increment: 1 },
        },
      });
      await this.burnInvites(tx, id);
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: id,
          action: "password-reset",
          actorId: actor.personId,
          // Never the password. Recorded because a reset hands the actor a working
          // credential for this account, which is a disclosure worth being able to trace.
          data: { disclosedToActor: true, targetRoles: person.roles },
        },
      });
    });

    return {
      id,
      name: `${person.firstName} ${person.lastName}`.trim(),
      email: person.email,
      tempPassword,
    };
  }

  /**
   * An outstanding invite is a credential. Leaving one live through a suspension means
   * whoever holds the link owns the account the moment it is restored.
   */
  private async burnInvites(tx: Prisma.TransactionClient, personId: string) {
    const usedAt = new Date();
    await tx.guardianInvite.updateMany({
      where: { guardianId: personId, usedAt: null },
      data: { usedAt },
    });
    await tx.studentInvite.updateMany({
      where: { studentPersonId: personId, usedAt: null },
      data: { usedAt },
    });
  }

  // --- Lifecycle -----------------------------------------------------------

  async suspend(actor: AuthUser, id: string, input: SuspendUserInput) {
    this.assertNotSelf(actor, id, "suspend");
    const person = await this.mustFind(id);
    this.assertMayAdminister(actor, person.roles);
    if (person.status === "suspended") {
      return { id, status: "suspended" as const };
    }

    return this.serializableTransaction(async (tx) => {
      await this.assertAdminsRemain(tx, id, false);
      await tx.person.update({
        where: { id },
        data: {
          status: "suspended",
          suspendedAt: new Date(),
          suspendedById: actor.personId,
          // Without this the suspension is advisory until their cookie expires.
          sessionVersion: { increment: 1 },
        },
      });
      await this.burnInvites(tx, id);
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: id,
          action: "suspended",
          actorId: actor.personId,
          data: { reason: input.reason ?? null, roles: person.roles },
        },
      });
      return { id, status: "suspended" as const };
    });
  }

  async restore(actor: AuthUser, id: string) {
    const person = await this.mustFind(id);
    this.assertMayAdminister(actor, person.roles);
    if (person.status === "active") return { id, status: "active" as const };

    await this.prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id },
        // suspendedAt must clear in the same statement; the DB CHECK rejects an active row
        // that still carries one.
        data: { status: "active", suspendedAt: null, suspendedById: null },
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: id,
          action: "restored",
          actorId: actor.personId,
        },
      });
    });
    return { id, status: "active" as const };
  }

  // --- Identity ------------------------------------------------------------

  async update(actor: AuthUser, id: string, input: UpdateUserInput) {
    const person = await this.mustFind(id);
    this.assertMayAdminister(actor, person.roles);

    const data: Prisma.PersonUpdateInput = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;

    let email: string | undefined;
    if (input.emailLocal !== undefined && input.emailDomain !== undefined) {
      email = this.composeEmail(input.emailLocal, input.emailDomain, person.kind);
      if (email !== person.email) {
        const clash = await this.prisma.person.findUnique({ where: { email } });
        if (clash) throw new ConflictException(`${email} is already in use`);
        data.email = email;
      }
    }
    if (Object.keys(data).length === 0) return { id, email: person.email };

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.person.update({ where: { id }, data });
      // The address is the sign-in identity, so changing it invalidates any setup link
      // pointing at the old one.
      if (data.email) await this.burnInvites(tx, id);
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: id,
          action: "user-updated",
          actorId: actor.personId,
          data: {
            from: {
              firstName: person.firstName,
              lastName: person.lastName,
              email: person.email,
            },
            to: {
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
            },
          },
        },
      });
      return row;
    });
    return { id: updated.id, email: updated.email };
  }
}

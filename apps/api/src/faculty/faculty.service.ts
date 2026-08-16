import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import {
  type FacultyCreateInput,
  type FacultyProfileInput,
  safeLink,
} from "@mydaust/shared";
import { requirePersonEmail } from "../auth/person-email.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Uploaded photo path (/uploads/...) or an http(s) URL; anything else → null. */
const safePhoto = (v: string | null | undefined): string | null =>
  typeof v === "string" && (/^\/[^/]/.test(v) || /^https?:\/\//i.test(v))
    ? v.slice(0, 300)
    : null;

/** Faculty list source: platform people holding the "faculty" role. */
function facultyWhere() {
  return { roles: { has: "faculty" } };
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0) ?? ""}${lastName.charAt(0) ?? ""}`.toUpperCase();
}

@Injectable()
export class FacultyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: professors toggled visible on the site (name merged from Person). */
  async publicList() {
    const rows = await this.prisma.facultyProfile.findMany({
      where: { publicProfile: true },
      include: {
        person: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { person: { lastName: "asc" } },
    });
    return rows.map((r) => ({
      id: r.personId,
      name: `${r.person.firstName} ${r.person.lastName}`.trim(),
      initials: initials(r.person.firstName, r.person.lastName),
      title: r.title,
      dept: r.dept,
      bio: r.bio,
      interests: r.interests,
      scholar: r.scholar,
      photo: r.photoUrl,
    }));
  }

  /** Comms: every platform faculty (with or without a profile), for the manager. */
  async adminList() {
    const people = await this.prisma.person.findMany({
      where: facultyWhere(),
      include: {
        facultyProfile: true,
        _count: { select: { taughtSections: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return people.map((p) => ({
      id: p.id,
      email: p.email,
      firstName: p.firstName,
      lastName: p.lastName,
      hasLogin: p.passwordHash !== null,
      mustChangePassword: p.mustChangePassword,
      publicProfile: p.facultyProfile?.publicProfile ?? false,
      assignedSectionCount: p._count.taughtSections,
      profile: p.facultyProfile
        ? {
            title: p.facultyProfile.title,
            dept: p.facultyProfile.dept,
            bio: p.facultyProfile.bio,
            interests: p.facultyProfile.interests,
            scholar: p.facultyProfile.scholar,
            photoUrl: p.facultyProfile.photoUrl,
          }
        : null,
    }));
  }

  /** Readable temp password (no ambiguous chars); shown once to the registrar, never stored plaintext. */
  private randomTempPassword(): string {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = randomBytes(14);
    let out = "";
    for (let i = 0; i < 14; i += 1)
      out += alphabet[bytes[i]! % alphabet.length];
    return out;
  }

  /**
   * Registrar: create a faculty member (Person with the faculty role) and an empty,
   * not-yet-public profile. Optionally provisions a login with a random temp password
   * (force-change on first sign-in) returned ONCE — never logged or audited.
   */
  async createFaculty(input: FacultyCreateInput, actorId: string) {
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.person.findUnique({ where: { email } })) {
      throw new BadRequestException(`Email ${email} is already in use`);
    }
    const tempPassword = input.provisionLogin
      ? this.randomTempPassword()
      : null;
    const person = await this.prisma.person.create({
      data: {
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        kind: "faculty",
        roles: ["faculty"],
        ...(tempPassword
          ? {
              passwordHash: await bcrypt.hash(tempPassword, 10),
              mustChangePassword: true,
            }
          : {}),
        facultyProfile: { create: { publicProfile: false } },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Person",
        entityId: person.id,
        action: "faculty-created",
        actorId,
        data: { email },
      },
    });
    return { id: person.id, email, tempPassword };
  }

  private async mustFaculty(personId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, ...facultyWhere() },
    });
    if (!person) throw new NotFoundException("Faculty member not found");
    return person;
  }

  /**
   * Give a faculty member a working login, or reset an existing one. Their
   * directory email remains the sign-in identity. The plaintext password is
   * returned once and is never included in the audit event.
   */
  async provisionLogin(actorId: string, personId: string) {
    const person = await this.mustFaculty(personId);
    const tempPassword = this.randomTempPassword();
    await this.prisma.person.update({
      where: { id: person.id },
      data: {
        passwordHash: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Person",
        entityId: person.id,
        action: "login-provisioned",
        actorId,
      },
    });
    return {
      facultyId: person.id,
      name: `${person.firstName} ${person.lastName}`.trim(),
      email: person.email,
      tempPassword,
    };
  }

  /** Bulk-provision only faculty who do not yet have a password. */
  async provisionAllMissing(actorId: string) {
    const people = await this.prisma.person.findMany({
      where: { ...facultyWhere(), passwordHash: null },
      select: { id: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const credentials = [];
    for (const person of people) {
      credentials.push(await this.provisionLogin(actorId, person.id));
    }
    return { count: credentials.length, credentials };
  }

  /** Comms: edit the name + profile fields (upserting the profile row). */
  async update(personId: string, input: FacultyProfileInput, actorId: string) {
    const person = await this.mustFaculty(personId);
    const email =
      input.email?.trim().toLowerCase() ??
      requirePersonEmail(person.email, "Faculty member");
    if (email !== person.email) {
      const existing = await this.prisma.person.findUnique({
        where: { email },
      });
      if (existing && existing.id !== person.id) {
        throw new BadRequestException(`Email ${email} is already in use`);
      }
    }
    await this.prisma.$transaction([
      this.prisma.person.update({
        where: { id: person.id },
        data: { firstName: input.firstName, lastName: input.lastName, email },
      }),
      this.prisma.facultyProfile.upsert({
        where: { personId: person.id },
        create: {
          personId: person.id,
          title: input.title ?? null,
          dept: input.dept ?? null,
          bio: input.bio ?? null,
          interests: input.interests,
          scholar: safeLink(input.scholar ?? undefined) || null,
          photoUrl: safePhoto(input.photoUrl),
        },
        update: {
          title: input.title ?? null,
          dept: input.dept ?? null,
          bio: input.bio ?? null,
          interests: input.interests,
          scholar: safeLink(input.scholar ?? undefined) || null,
          photoUrl: safePhoto(input.photoUrl),
        },
      }),
    ]);
    await this.prisma.auditLog.create({
      data: {
        entity: "FacultyProfile",
        entityId: person.id,
        action: "faculty-profile-updated",
        actorId,
      },
    });
    return { ok: true };
  }

  /**
   * Registrar: delete a faculty record only when no academic or operational
   * records reference it. Assigned instructors must be replaced first so a
   * mistaken click can never orphan a section or its grade history.
   */
  async remove(personId: string, actorId: string) {
    if (personId === actorId) {
      throw new BadRequestException("You cannot delete your own account");
    }
    const person = await this.prisma.person.findFirst({
      where: { id: personId, ...facultyWhere() },
      select: {
        id: true,
        email: true,
        _count: {
          select: {
            taughtSections: true,
            threadParticipations: true,
            messagesSent: true,
            projectMemberships: true,
            guardianOf: true,
            guardianInvites: true,
            studentInvites: true,
            broadcasts: true,
            paymentSubmissionsStarted: true,
            paymentSubmissionsVerified: true,
          },
        },
      },
    });
    if (!person) throw new NotFoundException("Faculty member not found");
    if (person._count.taughtSections > 0) {
      throw new ConflictException(
        `This faculty member is assigned to ${person._count.taughtSections} section${person._count.taughtSections === 1 ? "" : "s"}. Reassign those sections before deleting the record.`,
      );
    }
    const otherReferences = Object.entries(person._count)
      .filter(([key]) => key !== "taughtSections")
      .reduce((sum, [, count]) => sum + count, 0);
    if (otherReferences > 0) {
      throw new ConflictException(
        "This faculty member has activity that must be retained. Remove their faculty role instead of deleting the account.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: person.id,
          action: "faculty-deleted",
          actorId,
          data: { email: person.email },
        },
      });
      await tx.person.delete({ where: { id: person.id } });
    });
    return { ok: true };
  }

  /** Comms: flip whether the professor appears on the public site. */
  async setVisibility(personId: string, visible: boolean, actorId: string) {
    const person = await this.mustFaculty(personId);
    await this.prisma.facultyProfile.upsert({
      where: { personId: person.id },
      create: { personId: person.id, publicProfile: visible },
      update: { publicProfile: visible },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "FacultyProfile",
        entityId: person.id,
        action: visible ? "faculty-made-public" : "faculty-made-private",
        actorId,
      },
    });
    return { ok: true };
  }
}

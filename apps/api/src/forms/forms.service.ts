import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type CustomFormStatus } from "@mydaust/db";
import type {
  CreateFormInput,
  FormCondition,
  AuthRespondInput,
  PublicRespondInput,
} from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import * as crypto from "node:crypto";

// CSV injection prevention — prefix formula-triggering leading chars
export function escapeCsvCell(v: string): string {
  let safe = v;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = "'" + safe;
  }
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    safe = `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Registrar CRUD ───────────────────────────────────────────────────────

  async create(actor: AuthUser, input: CreateFormInput) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const form = await this.prisma.customForm.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        createdById: actor.personId,
        requiresAuth: input.requiresAuth ?? true,
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        maxResponses: input.maxResponses ?? null,
        sections: {
          create: input.sections.map((s, si) => ({
            title: s.title,
            sortOrder: s.sortOrder ?? si,
            conditionJson: s.conditionJson
              ? (s.conditionJson as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            fields: {
              create: s.fields.map((f, fi) => ({
                type: f.type,
                label: f.label,
                required: f.required ?? false,
                sortOrder: f.sortOrder ?? fi,
                optionsJson: f.optionsJson
                  ? (JSON.stringify(f.optionsJson) as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                conditionJson: f.conditionJson
                  ? (f.conditionJson as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              })),
            },
          })),
        },
      },
      include: { sections: { include: { fields: true }, orderBy: { sortOrder: "asc" } } },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: "CustomForm",
        entityId: form.id,
        action: "created",
        actorId: actor.personId,
        data: { title: input.title, sectionCount: input.sections.length },
      },
    });

    return form;
  }

  async list(actor: AuthUser) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    return this.prisma.customForm.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        requiresAuth: true,
        publishedAt: true,
        closesAt: true,
        maxResponses: true,
        responseCount: true,
        createdAt: true,
      },
    });
  }

  async getDetail(id: string) {
    const form = await this.prisma.customForm.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { fields: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!form) throw new NotFoundException("Form not found");
    return form;
  }

  async update(id: string, actor: AuthUser, input: CreateFormInput) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const existing = await this.prisma.customForm.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Form not found");
    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft forms can be edited");
    }

    return this.prisma.$transaction(async (tx) => {
      // Delete existing sections (cascades to fields + answers)
      await tx.formSection.deleteMany({ where: { formId: id } });

      const updated = await tx.customForm.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description ?? null,
          requiresAuth: input.requiresAuth ?? true,
          closesAt: input.closesAt ? new Date(input.closesAt) : null,
          maxResponses: input.maxResponses ?? null,
          sections: {
            create: input.sections.map((s, si) => ({
              title: s.title,
              sortOrder: s.sortOrder ?? si,
              conditionJson: s.conditionJson
                ? (s.conditionJson as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              fields: {
                create: s.fields.map((f, fi) => ({
                  type: f.type,
                  label: f.label,
                  required: f.required ?? false,
                  sortOrder: f.sortOrder ?? fi,
                  optionsJson: f.optionsJson
                    ? (JSON.stringify(f.optionsJson) as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
                  conditionJson: f.conditionJson
                    ? (f.conditionJson as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
                })),
              },
            })),
          },
        },
        include: {
          sections: { include: { fields: true }, orderBy: { sortOrder: "asc" } },
        },
      });

      await tx.auditLog.create({
        data: {
          entity: "CustomForm",
          entityId: id,
          action: "updated",
          actorId: actor.personId,
          data: { title: input.title, sectionCount: input.sections.length },
        },
      });

      return updated;
    });
  }

  async publish(id: string, actor: AuthUser) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const form = await this.prisma.customForm.findUnique({
      where: { id },
      include: { sections: { include: { fields: true } } },
    });
    if (!form) throw new NotFoundException("Form not found");
    if (form.status !== "draft") {
      throw new BadRequestException("Only draft forms can be published");
    }
    if (form.sections.length === 0 || form.sections.every((s) => s.fields.length === 0)) {
      throw new BadRequestException("Form must have at least one section with at least one field");
    }

    const publicToken =
      !form.requiresAuth
        ? crypto.randomBytes(32).toString("base64url")
        : null;

    const updated = await this.prisma.customForm.update({
      where: { id },
      data: {
        status: "published" satisfies CustomFormStatus,
        publishedAt: new Date(),
        publicToken,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: "CustomForm",
        entityId: id,
        action: "published",
        actorId: actor.personId,
        data: { requiresAuth: form.requiresAuth, hasPublicToken: publicToken !== null },
      },
    });

    return updated;
  }

  async close(id: string, actor: AuthUser) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const form = await this.prisma.customForm.findUnique({ where: { id } });
    if (!form) throw new NotFoundException("Form not found");
    if (form.status !== "published") {
      throw new BadRequestException("Only published forms can be closed");
    }

    const updated = await this.prisma.customForm.update({
      where: { id },
      data: { status: "closed" satisfies CustomFormStatus },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: "CustomForm",
        entityId: id,
        action: "closed",
        actorId: actor.personId,
      },
    });

    return updated;
  }

  async deleteForm(id: string, actor: AuthUser) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const form = await this.prisma.customForm.findUnique({ where: { id } });
    if (!form) throw new NotFoundException("Form not found");
    if (form.status !== "draft") {
      throw new BadRequestException("Only draft forms can be deleted");
    }

    await this.prisma.customForm.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        entity: "CustomForm",
        entityId: id,
        action: "deleted",
        actorId: actor.personId,
        data: { title: form.title },
      },
    });

    return { deleted: true };
  }

  // ─── Responses (registrar view) ───────────────────────────────────────────

  async listResponses(formId: string) {
    const form = await this.prisma.customForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException("Form not found");

    return this.prisma.formResponse.findMany({
      where: { formId },
      orderBy: { submittedAt: "desc" },
      include: { answers: { select: { fieldId: true, value: true } } },
    });
  }

  async getResponse(formId: string, responseId: string) {
    const response = await this.prisma.formResponse.findFirst({
      where: { id: responseId, formId },
      include: { answers: { select: { fieldId: true, value: true } } },
    });
    if (!response) throw new NotFoundException("Response not found");
    return response;
  }

  async exportCsv(formId: string) {
    const form = await this.prisma.customForm.findUnique({
      where: { id: formId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { fields: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!form) throw new NotFoundException("Form not found");

    const fields = form.sections.flatMap((s) => s.fields);
    const responses = await this.prisma.formResponse.findMany({
      where: { formId },
      orderBy: { submittedAt: "asc" },
      include: { answers: { select: { fieldId: true, value: true } } },
    });

    const header = [
      "Response ID",
      "Respondent",
      "Email",
      "Submitted At",
      ...fields.map((f) => f.label),
    ];

    const rows = responses.map((r) => {
      const answerMap = new Map(r.answers.map((a) => [a.fieldId, a.value]));
      return [
        r.id,
        r.respondentName ?? r.personId ?? "",
        r.respondentEmail ?? "",
        r.submittedAt.toISOString(),
        ...fields.map((f) => {
          const val = answerMap.get(f.id);
          if (val === null || val === undefined) return "";
          if (typeof val === "boolean") return val ? "Yes" : "No";
          if (Array.isArray(val)) return val.join(", ");
          return String(val);
        }),
      ];
    });

    return [header.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))].join(
      "\n",
    );
  }

  // ─── Public form access ───────────────────────────────────────────────────

  async getPublicForm(token: string) {
    const form = await this.prisma.customForm.findUnique({
      where: { publicToken: token },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { fields: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!form) throw new NotFoundException("Form not found");
    if (form.status !== "published") {
      throw new GoneException("This form is no longer accepting responses");
    }
    if (form.closesAt && form.closesAt < new Date()) {
      throw new GoneException("This form has passed its deadline");
    }
    return form;
  }

  // ─── Respond (public) ─────────────────────────────────────────────────────

  async respondPublic(token: string, input: PublicRespondInput) {
    const form = await this.getPublicForm(token);
    this.assertOpen(form);

    const allFields = form.sections.flatMap((s) => s.fields);
    const fieldMap = new Map(allFields.map((f) => [f.id, f]));
    const activeFields = this.getActiveFields(form.sections, new Map());
    this.validateRequired(activeFields, input.answers, fieldMap);
    this.validateAnswers(input.answers, fieldMap);

    return this.saveResponse(form.id, {
      respondentName: input.respondentName,
      respondentEmail: input.respondentEmail,
      answers: input.answers,
    });
  }

  // ─── Respond (auth) ───────────────────────────────────────────────────────

  async respondAuth(formId: string, actor: AuthUser, input: AuthRespondInput) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const form = await this.prisma.customForm.findUnique({
      where: { id: formId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { fields: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!form) throw new NotFoundException("Form not found");
    if (form.status !== "published") {
      throw new GoneException("This form is no longer accepting responses");
    }
    this.assertOpen(form);

    // Check for existing response (allow editing)
    const existing = await this.prisma.formResponse.findUnique({
      where: { formId_personId: { formId, personId: actor.personId } },
    });
    if (existing) {
      throw new ConflictException(
        "You have already responded to this form. Use the edit endpoint to update your response.",
      );
    }

    const answerMap = new Map(
      input.answers.map((a) => [a.fieldId, a.value as string | boolean | string[] | null]),
    );
    const activeFields = this.getActiveFields(form.sections, answerMap);
    const allFields = form.sections.flatMap((s) => s.fields);
    const fieldMap = new Map(allFields.map((f) => [f.id, f]));
    this.validateRequired(activeFields, input.answers, fieldMap);
    this.validateAnswers(input.answers, fieldMap);

    return this.saveResponse(formId, {
      personId: actor.personId,
      answers: input.answers,
    });
  }

  // ─── Edit response (public — email-gated) ──────────────────────────────────

  async editPublicResponse(token: string, responseId: string, input: PublicRespondInput) {
    const form = await this.getPublicForm(token);
    this.assertOpen(form);

    const existing = await this.prisma.formResponse.findFirst({
      where: { id: responseId, formId: form.id },
    });
    if (!existing) throw new NotFoundException("Response not found");

    // Public edit requires matching respondent email (identity proof)
    if (!existing.respondentEmail || existing.respondentEmail.toLowerCase() !== input.respondentEmail.toLowerCase()) {
      throw new ForbiddenException("Email does not match this response");
    }

    const allFields = form.sections.flatMap((s) => s.fields);
    const fieldMap = new Map(allFields.map((f) => [f.id, f]));
    const answerMap = new Map(
      input.answers.map((a) => [a.fieldId, a.value as string | boolean | string[] | null]),
    );
    const activeFields = this.getActiveFields(form.sections, answerMap);
    this.validateRequired(activeFields, input.answers, fieldMap);
    this.validateAnswers(input.answers, fieldMap);

    return this.replaceAnswers(existing.id, input.answers, "anonymous");
  }

  // ─── Edit response (auth — ownership-gated) ────────────────────────────────

  async editAuthResponse(formId: string, responseId: string, actor: AuthUser, input: AuthRespondInput) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const form = await this.prisma.customForm.findUnique({
      where: { id: formId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { fields: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!form) throw new NotFoundException("Form not found");
    this.assertOpen(form);

    const existing = await this.prisma.formResponse.findFirst({
      where: { id: responseId, formId: form.id },
    });
    if (!existing) throw new NotFoundException("Response not found");

    if (existing.personId !== actor.personId) {
      throw new ForbiddenException("You can only edit your own response");
    }

    const allFields = form.sections.flatMap((s) => s.fields);
    const fieldMap = new Map(allFields.map((f) => [f.id, f]));
    const answerMap = new Map(
      input.answers.map((a) => [a.fieldId, a.value as string | boolean | string[] | null]),
    );
    const activeFields = this.getActiveFields(form.sections, answerMap);
    this.validateRequired(activeFields, input.answers, fieldMap);
    this.validateAnswers(input.answers, fieldMap);

    return this.replaceAnswers(existing.id, input.answers, actor.personId);
  }

  private async replaceAnswers(
    responseId: string,
    answers: Array<{ fieldId: string; value: unknown }>,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.formResponseAnswer.deleteMany({ where: { responseId } });
      await tx.formResponseAnswer.createMany({
        data: answers.map((a) => ({
          responseId,
          fieldId: a.fieldId,
          value: a.value as Prisma.InputJsonValue,
        })),
      });

      await tx.auditLog.create({
        data: {
          entity: "FormResponse",
          entityId: responseId,
          action: "edited",
          actorId,
          data: { answerCount: answers.length },
        },
      });

      return tx.formResponse.findUnique({
        where: { id: responseId },
        include: { answers: { select: { fieldId: true, value: true } } },
      });
    });
  }

  // ─── Get form for respondent (auth) ───────────────────────────────────────

  async getFormForRespondent(formId: string, actor: AuthUser) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const form = await this.prisma.customForm.findUnique({
      where: { id: formId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { fields: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!form) throw new NotFoundException("Form not found");
    if (form.status !== "published") {
      throw new GoneException("This form is no longer accepting responses");
    }
    if (form.closesAt && form.closesAt < new Date()) {
      throw new GoneException("This form has passed its deadline");
    }

    const existingResponse = await this.prisma.formResponse.findUnique({
      where: { formId_personId: { formId, personId: actor.personId } },
      include: { answers: { select: { fieldId: true, value: true } } },
    });

    return { form, existingResponse };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private assertOpen(form: { status: string; closesAt: Date | null; maxResponses: number | null; responseCount: number }) {
    if (form.status !== "published") {
      throw new GoneException("This form is no longer accepting responses");
    }
    if (form.closesAt && form.closesAt < new Date()) {
      throw new GoneException("This form has passed its deadline");
    }
    if (form.maxResponses !== null && form.responseCount >= form.maxResponses) {
      throw new ConflictException("This form has reached its maximum number of responses");
    }
  }

  private getActiveFields(
    sections: Array<{
      conditionJson: Prisma.JsonValue;
      fields: Array<{ id: string; conditionJson: Prisma.JsonValue }>;
    }>,
    answerMap: Map<string, string | boolean | string[] | null>,
  ): Array<{ id: string }> {
    const active: Array<{ id: string }> = [];
    for (const section of sections) {
      if (section.conditionJson && !this.evaluateCondition(section.conditionJson, answerMap)) {
        continue;
      }
      for (const field of section.fields) {
        if (!field.conditionJson || this.evaluateCondition(field.conditionJson, answerMap)) {
          active.push({ id: field.id });
        }
      }
    }
    return active;
  }

  evaluateCondition(condition: Prisma.JsonValue, answerMap: Map<string, unknown>, depth = 0): boolean {
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH) return true;
    if (!condition || typeof condition !== "object") return true;
    const c = condition as Record<string, unknown>;

    if ("operator" in c && "fieldId" in c) {
      const val = answerMap.get(c.fieldId as string);
      return this.evaluateSimpleCondition(
        c.operator as string,
        val,
        c.value as string | undefined,
      );
    }

    if ("operator" in c && "conditions" in c && Array.isArray(c.conditions)) {
      const op = c.operator as "and" | "or";
      const results = c.conditions.map((cond) =>
        this.evaluateCondition(cond as Prisma.JsonValue, answerMap, depth + 1),
      );
      return op === "and" ? results.every(Boolean) : results.some(Boolean);
    }

    return true;
  }

  private evaluateSimpleCondition(
    operator: string,
    value: unknown,
    expected?: string,
  ): boolean {
    switch (operator) {
      case "equals":
        return String(value) === expected;
      case "not_equals":
        return String(value) !== expected;
      case "contains":
        return typeof value === "string" && value.includes(expected ?? "");
      case "not_empty":
        return value !== null && value !== undefined && String(value).trim() !== "";
      case "is_true":
        return value === true || value === "true";
      case "is_false":
        return value === false || value === "false";
      default:
        return true;
    }
  }

  private validateRequired(
    activeFields: Array<{ id: string }>,
    answers: Array<{ fieldId: string; value: unknown }>,
    fieldMap: Map<string, { required: boolean; label: string }>,
  ) {
    const answerMap = new Map(answers.map((a) => [a.fieldId, a.value]));
    const missing: string[] = [];
    for (const f of activeFields) {
      const field = fieldMap.get(f.id);
      if (!field?.required) continue;
      const val = answerMap.get(f.id);
      if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
        missing.push(field.label);
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required fields: ${missing.join(", ")}`);
    }
  }

  // FIX 3: validate answer values match field type constraints
  private validateAnswers(
    answers: Array<{ fieldId: string; value: unknown }>,
    fieldMap: Map<string, { type: string; optionsJson: Prisma.JsonValue }>,
  ) {
    for (const a of answers) {
      const field = fieldMap.get(a.fieldId);
      if (!field) continue;
      const val = a.value;
      switch (field.type) {
        case "text":
        case "textarea":
          if (val !== null && val !== undefined && typeof val !== "string") {
            throw new BadRequestException(`Field "${field.type}" expects a string value`);
          }
          break;
        case "select": {
          if (val !== null && val !== undefined && typeof val !== "string") {
            throw new BadRequestException("Dropdown field expects a string value");
          }
          if (val && typeof val === "string" && field.optionsJson && Array.isArray(field.optionsJson)) {
            const allowed = (field.optionsJson as Array<{ value: string }>).map((o) => o.value);
            if (!allowed.includes(val)) {
              throw new BadRequestException("Selected value is not a valid option");
            }
          }
          break;
        }
        case "checkbox":
          if (val !== null && val !== undefined && typeof val !== "boolean") {
            throw new BadRequestException("Checkbox field expects a boolean value");
          }
          break;
        case "date":
          if (val !== null && val !== undefined && typeof val !== "string") {
            throw new BadRequestException("Date field expects a string value");
          }
          if (typeof val === "string" && val !== "" && isNaN(Date.parse(val))) {
            throw new BadRequestException("Date field expects a valid ISO date");
          }
          break;
      }
    }
  }

  private async saveResponse(
    formId: string,
    data: {
      personId?: string;
      respondentName?: string;
      respondentEmail?: string;
      answers: Array<{ fieldId: string; value: unknown }>;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Check max responses atomically
      const form = await tx.customForm.findUnique({ where: { id: formId } });
      if (!form) throw new NotFoundException("Form not found");
      if (form.maxResponses !== null && form.responseCount >= form.maxResponses) {
        throw new ConflictException("This form has reached its maximum number of responses");
      }

      const response = await tx.formResponse.create({
        data: {
          formId,
          personId: data.personId ?? null,
          respondentName: data.respondentName ?? null,
          respondentEmail: data.respondentEmail ?? null,
          answers: {
            create: data.answers.map((a) => ({
              fieldId: a.fieldId,
              value: a.value as Prisma.InputJsonValue,
            })),
          },
        },
        include: { answers: { select: { fieldId: true, value: true } } },
      });

      await tx.customForm.update({
        where: { id: formId },
        data: { responseCount: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          entity: "FormResponse",
          entityId: response.id,
          action: "submitted",
          actorId: data.personId ?? "anonymous-public",
          data: {
            formId,
            respondentName: data.respondentName,
            answerCount: data.answers.length,
          },
        },
      });

      return response;
    }).then(async (response) => {
      // Notify form creator outside transaction
      try {
        const form = await this.prisma.customForm.findUnique({
          where: { id: formId },
          select: { createdById: true, title: true },
        });
        if (form) {
          await this.notifications.emit([
            {
              personId: form.createdById,
              kind: "form_response_received" as never,
              title: "New form response",
              body: `New response submitted to "${form.title}"`,
              href: `/admin/forms/${formId}/responses`,
            },
          ]);
        }
      } catch {
        /* notification is best-effort */
      }
      return response;
    });
  }
}

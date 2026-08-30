import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const CustomFormStatus = z.enum(["draft", "published", "closed"]);
export type CustomFormStatus = z.infer<typeof CustomFormStatus>;

export const FormFieldType = z.enum(["text", "textarea", "select", "checkbox", "date"]);
export type FormFieldType = z.infer<typeof FormFieldType>;

// ─── Condition ────────────────────────────────────────────────────────────────

export const ConditionOperator = z.enum([
  "equals",
  "not_equals",
  "contains",
  "not_empty",
  "is_true",
  "is_false",
]);
export type ConditionOperator = z.infer<typeof ConditionOperator>;

export interface SimpleCondition {
  fieldId: string;
  operator: ConditionOperator;
  value?: string;
}

export interface CompoundCondition {
  operator: "and" | "or";
  conditions: FormCondition[];
}

export type FormCondition = SimpleCondition | CompoundCondition;

export const SimpleConditionSchema = z.object({
  fieldId: z.string().uuid(),
  operator: ConditionOperator,
  value: z.string().optional(),
});

export const CompoundConditionSchema: z.ZodType<CompoundCondition> = z.lazy(() =>
  z.object({
    operator: z.enum(["and", "or"]),
    conditions: z.array(FormConditionSchema),
  }),
);

export const FormConditionSchema: z.ZodType<FormCondition> = z.union([
  SimpleConditionSchema,
  CompoundConditionSchema,
]);

// ─── Field option (for select fields) ─────────────────────────────────────────

export const SelectOption = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
});
export type SelectOption = z.infer<typeof SelectOption>;

// ─── Field input ──────────────────────────────────────────────────────────────

export const FormFieldInput = z.object({
  id: z.string().uuid().optional(),
  type: FormFieldType,
  label: z.string().trim().min(1).max(200),
  required: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  optionsJson: z.array(SelectOption).optional(),
  conditionJson: FormConditionSchema.nullish(),
});
export type FormFieldInput = z.infer<typeof FormFieldInput>;

// ─── Section input ────────────────────────────────────────────────────────────

export const FormSectionInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  sortOrder: z.number().int().min(0).default(0),
  conditionJson: FormConditionSchema.nullish(),
  fields: z.array(FormFieldInput).min(1).max(50),
});
export type FormSectionInput = z.infer<typeof FormSectionInput>;

// ─── Create / update form ─────────────────────────────────────────────────────

export const CreateCustomFormInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (v) => v.split(/\s+/).filter(Boolean).length <= 50,
      "Description must be 50 words or fewer",
    )
    .optional(),
  requiresAuth: z.boolean().default(true),
  closesAt: z.string().datetime().optional(),
  maxResponses: z.number().int().positive().optional(),
  sections: z.array(FormSectionInput).min(1).max(20),
});
export type CreateCustomFormInput = z.infer<typeof CreateCustomFormInput>;

export const UpdateCustomFormInput = CreateCustomFormInput;
export type UpdateCustomFormInput = z.infer<typeof UpdateCustomFormInput>;

// ─── Respondent identity (public forms) ───────────────────────────────────────

export const PublicRespondInput = z.object({
  respondentName: z.string().trim().min(1).max(200),
  respondentEmail: z.string().trim().email().max(200),
  answers: z.array(
    z.object({
      fieldId: z.string().uuid(),
      value: z.union([z.string().max(5000), z.boolean(), z.array(z.string()), z.null()]),
    }),
  ).max(200),
});
export type PublicRespondInput = z.infer<typeof PublicRespondInput>;

// ─── Respondent answers (auth forms) ──────────────────────────────────────────

export const AuthRespondInput = z.object({
  answers: z.array(
    z.object({
      fieldId: z.string().uuid(),
      value: z.union([z.string().max(5000), z.boolean(), z.array(z.string()), z.null()]),
    }),
  ).max(200),
});
export type AuthRespondInput = z.infer<typeof AuthRespondInput>;

// ─── Form with nested structure (API response) ────────────────────────────────

export const FormFieldSchema = z.object({
  id: z.string(),
  type: FormFieldType,
  label: z.string(),
  required: z.boolean(),
  sortOrder: z.number(),
  optionsJson: z.any().nullable(),
  conditionJson: z.any().nullable(),
});
export type FormFieldSchema = z.infer<typeof FormFieldSchema>;

export const FormSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  sortOrder: z.number(),
  conditionJson: z.any().nullable(),
  fields: z.array(FormFieldSchema),
});
export type FormSectionSchema = z.infer<typeof FormSectionSchema>;

export const FormDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: CustomFormStatus,
  requiresAuth: z.boolean(),
  publishedAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  maxResponses: z.number().nullable(),
  responseCount: z.number(),
  publicToken: z.string().nullable(),
  createdAt: z.string(),
  sections: z.array(FormSectionSchema),
});
export type FormDetailSchema = z.infer<typeof FormDetailSchema>;

export const FormListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: CustomFormStatus,
  requiresAuth: z.boolean(),
  publishedAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  maxResponses: z.number().nullable(),
  responseCount: z.number(),
  createdAt: z.string(),
});
export type FormListItemSchema = z.infer<typeof FormListItemSchema>;

export const FormResponseSchema = z.object({
  id: z.string(),
  formId: z.string(),
  personId: z.string().nullable(),
  respondentName: z.string().nullable(),
  respondentEmail: z.string().nullable(),
  submittedAt: z.string(),
  updatedAt: z.string(),
  answers: z.array(
    z.object({
      fieldId: z.string(),
      value: z.any(),
    }),
  ),
});
export type FormResponseSchema = z.infer<typeof FormResponseSchema>;

import { z } from "zod";

export const MealPeriod = z.enum(["breakfast", "lunch", "dinner"]);
export type MealPeriod = z.infer<typeof MealPeriod>;

export const MealPlanType = z.enum(["none", "half", "full"]);
export type MealPlanType = z.infer<typeof MealPlanType>;

export const ChoosePlanInput = z.object({ type: MealPlanType });
export type ChoosePlanInput = z.infer<typeof ChoosePlanInput>;

export const CreateOrderInput = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        qty: z.number().int().min(1).max(20),
      }),
    )
    .min(1),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

export const ScanInput = z.object({
  token: z.string().min(1),
  period: MealPeriod,
});
export type ScanInput = z.infer<typeof ScanInput>;

export const CreateMenuItemInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z
    .enum(["breakfast", "lunch", "dinner", "weekend"])
    .default("weekend"),
  priceXof: z.number().int().min(0).max(1_000_000),
  imageUrl: z.string().max(500).optional(),
});
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemInput>;

export const AdvanceOrderInput = z.object({
  status: z.enum(["preparing", "ready", "collected"]),
});
export type AdvanceOrderInput = z.infer<typeof AdvanceOrderInput>;

/** Dining back office: kitchen inventory, kept in display units (kg, pcs, L). */
export const CreateInventoryItemInput = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  reorderLevel: z.number().min(0).max(1_000_000_000).default(0),
  costPerUnitXof: z.number().int().min(0).max(100_000_000).default(0),
});
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemInput>;

export const AdjustInventoryInput = z.object({
  delta: z
    .number()
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((d) => d !== 0, {
      message: "Adjustment must move stock",
    }),
  reason: z.string().trim().min(1).max(280),
});
export type AdjustInventoryInput = z.infer<typeof AdjustInventoryInput>;

/** Planned servings and unit cost for one dated service. Money stays integer XOF. */
export const UpsertMealBudgetInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  period: MealPeriod,
  plannedServings: z.number().int().min(1).max(100_000),
  costPerServingXof: z.number().int().min(0).max(100_000),
  notes: z.string().trim().max(500).optional(),
});
export type UpsertMealBudgetInput = z.infer<typeof UpsertMealBudgetInput>;

/** The kitchen's plan for one dated service: which items, how many covers each. */
export const SetMenuScheduleInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  period: MealPeriod,
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        plannedQty: z.number().int().min(0).max(100_000),
      }),
    )
    .max(60),
});
export type SetMenuScheduleInput = z.infer<typeof SetMenuScheduleInput>;

/** Dietary profile, maintained by the dining office (not self-declared). */
export const UpsertDietaryInput = z.object({
  studentNo: z.string().trim().min(1).max(40),
  restrictions: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  allergies: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  notes: z.string().trim().max(1000).optional(),
});
export type UpsertDietaryInput = z.infer<typeof UpsertDietaryInput>;

export const ScanResult = z.enum(["served", "turned_away"]);
export type ScanResult = z.infer<typeof ScanResult>;

/** Manual serve when a pass will not scan, or a staff waiver of an overridable refusal. */
export const OverrideInput = z.object({
  studentNo: z.string().min(1).max(40),
  period: MealPeriod,
});
export type OverrideInput = z.infer<typeof OverrideInput>;

/**
 * Dakar wall-clock minutes since midnight. Africa/Dakar is UTC+0 year-round,
 * but the explicit zone keeps this correct if that ever changes and makes the
 * intent match every other Africa/Dakar date in the codebase.
 */
export function dakarMinutesNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dakar",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/**
 * Whether the dining office is currently accepting new weekend orders.
 * Pure so both the API guard and (via the returned reason) the student UI agree.
 * `orderCutoff` is the last Dakar-local HH:MM an order may be *placed* for the
 * next service — paying for an already-created cart is unaffected.
 */
export function orderingOpenNow(
  settings: Pick<DiningSettingsInput, "weekendOrdering" | "orderCutoff">,
  now: Date = new Date(),
): { open: boolean; reason: string | null } {
  if (!settings.weekendOrdering) {
    return { open: false, reason: "Weekend ordering is currently closed" };
  }
  const [hours, minutes] = settings.orderCutoff.split(":").map(Number);
  if (dakarMinutesNow(now) >= (hours ?? 0) * 60 + (minutes ?? 0)) {
    return {
      open: false,
      reason: `Weekend orders closed at ${settings.orderCutoff} Dakar time`,
    };
  }
  return { open: true, reason: null };
}

/** `?period=` on the live feed. Unvalidated, this reaches a Prisma enum filter as a 500. */
export const LiveScansQuery = z.object({ period: MealPeriod.default("lunch") });
export type LiveScansQuery = z.infer<typeof LiveScansQuery>;

export const SetMenuImageInput = z.object({ imageUrl: z.string().max(500) });
export type SetMenuImageInput = z.infer<typeof SetMenuImageInput>;

const ClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

const MealWindow = z
  .object({ start: ClockTime, end: ClockTime })
  .refine((w) => w.start < w.end, {
    message: "Service window must open before it closes",
  });

/**
 * Dining console settings. Every field is read by something — the windows drive the
 * station's default period and the student's next-meal card, the cost feeds the margin
 * figure, and the two booleans gate eligibility rules 4 and 6.
 */
export const DiningSettingsInput = z.object({
  mealWindows: z.object({
    breakfast: MealWindow,
    lunch: MealWindow,
    dinner: MealWindow,
  }),
  costPerMealXof: z.number().int().min(0).max(100_000),
  weekendOrdering: z.boolean(),
  /** Last local time a weekend order may be placed for the next service. */
  orderCutoff: ClockTime,
  /** Turn away students carrying overdue charges. Off by default: it refuses real students. */
  enforcePayment: z.boolean(),
  /** Refuse a second scan in the same period on the same Dakar day. */
  blockSecondScan: z.boolean(),
});
export type DiningSettingsInput = z.infer<typeof DiningSettingsInput>;

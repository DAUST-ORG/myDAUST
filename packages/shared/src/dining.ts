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

export const ScanResult = z.enum(["served", "turned_away"]);
export type ScanResult = z.infer<typeof ScanResult>;

/** Manual serve when a pass will not scan, or a staff waiver of an overridable refusal. */
export const OverrideInput = z.object({
  studentNo: z.string().min(1).max(40),
  period: MealPeriod,
});
export type OverrideInput = z.infer<typeof OverrideInput>;

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

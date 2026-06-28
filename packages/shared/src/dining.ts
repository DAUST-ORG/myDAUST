import { z } from "zod";

export const MealPeriod = z.enum(["breakfast", "lunch", "dinner"]);
export type MealPeriod = z.infer<typeof MealPeriod>;

export const MealPlanType = z.enum(["none", "half", "full"]);
export type MealPlanType = z.infer<typeof MealPlanType>;

export const ChoosePlanInput = z.object({ type: MealPlanType });
export type ChoosePlanInput = z.infer<typeof ChoosePlanInput>;

export const CreateOrderInput = z.object({
  items: z.array(z.object({ menuItemId: z.string().uuid(), qty: z.number().int().min(1).max(20) })).min(1),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

export const ScanInput = z.object({ token: z.string().min(1), period: MealPeriod });
export type ScanInput = z.infer<typeof ScanInput>;

export const CreateMenuItemInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(["breakfast", "lunch", "dinner", "weekend"]).default("weekend"),
  priceXof: z.number().int().min(0).max(1_000_000),
});
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemInput>;

export const AdvanceOrderInput = z.object({ status: z.enum(["preparing", "ready", "collected"]) });
export type AdvanceOrderInput = z.infer<typeof AdvanceOrderInput>;

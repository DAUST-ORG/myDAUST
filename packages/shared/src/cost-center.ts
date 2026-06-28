import { z } from "zod";

/** Cost-center type — drives how a center participates in the director's money-in/out view. */
export const CostCenterType = z.enum([
  "group",
  "operating",
  "auxiliary",
  "revenue",
  "reserve",
  "capital",
  "restricted",
]);
export type CostCenterType = z.infer<typeof CostCenterType>;

export interface CostCenter {
  code: string;
  name: string;
  type: CostCenterType;
  /** Parent group code (null for top-level groups). */
  parent: string | null;
}

/** DAUST cost-center chart (user-provided). Seed source of truth for the finance dimension. */
export const COST_CENTERS: readonly CostCenter[] = [
  { code: "1000", name: "Academic Affairs", type: "group", parent: null },
  { code: "1100", name: "Academic Programs & Faculty", type: "operating", parent: "1000" },
  { code: "1200", name: "Registrar", type: "operating", parent: "1000" },
  { code: "2000", name: "Student Affairs", type: "group", parent: null },
  { code: "2100", name: "Student Life", type: "operating", parent: "2000" },
  { code: "2200", name: "Co-curricular & Engagement", type: "operating", parent: "2000" },
  { code: "3000", name: "Finance & Administration", type: "group", parent: null },
  { code: "3100", name: "Finance & Accounting", type: "operating", parent: "3000" },
  { code: "3300", name: "Human Resources", type: "operating", parent: "3000" },
  { code: "3400", name: "Facilities & Maintenance", type: "operating", parent: "3000" },
  { code: "3500", name: "IT / Information Systems", type: "operating", parent: "3000" },
  { code: "3600", name: "Dining / Auxiliary Services", type: "auxiliary", parent: "3000" },
  { code: "3700", name: "Housing / Residence", type: "auxiliary", parent: "3000" },
  { code: "4000", name: "Enrollment & External", type: "group", parent: null },
  { code: "4100", name: "Marketing & Communications", type: "operating", parent: "4000" },
  { code: "4200", name: "Admissions", type: "operating", parent: "4000" },
  { code: "5000", name: "Innovation", type: "group", parent: null },
  { code: "5100", name: "Innovation Studio", type: "restricted", parent: "5000" },
  { code: "9000", name: "Institutional / Central", type: "group", parent: null },
  { code: "9100", name: "Tuition & Academic Fees", type: "revenue", parent: "9000" },
  { code: "9200", name: "Institutional / Shared Costs", type: "operating", parent: "9000" },
  { code: "9300", name: "Contingency Reserve", type: "reserve", parent: "9000" },
  { code: "9400", name: "Capital Projects", type: "capital", parent: "9000" },
] as const;

/** Tuition revenue lands here (see plan: Invoice tagged to 9100). */
export const COST_CENTER_TUITION = "9100" as const;

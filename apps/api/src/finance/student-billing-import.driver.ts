import { setTimeout as delay } from "node:timers/promises";
import type { BillingRepriceAction } from "./student-billing-import.planner.js";

/**
 * Drives the shipped admin endpoints to apply a billing plan.
 *
 * Deliberately HTTP and not a Prisma transaction. Every finance mutation here is
 * meant to travel through ApprovalRequest, which records who asked, who approved,
 * what the invoice looked like before, and refuses to apply against a stale
 * revision. A direct write would skip all of that, and would leave
 * paymentPlanOverride false, which silently turns restore-to-standard into a no-op
 * and destroys the only per-account revert.
 *
 * An admin's own request self-approves and applies in the same call, so each step
 * is one round trip.
 */

export interface DriverConfig {
  baseUrl: string;
  token: string;
  /** Milliseconds between calls; the throttle guard keys on route and student. */
  pauseMs: number;
}

export interface StepResult {
  step: string;
  ok: boolean;
  status: number;
  detail?: string;
}

async function call(
  config: DriverConfig,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
  }
  return { status: response.status, json };
}

function failureDetail(json: unknown): string {
  if (json && typeof json === "object" && "message" in json) {
    const message = (json as { message: unknown }).message;
    return Array.isArray(message) ? message.join("; ") : String(message);
  }
  return JSON.stringify(json).slice(0, 300);
}

/**
 * Selects the components one student's package should carry.
 *
 * Requests are strictly serialized per invoice: a pending request on the same
 * target is rejected as a duplicate, and each applied stage bumps Invoice.revision,
 * so the next request must be created after the previous one applied.
 */
export async function applyComponentSelection(
  config: DriverConfig,
  action: BillingRepriceAction,
  reason: string,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const key of action.keysToAdd) {
    const { status, json } = await call(
      config,
      "POST",
      `/api/finance/admin/plans/${action.invoiceId}/components`,
      { componentKey: key, reason },
    );
    results.push({
      step: `add:${key}`,
      ok: status >= 200 && status < 300,
      status,
      detail: status >= 300 ? failureDetail(json) : undefined,
    });
    if (status >= 300) return results;
    await delay(config.pauseMs);
  }
  for (const key of action.keysToRemove) {
    const { status, json } = await call(
      config,
      "DELETE",
      `/api/finance/admin/plans/${action.invoiceId}/components/${key}?reason=${encodeURIComponent(reason)}`,
    );
    results.push({
      step: `remove:${key}`,
      ok: status >= 200 && status < 300,
      status,
      detail: status >= 300 ? failureDetail(json) : undefined,
    });
    if (status >= 300) return results;
    await delay(config.pauseMs);
  }
  return results;
}

/**
 * Posts the residual as a credit. The workbook's total is below the catalog total
 * for every discounted student, so this is what carries the scholarship onto the
 * account rather than bending a component amount.
 */
export async function applyResidualCredit(
  config: DriverConfig,
  action: BillingRepriceAction,
  label: string,
  reason: string,
): Promise<StepResult> {
  if (action.residualXof >= 0) {
    return { step: "credit", ok: true, status: 0, detail: "no residual" };
  }
  const { status, json } = await call(
    config,
    "POST",
    "/api/finance/admin/discounts",
    {
      studentId: action.studentId,
      label,
      amountXof: Math.abs(action.residualXof),
      kind: "scholarship",
      costCenterCode: "9100",
      reason,
    },
  );
  return {
    step: "credit",
    ok: status >= 200 && status < 300,
    status,
    detail: status >= 300 ? failureDetail(json) : undefined,
  };
}

export interface StudentOutcome {
  studentNo: string;
  invoiceId: string;
  ok: boolean;
  steps: StepResult[];
}

export async function applyBillingPlan(
  config: DriverConfig,
  actions: readonly BillingRepriceAction[],
  reason: string,
  onProgress?: (outcome: StudentOutcome) => void,
): Promise<StudentOutcome[]> {
  const outcomes: StudentOutcome[] = [];
  for (const action of actions) {
    const steps = await applyComponentSelection(config, action, reason);
    if (steps.every((step) => step.ok)) {
      steps.push(
        await applyResidualCredit(
          config,
          action,
          `Workbook billing ${action.workbookTotalXof} XOF`,
          reason,
        ),
      );
    }
    const outcome: StudentOutcome = {
      studentNo: action.studentNo,
      invoiceId: action.invoiceId,
      ok: steps.every((step) => step.ok),
      steps,
    };
    outcomes.push(outcome);
    onProgress?.(outcome);
    await delay(config.pauseMs);
  }
  return outcomes;
}

"use client";

import Link from "next/link";
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  FilePenLine,
  Landmark,
  ListFilter,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BudgetCashflowChart } from "@/components/BudgetCashflowChart";
import { BudgetMatrix, type BudgetMatrixMode } from "@/components/BudgetMatrix";
import { Badge, Button, Drawer, Modal, PageHeader } from "@/components/ui";
import {
  ApiError,
  type CostCenter,
  type FinanceChangeResult,
  type OperatingBudgetActualEntries,
  type OperatingBudgetActualEntry,
  type OperatingBudgetForecast,
  type OperatingBudgetKind,
  type OperatingBudgetMatrix,
  type OperatingBudgetMatrixRow,
  type OperatingBudgetView,
  createOperatingBudgetAdjustment,
  createOperatingBudgetExpense,
  createOperatingBudgetManualIncome,
  forecastOperatingBudget,
  getCostCenters,
  getOperatingBudget,
  getOperatingBudgetActuals,
  updateOperatingBudget,
  updateOperatingBudgetActualEntry,
  updateOperatingBudgetExpense,
  voidOperatingBudgetActualEntry,
  voidOperatingBudgetExpense,
} from "@/lib/api";
import { formatDate, formatXof, formatXofCompact } from "@/lib/format";
import {
  MAX_SAFE_MILLIONS_INPUT,
  MAX_SAFE_XOF_BIGINT,
  formatWholeXofAsMillions,
  parseMillionsToWholeXof,
} from "@/lib/xof-input";
import styles from "./budget.module.css";

type Scenario = "conservative" | "base" | "optimistic";
type DraftValues = Record<string, Record<string, number>>;
type ActualSelection = {
  row: OperatingBudgetMatrixRow;
  month: string;
};
type ActionMode =
  "manual_income" | "expense" | "adjustment" | "edit_expense" | "edit_income";

type ActionForm = {
  categoryKey: string;
  costCenterCode: string;
  amountMillions: string;
  occurredOn: string;
  description: string;
  payee: string;
  reason: string;
  isEstimate: boolean;
};

const STATUS_TONE = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "error",
  superseded: "neutral",
} as const;

const STATUS_LABEL = {
  draft: "Draft",
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
} as const;

const SOURCE_LABEL: Record<OperatingBudgetActualEntry["source"], string> = {
  bursar: "Bursar settlement",
  payment: "Bursar settlement",
  balance_reconciliation: "Paid-to-date balance reconciliation",
  legacy_payment: "Legacy settled payment",
  expense: "Operating expense",
  manual_income: "Manual income",
  adjustment: "Approved adjustment",
  refund: "Refund reversal",
  unallocated_credit: "Unclassified settled collection",
};

function isActualOnlyCategory(categoryKey: string): boolean {
  return (
    categoryKey === "unclassified_expenses" ||
    categoryKey === "unclassified_collections"
  );
}

function draftFromView(view: OperatingBudgetView): DraftValues {
  return [...view.budget.income.rows, ...view.budget.expense.rows].reduce(
    (draft, row) => {
      draft[row.categoryKey] = { ...row.months };
      return draft;
    },
    {} as DraftValues,
  );
}

function matrixWithDraft(
  matrix: OperatingBudgetMatrix,
  draft: DraftValues,
  months: OperatingBudgetView["months"],
): OperatingBudgetMatrix {
  const rows = matrix.rows.map((row) => {
    const values = draft[row.categoryKey] ?? {};
    const monthValues = Object.fromEntries(
      months.map((month) => [month.key, values[month.key] ?? 0]),
    );
    return {
      ...row,
      months: monthValues,
      totalXof: Object.values(monthValues).reduce(
        (total, amount) => total + amount,
        0,
      ),
    };
  });
  const monthTotalsXof = Object.fromEntries(
    months.map((month) => [
      month.key,
      rows.reduce((total, row) => total + (row.months[month.key] ?? 0), 0),
    ]),
  );
  return {
    rows,
    monthTotalsXof,
    totalXof: rows.reduce((total, row) => total + row.totalXof, 0),
  };
}

function withoutActualOnly(
  matrix: OperatingBudgetMatrix,
): OperatingBudgetMatrix {
  const rows = matrix.rows.filter(
    (row) => !isActualOnlyCategory(row.categoryKey),
  );
  return {
    ...matrix,
    rows,
    monthTotalsXof: Object.fromEntries(
      Object.keys(matrix.monthTotalsXof).map((month) => [
        month,
        rows.reduce((sum, row) => sum + (row.months[month] ?? 0), 0),
      ]),
    ),
    totalXof: rows.reduce((sum, row) => sum + row.totalXof, 0),
  };
}

function yearOptions(view: OperatingBudgetView): string[] {
  const available =
    view.availableAcademicYears?.map((year) => year.label) ?? [];
  const match = view.academicYear.label.match(/(\d{4}).*?(\d{4})/);
  const separator = view.academicYear.label.includes("–") ? "–" : "-";
  const generated = match
    ? Array.from({ length: 5 }, (_, index) => {
        const start = Number(match[1]) - 2 + index;
        return `${start}${separator}${start + 1}`;
      })
    : [];
  return [
    ...new Set([
      ...(available.length > 0 ? available : generated),
      view.academicYear.label,
    ]),
  ].sort((left, right) => right.localeCompare(left));
}

function monthLabel(view: OperatingBudgetView, key: string): string {
  return view.months.find((month) => month.key === key)?.label ?? key;
}

function dateForMonth(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : "";
}

function todayInDakar(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dakar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function earlierDate(left: string, right: string): string {
  return left <= right ? left : right;
}

function isView(
  result: OperatingBudgetView | FinanceChangeResult,
): result is OperatingBudgetView {
  return "academicYear" in result;
}

function mutationMessage(result: FinanceChangeResult, noun: string): string {
  return result.applied
    ? `${noun} approved and applied.`
    : `${noun} submitted for Director approval.`;
}

function closingActual(view: OperatingBudgetView): number {
  return view.summary.actualClosingBalanceXof;
}

function statusDescription(view: OperatingBudgetView): string {
  const revision = view.revision;
  if (!revision)
    return "No operating budget has been published for this academic year. Actuals still reflect the approved financial ledger.";
  if (revision.status === "pending")
    return "This revision is locked while the Director reviews the submitted plan.";
  if (revision.status === "approved")
    return "The monthly plan is approved. Starting an edit creates a new controlled revision without changing this published version.";
  if (revision.status === "rejected")
    return "The last submission was rejected. Its figures remain available as a draft for correction and resubmission.";
  if (revision.status === "superseded")
    return "A newer approved revision replaced this version. This snapshot is read-only.";
  return "Draft changes remain private to the Director until they are approved and published.";
}

function formDefaults(
  kind: OperatingBudgetKind,
  view: OperatingBudgetView,
  selection: ActualSelection | null,
  entry?: OperatingBudgetActualEntry,
): ActionForm {
  const today = todayInDakar();
  const yearStart = view.academicYear.startDate.slice(0, 10);
  const yearEnd = view.academicYear.endDate.slice(0, 10);
  const selectedDate = selection ? dateForMonth(selection.month) : "";
  const defaultOccurredOn =
    today < yearStart
      ? ""
      : today > yearEnd
        ? yearEnd
        : selectedDate
          ? earlierDate(selectedDate, today)
          : today;
  const entryCategory = entry?.categoryKey;
  const selectionCategory = selection?.row.categoryKey;
  const category =
    (entryCategory &&
    view.categories.some((candidate) => candidate.key === entryCategory)
      ? entryCategory
      : undefined) ??
    (selectionCategory &&
    !isActualOnlyCategory(selectionCategory) &&
    view.categories.some((candidate) => candidate.key === selectionCategory)
      ? selectionCategory
      : undefined) ??
    view.categories.find((candidate) => candidate.kind === kind)?.key ??
    "";
  const amount =
    entry?.amountXof ?? selection?.row.months[selection.month] ?? 0;
  return {
    categoryKey: category,
    costCenterCode: entry?.costCenterCode ?? "",
    amountMillions: amount ? formatWholeXofAsMillions(amount) : "",
    occurredOn: entry?.occurredOn.slice(0, 10) ?? defaultOccurredOn,
    description: entry?.description ?? "",
    payee: entry?.payee ?? "",
    reason: "",
    isEstimate: entry?.isEstimate ?? false,
  };
}

export default function BudgetingCashflowPage() {
  const requestVersion = useRef(0);
  const actualRequestVersion = useRef(0);
  const forecastRequestVersion = useRef(0);
  const [data, setData] = useState<OperatingBudgetView | null>(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [tab, setTab] = useState<BudgetMatrixMode>("budget");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<DraftValues>({});
  const [openingBalanceXof, setOpeningBalanceXof] = useState(0);
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scenario, setScenario] = useState<Scenario>("base");
  const [collectionRate, setCollectionRate] = useState(100);
  const [expenseGrowth, setExpenseGrowth] = useState(0);
  const [forecast, setForecast] = useState<OperatingBudgetForecast | null>(
    null,
  );
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const [actualSelection, setActualSelection] =
    useState<ActualSelection | null>(null);
  const [actualEntries, setActualEntries] =
    useState<OperatingBudgetActualEntries | null>(null);
  const [actualLoading, setActualLoading] = useState(false);
  const [actualError, setActualError] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionEntry, setActionEntry] =
    useState<OperatingBudgetActualEntry | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [voidEntry, setVoidEntry] = useState<OperatingBudgetActualEntry | null>(
    null,
  );
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const load = useCallback(
    async (
      academicYear?: string,
      options?: { preserveLocalDraft?: boolean },
    ) => {
      const version = ++requestVersion.current;
      actualRequestVersion.current += 1;
      forecastRequestVersion.current += 1;
      setLoading(true);
      setError(null);
      if (!options?.preserveLocalDraft) setStale(false);
      try {
        const result = await getOperatingBudget(academicYear);
        if (version !== requestVersion.current) return;
        setData(result);
        setSelectedYear(result.academicYear.label);
        if (options?.preserveLocalDraft) {
          setStale(false);
          setDirty(true);
          setMessage(
            "Latest server revision loaded. Your local cells, opening balance and reason are still in place; review them, then save again.",
          );
        } else {
          setIsEditing(false);
          setDraft(draftFromView(result));
          setOpeningBalanceXof(result.summary.openingBalanceXof);
          setReason(result.revision?.reason ?? "");
          setDirty(false);
        }
        setActualSelection((current) => {
          if (!current) return null;
          const side =
            current.row.kind === "income"
              ? result.actual.income
              : result.actual.expense;
          const row = side.rows.find(
            (candidate) => candidate.categoryKey === current.row.categoryKey,
          );
          return row ? { row, month: current.month } : null;
        });
      } catch (cause) {
        if (version !== requestVersion.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load the operating budget.",
        );
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load();
    getCostCenters()
      .then(setCostCenters)
      .catch(() => setCostCenters([]));
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(async () => {
      const version = ++forecastRequestVersion.current;
      setForecastLoading(true);
      setForecastError(null);
      try {
        const result = await forecastOperatingBudget({
          academicYear: data.academicYear.label,
          scenario,
          collectionRatePercent: collectionRate,
          expenseGrowthPercent: expenseGrowth,
        });
        if (version === forecastRequestVersion.current) setForecast(result);
      } catch (cause) {
        if (version === forecastRequestVersion.current) {
          setForecast(null);
          setForecastError(
            cause instanceof Error ? cause.message : "Forecast is unavailable.",
          );
        }
      } finally {
        if (version === forecastRequestVersion.current)
          setForecastLoading(false);
      }
    }, 280);
    return () => {
      forecastRequestVersion.current += 1;
      window.clearTimeout(timer);
    };
  }, [collectionRate, data, expenseGrowth, scenario]);

  const loadActuals = useCallback(
    async (selection: ActualSelection, cursor?: string) => {
      if (!data) return;
      const version = ++actualRequestVersion.current;
      setActualLoading(true);
      setActualError(null);
      try {
        const result = await getOperatingBudgetActuals({
          academicYear: data.academicYear.label,
          kind: selection.row.kind,
          categoryKey: selection.row.categoryKey,
          month: selection.month,
          cursor,
        });
        if (version === actualRequestVersion.current) {
          setActualEntries((current) =>
            cursor && current
              ? {
                  ...result,
                  items: [...current.items, ...result.items],
                }
              : result,
          );
        }
      } catch (cause) {
        if (version === actualRequestVersion.current) {
          setActualError(
            cause instanceof Error
              ? cause.message
              : "Could not load contributing entries.",
          );
        }
      } finally {
        if (version === actualRequestVersion.current) setActualLoading(false);
      }
    },
    [data],
  );

  useEffect(() => {
    if (!actualSelection) {
      actualRequestVersion.current += 1;
      setActualEntries(null);
      return;
    }
    loadActuals(actualSelection);
  }, [actualSelection, loadActuals]);

  const budgetIncome = useMemo(
    () =>
      data && isEditing
        ? matrixWithDraft(
            withoutActualOnly(data.budget.income),
            draft,
            data.months,
          )
        : data
          ? withoutActualOnly(data.budget.income)
          : undefined,
    [data, draft, isEditing],
  );
  const budgetExpense = useMemo(
    () =>
      data && isEditing
        ? matrixWithDraft(
            withoutActualOnly(data.budget.expense),
            draft,
            data.months,
          )
        : data
          ? withoutActualOnly(data.budget.expense)
          : undefined,
    [data, draft, isEditing],
  );

  function beginEdit() {
    if (!data) return;
    setDraft(draftFromView(data));
    setOpeningBalanceXof(data.summary.openingBalanceXof);
    setReason(data.revision?.reason ?? "");
    setDirty(false);
    setStale(false);
    setIsEditing(true);
    setTab("budget");
  }

  function cancelEdit() {
    if (!data) return;
    setDraft(draftFromView(data));
    setOpeningBalanceXof(data.summary.openingBalanceXof);
    setReason(data.revision?.reason ?? "");
    setDirty(false);
    setStale(false);
    setIsEditing(false);
  }

  function changeDraft(categoryKey: string, month: string, amountXof: number) {
    setDraft((current) => ({
      ...current,
      [categoryKey]: {
        ...(current[categoryKey] ?? {}),
        [month]: amountXof,
      },
    }));
    setDirty(true);
  }

  async function persistBudget(action: "save" | "submit") {
    if (!data) return;
    if (!reason.trim()) {
      setError(
        action === "submit"
          ? "Explain why this budget revision is being approved."
          : "Add a short draft reason so this revision is identifiable.",
      );
      return;
    }
    const invalidBudgetInput = document.querySelector<HTMLInputElement>(
      'input[data-budget-input="true"]:invalid',
    );
    if (invalidBudgetInput) {
      invalidBudgetInput.focus();
      invalidBudgetInput.reportValidity();
      setError(
        "Fix the highlighted amount before saving. Budget amounts support whole FCFA, entered with at most six decimal places in millions.",
      );
      return;
    }
    if (!Number.isSafeInteger(openingBalanceXof)) {
      setError(
        "Opening balance must be a whole-XOF amount within the supported accounting range.",
      );
      return;
    }
    const lines = data.categories.flatMap((category) =>
      data.months.map((month) => ({
        categoryKey: category.key,
        month: month.key,
        amountXof: draft[category.key]?.[month.key] ?? 0,
      })),
    );
    if (
      lines.some(
        (line) => !Number.isSafeInteger(line.amountXof) || line.amountXof < 0,
      )
    ) {
      setError(
        "Every budget cell must be a non-negative whole-XOF amount within the supported accounting range.",
      );
      return;
    }
    const planTotals = data.categories.reduce(
      (totals, category) => {
        const categoryTotal = data.months.reduce(
          (total, month) =>
            total + BigInt(draft[category.key]?.[month.key] ?? 0),
          0n,
        );
        totals[category.kind] += categoryTotal;
        return totals;
      },
      { income: 0n, expense: 0n },
    );
    if (
      planTotals.income > MAX_SAFE_XOF_BIGINT ||
      planTotals.expense > MAX_SAFE_XOF_BIGINT
    ) {
      setError(
        "Annual income and expense totals must each stay within the supported accounting range.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    setStale(false);
    try {
      const result = await updateOperatingBudget({
        academicYear: data.academicYear.label,
        action,
        reason: reason.trim(),
        openingBalanceXof,
        expectedBudgetId: data.revision?.id ?? null,
        expectedContentVersion: data.revision?.contentVersion ?? null,
        lines,
      });
      if (isView(result)) {
        setData(result);
        setDraft(draftFromView(result));
        setOpeningBalanceXof(result.summary.openingBalanceXof);
        setMessage("Draft saved. No published figures were changed.");
      } else {
        setMessage(mutationMessage(result, "Budget revision"));
        await load(data.academicYear.label);
      }
      setDirty(false);
      if (action === "submit") setIsEditing(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setStale(true);
        setError(
          "This revision changed after you opened it. Your local values are still here. Load the latest revision, review your retained edits, then save again.",
        );
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save this budget.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function openActual(row: OperatingBudgetMatrixRow, month: string) {
    setActionMode(null);
    setActualEntries(null);
    setActualSelection({ row, month });
  }

  function openAction(
    mode: ActionMode,
    kind: OperatingBudgetKind,
    entry?: OperatingBudgetActualEntry,
  ) {
    if (!data) return;
    const defaults = formDefaults(kind, data, actualSelection, entry);
    if (mode === "manual_income" || mode === "expense") {
      defaults.amountMillions = "";
    }
    if (
      (mode === "manual_income" || mode === "edit_income") &&
      defaults.categoryKey === "bursar"
    ) {
      defaults.categoryKey =
        data.categories.find(
          (category) => category.kind === "income" && category.key !== "bursar",
        )?.key ?? "";
    }
    setActionEntry(entry ?? null);
    setActionForm(defaults);
    setActionError(null);
    setActionMode(mode);
  }

  async function submitAction() {
    if (!data || !actionMode || !actionForm) return;
    const hasAmount = actionForm.amountMillions.trim() !== "";
    const amountXof = hasAmount
      ? parseMillionsToWholeXof(actionForm.amountMillions, {
          allowNegative: actionMode === "adjustment",
        })
      : null;
    if (!actionForm.categoryKey || !actionForm.costCenterCode) {
      setActionError("Choose both a category and cost center.");
      return;
    }
    if (
      !hasAmount ||
      amountXof === null ||
      (actionMode === "adjustment" ? false : amountXof <= 0)
    ) {
      setActionError(
        actionMode === "adjustment"
          ? "Enter a valid replacement total. Signed values are allowed."
          : "Enter an amount greater than zero.",
      );
      return;
    }
    if (!actionForm.reason.trim()) {
      setActionError("An approval reason is required.");
      return;
    }
    if (actionMode !== "adjustment" && !actionForm.occurredOn) {
      setActionError("Choose the date this entry occurred.");
      return;
    }

    setActionBusy(true);
    setActionError(null);
    try {
      let result: FinanceChangeResult;
      if (actionMode === "manual_income") {
        result = await createOperatingBudgetManualIncome({
          academicYear: data.academicYear.label,
          categoryKey: actionForm.categoryKey,
          costCenterCode: actionForm.costCenterCode,
          amountXof,
          occurredOn: actionForm.occurredOn,
          description: actionForm.description.trim() || undefined,
          reason: actionForm.reason.trim(),
        });
      } else if (actionMode === "expense") {
        result = await createOperatingBudgetExpense({
          academicYear: data.academicYear.label,
          categoryKey: actionForm.categoryKey,
          costCenterCode: actionForm.costCenterCode,
          amountXof,
          occurredOn: actionForm.occurredOn,
          description: actionForm.description.trim() || undefined,
          payee: actionForm.payee.trim() || undefined,
          isEstimate: actionForm.isEstimate,
          reason: actionForm.reason.trim(),
        });
      } else if (actionMode === "adjustment") {
        if (!actualSelection) throw new Error("Choose an actual cell first.");
        result = await createOperatingBudgetAdjustment({
          academicYear: data.academicYear.label,
          kind: actualSelection.row.kind,
          categoryKey: actualSelection.row.categoryKey,
          costCenterCode: actionForm.costCenterCode,
          month: actualSelection.month,
          requestedActualXof: amountXof,
          reason: actionForm.reason.trim(),
          description: actionForm.description.trim() || undefined,
        });
      } else if (actionMode === "edit_expense") {
        if (!actionEntry) throw new Error("Choose an expense entry first.");
        result = await updateOperatingBudgetExpense(actionEntry.id, {
          categoryKey: actionForm.categoryKey,
          costCenterCode: actionForm.costCenterCode,
          amountXof,
          occurredOn: actionForm.occurredOn,
          description: actionForm.description.trim() || undefined,
          payee: actionForm.payee.trim(),
          isEstimate: actionForm.isEstimate,
          reason: actionForm.reason.trim(),
        });
      } else {
        if (!actionEntry) throw new Error("Choose an income entry first.");
        result = await updateOperatingBudgetActualEntry(actionEntry.id, {
          academicYear: data.academicYear.label,
          categoryKey: actionForm.categoryKey,
          costCenterCode: actionForm.costCenterCode,
          amountXof,
          occurredOn: actionForm.occurredOn,
          description: actionForm.description.trim() || undefined,
          reason: actionForm.reason.trim(),
        });
      }
      setMessage(
        mutationMessage(
          result,
          actionMode === "adjustment"
            ? "Actual adjustment"
            : actionMode === "manual_income"
              ? "Income entry"
              : actionMode === "edit_income"
                ? "Income change"
                : "Expense change",
        ),
      );
      setActionMode(null);
      setActionForm(null);
      setActionEntry(null);
      await load(data.academicYear.label);
      if (actualSelection) await loadActuals(actualSelection);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Could not apply this change.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmVoid() {
    if (!voidEntry || !data) return;
    if (!voidReason.trim()) {
      setVoidError("Explain why this approved entry must be voided.");
      return;
    }
    setVoidBusy(true);
    setVoidError(null);
    try {
      const result =
        voidEntry.source === "expense"
          ? await voidOperatingBudgetExpense(voidEntry.id, voidReason.trim())
          : await voidOperatingBudgetActualEntry(
              voidEntry.id,
              voidReason.trim(),
            );
      setMessage(mutationMessage(result, "Entry void"));
      setVoidEntry(null);
      setVoidReason("");
      await load(data.academicYear.label);
      if (actualSelection) await loadActuals(actualSelection);
    } catch (cause) {
      setVoidError(
        cause instanceof Error ? cause.message : "Could not apply this void.",
      );
    } finally {
      setVoidBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Director · Operating plan"
          title="Budgeting & Cashflow"
          subtitle="Loading approved plans and management actuals…"
        />
        <div className={styles.skeleton} aria-label="Loading budget">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} style={{ height: 360 }} />
          <div className={styles.skeletonRow} style={{ height: 280 }} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Director · Operating plan"
          title="Budgeting & Cashflow"
          subtitle="Set monthly plans, inspect ledger actuals and explore cashflow scenarios."
        />
        <div className={styles.emptyState} role="alert">
          <div>
            <AlertCircle size={34} />
            <h2>Budget data is unavailable</h2>
            <p>{error ?? "The operating budget could not be loaded."}</p>
            <div style={{ marginTop: 16 }}>
              <Button
                variant="navy"
                icon={<RefreshCw size={14} />}
                onClick={() => load(selectedYear || undefined)}
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const revision = data.revision;
  const status = revision?.status;
  const editLocked = status === "pending" || status === "superseded";
  const actualIncome = data.actual.income.totalXof;
  const actualExpense = data.actual.expense.totalXof;
  const currentClosing = closingActual(data);
  const projectedClosing =
    forecast?.projectedClosingBalanceXof ??
    forecast?.months.at(-1)?.balanceXof ??
    currentClosing;
  const activeActualAmount = actualSelection
    ? (actualSelection.row.months[actualSelection.month] ?? 0)
    : 0;
  const selectedActionKind: OperatingBudgetKind =
    actionMode === "manual_income" || actionMode === "edit_income"
      ? "income"
      : actionMode === "adjustment"
        ? (actualSelection?.row.kind ?? "expense")
        : "expense";

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Director · Operating plan"
        title="Budgeting & Cashflow"
        subtitle="Plan August through July, reconcile management actuals and test cashflow assumptions without changing the ledger."
        actions={
          <div className={styles.toolbar}>
            <label className={styles.yearControl}>
              <CalendarRange size={15} aria-hidden="true" />
              <span>Year</span>
              <select
                aria-label="Academic year"
                value={selectedYear}
                disabled={loading || isEditing}
                onChange={(event) => {
                  const value = event.target.value;
                  setMessage(null);
                  setActualSelection(null);
                  load(value);
                }}
              >
                {yearOptions(data).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Save size={14} />}
                  disabled={saving}
                  onClick={() => persistBudget("save")}
                >
                  {saving ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Send size={14} />}
                  disabled={saving}
                  onClick={() => persistBudget("submit")}
                >
                  Approve revision
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="navy"
                icon={<Pencil size={14} />}
                disabled={editLocked}
                onClick={beginEdit}
              >
                {revision ? "Create revision" : "Start budget"}
              </Button>
            )}
          </div>
        }
      />

      {loading && (
        <div className={styles.notice} role="status">
          <RefreshCw size={17} aria-hidden="true" />
          <span>Loading the latest budget data…</span>
        </div>
      )}

      <div className={styles.statusBanner}>
        <span className={styles.statusIcon} aria-hidden="true">
          {status === "approved" ? (
            <CheckCircle2 size={18} />
          ) : status === "pending" ? (
            <Clock3 size={18} />
          ) : (
            <FilePenLine size={18} />
          )}
        </span>
        <div>
          <strong>
            {revision
              ? `Revision ${revision.revision} · ${STATUS_LABEL[revision.status]}`
              : "No published operating budget"}
          </strong>
          <p>{statusDescription(data)}</p>
        </div>
        <div className={styles.statusMeta}>
          {status && (
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          )}
          {revision?.createdAt && (
            <span className="muted" style={{ fontSize: 10.5 }}>
              Created {formatDate(revision.createdAt)}
            </span>
          )}
          {status === "pending" && (
            <Link
              href="/director/approvals"
              style={{ fontSize: 11, fontWeight: 700 }}
            >
              View request →
            </Link>
          )}
        </div>
      </div>

      {message && (
        <div className={styles.notice} role="status">
          <CheckCircle2 size={17} aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            {error}
            {stale && (
              <div style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RefreshCw size={13} />}
                  disabled={loading}
                  onClick={() =>
                    load(data.academicYear.label, {
                      preserveLocalDraft: true,
                    })
                  }
                >
                  {loading ? "Loading…" : "Review latest & keep my edits"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      {data.integrityWarnings.map((warning) => (
        <div key={warning.code} className={styles.warning} role="status">
          <AlertCircle size={17} aria-hidden="true" />
          {warning.code === "unclassified_expenses" ? (
            <span>
              <strong>
                {warning.count} unclassified legacy expense
                {warning.count === 1 ? "" : "s"}
              </strong>{" "}
              totaling {formatXof(warning.amountXof)}. They remain included in
              cash and closing totals. Open their Actual cells and edit an entry
              to assign a management category.
            </span>
          ) : warning.code === "unclassified_collections" ? (
            <span>
              <strong>
                {warning.count} unclassified settled collection
                {warning.count === 1 ? "" : "s"}
              </strong>{" "}
              totaling {formatXof(warning.amountXof)}. They remain included in
              cash and closing totals but cannot be budgeted or adjusted here.
              Resolve their source allocation in Finance.
            </span>
          ) : warning.code === "source_as_of_balance_reconciliations" ? (
            <span>
              <strong>
                {warning.count} paid-to-date balance reconciliation
                {warning.count === 1 ? "" : "s"}
              </strong>{" "}
              totaling {formatXof(warning.amountXof)}. {warning.message}
            </span>
          ) : (
            <span>
              <strong>
                {warning.count} legacy payment timing warning
                {warning.count === 1 ? "" : "s"}
              </strong>{" "}
              affecting {formatXof(warning.amountXof)}. {warning.message} Annual
              totals remain valid, but monthly actual and forecast timing may
              change after those dates are corrected.
            </span>
          )}
        </div>
      ))}

      <section className={styles.kpis} aria-label="Cashflow summary">
        <article
          className={styles.kpi}
          style={{ "--tone": "var(--daust-navy-700)" } as React.CSSProperties}
        >
          <span className={styles.kpiLabel}>
            <Landmark size={14} /> Opening balance
          </span>
          {isEditing ? (
            <label className={styles.openingInput}>
              <span
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                }}
              >
                Opening balance in millions of FCFA
              </span>
              <input
                data-budget-input="true"
                type="number"
                min={`-${MAX_SAFE_MILLIONS_INPUT}`}
                max={MAX_SAFE_MILLIONS_INPUT}
                step="0.000001"
                value={
                  openingBalanceXof
                    ? formatWholeXofAsMillions(openingBalanceXof)
                    : ""
                }
                placeholder="0"
                onChange={(event) => {
                  const input = event.currentTarget;
                  const amountXof =
                    input.value === ""
                      ? 0
                      : parseMillionsToWholeXof(input.value, {
                          allowNegative: true,
                        });
                  if (amountXof === null) {
                    input.setCustomValidity(
                      "Use at most six decimal places and stay within the supported accounting range.",
                    );
                    setError(
                      "Opening balance must use at most six decimal places and stay within the supported accounting range.",
                    );
                    return;
                  }
                  input.setCustomValidity("");
                  setOpeningBalanceXof(amountXof);
                  setError(null);
                  setDirty(true);
                }}
              />
              <span>M</span>
            </label>
          ) : (
            <strong
              className={styles.kpiValue}
              title={formatXof(data.summary.openingBalanceXof)}
            >
              {formatXofCompact(data.summary.openingBalanceXof)}
            </strong>
          )}
          <span className={styles.kpiSub}>
            {revision &&
            revision.openingBalanceXof !== data.defaultOpeningBalanceXof
              ? revision.status === "approved" ||
                revision.status === "superseded"
                ? "Approved opening override"
                : "Proposed opening override"
              : data.openingBalanceSource === "zero"
                ? "No prior approved closing balance"
                : "Carried from the prior approved closing balance"}
          </span>
        </article>
        <article
          className={styles.kpi}
          style={{ "--tone": "var(--success-500)" } as React.CSSProperties}
        >
          <span className={styles.kpiLabel}>
            <TrendingUp size={14} /> Actual income
          </span>
          <strong className={styles.kpiValue} title={formatXof(actualIncome)}>
            {formatXofCompact(actualIncome)}
          </strong>
          <span className={styles.kpiSub}>
            Approved, settled and net of refunds
          </span>
        </article>
        <article
          className={styles.kpi}
          style={{ "--tone": "var(--daust-orange)" } as React.CSSProperties}
        >
          <span className={styles.kpiLabel}>
            <TrendingDown size={14} /> Actual expenses
          </span>
          <strong className={styles.kpiValue} title={formatXof(actualExpense)}>
            {formatXofCompact(actualExpense)}
          </strong>
          <span className={styles.kpiSub}>
            Approved expenses; estimates excluded
          </span>
        </article>
        <article
          className={styles.kpi}
          style={
            {
              "--tone":
                currentClosing >= 0
                  ? "var(--daust-navy-700)"
                  : "var(--error-500)",
            } as React.CSSProperties
          }
        >
          <span className={styles.kpiLabel}>
            <WalletCards size={14} /> Current closing cash
          </span>
          <strong className={styles.kpiValue} title={formatXof(currentClosing)}>
            {formatXofCompact(currentClosing)}
          </strong>
          <span className={styles.kpiSub}>
            Scenario projects {formatXofCompact(projectedClosing)} at year end
          </span>
        </article>
      </section>

      <div className={styles.chartLayout}>
        <BudgetCashflowChart
          months={data.months}
          cashflow={data.cashflow}
          forecast={forecast}
          forecastLoading={forecastLoading}
        />
        <aside
          className={styles.forecastPanel}
          aria-labelledby="forecast-title"
        >
          <h2 id="forecast-title">Forecast studio</h2>
          <p>
            Explore assumptions only. These controls never save or alter an
            approved plan.
          </p>
          <div
            className={styles.scenario}
            role="group"
            aria-label="Forecast scenario"
          >
            {(
              [
                ["conservative", "Conservative"],
                ["base", "Base"],
                ["optimistic", "Optimistic"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scenario === value}
                onClick={() => setScenario(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Collection rate
              <output>{collectionRate}%</output>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={collectionRate}
                onChange={(event) =>
                  setCollectionRate(Number(event.target.value))
                }
              />
              <small>Applies to live remaining approved installments.</small>
            </label>
            <label className={styles.sliderLabel}>
              Monthly expense growth
              <output>
                {expenseGrowth > 0 ? "+" : ""}
                {expenseGrowth}%
              </output>
              <input
                type="range"
                min="-10"
                max="20"
                step="0.5"
                value={expenseGrowth}
                onChange={(event) =>
                  setExpenseGrowth(Number(event.target.value))
                }
              />
              <small>Compounds only forecast expense months.</small>
            </label>
          </div>
          <div className={styles.forecastResult}>
            <div>
              <span>Projected closing cash</span>
              <strong title={formatXof(projectedClosing)}>
                {forecastLoading
                  ? "Updating…"
                  : formatXofCompact(projectedClosing)}
              </strong>
            </div>
            <p>
              {forecastError
                ? `Forecast unavailable: ${forecastError}`
                : forecast?.metadata.forecastStatus === "insufficient_data"
                  ? "There is not enough ledger history for a reliable projection."
                  : forecast
                    ? `Based on approved revision ${forecast.metadata.basisRevision}. Dashed values are exploratory and are not stored.`
                    : "Dashed chart values are exploratory and are not stored."}
            </p>
          </div>
        </aside>
      </div>

      <section className={styles.workbook} aria-labelledby="workbook-title">
        <div className={styles.workbookHead}>
          <div>
            <h2 id="workbook-title" className="h1" style={{ fontSize: 18 }}>
              Operating workbook
            </h2>
            <p className="muted" style={{ margin: "3px 0 0", fontSize: 12 }}>
              August–July · all amounts in FCFA · select actual cells for source
              detail
            </p>
          </div>
          <div className={styles.matrixActions}>
            {tab === "actual" && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={14} />}
                  disabled={costCenters.length === 0}
                  onClick={() => openAction("manual_income", "income")}
                >
                  Record income
                </Button>
                <Button
                  size="sm"
                  variant="navy"
                  icon={<Plus size={14} />}
                  disabled={costCenters.length === 0}
                  onClick={() => openAction("expense", "expense")}
                >
                  Record expense
                </Button>
              </>
            )}
            <div
              className={styles.tabs}
              role="group"
              aria-label="Workbook view"
            >
              {(
                [
                  ["budget", "Budget"],
                  ["actual", "Actual"],
                  ["deviation", "Deviation"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isEditing && tab === "budget" && (
          <div className={styles.reasonPanel}>
            <label>
              Revision reason
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setDirty(true);
                }}
                placeholder="What changed, and why is this plan needed?"
              />
            </label>
            <p>
              {dirty ? "Unsaved changes." : "Draft matches the server."} Saving
              keeps this private; approval publishes the complete revision
              through the Director change-control record.
            </p>
          </div>
        )}

        {tab === "budget" && budgetIncome && budgetExpense && (
          <>
            <BudgetMatrix
              kind="income"
              mode="budget"
              months={data.months}
              matrix={budgetIncome}
              editable={isEditing}
              onChange={changeDraft}
            />
            <BudgetMatrix
              kind="expense"
              mode="budget"
              months={data.months}
              matrix={budgetExpense}
              editable={isEditing}
              onChange={changeDraft}
            />
          </>
        )}
        {tab === "actual" && (
          <>
            <BudgetMatrix
              kind="income"
              mode="actual"
              months={data.months}
              matrix={data.actual.income}
              onOpenActual={openActual}
            />
            <BudgetMatrix
              kind="expense"
              mode="actual"
              months={data.months}
              matrix={data.actual.expense}
              onOpenActual={openActual}
            />
          </>
        )}
        {tab === "deviation" && (
          <>
            <BudgetMatrix
              kind="income"
              mode="deviation"
              months={data.months}
              matrix={data.deviation.income}
            />
            <BudgetMatrix
              kind="expense"
              mode="deviation"
              months={data.months}
              matrix={data.deviation.expense}
            />
          </>
        )}
      </section>

      <Drawer
        open={
          actualSelection !== null && actionMode === null && voidEntry === null
        }
        onClose={() => setActualSelection(null)}
        width={560}
        title={
          actualSelection
            ? `${actualSelection.row.label} · ${monthLabel(data, actualSelection.month)}`
            : "Actual detail"
        }
        footer={
          actualSelection ? (
            <>
              <Button variant="ghost" onClick={() => setActualSelection(null)}>
                Close
              </Button>
              {!isActualOnlyCategory(actualSelection.row.categoryKey) && (
                <Button
                  variant="secondary"
                  icon={<FilePenLine size={14} />}
                  disabled={costCenters.length === 0}
                  onClick={() =>
                    openAction("adjustment", actualSelection.row.kind)
                  }
                >
                  Adjust reported total
                </Button>
              )}
              {!isActualOnlyCategory(actualSelection.row.categoryKey) && (
                <Button
                  variant="navy"
                  icon={<Plus size={14} />}
                  disabled={costCenters.length === 0}
                  onClick={() =>
                    openAction(
                      actualSelection.row.kind === "income"
                        ? "manual_income"
                        : "expense",
                      actualSelection.row.kind,
                    )
                  }
                >
                  Add {actualSelection.row.kind}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {actualSelection && (
          <>
            <p className={styles.drawerIntro}>
              Reported actual: <strong>{formatXof(activeActualAmount)}</strong>.
              {actualSelection.row.categoryKey === "unclassified_expenses"
                ? " Open an expense below and edit it to classify it. Cell-level adjustments and new entries are unavailable until classification."
                : actualSelection.row.categoryKey === "unclassified_collections"
                  ? " These settled collections are read-only here. Resolve the payment or credit allocation at its Finance source before assigning a management category."
                  : " Source transactions remain immutable; corrections create signed, approval-backed adjustments."}
            </p>
            {actualLoading && !actualEntries && (
              <p className="muted" role="status">
                Loading ledger entries…
              </p>
            )}
            {actualError && (
              <div className={styles.error} role="alert">
                <AlertCircle size={16} /> {actualError}
              </div>
            )}
            {actualEntries && actualEntries.excludedEstimateXof > 0 && (
              <div className={styles.warning} role="status">
                <Clock3 size={16} aria-hidden="true" />
                <span>
                  Approved estimates totaling{" "}
                  <strong>
                    {formatXof(actualEntries.excludedEstimateXof)}
                  </strong>{" "}
                  are listed below for planning visibility but excluded from the
                  reported Actual, KPIs and cash balance.
                </span>
              </div>
            )}
            {actualEntries && actualEntries.items.length === 0 && (
              <div className={styles.emptyState} style={{ minHeight: 190 }}>
                <div>
                  <ListFilter size={28} />
                  <h2>No contributing entries</h2>
                  <p>
                    This month has no approved ledger entries for the selected
                    category.
                  </p>
                </div>
              </div>
            )}
            {actualEntries && actualEntries.items.length > 0 && (
              <div className={styles.entryList}>
                {actualEntries.items.map((entry) => (
                  <article
                    key={`${entry.source}-${entry.id}`}
                    className={styles.entry}
                  >
                    <div className={styles.entryHead}>
                      <strong>{SOURCE_LABEL[entry.source]}</strong>
                      <span title={formatXof(entry.amountXof)}>
                        {entry.amountXof > 0 ? "+" : ""}
                        {formatXofCompact(entry.amountXof)}
                      </span>
                    </div>
                    <div className={styles.entryMeta}>
                      <span>
                        {formatDate(entry.occurredOn)}
                        {entry.costCenterCode
                          ? ` · ${entry.costCenterCode}${entry.costCenterName ? ` ${entry.costCenterName}` : ""}`
                          : ""}
                        {entry.isEstimate ? " · Estimate (excluded)" : ""}
                      </span>
                      <Badge
                        tone={
                          entry.status === "approved" ? "success" : "neutral"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </div>
                    {entry.description && (
                      <p
                        style={{
                          margin: "8px 0 0",
                          color: "var(--fg2)",
                          fontSize: 11.5,
                          lineHeight: 1.5,
                        }}
                      >
                        {entry.description}
                      </p>
                    )}
                    {(entry.source === "expense" ||
                      entry.source === "manual_income") &&
                      entry.status !== "void" && (
                        <div className={styles.entryActions}>
                          <button
                            type="button"
                            onClick={() =>
                              openAction(
                                entry.source === "expense"
                                  ? "edit_expense"
                                  : "edit_income",
                                entry.kind,
                                entry,
                              )
                            }
                          >
                            Edit entry
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVoidReason("");
                              setVoidError(null);
                              setVoidEntry(entry);
                            }}
                          >
                            Void entry
                          </button>
                        </div>
                      )}
                  </article>
                ))}
                {actualEntries.nextCursor && (
                  <Button
                    variant="secondary"
                    disabled={actualLoading}
                    onClick={() =>
                      loadActuals(
                        actualSelection,
                        actualEntries.nextCursor ?? undefined,
                      )
                    }
                  >
                    {actualLoading ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Drawer>

      <Drawer
        open={actionMode !== null}
        onClose={() => {
          if (!actionBusy) setActionMode(null);
        }}
        width={520}
        title={
          actionMode === "manual_income"
            ? "Record non-Bursar income"
            : actionMode === "expense"
              ? "Record operating expense"
              : actionMode === "adjustment"
                ? "Adjust reported actual"
                : actionMode === "edit_income"
                  ? "Edit income entry"
                  : "Edit expense entry"
        }
        footer={
          <>
            <Button
              variant="ghost"
              disabled={actionBusy}
              onClick={() => setActionMode(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<ShieldCheck size={14} />}
              disabled={actionBusy}
              onClick={submitAction}
            >
              {actionBusy ? "Applying…" : "Approve & apply"}
            </Button>
          </>
        }
      >
        {actionForm && (
          <div className={styles.form}>
            {actionError && (
              <div className={styles.error} role="alert">
                <AlertCircle size={16} /> {actionError}
              </div>
            )}
            {actionMode === "adjustment" && actualSelection && (
              <p className={styles.drawerIntro}>
                Current reported actual for{" "}
                {monthLabel(data, actualSelection.month)}:{" "}
                <strong>{formatXof(activeActualAmount)}</strong>. Enter the
                requested replacement total; the server records only the signed
                difference and verifies this base has not changed.
              </p>
            )}
            <div className={styles.formGrid}>
              <label>
                Category
                <select
                  value={actionForm.categoryKey}
                  disabled={actionMode === "adjustment"}
                  onChange={(event) =>
                    setActionForm({
                      ...actionForm,
                      categoryKey: event.target.value,
                    })
                  }
                >
                  {data.categories
                    .filter(
                      (category) =>
                        category.kind === selectedActionKind &&
                        !(
                          (actionMode === "manual_income" ||
                            actionMode === "edit_income") &&
                          category.key === "bursar"
                        ),
                    )
                    .map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cost center
                <select
                  value={actionForm.costCenterCode}
                  onChange={(event) =>
                    setActionForm({
                      ...actionForm,
                      costCenterCode: event.target.value,
                    })
                  }
                >
                  <option value="">Select a cost center</option>
                  {costCenters.map((center) => (
                    <option key={center.code} value={center.code}>
                      {center.code} · {center.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {actionMode === "adjustment"
                  ? "Requested actual (millions FCFA)"
                  : "Amount (millions FCFA)"}
                <input
                  type="number"
                  min={
                    actionMode === "adjustment"
                      ? `-${MAX_SAFE_MILLIONS_INPUT}`
                      : "0"
                  }
                  max={MAX_SAFE_MILLIONS_INPUT}
                  step="0.000001"
                  value={actionForm.amountMillions}
                  onChange={(event) =>
                    setActionForm({
                      ...actionForm,
                      amountMillions: event.target.value,
                    })
                  }
                />
              </label>
              {actionMode !== "adjustment" && (
                <label>
                  Occurred on
                  <input
                    type="date"
                    value={actionForm.occurredOn}
                    min={data.academicYear.startDate.slice(0, 10)}
                    max={
                      actionForm.isEstimate &&
                      (actionMode === "expense" ||
                        actionMode === "edit_expense")
                        ? data.academicYear.endDate.slice(0, 10)
                        : earlierDate(
                            todayInDakar(),
                            data.academicYear.endDate.slice(0, 10),
                          )
                    }
                    onChange={(event) =>
                      setActionForm({
                        ...actionForm,
                        occurredOn: event.target.value,
                      })
                    }
                  />
                </label>
              )}
            </div>
            {(actionMode === "expense" || actionMode === "edit_expense") && (
              <>
                <label>
                  Payee (optional)
                  <input
                    value={actionForm.payee}
                    onChange={(event) =>
                      setActionForm({
                        ...actionForm,
                        payee: event.target.value,
                      })
                    }
                    placeholder="Supplier or recipient"
                  />
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={actionForm.isEstimate}
                    onChange={(event) =>
                      setActionForm({
                        ...actionForm,
                        isEstimate: event.target.checked,
                      })
                    }
                  />
                  <div>
                    Estimate only
                    <span>
                      Estimated expenses remain visible in detail but are
                      excluded from approved actual totals.
                    </span>
                  </div>
                </label>
              </>
            )}
            <label>
              Description (optional)
              <textarea
                value={actionForm.description}
                onChange={(event) =>
                  setActionForm({
                    ...actionForm,
                    description: event.target.value,
                  })
                }
                placeholder="What does this entry represent?"
              />
            </label>
            <label>
              Approval reason
              <textarea
                required
                value={actionForm.reason}
                onChange={(event) =>
                  setActionForm({ ...actionForm, reason: event.target.value })
                }
                placeholder="Why should this entry or correction be approved?"
              />
            </label>
            <div className={styles.approvalNote}>
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                Source transactions are never overwritten. The Director approval
                record preserves the before and after values.
              </span>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={voidEntry !== null}
        onClose={() => {
          if (!voidBusy) setVoidEntry(null);
        }}
        title="Approve entry void"
        width={480}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={voidBusy}
              onClick={() => setVoidEntry(null)}
            >
              Cancel
            </Button>
            <Button variant="danger" disabled={voidBusy} onClick={confirmVoid}>
              {voidBusy ? "Applying…" : "Approve void"}
            </Button>
          </>
        }
      >
        {voidEntry && (
          <div className={styles.form}>
            <p className={styles.drawerIntro}>
              The approved entry{" "}
              <strong>{formatXof(voidEntry.amountXof)}</strong> remains in audit
              history. The ledger changes only after Director approval.
            </p>
            {voidError && (
              <div className={styles.error} role="alert">
                <AlertCircle size={16} /> {voidError}
              </div>
            )}
            <label>
              Reason for void
              <textarea
                autoFocus
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder="Explain the duplicate, error or reversal that requires this void."
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

"use client";

import type {
  OperatingBudgetDeviationMatrix,
  OperatingBudgetDeviationRow,
  OperatingBudgetKind,
  OperatingBudgetMatrix,
  OperatingBudgetMatrixRow,
  OperatingBudgetMonth,
} from "@/lib/api";
import { formatXof, formatXofCompact } from "@/lib/format";
import {
  MAX_SAFE_MILLIONS_INPUT,
  formatWholeXofAsMillions,
  parseMillionsToWholeXof,
} from "@/lib/xof-input";
import styles from "./BudgetMatrix.module.css";

export type BudgetMatrixMode = "budget" | "actual" | "deviation";

type Props = {
  kind: OperatingBudgetKind;
  mode: BudgetMatrixMode;
  months: OperatingBudgetMonth[];
  matrix: OperatingBudgetMatrix | OperatingBudgetDeviationMatrix;
  editable?: boolean;
  onChange?: (categoryKey: string, month: string, amountXof: number) => void;
  onOpenActual?: (row: OperatingBudgetMatrixRow, month: string) => void;
};

function matrixAmount(value: number): string {
  return value === 0 ? "—" : formatXofCompact(value).replace(" FCFA", "");
}

function inputAmount(value: number): string {
  return value === 0 ? "" : formatWholeXofAsMillions(value);
}

function signedAmount(value: number): string {
  if (value === 0) return "—";
  return `${value > 0 ? "+" : "−"}${formatXofCompact(Math.abs(value)).replace(" FCFA", "")}`;
}

function varianceTone(kind: OperatingBudgetKind, value: number): string {
  if (value === 0) return styles.neutral!;
  const favorable = kind === "income" ? value > 0 : value < 0;
  return favorable ? styles.favorable! : styles.unfavorable!;
}

function varianceLabel(kind: OperatingBudgetKind, value: number): string {
  if (value === 0) return "On plan";
  if (kind === "income") return value > 0 ? "Above plan" : "Below plan";
  return value > 0 ? "Over budget" : "Under budget";
}

function isDeviationRow(
  row: OperatingBudgetMatrixRow,
): row is OperatingBudgetDeviationRow {
  return "variancePercentByMonth" in row;
}

function percentLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "No baseline";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function deviationLabel(
  kind: OperatingBudgetKind,
  value: number,
  unbudgeted: boolean,
  percent: number | null | undefined,
): string {
  return unbudgeted
    ? "Unbudgeted actual · No baseline"
    : `${varianceLabel(kind, value)} · ${percentLabel(percent)}`;
}

function totalForMonth(
  matrix: OperatingBudgetMatrix | OperatingBudgetDeviationMatrix,
  month: string,
): number {
  return matrix.monthTotalsXof[month] ?? 0;
}

function ValueCell({
  kind,
  mode,
  row,
  month,
  monthLabel,
  editable,
  onChange,
  onOpenActual,
}: {
  kind: OperatingBudgetKind;
  mode: BudgetMatrixMode;
  row: OperatingBudgetMatrixRow;
  month: string;
  monthLabel: string;
  editable?: boolean;
  onChange?: Props["onChange"];
  onOpenActual?: Props["onOpenActual"];
}) {
  const value = row.months[month] ?? 0;
  const aria = `${monthLabel} ${row.label}`;

  if (mode === "budget" && editable) {
    return (
      <label className={styles.inputWrap}>
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        >
          {aria} planned amount in millions of FCFA
        </span>
        <input
          data-budget-input="true"
          inputMode="decimal"
          type="number"
          min="0"
          max={MAX_SAFE_MILLIONS_INPUT}
          step="0.000001"
          value={inputAmount(value)}
          placeholder="0"
          onChange={(event) => {
            const amountXof =
              event.target.value === ""
                ? 0
                : parseMillionsToWholeXof(event.target.value);
            if (amountXof === null) {
              event.currentTarget.setCustomValidity(
                "Use at most six decimal places and stay within the supported accounting range.",
              );
              event.currentTarget.reportValidity();
              return;
            }
            event.currentTarget.setCustomValidity("");
            onChange?.(row.categoryKey, month, amountXof);
          }}
        />
        <span className={styles.unit}>M</span>
      </label>
    );
  }

  if (mode === "actual") {
    return (
      <button
        type="button"
        className={styles.valueButton}
        aria-label={`${aria}: ${formatXof(value)}. View contributing entries.`}
        onClick={() => onOpenActual?.(row, month)}
      >
        <span className={value === 0 ? styles.empty : undefined}>
          {matrixAmount(value)}
        </span>
      </button>
    );
  }

  if (mode === "deviation") {
    const percent = isDeviationRow(row)
      ? row.variancePercentByMonth[month]
      : null;
    const unbudgeted = isDeviationRow(row)
      ? Boolean(row.unbudgetedByMonth[month])
      : false;
    return (
      <div
        className={`${styles.variance} ${varianceTone(kind, value)}`}
        title={formatXof(value)}
        aria-label={`${aria}: ${formatXof(value)}. ${deviationLabel(kind, value, unbudgeted, percent)}.`}
      >
        <strong>{signedAmount(value)}</strong>
        <span>{deviationLabel(kind, value, unbudgeted, percent)}</span>
      </div>
    );
  }

  return (
    <span
      className={value === 0 ? styles.empty : undefined}
      title={formatXof(value)}
      aria-label={`${aria}: ${formatXof(value)}`}
    >
      {matrixAmount(value)}
    </span>
  );
}

export function BudgetMatrix({
  kind,
  mode,
  months,
  matrix,
  editable,
  onChange,
  onOpenActual,
}: Props) {
  const annualLabel = mode === "deviation" ? "Annual deviation" : "Annual";
  const title = kind === "income" ? "Income" : "Expenses";
  const subtitle =
    mode === "budget"
      ? editable
        ? "Enter each monthly plan in millions of FCFA"
        : "Approved or draft monthly plan"
      : mode === "actual"
        ? "Select any month to inspect its contributing ledger entries"
        : "Actual minus budget; favorable direction depends on income or expense";

  return (
    <section
      className={styles.section}
      aria-labelledby={`${kind}-${mode}-title`}
    >
      <div className={styles.heading}>
        <div className={styles.titleGroup}>
          <span
            className={`${styles.marker} ${kind === "income" ? styles.markerIncome : styles.markerExpense}`}
            aria-hidden="true"
          />
          <div>
            <h3 id={`${kind}-${mode}-title`}>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
        <strong title={formatXof(matrix.totalXof)}>
          {formatXofCompact(matrix.totalXof)}
        </strong>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
          >
            {title} {mode} by academic-year month in FCFA
          </caption>
          <thead>
            <tr>
              <th className={styles.category}>Category</th>
              {months.map((month) => (
                <th key={month.key}>{month.label}</th>
              ))}
              <th className={styles.annual}>{annualLabel}</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => {
              const annualPercent = isDeviationRow(row)
                ? row.annualVariancePercent
                : null;
              return (
                <tr key={row.categoryKey}>
                  <th scope="row" className={styles.category}>
                    {row.label}
                  </th>
                  {months.map((month) => (
                    <td key={month.key}>
                      <ValueCell
                        kind={kind}
                        mode={mode}
                        row={row}
                        month={month.key}
                        monthLabel={month.label}
                        editable={editable}
                        onChange={onChange}
                        onOpenActual={onOpenActual}
                      />
                    </td>
                  ))}
                  <td className={styles.annual}>
                    {mode === "deviation" ? (
                      <div
                        className={`${styles.variance} ${varianceTone(kind, row.totalXof)}`}
                        title={formatXof(row.totalXof)}
                        aria-label={`${row.label} annual deviation: ${formatXof(row.totalXof)}. ${deviationLabel(
                          kind,
                          row.totalXof,
                          isDeviationRow(row) && row.annualUnbudgeted,
                          annualPercent,
                        )}.`}
                      >
                        <strong>{signedAmount(row.totalXof)}</strong>
                        <span>
                          {deviationLabel(
                            kind,
                            row.totalXof,
                            isDeviationRow(row) && row.annualUnbudgeted,
                            annualPercent,
                          )}
                        </span>
                      </div>
                    ) : (
                      <span
                        className={
                          row.totalXof === 0 ? styles.empty : undefined
                        }
                        title={formatXof(row.totalXof)}
                        aria-label={`${row.label} annual: ${formatXof(row.totalXof)}`}
                      >
                        {matrixAmount(row.totalXof)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={styles.category}>
                {title} total
              </th>
              {months.map((month) => (
                <td
                  key={month.key}
                  title={formatXof(totalForMonth(matrix, month.key))}
                  aria-label={`${month.label} ${title.toLowerCase()} total: ${formatXof(totalForMonth(matrix, month.key))}`}
                >
                  {matrixAmount(totalForMonth(matrix, month.key))}
                </td>
              ))}
              <td
                className={styles.annual}
                title={formatXof(matrix.totalXof)}
                aria-label={`Annual ${title.toLowerCase()} total: ${formatXof(matrix.totalXof)}`}
              >
                {matrixAmount(matrix.totalXof)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={styles.mobile}>
        {matrix.rows.map((row) => (
          <article key={row.categoryKey} className={styles.mobileCard}>
            <div className={styles.mobileCardHead}>
              <strong>{row.label}</strong>
              {mode === "deviation" ? (
                <div
                  className={`${styles.variance} ${varianceTone(kind, row.totalXof)}`}
                  title={formatXof(row.totalXof)}
                  aria-label={`${row.label} annual deviation: ${formatXof(row.totalXof)}. ${deviationLabel(
                    kind,
                    row.totalXof,
                    isDeviationRow(row) && row.annualUnbudgeted,
                    isDeviationRow(row) ? row.annualVariancePercent : null,
                  )}.`}
                >
                  <strong>{signedAmount(row.totalXof)}</strong>
                  <span>
                    {deviationLabel(
                      kind,
                      row.totalXof,
                      isDeviationRow(row) && row.annualUnbudgeted,
                      isDeviationRow(row) ? row.annualVariancePercent : null,
                    )}
                  </span>
                </div>
              ) : (
                <span
                  title={formatXof(row.totalXof)}
                  aria-label={`${row.label} annual: ${formatXof(row.totalXof)}`}
                >
                  {matrixAmount(row.totalXof)}
                </span>
              )}
            </div>
            <div className={styles.mobileMonths}>
              {months.map((month) => (
                <div key={month.key} className={styles.mobileMonth}>
                  <span>{month.label}</span>
                  <ValueCell
                    kind={kind}
                    mode={mode}
                    row={row}
                    month={month.key}
                    monthLabel={month.label}
                    editable={editable}
                    onChange={onChange}
                    onOpenActual={onOpenActual}
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

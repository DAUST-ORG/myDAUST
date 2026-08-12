export interface ComponentBalance {
  id: string;
  availableXof: number;
}

export interface ComponentSplit {
  id: string;
  amountXof: number;
}

/**
 * Split whole-XOF cash proportionally across component balances.
 *
 * The largest-remainder method makes the result deterministic and exact: floor
 * every fractional share, then hand leftover francs to the largest remainders
 * (stable component id breaks ties). No component can receive more than its
 * available balance.
 */
export function allocateProportionallyXof(
  requestedXof: number,
  components: readonly ComponentBalance[],
): ComponentSplit[] {
  if (!Number.isSafeInteger(requestedXof) || requestedXof < 0) {
    throw new Error("Allocation amount must be a non-negative whole XOF value");
  }
  const valid = components
    .map((component) => ({
      id: component.id,
      availableXof: component.availableXof,
    }))
    .filter((component) => component.availableXof > 0);
  if (
    valid.some((component) => !Number.isSafeInteger(component.availableXof))
  ) {
    throw new Error("Component balances must be whole XOF values");
  }
  const capacityXof = valid.reduce(
    (sum, component) => sum + component.availableXof,
    0,
  );
  if (requestedXof > capacityXof) {
    throw new Error("Allocation exceeds component capacity");
  }
  if (requestedXof === 0 || capacityXof === 0) return [];

  const weighted = valid.map((component) => {
    const numerator = BigInt(requestedXof) * BigInt(component.availableXof);
    const denominator = BigInt(capacityXof);
    return {
      ...component,
      amountXof: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let remainderXof =
    requestedXof - weighted.reduce((sum, row) => sum + row.amountXof, 0);
  weighted.sort((a, b) => {
    if (a.remainder === b.remainder) return a.id.localeCompare(b.id);
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (const row of weighted) {
    if (remainderXof === 0) break;
    if (row.amountXof < row.availableXof) {
      row.amountXof += 1;
      remainderXof -= 1;
    }
  }
  if (remainderXof !== 0) {
    throw new Error("Unable to reconcile component allocation");
  }
  return weighted
    .filter((row) => row.amountXof > 0)
    .map(({ id, amountXof }) => ({ id, amountXof }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

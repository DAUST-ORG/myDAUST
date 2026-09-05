/**
 * What one fee component is worth on an invoice right now.
 *
 * A removed component is not deleted from the invoice: when allocations still
 * reference it, it is left behind selected:false at amountXof 0. That zeroed
 * snapshot is the correct price for a component that is still billed, but it is
 * not the price of putting the component back — re-adding bills the catalog
 * amount. Reading the snapshot with `??` cannot tell the two apart, because 0 is
 * not nullish and so survives the fallback.
 */
export function componentPriceXof(row: {
  selected: boolean;
  selectedComponent?: { amountXof: number } | null;
  annualAmountXof: number;
}): number {
  if (row.selected && row.selectedComponent)
    return row.selectedComponent.amountXof;
  return row.annualAmountXof;
}

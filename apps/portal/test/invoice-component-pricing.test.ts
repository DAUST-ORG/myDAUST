import assert from "node:assert/strict";
import test from "node:test";
import { componentPriceXof } from "../src/lib/invoice-component-pricing.ts";

const HOUSING = 500_000;

test("re-adding a soft-removed component costs the catalog price, not its zeroed snapshot", () => {
  // Housing was removed but survives on the invoice at zero because allocations
  // reference it. Reading amountXof here previewed the change as free while
  // approval billed the full catalog amount.
  const softRemoved = {
    selected: false,
    selectedComponent: { amountXof: 0 },
    annualAmountXof: HOUSING,
  };

  assert.equal(componentPriceXof(softRemoved), HOUSING);
});

test("a component with no invoice history is priced from the catalog", () => {
  assert.equal(
    componentPriceXof({ selected: false, annualAmountXof: HOUSING }),
    HOUSING,
  );
});

test("a selected component keeps the amount the invoice actually carries", () => {
  // The invoice snapshot wins while the component is billed: a negotiated or
  // adjusted amount must not be overwritten by the latest catalog price.
  assert.equal(
    componentPriceXof({
      selected: true,
      selectedComponent: { amountXof: 425_000 },
      annualAmountXof: HOUSING,
    }),
    425_000,
  );
});

test("a selected component fully covered by an adjustment is worth zero", () => {
  assert.equal(
    componentPriceXof({
      selected: true,
      selectedComponent: { amountXof: 0 },
      annualAmountXof: HOUSING,
    }),
    0,
  );
});

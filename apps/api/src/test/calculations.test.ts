import { describe, expect, it } from "vitest";
import { calculateInvestmentValue } from "../services/investments.js";
import { calculateLoanBalance, nextLoanStatus } from "../services/loans.js";
import { calculateZakat } from "../services/zakat.js";

describe("financial calculations", () => {
  it("calculates loan balances from child repayments", () => {
    const balance = calculateLoanBalance("1000", "USD", [
      { amount: "250", currency: "USD" },
      { amount: "125.50", currency: "USD" }
    ]);

    expect(balance.totalRepaid.toFixed(2)).toBe("375.50");
    expect(balance.remaining.toFixed(2)).toBe("624.50");
    expect(nextLoanStatus("1000", "USD", [{ amount: "250", currency: "USD" }])).toBe("PARTIALLY_PAID");
  });

  it("rejects mixed-currency loan totals without exchange rates", () => {
    expect(() =>
      calculateLoanBalance("1000", "USD", [{ amount: "100", currency: "AED" }])
    ).toThrow(/Mixed currencies/);
  });

  it("calculates investment value, gain, and percentage from NAV", () => {
    const value = calculateInvestmentValue({
      amountInvested: "1000",
      quantity: "8",
      nav: "150"
    });

    expect(value.currentValue?.toFixed(2)).toBe("1200.00");
    expect(value.gainLoss?.toFixed(2)).toBe("200.00");
    expect(value.gainLossPercentage?.toFixed(2)).toBe("20.00");
  });

  it("calculates configurable Zakat and threshold boundaries", () => {
    const result = calculateZakat({
      currency: "USD",
      nisabThreshold: "5000",
      rate: "0.025",
      items: [
        { kind: "ASSET", label: "Cash", amount: "6000", currency: "USD", included: true },
        { kind: "LIABILITY", label: "Short-term debt", amount: "500", currency: "USD", included: true },
        { kind: "EXEMPT", label: "Personal vehicle", amount: "10000", currency: "USD", included: false }
      ]
    });

    expect(result.zakatableWealth.toFixed(2)).toBe("5500.00");
    expect(result.thresholdMet).toBe(true);
    expect(result.estimatedZakat.toFixed(2)).toBe("137.50");
  });
});

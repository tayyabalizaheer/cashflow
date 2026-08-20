import { describe, expect, it } from "vitest";
import { parseStockRows } from "./stock.js";

describe("parseStockRows", () => {
  it("parses stock markdown rows and carries category headings", () => {
    const rows = parseStockRows(`
| Funds Category | Launch Date | Validity Date | Repurchase (Rs.) | Offer (Rs.) | NAV (Rs.) | M. Fee (%) | Trustee Fee (%) | Regulatory. Fee (%) | Levies and Taxes | Transaction Expenses (Broker, Bank, PSX, CDC, NCCPL etc) | Third Party Expenses (Auditor, Rating Agency, Legal, Shariah Advisor) | Other Expenses | TER with Levies | TER without Levies | MTD Return | FYTD Return | CYTD Return | FY25 (%) Return | FY24 (%) Return | Since Inception Return |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Equity Funds |  |
| Al Meezan Mutual Fund | 13 Jul 1995 | 19 Aug 2026 | 50.2064 | 51.3611 | 0.0000 | - | - | - | - | - | - | - | - | - | 0.80 | -2.58 | -1.84 | 29.87 | 64.70 | 10537.48 |
`);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fundName: "Al Meezan Mutual Fund",
      category: "Equity Funds",
      launchDate: "13 Jul 1995",
      validityDate: "19 Aug 2026",
      repurchasePrice: "50.2064",
      offerPrice: "51.3611",
      navPrice: "0.0000",
      mtdReturn: "0.80",
      fytdReturn: "-2.58",
      sinceInceptionReturn: "10537.48"
    });
  });
});

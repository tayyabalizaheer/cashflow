import { zakatDisclaimer } from "@cash-flow/shared";
import { useState } from "react";
import { formatCurrency } from "../lib/api";

export function ZakatPage() {
  const [assets, setAssets] = useState(10000);
  const [investments, setInvestments] = useState(4000);
  const [liabilities, setLiabilities] = useState(1200);
  const [nisab, setNisab] = useState(5500);
  const [rate, setRate] = useState(2.5);
  const wealth = Math.max(assets + investments - liabilities, 0);
  const thresholdMet = wealth >= nisab;
  const due = thresholdMet ? wealth * (rate / 100) : 0;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Transparent estimate</p>
          <h1>Zakat calculator</h1>
        </div>
      </header>
      <section className="calculator-grid">
        <form className="form-card compact-form">
          <label>
            Eligible assets and cash
            <input type="number" value={assets} onChange={(event) => setAssets(Number(event.target.value))} />
          </label>
          <label>
            Eligible investments
            <input type="number" value={investments} onChange={(event) => setInvestments(Number(event.target.value))} />
          </label>
          <label>
            Deductible short-term liabilities
            <input type="number" value={liabilities} onChange={(event) => setLiabilities(Number(event.target.value))} />
          </label>
          <label>
            Nisab threshold
            <input type="number" value={nisab} onChange={(event) => setNisab(Number(event.target.value))} />
          </label>
          <label>
            Rate
            <input type="number" step="0.1" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
          </label>
        </form>
        <aside className="zakat-result">
          <span className={thresholdMet ? "status-pill good" : "status-pill"}>{thresholdMet ? "Nisab met" : "Below nisab"}</span>
          <strong>{formatCurrency(due, "USD")}</strong>
          <p>Zakatable wealth: {formatCurrency(wealth, "USD")}</p>
          <small>{zakatDisclaimer}</small>
        </aside>
      </section>
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import { RecordTable } from "../components/RecordTable";
import { api, formatCurrency } from "../lib/api";

type RecordItem = {
  id: string;
  purpose?: string;
  person?: string;
  name?: string;
  type?: string;
  assetType?: string;
  amount?: string;
  amountInvested?: string;
  value?: string;
  currency: string;
  status?: string;
};

const config = {
  expenses: {
    title: "Expenses",
    endpoint: "/expenses",
    empty: "No expenses yet. Add your first expense from the API or connect the form flow.",
    columns: [
      { key: "purpose", label: "Purpose" },
      { key: "amount", label: "Amount", render: (row: RecordItem) => formatCurrency(row.amount ?? 0, row.currency) },
      { key: "currency", label: "Currency" }
    ]
  },
  loans: {
    title: "Loans",
    endpoint: "/loans",
    empty: "No loans yet. Receivables and payables will appear here.",
    columns: [
      { key: "person", label: "Person" },
      { key: "amount", label: "Amount", render: (row: RecordItem) => formatCurrency(row.amount ?? 0, row.currency) },
      { key: "status", label: "Status" }
    ]
  },
  investments: {
    title: "Investments",
    endpoint: "/investments",
    empty: "No investments yet. Add cost basis, quantity, and NAV to track value.",
    columns: [
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "amountInvested", label: "Cost", render: (row: RecordItem) => formatCurrency(row.amountInvested ?? 0, row.currency) }
    ]
  },
  assets: {
    title: "Assets",
    endpoint: "/assets",
    empty: "No assets yet. Cash, gold, property, vehicles, and other assets belong here.",
    columns: [
      { key: "name", label: "Name" },
      { key: "assetType", label: "Type" },
      { key: "value", label: "Value", render: (row: RecordItem) => formatCurrency(row.value ?? 0, row.currency) }
    ]
  }
};

export function RecordsPage({ module }: { module: keyof typeof config }) {
  const page = config[module];
  const { data, error, isLoading } = useQuery({
    queryKey: [module],
    queryFn: () => api<{ data: RecordItem[] }>(page.endpoint)
  });

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Manage</p>
          <h1>{page.title}</h1>
        </div>
        <div className="filter-bar">
          <input aria-label="Search" placeholder="Search" />
          <select aria-label="Currency filter">
            <option>All currencies</option>
            <option>USD</option>
            <option>AED</option>
            <option>SAR</option>
          </select>
          <button className="primary-button compact">Add</button>
        </div>
      </header>
      {error ? <div className="form-error">Could not load {page.title.toLowerCase()}.</div> : null}
      {isLoading ? <div className="empty-state">Loading {page.title.toLowerCase()}...</div> : null}
      <RecordTable columns={page.columns} rows={data?.data ?? []} emptyLabel={page.empty} />
    </section>
  );
}

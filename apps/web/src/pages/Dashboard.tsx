import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from "recharts";
import { StatCard } from "../components/StatCard";
import { api, formatCurrency } from "../lib/api";

type DashboardResponse = {
  data: {
    baseCurrency: string;
    consolidatedTotalsAvailable: boolean;
    currencyNote: string;
    counts: Record<string, number>;
    latestZakat?: { estimatedZakatDue: string; currency: string } | null;
  };
};

export function Dashboard() {
  const chartColors = ["#0f5f5c", "#f4c95d", "#5b6f95", "#b1465a"];
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardResponse>("/dashboard")
  });
  const dashboard = data?.data;
  const chartData = dashboard
    ? Object.entries(dashboard.counts).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
        </div>
        <div className="filter-bar">
          <select aria-label="Date range" defaultValue="30">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">This year</option>
          </select>
          <select aria-label="Currency" defaultValue={dashboard?.baseCurrency ?? "USD"}>
            <option>{dashboard?.baseCurrency ?? "USD"}</option>
          </select>
        </div>
      </header>
      {error ? <div className="form-error">Dashboard could not load. Check the API connection.</div> : null}
      <div className="stat-grid">
        <StatCard label="Expenses" value={String(dashboard?.counts.expenses ?? 0)} note="Records in scope" />
        <StatCard label="Loans" value={String(dashboard?.counts.loans ?? 0)} tone="warn" note="Receivable and payable" />
        <StatCard label="Investments" value={String(dashboard?.counts.investments ?? 0)} tone="good" note="NAV-aware" />
        <StatCard
          label="Estimated Zakat"
          value={
            dashboard?.latestZakat
              ? formatCurrency(dashboard.latestZakat.estimatedZakatDue, dashboard.latestZakat.currency)
              : "Not calculated"
          }
          tone="neutral"
          note="Estimate only"
        />
      </div>
      <section className="work-surface">
        <div>
          <h2>Record mix</h2>
          <p>{isLoading ? "Loading records..." : dashboard?.currencyNote ?? "Sign in to load your records."}</p>
        </div>
        <div className="chart-box" aria-label="Financial record mix chart">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColors[index % chartColors.length] ?? "#0f5f5c"} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </section>
  );
}

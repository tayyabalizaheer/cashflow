import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Eye,
  Pencil,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { RecordTable } from "../components/recordtable";
import { api, formatCurrency } from "../lib/api";
import { formatAppDate } from "../lib/dateformat";
import { useCloseActionMenu } from "../lib/usecloseactionmenu";

type Currency = {
  code: string;
  name: string;
};

type UserCurrency = {
  id: string;
  currencyCode: string;
  currency: Currency;
};

type Category = {
  id: string;
  name: string;
};

type StockOption = {
  fundName: string;
  category: string | null;
};

type ExpenseCurrencyLine = {
  id: string;
  currencyCode: string;
  isMain: boolean;
};

type ExpenseTransactionAmount = {
  id: string;
  amount: string;
  currencyCode: string;
  rateToMain: string;
};

type ExpenseTransaction = {
  id: string;
  mainAmount: string;
  transactionDate?: string;
  createdAt?: string;
  updatedAt?: string;
  amounts: ExpenseTransactionAmount[];
};

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
  quantity?: string | null;
  nav?: string | null;
  currentValue?: string | null;
  computedCurrentValue?: string | null;
  currentUnitPrice?: string | null;
  currentPriceSource?: string | null;
  currentPriceDate?: string | null;
  purchaseDate?: string | null;
  latestValuationDate?: string | null;
  notes?: string | null;
  stockFundName?: string | null;
  mainCurrency?: string | null;
  expenseDate?: string;
  acquisitionDate?: string | null;
  valuationDate?: string | null;
  zakatEligible?: boolean;
  zakatPercentage?: string | number | null;
  sourceExpenseId?: string | null;
  sourceCurrency?: string | null;
  category?: Category;
  currencies?: ExpenseCurrencyLine[];
  transactions?: ExpenseTransaction[];
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type AssetCurrencyValue = {
  id: string;
  currency: string;
  value: string;
};

type AssetDisplayItem = RecordItem & {
  groupKey: string;
  isLinkedAsset: boolean;
  currencyValues: AssetCurrencyValue[];
};

type InvestmentGroupTotal = {
  currencyCode: string;
  cost: number;
  currentValue: number;
};

type InvestmentGroup = {
  key: string;
  title: string;
  type: string;
  latestDate: string;
  transactionCount: number;
  quantityTotal: number | null;
  totals: InvestmentGroupTotal[];
  transactions: RecordItem[];
};

type ExpenseSetupState = {
  name: string;
  categoryId: string;
  mainCurrency: string;
  currencies: string[];
};

type AssetFormState = {
  mode: "manual" | "expense";
  name: string;
  date: string;
  value: string;
  currency: string;
  zakatEligible: boolean;
  expenseId: string;
};

type InvestmentFormState = {
  sourceMode: "stock" | "manual";
  type: string;
  name: string;
  stockFundName: string;
  amountInvested: string;
  currency: string;
  quantity: string;
  nav: string;
  currentValue: string;
  purchaseDate: string;
  zakatEligible: boolean;
  notes: string;
};

const config = {
  expenses: {
    title: "Expenses",
    singular: "expense",
    endpoint: "/expenses",
    empty: "No expenses yet. Add your first expense.",
    columns: [
      {
        key: "name",
        label: "Name",
        render: (row: RecordItem) => row.name ?? row.purpose ?? "",
      },
      {
        key: "amount",
        label: "Total",
        render: (row: RecordItem) =>
          formatCurrency(row.amount ?? 0, row.mainCurrency ?? row.currency),
      },
      {
        key: "currency",
        label: "Currencies",
        render: (row: RecordItem) => expenseCurrencyCodes(row).join(", "),
      },
    ],
  },
  loans: {
    title: "Loans",
    singular: "loan",
    endpoint: "/loans",
    empty: "No loans yet. Receivables and payables will appear here.",
    columns: [
      { key: "person", label: "Person" },
      {
        key: "amount",
        label: "Amount",
        render: (row: RecordItem) =>
          formatCurrency(row.amount ?? 0, row.currency),
      },
      { key: "status", label: "Status" },
    ],
  },
  investments: {
    title: "Investments",
    singular: "investment",
    endpoint: "/investments?pageSize=100",
    empty:
      "No investments yet. Add cost basis, quantity, and NAV to track value.",
    columns: [
      {
        key: "name",
        label: "Name",
        render: (row: RecordItem) => row.name ?? row.stockFundName ?? "",
      },
      { key: "type", label: "Type" },
      {
        key: "amountInvested",
        label: "Cost",
        render: (row: RecordItem) =>
          formatCurrency(row.amountInvested ?? 0, row.currency),
      },
    ],
  },
  assets: {
    title: "Assets",
    singular: "asset",
    endpoint: "/assets",
    empty:
      "No assets yet. Cash, gold, property, vehicles, and other assets belong here.",
    columns: [
      { key: "name", label: "Name" },
      {
        key: "valuationDate",
        label: "Date",
        render: (row: RecordItem) =>
          row.valuationDate || row.acquisitionDate
            ? formatAppDate(row.valuationDate ?? row.acquisitionDate)
            : "-",
      },
      {
        key: "value",
        label: "Amount",
        render: (row: RecordItem) =>
          formatCurrency(row.value ?? 0, row.currency),
      },
      {
        key: "zakatEligible",
        label: "Zakatable",
        render: (row: RecordItem) => (row.zakatEligible ? "Yes" : "No"),
      },
    ],
  },
};

const todayInputValue = () => new Date().toISOString().slice(0, 10);

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : todayInputValue();
}

function timeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function latestRecordTime(record: RecordItem) {
  const transactionTimes =
    record.transactions?.flatMap((transaction) => [
      timeValue(transaction.createdAt),
      timeValue(transaction.updatedAt),
      timeValue(transaction.transactionDate),
    ]) ?? [];
  return Math.max(
    timeValue(record.updatedAt),
    timeValue(record.createdAt),
    timeValue(record.latestValuationDate),
    timeValue(record.purchaseDate),
    timeValue(record.valuationDate),
    timeValue(record.acquisitionDate),
    timeValue(record.expenseDate),
    ...transactionTimes,
  );
}

function compareRecordsByLatestDesc(left: RecordItem, right: RecordItem) {
  return latestRecordTime(right) - latestRecordTime(left);
}

function investmentPurchaseTime(record: RecordItem) {
  return Math.max(timeValue(record.purchaseDate), timeValue(record.createdAt));
}

function compareInvestmentsByPurchaseDateDesc(
  left: RecordItem,
  right: RecordItem,
) {
  return investmentPurchaseTime(right) - investmentPurchaseTime(left);
}

function expenseCurrencyCodes(expense: RecordItem) {
  if (expense.currencies?.length)
    return expense.currencies.map((line) => line.currencyCode);
  return [expense.mainCurrency ?? expense.currency];
}

function expenseCurrencySummary(expense: RecordItem) {
  return expenseCurrencyCodes(expense).map((currencyCode) => {
    const lines =
      expense.transactions?.flatMap((transaction) =>
        transaction.amounts.filter(
          (amount) => amount.currencyCode === currencyCode,
        ),
      ) ?? [];
    const total = lines.reduce((sum, line) => sum + Number(line.amount), 0);
    const rates = lines
      .map((line) => Number(line.rateToMain))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    const average = rates.length
      ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
      : 0;
    const high = rates.length ? Math.max(...rates) : 0;
    const low = rates.length ? Math.min(...rates) : 0;
    return { currencyCode, total, average, high, low };
  });
}

function formatNumber(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatAmountWithCode(value: number | string, currencyCode: string) {
  return `${formatNumber(value)} ${currencyCode}`;
}

function expenseAmountSummaries(expense: RecordItem) {
  const summaries = expenseCurrencySummary(expense).filter(
    (summary) => summary.total > 0,
  );
  if (summaries.length > 0) return summaries;
  return [
    {
      currencyCode: expense.mainCurrency ?? expense.currency,
      total: Number(expense.amount ?? 0),
      average: 0,
      high: 0,
      low: 0,
    },
  ];
}

function expenseAmountText(expense: RecordItem) {
  return expenseAmountSummaries(expense)
    .map((summary) => formatAmountWithCode(summary.total, summary.currencyCode))
    .join(", ");
}

function assetDisplayRows(assets: RecordItem[]) {
  const grouped = new Map<string, AssetDisplayItem>();
  assets.forEach((asset) => {
    const isLinkedAsset = Boolean(asset.sourceExpenseId);
    const groupKey = isLinkedAsset
      ? `expense:${asset.sourceExpenseId}`
      : asset.id;
    const amountLine = {
      id: asset.id,
      currency: asset.sourceCurrency ?? asset.currency,
      value: String(asset.value ?? 0),
    };
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.currencyValues.push(amountLine);
      return;
    }
    grouped.set(groupKey, {
      ...asset,
      groupKey,
      isLinkedAsset,
      currency: amountLine.currency,
      value: amountLine.value,
      currencyValues: [amountLine],
    });
  });

  return [...grouped.values()].map((asset) => ({
    ...asset,
    currencyValues: asset.currencyValues.sort((left, right) =>
      left.currency.localeCompare(right.currency),
    ),
  }));
}

function assetGroupCurrencyTotals(assets: AssetDisplayItem[]) {
  const totals = new Map<string, number>();
  assets.forEach((asset) => {
    asset.currencyValues.forEach((line) => {
      totals.set(
        line.currency,
        (totals.get(line.currency) ?? 0) + Number(line.value),
      );
    });
  });
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, total]) => ({ currencyCode, total }));
}

function assetDate(asset: RecordItem) {
  const date = asset.valuationDate ?? asset.acquisitionDate;
  return date ? formatAppDate(date, "") : "";
}

function investmentTitle(investment: RecordItem) {
  return investment.name ?? investment.stockFundName ?? "Investment";
}

function investmentInitialValue(investment: RecordItem) {
  return investment.currentValue || investment.amountInvested || "0";
}

function investmentCurrentValue(investment: RecordItem) {
  return investment.computedCurrentValue || investmentInitialValue(investment);
}

function investmentDate(investment: RecordItem) {
  const date = investment.latestValuationDate ?? investment.purchaseDate;
  return date ? formatAppDate(date, "") : "";
}

function investmentGroupKey(investment: RecordItem) {
  const type = investment.type?.trim() || "Investment";
  const name = investmentTitle(investment).trim();
  return `${type.toLowerCase()}:${name.toLowerCase()}`;
}

function investmentGroups(investments: RecordItem[]) {
  const grouped = new Map<string, RecordItem[]>();

  investments.forEach((investment) => {
    const key = investmentGroupKey(investment);
    grouped.set(key, [...(grouped.get(key) ?? []), investment]);
  });

  return [...grouped.entries()]
    .map(([key, transactions]): InvestmentGroup => {
      const orderedTransactions = [...transactions].sort(
        compareInvestmentsByPurchaseDateDesc,
      );
      const first = orderedTransactions[0]!;
      const totalsByCurrency = new Map<string, InvestmentGroupTotal>();
      let quantityTotal = 0;
      let hasQuantity = false;

      orderedTransactions.forEach((transaction) => {
        const currencyCode = transaction.currency;
        const currentTotal = totalsByCurrency.get(currencyCode) ?? {
          currencyCode,
          cost: 0,
          currentValue: 0,
        };
        currentTotal.cost += Number(transaction.amountInvested ?? 0);
        currentTotal.currentValue += Number(investmentCurrentValue(transaction));
        totalsByCurrency.set(currencyCode, currentTotal);

        const quantity = Number(transaction.quantity);
        if (Number.isFinite(quantity)) {
          quantityTotal += quantity;
          hasQuantity = true;
        }
      });

      return {
        key,
        title: investmentTitle(first),
        type: first.type ?? "Investment",
        latestDate: investmentDate(first),
        transactionCount: orderedTransactions.length,
        quantityTotal: hasQuantity ? quantityTotal : null,
        totals: [...totalsByCurrency.values()].sort((left, right) =>
          left.currencyCode.localeCompare(right.currencyCode),
        ),
        transactions: orderedTransactions,
      };
    })
    .sort(
      (left, right) =>
        investmentPurchaseTime(right.transactions[0]!) -
        investmentPurchaseTime(left.transactions[0]!),
    );
}

function detailDate(value?: string | null) {
  return formatAppDate(value);
}

function AssetList({
  assets,
  emptyLabel,
  openActionMenu,
  onToggleActions,
  onShowDetails,
  onEdit,
  onRequestDelete,
}: {
  assets: AssetDisplayItem[];
  emptyLabel: string;
  openActionMenu: string | null;
  onToggleActions: (id: string) => void;
  onShowDetails: (asset: AssetDisplayItem) => void;
  onEdit: (asset: AssetDisplayItem) => void;
  onRequestDelete: (asset: AssetDisplayItem) => void;
}) {
  if (assets.length === 0) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="asset-list">
      {assets.map((asset) => (
        <article className="asset-card" key={asset.groupKey}>
          <div className="asset-card-main">
            <div className="asset-title-block">
              <strong>{asset.name ?? "Asset"}</strong>
              <span>
                {asset.assetType ?? "Asset"}
                {assetDate(asset) ? ` | ${assetDate(asset)}` : ""}
              </span>
            </div>
            <div className="asset-value-grid">
              {asset.currencyValues.map((line) => (
                <div className="asset-value-cell" key={line.id}>
                  <span>{line.currency}</span>
                  <strong>
                    {formatAmountWithCode(line.value, line.currency)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
          <div className="row-menu-wrap">
            <button
              className="icon-button"
              type="button"
              title="Actions"
              onClick={() => onToggleActions(asset.groupKey)}
            >
              <MoreVertical size={16} />
            </button>
            {openActionMenu === asset.groupKey ? (
              <div className="action-menu">
                <button type="button" onClick={() => onShowDetails(asset)}>
                  <Eye size={15} />
                  Details
                </button>
                <button type="button" onClick={() => onEdit(asset)}>
                  <Pencil size={15} />
                  Edit
                </button>
                <button type="button" onClick={() => onRequestDelete(asset)}>
                  <Trash2 size={15} />
                  Move to trash
                </button>
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function InvestmentList({
  investments,
  emptyLabel,
  onShowDetails,
}: {
  investments: RecordItem[];
  emptyLabel: string;
  onShowDetails: (investment: RecordItem) => void;
}) {
  if (investments.length === 0) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  const groups = investmentGroups(investments);

  return (
    <div className="investment-list investment-group-list">
      {groups.map((group) => (
        <article
          className="investment-card investment-group-card"
          key={group.key}
        >
          <div className="investment-group-summary">
            <div className="asset-title-block">
              <strong>{group.title}</strong>
              <span>
                {group.type}
                {group.latestDate ? ` | ${group.latestDate}` : ""}
              </span>
            </div>
            <div className="investment-value-grid">
              <div className="asset-value-cell">
                <span>Total cost</span>
                {group.totals.map((total) => (
                  <strong key={total.currencyCode}>
                    {formatAmountWithCode(total.cost, total.currencyCode)}
                  </strong>
                ))}
              </div>
              <div className="asset-value-cell">
                <span>Current value</span>
                {group.totals.map((total) => (
                  <strong key={total.currencyCode}>
                    {formatAmountWithCode(
                      total.currentValue,
                      total.currencyCode,
                    )}
                  </strong>
                ))}
              </div>
              <div className="asset-value-cell">
                <span>No. of units</span>
                <strong>
                  {group.quantityTotal != null
                    ? formatNumber(group.quantityTotal)
                    : "-"}
                </strong>
              </div>
              <div className="asset-value-cell">
                <span>Transactions</span>
                <strong>{group.transactionCount}</strong>
              </div>
            </div>
          </div>
          <div className="investment-transaction-section">
            <div className="investment-transaction-divider">
              <span>Transactions</span>
            </div>
            <div className="investment-transaction-list">
              {group.transactions.map((transaction) => (
                <button
                  className="investment-transaction-row"
                  type="button"
                  key={transaction.id}
                  onClick={() => onShowDetails(transaction)}
                >
                  <span>{investmentTitle(transaction)}</span>
                  <strong>
                    {formatAmountWithCode(
                      transaction.amountInvested ?? "0",
                      transaction.currency,
                    )}
                  </strong>
                </button>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function RecordHeader({
  title,
  onAdd,
  onFilter,
  addTitle = "Add",
  showActions = true,
}: {
  title: string;
  onAdd?: () => void;
  onFilter?: () => void;
  addTitle?: string;
  showActions?: boolean;
}) {
  return (
    <header className="page-header records-header">
      <div className="records-title-block">
        <p className="eyebrow">Manage</p>
        <h1>{title}</h1>
      </div>
      {showActions ? (
        <div className="header-icon-actions">
          <button
            className="icon-button"
            type="button"
            title="Filter"
            onClick={onFilter}
          >
            <SlidersHorizontal size={17} />
          </button>
          <button
            className="icon-button primary-icon"
            type="button"
            title={addTitle}
            onClick={onAdd}
          >
            <Plus size={18} />
          </button>
        </div>
      ) : null}
    </header>
  );
}

function SearchRow() {
  return (
    <div className="record-filters search-only">
      <label className="search-box">
        <Search size={16} />
        <input aria-label="Search" placeholder="Search" />
      </label>
    </div>
  );
}

function FilterPanel({
  currencies,
  onApply,
}: {
  currencies?: string[];
  onApply: () => void;
}) {
  return (
    <div className="filter-panel">
      <select aria-label="Currency filter">
        <option>All currencies</option>
        {currencies?.map((currencyCode) => (
          <option key={currencyCode}>{currencyCode}</option>
        ))}
      </select>
      <button
        className="primary-button compact"
        type="button"
        onClick={onApply}
      >
        Apply
      </button>
    </div>
  );
}

export function RecordsPage({ module }: { module: keyof typeof config }) {
  const queryClient = useQueryClient();
  const page = config[module];
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showInvestmentForm, setShowInvestmentForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  useCloseActionMenu(Boolean(openActionMenu), () => setOpenActionMenu(null));
  const [confirmExpense, setConfirmExpense] = useState<RecordItem | null>(null);
  const [confirmAsset, setConfirmAsset] = useState<AssetDisplayItem | null>(
    null,
  );
  const [assetDetail, setAssetDetail] = useState<AssetDisplayItem | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetDisplayItem | null>(
    null,
  );
  const [confirmInvestment, setConfirmInvestment] = useState<RecordItem | null>(
    null,
  );
  const [investmentDetail, setInvestmentDetail] = useState<RecordItem | null>(
    null,
  );
  const [editingInvestment, setEditingInvestment] = useState<RecordItem | null>(
    null,
  );
  const [undoExpense, setUndoExpense] = useState<RecordItem | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expenseSetup, setExpenseSetup] = useState<ExpenseSetupState>({
    name: "",
    categoryId: "",
    mainCurrency: "",
    currencies: [],
  });
  const [assetForm, setAssetForm] = useState<AssetFormState>({
    mode: "manual",
    name: "",
    date: todayInputValue(),
    value: "",
    currency: "",
    zakatEligible: false,
    expenseId: "",
  });
  const [investmentForm, setInvestmentForm] = useState<InvestmentFormState>({
    sourceMode: "stock",
    type: "",
    name: "",
    stockFundName: "",
    amountInvested: "",
    currency: "",
    quantity: "",
    nav: "",
    currentValue: "",
    purchaseDate: todayInputValue(),
    zakatEligible: false,
    notes: "",
  });
  const { data, error, isLoading } = useQuery({
    queryKey: [module],
    queryFn: () => api<{ data: RecordItem[] }>(page.endpoint),
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<{ data: Category[] }>("/categories"),
    enabled: module === "expenses",
  });
  const { data: userCurrenciesData } = useQuery({
    queryKey: ["user-currencies"],
    queryFn: () => api<{ data: UserCurrency[] }>("/user-currencies"),
    enabled:
      module === "expenses" || module === "assets" || module === "investments",
  });
  const {
    data: assetExpenseData,
    error: assetExpenseError,
    isLoading: isLoadingAssetExpenses,
  } = useQuery({
    queryKey: ["expenses", "asset-import"],
    queryFn: () => api<{ data: RecordItem[] }>("/expenses?pageSize=100"),
    enabled: module === "assets",
  });
  const {
    data: stockOptionsData,
    error: stockOptionsError,
    isLoading: isLoadingStockOptions,
  } = useQuery({
    queryKey: ["stock-options"],
    queryFn: () =>
      api<{ data: StockOption[] }>("/stocks/options", { onlineOnly: true }),
    enabled: module === "investments" && showInvestmentForm,
  });
  const createExpense = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<{ data: RecordItem }>("/expenses", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setShowExpenseForm(false);
      setExpenseSetup((current) => ({ ...current, name: "" }));
    },
  });
  const createAsset = useMutation({
    mutationFn: async (
      payload: Record<string, unknown> | Record<string, unknown>[],
    ) => {
      const payloads = Array.isArray(payload) ? payload : [payload];
      const results = await Promise.all(
        payloads.map((item) =>
          api<{ data: RecordItem }>("/assets", {
            method: "POST",
            body: JSON.stringify(item),
          }),
        ),
      );
      return results[0] ?? { data: {} as RecordItem };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowAssetForm(false);
      setAssetForm((current) => ({
        ...current,
        name: "",
        date: todayInputValue(),
        value: "",
        expenseId: "",
        zakatEligible: false,
      }));
    },
  });
  const updateAsset = useMutation({
    mutationFn: ({
      assetId,
      payload,
    }: {
      assetId: string;
      payload: Record<string, unknown>;
    }) =>
      api<{ data: RecordItem }>(`/assets/${assetId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowAssetForm(false);
      setEditingAsset(null);
    },
  });
  const createInvestment = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<{ data: RecordItem }>("/investments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowInvestmentForm(false);
      setInvestmentForm((current) => ({
        ...current,
        sourceMode: "stock",
        type: "",
        name: "",
        stockFundName: "",
        amountInvested: "",
        quantity: "",
        nav: "",
        currentValue: "",
        purchaseDate: todayInputValue(),
        zakatEligible: false,
        notes: "",
      }));
    },
  });
  const updateInvestment = useMutation({
    mutationFn: ({
      investmentId,
      payload,
    }: {
      investmentId: string;
      payload: Record<string, unknown>;
    }) =>
      api<{ data: RecordItem }>(`/investments/${investmentId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowInvestmentForm(false);
      setEditingInvestment(null);
    },
  });
  const deleteExpense = useMutation({
    mutationFn: (expenseId: string) =>
      api<void>(`/expenses/${expenseId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });
  const deleteAsset = useMutation({
    mutationFn: (assetId: string) =>
      api<void>(`/assets/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmAsset(null);
      setOpenActionMenu(null);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });
  const deleteInvestment = useMutation({
    mutationFn: (investmentId: string) =>
      api<void>(`/investments/${investmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmInvestment(null);
      setOpenActionMenu(null);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["investments"] });
    },
  });

  const rows = [...(data?.data ?? [])].sort(
    module === "investments"
      ? compareInvestmentsByPurchaseDateDesc
      : compareRecordsByLatestDesc,
  );
  const categories = categoriesData?.data ?? [];
  const userCurrencies = userCurrenciesData?.data ?? [];
  const assetExpenses = assetExpenseData?.data ?? [];
  const stockOptions = stockOptionsData?.data ?? [];

  useEffect(() => {
    if (!expenseSetup.categoryId && categories.length > 0) {
      setExpenseSetup((current) => ({
        ...current,
        categoryId: categories[0]!.id,
      }));
    }
  }, [categories, expenseSetup.categoryId]);

  useEffect(() => {
    if (expenseSetup.currencies.length === 0 && userCurrencies.length > 0) {
      const code = userCurrencies[0]!.currencyCode;
      setExpenseSetup((current) => ({
        ...current,
        currencies: [code],
        mainCurrency: code,
      }));
    }
  }, [expenseSetup.currencies.length, userCurrencies]);

  useEffect(() => {
    if (
      module === "assets" &&
      !assetForm.currency &&
      userCurrencies.length > 0
    ) {
      setAssetForm((current) => ({
        ...current,
        currency: userCurrencies[0]!.currencyCode,
      }));
    }
  }, [assetForm.currency, module, userCurrencies]);

  useEffect(() => {
    if (
      module === "investments" &&
      !investmentForm.currency &&
      userCurrencies.length > 0
    ) {
      setInvestmentForm((current) => ({
        ...current,
        currency: userCurrencies[0]!.currencyCode,
      }));
    }
  }, [investmentForm.currency, module, userCurrencies]);

  useEffect(() => {
    if (
      module === "assets" &&
      assetForm.mode === "expense" &&
      !assetForm.expenseId &&
      assetExpenses.length > 0
    ) {
      setAssetForm((current) => ({
        ...current,
        expenseId: assetExpenses[0]!.id,
      }));
    }
  }, [assetExpenses, assetForm.expenseId, assetForm.mode, module]);

  function updateExpenseSetup<K extends keyof ExpenseSetupState>(
    key: K,
    value: ExpenseSetupState[K],
  ) {
    setExpenseSetup((current) => ({ ...current, [key]: value }));
  }

  function updateAssetForm<K extends keyof AssetFormState>(
    key: K,
    value: AssetFormState[K],
  ) {
    setAssetForm((current) => ({ ...current, [key]: value }));
  }

  function updateInvestmentForm<K extends keyof InvestmentFormState>(
    key: K,
    value: InvestmentFormState[K],
  ) {
    setInvestmentForm((current) => ({ ...current, [key]: value }));
  }

  function setInvestmentSourceMode(mode: InvestmentFormState["sourceMode"]) {
    setInvestmentForm((current) => ({
      ...current,
      sourceMode: mode,
      stockFundName: mode === "stock" ? current.stockFundName : "",
      type:
        mode === "stock"
          ? "Stock"
          : current.type === "Stock"
            ? ""
            : current.type,
      name: mode === "stock" ? current.stockFundName || current.name : "",
    }));
  }

  function chooseInvestmentStock(fundName: string) {
    setInvestmentForm((current) => ({
      ...current,
      sourceMode: "stock",
      type: "Stock",
      name: fundName,
      stockFundName: fundName,
    }));
  }

  function toggleSetupCurrency(currencyCode: string) {
    setExpenseSetup((current) => {
      const currencies = current.currencies.includes(currencyCode)
        ? current.currencies.filter((code) => code !== currencyCode)
        : [...current.currencies, currencyCode];
      return {
        ...current,
        currencies,
        mainCurrency: currencies.includes(current.mainCurrency)
          ? current.mainCurrency
          : (currencies[0] ?? ""),
      };
    });
  }

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createExpense.mutate({
      name: expenseSetup.name,
      categoryId: expenseSetup.categoryId,
      mainCurrency: expenseSetup.mainCurrency,
      currencies: expenseSetup.currencies,
    });
  }

  function submitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingAsset) {
      updateAsset.mutate({
        assetId: editingAsset.id,
        payload: {
          name: assetForm.name,
          assetType: editingAsset.assetType ?? "Other",
          value: assetForm.value,
          currency: assetForm.currency,
          ...(editingAsset.sourceExpenseId
            ? {
                sourceExpenseId: editingAsset.sourceExpenseId,
                sourceCurrency: assetForm.currency,
              }
            : {}),
          acquisitionDate: assetForm.date,
          valuationDate: assetForm.date,
          zakatEligible: assetForm.zakatEligible,
          zakatPercentage: editingAsset.zakatPercentage ?? 100,
          notes: editingAsset.notes ?? undefined,
        },
      });
      return;
    }

    if (assetForm.mode === "expense") {
      const expense = assetExpenses.find(
        (item) => item.id === assetForm.expenseId,
      );
      if (!expense) return;
      const date = expense.expenseDate?.slice(0, 10) ?? todayInputValue();
      const expenseName = expense.name ?? expense.purpose ?? "Imported expense";
      createAsset.mutate(
        expenseAmountSummaries(expense).map((summary) => ({
          name: expenseName,
          assetType: "Expense import",
          value: summary.total.toFixed(4),
          currency: summary.currencyCode,
          sourceExpenseId: expense.id,
          sourceCurrency: summary.currencyCode,
          acquisitionDate: date,
          valuationDate: date,
          zakatEligible: assetForm.zakatEligible,
          zakatPercentage: 100,
          notes: `Imported from expense: ${expenseName}`,
        })),
      );
      return;
    }

    createAsset.mutate({
      name: assetForm.name,
      assetType: "Other",
      value: assetForm.value,
      currency: assetForm.currency,
      acquisitionDate: assetForm.date,
      valuationDate: assetForm.date,
      zakatEligible: assetForm.zakatEligible,
      zakatPercentage: 100,
    });
  }

  function submitInvestment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedStockName =
      investmentForm.sourceMode === "stock"
        ? investmentForm.stockFundName.trim()
        : "";
    const payload = {
      type:
        investmentForm.sourceMode === "stock" ? "Stock" : investmentForm.type,
      name:
        investmentForm.sourceMode === "stock"
          ? selectedStockName
          : investmentForm.name || undefined,
      stockFundName: selectedStockName || null,
      amountInvested: investmentForm.amountInvested,
      currency: investmentForm.currency,
      quantity: investmentForm.quantity || undefined,
      nav: investmentForm.nav || undefined,
      currentValue: investmentForm.currentValue || undefined,
      purchaseDate: investmentForm.purchaseDate || undefined,
      latestValuationDate: investmentForm.purchaseDate || undefined,
      notes: investmentForm.notes || undefined,
      zakatEligible: investmentForm.zakatEligible,
      zakatPercentage: 100,
    };

    if (editingInvestment) {
      updateInvestment.mutate({
        investmentId: editingInvestment.id,
        payload,
      });
      return;
    }

    createInvestment.mutate(payload);
  }

  function confirmDeleteExpense(expense: RecordItem) {
    setOpenActionMenu(null);
    setConfirmExpense(expense);
  }

  function scheduleDeleteExpense(expense: RecordItem) {
    setConfirmExpense(null);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteExpense.mutate(expense.id);
    setUndoExpense(null);
    deleteTimer.current = null;
  }

  function undoDeleteExpense() {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = null;
    setUndoExpense(null);
  }

  function requestDeleteAsset(asset: AssetDisplayItem) {
    setOpenActionMenu(null);
    setConfirmAsset(asset);
  }

  function showAssetDetails(asset: AssetDisplayItem) {
    setOpenActionMenu(null);
    setAssetDetail(asset);
  }

  function startAddAsset() {
    setEditingAsset(null);
    setAssetForm((current) => ({
      ...current,
      mode: "manual",
      name: "",
      date: todayInputValue(),
      value: "",
      expenseId: "",
      zakatEligible: false,
    }));
    setShowAssetForm(true);
  }

  function startEditAsset(asset: AssetDisplayItem) {
    setOpenActionMenu(null);
    setEditingAsset(asset);
    setAssetForm({
      mode: "manual",
      name: asset.name ?? "Asset",
      date: dateInputValue(asset.valuationDate ?? asset.acquisitionDate),
      value: String(asset.value ?? "0"),
      currency: asset.currency,
      zakatEligible: Boolean(asset.zakatEligible),
      expenseId: "",
    });
    setShowAssetForm(true);
  }

  function closeAssetForm() {
    setShowAssetForm(false);
    setEditingAsset(null);
  }

  function removeAssetFromList(asset: AssetDisplayItem) {
    queryClient.setQueryData<{ data: RecordItem[] }>(["assets"], (current) =>
      current
        ? {
            ...current,
            data: current.data.filter((item) =>
              asset.sourceExpenseId
                ? item.sourceExpenseId !== asset.sourceExpenseId
                : item.id !== asset.id,
            ),
          }
        : current,
    );
  }

  function moveAssetToTrash(asset: AssetDisplayItem) {
    setConfirmAsset(null);
    setOpenActionMenu(null);
    removeAssetFromList(asset);
    deleteAsset.mutate(asset.id);
  }

  function showInvestmentDetails(investment: RecordItem) {
    setOpenActionMenu(null);
    setInvestmentDetail(investment);
  }

  function startAddInvestment() {
    setEditingInvestment(null);
    setInvestmentForm((current) => ({
      ...current,
      sourceMode: "stock",
      type: "",
      name: "",
      stockFundName: "",
      amountInvested: "",
      quantity: "",
      nav: "",
      currentValue: "",
      purchaseDate: todayInputValue(),
      zakatEligible: false,
      notes: "",
    }));
    setShowInvestmentForm(true);
  }

  function startEditInvestment(investment: RecordItem) {
    setOpenActionMenu(null);
    setEditingInvestment(investment);
    setInvestmentForm({
      sourceMode: investment.stockFundName ? "stock" : "manual",
      type: investment.type ?? "",
      name: investment.name ?? investment.stockFundName ?? "",
      stockFundName: investment.stockFundName ?? "",
      amountInvested: String(investment.amountInvested ?? ""),
      currency: investment.currency,
      quantity: String(investment.quantity ?? ""),
      nav: String(investment.nav ?? ""),
      currentValue: String(investment.currentValue ?? ""),
      purchaseDate: dateInputValue(
        investment.latestValuationDate ?? investment.purchaseDate,
      ),
      zakatEligible: Boolean(investment.zakatEligible),
      notes: investment.notes ?? "",
    });
    setShowInvestmentForm(true);
  }

  function closeInvestmentForm() {
    setShowInvestmentForm(false);
    setEditingInvestment(null);
  }

  function requestDeleteInvestment(investment: RecordItem) {
    setOpenActionMenu(null);
    setConfirmInvestment(investment);
  }

  function removeInvestmentFromList(investment: RecordItem) {
    queryClient.setQueryData<{ data: RecordItem[] }>(
      ["investments"],
      (current) =>
        current
          ? {
              ...current,
              data: current.data.filter((item) => item.id !== investment.id),
            }
          : current,
    );
  }

  function moveInvestmentToTrash(investment: RecordItem) {
    setConfirmInvestment(null);
    setOpenActionMenu(null);
    removeInvestmentFromList(investment);
    deleteInvestment.mutate(investment.id);
  }

  if (module === "assets") {
    const selectedExpense = assetExpenses.find(
      (item) => item.id === assetForm.expenseId,
    );
    const selectedExpenseAmount = selectedExpense
      ? expenseAmountText(selectedExpense)
      : "";
    const assetRows = assetDisplayRows(rows);
    const assetTotals = assetGroupCurrencyTotals(assetRows);

    return (
      <section className="page">
        <RecordHeader
          title="Assets"
          addTitle="Add asset"
          onAdd={startAddAsset}
          onFilter={() => setShowFilters((value) => !value)}
        />
        <SearchRow />
        {showFilters ? (
          <FilterPanel
            currencies={userCurrencies.map((item) => item.currencyCode)}
            onApply={() => setShowFilters(false)}
          />
        ) : null}
        <section className="expense-card asset-total-strip">
          <div>
            <p className="eyebrow">Totals</p>
            <strong>{assetRows.length} asset(s)</strong>
          </div>
          <div className="asset-total-list">
            {assetTotals.length === 0 ? (
              <span>No asset value yet</span>
            ) : (
              assetTotals.map((summary) => (
                <strong key={summary.currencyCode}>
                  {formatAmountWithCode(summary.total, summary.currencyCode)}
                </strong>
              ))
            )}
          </div>
        </section>
        {showAssetForm ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={editingAsset ? "Edit asset" : "Add asset"}
          >
            <form
              className="modal-panel form-modal asset-entry asset-modal"
              onSubmit={submitAsset}
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow">
                    {editingAsset ? "Edit asset" : "New asset"}
                  </p>
                  <h2>{editingAsset ? "Edit asset" : "Add asset"}</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close"
                  onClick={closeAssetForm}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="modal-form-body">
                {!editingAsset ? (
                  <div
                    className="segmented asset-source-tabs"
                    role="tablist"
                    aria-label="Asset source"
                  >
                    <button
                      className={assetForm.mode === "manual" ? "selected" : ""}
                      type="button"
                      onClick={() => updateAssetForm("mode", "manual")}
                    >
                      Manual
                    </button>
                    <button
                      className={assetForm.mode === "expense" ? "selected" : ""}
                      type="button"
                      onClick={() => updateAssetForm("mode", "expense")}
                    >
                      From expense
                    </button>
                  </div>
                ) : null}
                {assetForm.mode === "manual" ? (
                  <>
                    <label>
                      Name
                      <input
                        value={assetForm.name}
                        onChange={(event) =>
                          updateAssetForm("name", event.target.value)
                        }
                        required
                      />
                    </label>
                    <div className="compact-form">
                      <label>
                        Date
                        <input
                          type="date"
                          value={assetForm.date}
                          onChange={(event) =>
                            updateAssetForm("date", event.target.value)
                          }
                          required
                        />
                      </label>
                      <label>
                        Currency
                        <select
                          value={assetForm.currency}
                          onChange={(event) =>
                            updateAssetForm("currency", event.target.value)
                          }
                          required
                        >
                          <option value="">Choose currency</option>
                          {userCurrencies.map((item) => (
                            <option key={item.id} value={item.currencyCode}>
                              {item.currencyCode}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Amount
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={assetForm.value}
                        onChange={(event) =>
                          updateAssetForm("value", event.target.value)
                        }
                        required
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Expense
                      <select
                        value={assetForm.expenseId}
                        onChange={(event) =>
                          updateAssetForm("expenseId", event.target.value)
                        }
                        required
                      >
                        <option value="">
                          {isLoadingAssetExpenses
                            ? "Loading expenses..."
                            : assetExpenseError
                              ? "Could not load expenses"
                              : "Choose expense"}
                        </option>
                        {assetExpenses.map((expense) => (
                          <option key={expense.id} value={expense.id}>
                            {expense.name ?? expense.purpose} -{" "}
                            {expenseAmountText(expense)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedExpense ? (
                      <div className="asset-import-preview">
                        <span>
                          {selectedExpense.name ?? selectedExpense.purpose}
                        </span>
                        <strong>{selectedExpenseAmount}</strong>
                      </div>
                    ) : assetExpenseError ? (
                      <div className="form-error">
                        Could not load expenses for import.
                      </div>
                    ) : isLoadingAssetExpenses ? (
                      <div className="empty-state">Loading expenses...</div>
                    ) : assetExpenses.length === 0 ? (
                      <div className="empty-state">
                        Add an expense first, then import it as an asset.
                      </div>
                    ) : (
                      <div className="empty-state">No expense selected.</div>
                    )}
                  </>
                )}
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={assetForm.zakatEligible}
                    onChange={(event) =>
                      updateAssetForm("zakatEligible", event.target.checked)
                    }
                  />
                  Is zakatable
                </label>
                {createAsset.error ? (
                  <div className="form-error">{createAsset.error.message}</div>
                ) : null}
                {updateAsset.error ? (
                  <div className="form-error">{updateAsset.error.message}</div>
                ) : null}
              </div>
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeAssetForm}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={
                    createAsset.isPending ||
                    updateAsset.isPending ||
                    (assetForm.mode === "manual" &&
                      (!assetForm.name ||
                        !assetForm.date ||
                        !assetForm.value ||
                        !assetForm.currency)) ||
                    (assetForm.mode === "expense" && !assetForm.expenseId)
                  }
                >
                  {editingAsset ? "Save changes" : "Save asset"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {error ? (
          <div className="form-error">Could not load assets.</div>
        ) : null}
        {isLoading ? (
          <div className="empty-state">Loading assets...</div>
        ) : null}
        <AssetList
          assets={assetRows}
          emptyLabel={page.empty}
          openActionMenu={openActionMenu}
          onToggleActions={(id) =>
            setOpenActionMenu((current) => (current === id ? null : id))
          }
          onShowDetails={showAssetDetails}
          onEdit={startEditAsset}
          onRequestDelete={requestDeleteAsset}
        />
        {assetDetail ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Asset details"
          >
            <section className="modal-panel confirm-panel">
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Asset details</p>
                  <h2>{assetDetail.name ?? "Asset"}</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close"
                  onClick={() => setAssetDetail(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Type</dt>
                  <dd>{assetDetail.assetType ?? "Asset"}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>
                    {detailDate(
                      assetDetail.valuationDate ?? assetDetail.acquisitionDate,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Values</dt>
                  <dd>
                    {assetDetail.currencyValues
                      .map((line) =>
                        formatAmountWithCode(line.value, line.currency),
                      )
                      .join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Zakatable</dt>
                  <dd>{assetDetail.zakatEligible ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{assetDetail.notes || "No notes"}</dd>
                </div>
              </dl>
            </section>
          </div>
        ) : null}
        {confirmAsset ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Move asset to trash"
          >
            <section className="modal-panel confirm-panel">
              <div>
                <p className="eyebrow">Move to trash</p>
                <h2>{confirmAsset.name ?? "Asset"}</h2>
              </div>
              <p>
                This asset will move to trash. Linked expense assets move all
                currency values together.
              </p>
              {deleteAsset.error ? (
                <div className="form-error">{deleteAsset.error.message}</div>
              ) : null}
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setConfirmAsset(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary-button danger-button"
                  type="button"
                  disabled={deleteAsset.isPending}
                  onClick={() => moveAssetToTrash(confirmAsset)}
                >
                  Move to trash
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  if (module === "investments") {
    return (
      <section className="page">
        <RecordHeader
          title="Investments"
          addTitle="Add investment"
          onAdd={startAddInvestment}
          onFilter={() => setShowFilters((value) => !value)}
        />
        <SearchRow />
        {showFilters ? (
          <FilterPanel
            currencies={userCurrencies.map((item) => item.currencyCode)}
            onApply={() => setShowFilters(false)}
          />
        ) : null}
        {showInvestmentForm ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={
              editingInvestment ? "Edit investment" : "Add investment"
            }
          >
            <form
              className="modal-panel form-modal"
              onSubmit={submitInvestment}
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow">
                    {editingInvestment ? "Edit investment" : "New investment"}
                  </p>
                  <h2>
                    {editingInvestment ? "Edit investment" : "Add investment"}
                  </h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close"
                  onClick={closeInvestmentForm}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="modal-form-body">
                <div className="investment-source-picker segmented">
                  <button
                    className={
                      investmentForm.sourceMode === "stock" ? "selected" : ""
                    }
                    type="button"
                    onClick={() => setInvestmentSourceMode("stock")}
                  >
                    Stocks list
                  </button>
                  <button
                    className={
                      investmentForm.sourceMode === "manual" ? "selected" : ""
                    }
                    type="button"
                    onClick={() => setInvestmentSourceMode("manual")}
                  >
                    Manual
                  </button>
                </div>
                <div className="compact-form">
                  {investmentForm.sourceMode === "stock" ? (
                    <label>
                      Stock
                      <select
                        value={investmentForm.stockFundName}
                        onChange={(event) =>
                          chooseInvestmentStock(event.target.value)
                        }
                        required
                      >
                        <option value="">Choose from stocks</option>
                        {stockOptions.map((stock) => (
                          <option key={stock.fundName} value={stock.fundName}>
                            {stock.fundName}
                            {stock.category ? ` - ${stock.category}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <label>
                        Type
                        <input
                          value={investmentForm.type}
                          onChange={(event) =>
                            updateInvestmentForm("type", event.target.value)
                          }
                          placeholder="Fund, gold..."
                          required
                        />
                      </label>
                      <label>
                        Name
                        <input
                          value={investmentForm.name}
                          onChange={(event) =>
                            updateInvestmentForm("name", event.target.value)
                          }
                          required
                        />
                      </label>
                    </>
                  )}
                  {investmentForm.sourceMode === "stock" ? (
                    <div className="stock-link-status">
                      <span>Linked for future calculations</span>
                    </div>
                  ) : null}
                </div>
                {investmentForm.sourceMode === "stock" && stockOptionsError ? (
                  <div className="form-error">Could not load stocks list.</div>
                ) : null}
                {investmentForm.sourceMode === "stock" &&
                isLoadingStockOptions ? (
                  <div className="empty-state">Loading stocks...</div>
                ) : null}
                {investmentForm.sourceMode === "stock" &&
                !isLoadingStockOptions &&
                !stockOptionsError &&
                stockOptions.length === 0 ? (
                  <div className="empty-state">
                    No stocks available. Use Manual to enter this investment.
                  </div>
                ) : null}
                <div className="compact-form">
                  <label>
                    Cost
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={investmentForm.amountInvested}
                      onChange={(event) =>
                        updateInvestmentForm(
                          "amountInvested",
                          event.target.value,
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Currency
                    <select
                      value={investmentForm.currency}
                      onChange={(event) =>
                        updateInvestmentForm("currency", event.target.value)
                      }
                      required
                    >
                      <option value="">Choose currency</option>
                      {userCurrencies.map((item) => (
                        <option key={item.id} value={item.currencyCode}>
                          {item.currencyCode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="compact-form">
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="0"
                      step="0.00000001"
                      value={investmentForm.quantity}
                      onChange={(event) =>
                        updateInvestmentForm("quantity", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    NAV
                    <input
                      type="number"
                      min="0"
                      step="0.00000001"
                      value={investmentForm.nav}
                      onChange={(event) =>
                        updateInvestmentForm("nav", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="compact-form">
                  <label>
                    Initial value
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={investmentForm.currentValue}
                      onChange={(event) =>
                        updateInvestmentForm("currentValue", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      value={investmentForm.purchaseDate}
                      onChange={(event) =>
                        updateInvestmentForm("purchaseDate", event.target.value)
                      }
                    />
                  </label>
                </div>
                <label>
                  Notes
                  <textarea
                    value={investmentForm.notes}
                    onChange={(event) =>
                      updateInvestmentForm("notes", event.target.value)
                    }
                    rows={3}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={investmentForm.zakatEligible}
                    onChange={(event) =>
                      updateInvestmentForm(
                        "zakatEligible",
                        event.target.checked,
                      )
                    }
                  />
                  Is zakatable
                </label>
                {createInvestment.error ? (
                  <div className="form-error">
                    {createInvestment.error.message}
                  </div>
                ) : null}
                {updateInvestment.error ? (
                  <div className="form-error">
                    {updateInvestment.error.message}
                  </div>
                ) : null}
              </div>
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeInvestmentForm}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={
                    createInvestment.isPending ||
                    updateInvestment.isPending ||
                    (investmentForm.sourceMode === "stock"
                      ? !investmentForm.stockFundName
                      : !investmentForm.type.trim() ||
                        !investmentForm.name.trim()) ||
                    !investmentForm.amountInvested ||
                    !investmentForm.currency
                  }
                >
                  {editingInvestment ? "Save changes" : "Save investment"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {error ? (
          <div className="form-error">Could not load investments.</div>
        ) : null}
        {isLoading ? (
          <div className="empty-state">Loading investments...</div>
        ) : null}
        <InvestmentList
          investments={rows}
          emptyLabel={page.empty}
          onShowDetails={showInvestmentDetails}
        />
        {investmentDetail ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Investment details"
          >
            <section className="modal-panel confirm-panel">
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Investment details</p>
                  <h2>{investmentTitle(investmentDetail)}</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close"
                  onClick={() => setInvestmentDetail(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Type</dt>
                  <dd>{investmentDetail.type ?? "Investment"}</dd>
                </div>
                <div>
                  <dt>Stock link</dt>
                  <dd>{investmentDetail.stockFundName ?? "Manual entry"}</dd>
                </div>
                <div>
                  <dt>Total cost</dt>
                  <dd>
                    {formatAmountWithCode(
                      investmentDetail.amountInvested ?? "0",
                      investmentDetail.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Initial value</dt>
                  <dd>
                    {formatAmountWithCode(
                      investmentInitialValue(investmentDetail),
                      investmentDetail.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>No. of units</dt>
                  <dd>
                    {investmentDetail.quantity
                      ? formatNumber(investmentDetail.quantity)
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt>Current value</dt>
                  <dd>
                    {formatAmountWithCode(
                      investmentCurrentValue(investmentDetail),
                      investmentDetail.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Current price</dt>
                  <dd>
                    {investmentDetail.currentUnitPrice
                      ? `${formatNumber(investmentDetail.currentUnitPrice)} (${investmentDetail.currentPriceSource ?? "Price"})`
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt>NAV</dt>
                  <dd>
                    {investmentDetail.nav
                      ? formatNumber(investmentDetail.nav)
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>
                    {detailDate(
                      investmentDetail.latestValuationDate ??
                        investmentDetail.purchaseDate,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Zakatable</dt>
                  <dd>{investmentDetail.zakatEligible ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{investmentDetail.notes || "No notes"}</dd>
                </div>
              </dl>
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    const selectedInvestment = investmentDetail;
                    setInvestmentDetail(null);
                    startEditInvestment(selectedInvestment);
                  }}
                >
                  Edit
                </button>
                <button
                  className="primary-button danger-button"
                  type="button"
                  onClick={() => {
                    const selectedInvestment = investmentDetail;
                    setInvestmentDetail(null);
                    requestDeleteInvestment(selectedInvestment);
                  }}
                >
                  Move to trash
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {confirmInvestment ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Move investment to trash"
          >
            <section className="modal-panel confirm-panel">
              <div>
                <p className="eyebrow">Move to trash</p>
                <h2>{investmentTitle(confirmInvestment)}</h2>
              </div>
              <p>This investment will move to trash immediately.</p>
              {deleteInvestment.error ? (
                <div className="form-error">
                  {deleteInvestment.error.message}
                </div>
              ) : null}
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setConfirmInvestment(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary-button danger-button"
                  type="button"
                  disabled={deleteInvestment.isPending}
                  onClick={() => moveInvestmentToTrash(confirmInvestment)}
                >
                  Move to trash
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  if (module !== "expenses") {
    return (
      <section className="page">
        <RecordHeader
          title={page.title}
          addTitle={`Add ${page.singular}`}
          onFilter={() => setShowFilters((value) => !value)}
        />
        <SearchRow />
        {showFilters ? (
          <FilterPanel onApply={() => setShowFilters(false)} />
        ) : null}
        {error ? (
          <div className="form-error">
            Could not load {page.title.toLowerCase()}.
          </div>
        ) : null}
        {isLoading ? (
          <div className="empty-state">
            Loading {page.title.toLowerCase()}...
          </div>
        ) : null}
        <RecordTable
          columns={page.columns}
          rows={rows}
          emptyLabel={page.empty}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <RecordHeader
        title="Expenses"
        addTitle="Add expense"
        onAdd={() => setShowExpenseForm(true)}
        onFilter={() => setShowFilters((value) => !value)}
      />
      <SearchRow />
      {showFilters ? (
        <FilterPanel
          currencies={userCurrencies.map((item) => item.currencyCode)}
          onApply={() => setShowFilters(false)}
        />
      ) : null}
      {showExpenseForm ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Add expense"
        >
          <form
            className="modal-panel form-modal expense-entry"
            onSubmit={submitExpense}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">New expense</p>
                <h2>Expense setup</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setShowExpenseForm(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-form-body">
              <label>
                Name
                <input
                  value={expenseSetup.name}
                  onChange={(event) =>
                    updateExpenseSetup("name", event.target.value)
                  }
                  required
                />
              </label>
              <div className="compact-form">
                <label>
                  Category
                  <select
                    value={expenseSetup.categoryId}
                    onChange={(event) =>
                      updateExpenseSetup("categoryId", event.target.value)
                    }
                    required
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Main currency
                  <select
                    value={expenseSetup.mainCurrency}
                    onChange={(event) =>
                      updateExpenseSetup("mainCurrency", event.target.value)
                    }
                    required
                  >
                    {expenseSetup.currencies.map((currencyCode) => (
                      <option key={currencyCode} value={currencyCode}>
                        {currencyCode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {userCurrencies.length > 0 ? (
                <div className="currency-picker">
                  {userCurrencies.map((item) => (
                    <label className="currency-check" key={item.id}>
                      <input
                        type="checkbox"
                        checked={expenseSetup.currencies.includes(
                          item.currencyCode,
                        )}
                        onChange={() => toggleSetupCurrency(item.currencyCode)}
                      />
                      <span>{item.currencyCode}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  Add currencies in Settings before creating an expense.
                </div>
              )}
              {createExpense.error ? (
                <div className="form-error">{createExpense.error.message}</div>
              ) : null}
            </div>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowExpenseForm(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  createExpense.isPending ||
                  !expenseSetup.name ||
                  !expenseSetup.categoryId ||
                  !expenseSetup.mainCurrency ||
                  expenseSetup.currencies.length === 0
                }
              >
                Save expense
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {error ? (
        <div className="form-error">Could not load expenses.</div>
      ) : null}
      {isLoading ? (
        <div className="empty-state">Loading expenses...</div>
      ) : null}
      {rows.length === 0 && !isLoading ? (
        <div className="empty-state">{page.empty}</div>
      ) : null}
      <div className="expense-list">
        {rows.map((expense) => (
          <article
            className="expense-card expense-card-row expense-list-card"
            key={expense.id}
          >
            <Link
              className="expense-card-header expense-list-header"
              to={`/expenses/${expense.id}`}
            >
              <div>
                <strong>{expense.name ?? expense.purpose}</strong>
              </div>
              <div className="expense-summary-row">
                {expenseCurrencySummary(expense).map((summary) => (
                  <div
                    className="expense-summary-cell"
                    key={summary.currencyCode}
                  >
                    <span>{summary.currencyCode}</span>
                    <strong>
                      {formatCurrency(summary.total, summary.currencyCode)}
                    </strong>
                  </div>
                ))}
              </div>
            </Link>
            <div className="row-menu-wrap">
              <button
                className="icon-button expense-delete-button"
                type="button"
                title="Actions"
                onClick={() =>
                  setOpenActionMenu((current) =>
                    current === expense.id ? null : expense.id,
                  )
                }
              >
                <MoreVertical size={16} />
              </button>
              {openActionMenu === expense.id ? (
                <div className="action-menu">
                  <button
                    type="button"
                    onClick={() => confirmDeleteExpense(expense)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {confirmExpense ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Delete expense"
        >
          <section className="modal-panel confirm-panel">
            <div>
              <p className="eyebrow">Move to trash</p>
              <h2>{confirmExpense.name ?? confirmExpense.purpose}</h2>
            </div>
            <p>This expense will move to trash immediately.</p>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirmExpense(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                onClick={() => scheduleDeleteExpense(confirmExpense)}
              >
                Move to trash
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {undoExpense ? (
        <div className="undo-toast">
          <span>Deleting {undoExpense.name ?? undoExpense.purpose}</span>
          <button type="button" onClick={undoDeleteExpense}>
            Undo
          </button>
        </div>
      ) : null}
    </section>
  );
}

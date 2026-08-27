import type { KeyboardEvent, MouseEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Minus,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { formatAppDate, formatAppDateTime } from "../lib/dateformat";

type StockTrend = {
  direction: "up" | "down" | "flat" | null;
  basis: "repurchasePrice" | "navPrice" | "offerPrice" | null;
  latestValue: string | null;
  previousValue: string | null;
  previousValidityDate: string | null;
  change: string | null;
  changePercent: string | null;
};

type Stock = {
  id: string;
  fundName: string;
  category: string | null;
  launchDate: string | null;
  validityDate: string;
  repurchasePrice: string | null;
  offerPrice: string | null;
  navPrice: string | null;
  managementFee: string | null;
  trusteeFee: string | null;
  regulatoryFee: string | null;
  leviesAndTaxes: string | null;
  transactionExpenses: string | null;
  thirdPartyExpenses: string | null;
  otherExpenses: string | null;
  terWithLevies: string | null;
  terWithoutLevies: string | null;
  mtdReturn: string | null;
  fytdReturn: string | null;
  cytdReturn: string | null;
  fy25Return: string | null;
  fy24Return: string | null;
  sinceInceptionReturn: string | null;
  sourceUrl: string;
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
  isAverage?: boolean;
  isFavorite?: boolean;
  recordCount?: number;
  trend?: StockTrend | null;
};

type StockOption = {
  fundName: string;
  category: string | null;
};

const visibleColumns = [
  { key: "repurchasePrice", label: "Repurchase" },
  { key: "offerPrice", label: "Offer" },
  { key: "navPrice", label: "NAV" },
  { key: "mtdReturn", label: "MTD Return" },
  { key: "fytdReturn", label: "FYTD Return" },
  { key: "cytdReturn", label: "CYTD Return" },
  { key: "fy25Return", label: "FY25 (%) Return" },
  { key: "fy24Return", label: "FY24 (%) Return" },
] as const;

const detailRows = [
  { key: "fundName", label: "Stock" },
  { key: "category", label: "Category" },
  { key: "recordCount", label: "Records averaged" },
  { key: "launchDate", label: "Launch date", kind: "date" },
  { key: "validityDate", label: "Validity date", kind: "date" },
  { key: "repurchasePrice", label: "Repurchase" },
  { key: "offerPrice", label: "Offer" },
  { key: "navPrice", label: "NAV" },
  { key: "managementFee", label: "Management fee" },
  { key: "trusteeFee", label: "Trustee fee" },
  { key: "regulatoryFee", label: "Regulatory fee" },
  { key: "leviesAndTaxes", label: "Levies and taxes" },
  { key: "transactionExpenses", label: "Transaction expenses" },
  { key: "thirdPartyExpenses", label: "Third party expenses" },
  { key: "otherExpenses", label: "Other expenses" },
  { key: "terWithLevies", label: "TER with levies" },
  { key: "terWithoutLevies", label: "TER without levies" },
  { key: "mtdReturn", label: "MTD Return" },
  { key: "fytdReturn", label: "FYTD Return" },
  { key: "cytdReturn", label: "CYTD Return" },
  { key: "fy25Return", label: "FY25 (%) Return" },
  { key: "fy24Return", label: "FY24 (%) Return" },
  { key: "sinceInceptionReturn", label: "Since inception return" },
  { key: "scrapedAt", label: "Scraped at", kind: "datetime" },
  { key: "updatedAt", label: "Updated at", kind: "datetime" },
  { key: "sourceUrl", label: "Source" },
] as const;

const trendBasisLabels: Record<NonNullable<StockTrend["basis"]>, string> = {
  repurchasePrice: "Repurchase",
  navPrice: "NAV",
  offerPrice: "Offer",
};

function formatDate(value: string | number | null | undefined) {
  return formatAppDate(value);
}

function formatDateTime(value: string | number | null | undefined) {
  return formatAppDateTime(value);
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (!value) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function detailValue(stock: Stock, row: (typeof detailRows)[number]) {
  const value = stock[row.key];
  const kind = "kind" in row ? row.kind : undefined;
  if (kind === "date") return formatDate(value);
  if (kind === "datetime") return formatDateTime(value);
  if (row.key === "sourceUrl" && typeof value === "string") {
    return (
      <a className="inline-link" href={value} target="_blank" rel="noreferrer">
        Open source
      </a>
    );
  }
  return formatValue(value);
}

function trendLabel(stock: Stock) {
  const trend = stock.trend;
  if (!trend?.direction || !trend.basis) return "No previous record";
  const basis = trendBasisLabels[trend.basis];
  if (trend.direction === "flat")
    return `${basis} unchanged from previous record`;
  const direction = trend.direction === "up" ? "up" : "down";
  const change = trend.change ? formatValue(trend.change) : "-";
  const percent = trend.changePercent ? ` (${trend.changePercent}%)` : "";
  const previousDate = trend.previousValidityDate
    ? ` since ${formatDate(trend.previousValidityDate)}`
    : "";
  return `${basis} ${direction} ${change}${percent}${previousDate}`;
}

function StockTrendIcon({ stock }: { stock: Stock }) {
  const direction = stock.trend?.direction ?? null;
  const Icon =
    direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;

  return (
    <span
      className={`stock-trend ${direction ?? "none"}`}
      title={trendLabel(stock)}
      aria-label={trendLabel(stock)}
    >
      <Icon size={15} strokeWidth={3} />
    </span>
  );
}

export function StocksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");
  const [appliedStockNames, setAppliedStockNames] = useState<string[]>([]);
  const [appliedAverageByStock, setAppliedAverageByStock] = useState(false);
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [draftStockNames, setDraftStockNames] = useState<string[]>([]);
  const [draftAverageByStock, setDraftAverageByStock] = useState(false);
  const [stockDropdownOpen, setStockDropdownOpen] = useState(false);
  const [stockOptionSearch, setStockOptionSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const stockPath = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());
    if (appliedFromDate) params.set("from", appliedFromDate);
    if (appliedToDate) params.set("to", appliedToDate);
    if (appliedStockNames.length > 0)
      params.set("stockNames", appliedStockNames.join(","));
    if (appliedAverageByStock) params.set("average", "true");
    return `/stocks?${params.toString()}`;
  }, [
    appliedAverageByStock,
    appliedFromDate,
    appliedStockNames,
    appliedToDate,
    page,
    pageSize,
    search,
  ]);

  const query = useQuery({
    queryKey: ["stocks", stockPath],
    queryFn: () =>
      api<{
        data: Stock[];
        meta: {
          page: number;
          pageSize: number;
          total: number;
          average?: boolean;
          latestValidityDate?: string | null;
        };
      }>(stockPath, { onlineOnly: true }),
  });
  const optionsQuery = useQuery({
    queryKey: ["stock-options"],
    queryFn: () =>
      api<{ data: StockOption[] }>("/stocks/options", { onlineOnly: true }),
  });
  const favoriteMutation = useMutation({
    mutationFn: (input: { fundName: string; favorite: boolean }) =>
      api<{ data: { fundName: string; isFavorite: boolean } }>(
        "/stocks/favorites",
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
      ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["stocks"] });
      const previous = queryClient.getQueriesData<{ data: Stock[] }>({
        queryKey: ["stocks"],
      });
      queryClient.setQueriesData<{ data: Stock[] }>(
        { queryKey: ["stocks"] },
        (old) =>
          old
            ? {
                ...old,
                data: old.data.map((stock) =>
                  stock.fundName === input.fundName
                    ? { ...stock, isFavorite: input.favorite }
                    : stock,
                ),
              }
            : old,
      );
      setSelectedStock((current) =>
        current?.fundName === input.fundName
          ? { ...current, isFavorite: input.favorite }
          : current,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      context?.previous.forEach(([queryKey, data]) =>
        queryClient.setQueryData(queryKey, data),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["stocks"] });
    },
  });

  const stocks = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const latestValidityDate = query.data?.meta.latestValidityDate;
  const stockOptions = optionsQuery.data?.data ?? [];
  const filteredStockOptions = useMemo(() => {
    const needle = stockOptionSearch.trim().toLowerCase();
    if (!needle) return stockOptions;
    return stockOptions.filter((option) =>
      [option.fundName, option.category].some((value) =>
        value?.toLowerCase().includes(needle),
      ),
    );
  }, [stockOptionSearch, stockOptions]);
  const filterCount =
    (appliedFromDate ? 1 : 0) +
    (appliedToDate ? 1 : 0) +
    appliedStockNames.length +
    (appliedAverageByStock ? 1 : 0);

  function openFilters() {
    setDraftFromDate(appliedFromDate);
    setDraftToDate(appliedToDate);
    setDraftStockNames(appliedStockNames);
    setDraftAverageByStock(appliedAverageByStock);
    setStockDropdownOpen(false);
    setStockOptionSearch("");
    setShowFilters(true);
  }

  function toggleStockName(fundName: string) {
    setDraftStockNames((current) =>
      current.includes(fundName)
        ? current.filter((item) => item !== fundName)
        : [...current, fundName],
    );
  }

  function clearDraftFilters() {
    setDraftFromDate("");
    setDraftToDate("");
    setDraftStockNames([]);
    setDraftAverageByStock(false);
    setStockOptionSearch("");
  }

  function applyFilters() {
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
    setAppliedStockNames(draftStockNames);
    setAppliedAverageByStock(draftAverageByStock);
    setPage(1);
    setStockDropdownOpen(false);
    setShowFilters(false);
  }

  function toggleFavorite(event: MouseEvent, stock: Stock) {
    event.stopPropagation();
    favoriteMutation.mutate({
      fundName: stock.fundName,
      favorite: !stock.isFavorite,
    });
  }

  function openStockFromKeyboard(event: KeyboardEvent, stock: Stock) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedStock(stock);
    }
  }

  return (
    <section className="page stocks-page">
      <header className="page-header records-header">
        <div className="records-title-block">
          <p className="eyebrow">Market data</p>
          <h1>Stocks</h1>
        </div>
        <div className="stock-header-actions">
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search stocks"
              placeholder="Search stock"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <button
            className="icon-button"
            type="button"
            title="Filter stocks"
            onClick={openFilters}
          >
            <SlidersHorizontal size={17} />
            {filterCount > 0 ? (
              <span className="filter-count">{filterCount}</span>
            ) : null}
          </button>
        </div>
      </header>

      {showFilters ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Stock filters"
        >
          <section className="modal-panel stock-filter-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Filter</p>
                <h2>Stocks</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setShowFilters(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="stock-filter-content">
              <div className="stock-date-grid">
                <label>
                  From date
                  <input
                    type="date"
                    value={draftFromDate}
                    onChange={(event) => setDraftFromDate(event.target.value)}
                  />
                </label>
                <label>
                  To date
                  <input
                    type="date"
                    value={draftToDate}
                    onChange={(event) => setDraftToDate(event.target.value)}
                  />
                </label>
              </div>
              <label className="stock-average-toggle">
                <input
                  type="checkbox"
                  checked={draftAverageByStock}
                  onChange={(event) =>
                    setDraftAverageByStock(event.target.checked)
                  }
                />
                <span>
                  <strong>Average by stock</strong>
                  <small>
                    Group matching records and average price and return values.
                  </small>
                </span>
              </label>
              <div className="stock-picker">
                <div className="stock-picker-header">
                  <span>Selected stocks</span>
                  <span>{draftStockNames.length} selected</span>
                </div>
                {draftStockNames.length > 0 ? (
                  <div className="stock-chip-list" aria-label="Selected stocks">
                    {draftStockNames.map((fundName) => (
                      <button
                        className="stock-chip"
                        type="button"
                        key={fundName}
                        onClick={() => toggleStockName(fundName)}
                      >
                        <span>{fundName}</span>
                        <X size={14} />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="stock-select-dropdown">
                  <button
                    className="stock-select-trigger"
                    type="button"
                    onClick={() => setStockDropdownOpen((value) => !value)}
                    aria-expanded={stockDropdownOpen}
                  >
                    <span>
                      {draftStockNames.length > 0
                        ? `${draftStockNames.length} stock(s) selected`
                        : "Choose stocks"}
                    </span>
                    <ChevronDown size={17} />
                  </button>
                  {stockDropdownOpen ? (
                    <div className="stock-select-panel">
                      <label className="stock-select-search">
                        <Search size={15} />
                        <input
                          autoFocus
                          aria-label="Search stock options"
                          placeholder="Search stock"
                          value={stockOptionSearch}
                          onChange={(event) =>
                            setStockOptionSearch(event.target.value)
                          }
                        />
                      </label>
                      <div className="stock-option-grid">
                        {filteredStockOptions.map((option) => (
                          <label className="stock-option" key={option.fundName}>
                            <input
                              type="checkbox"
                              checked={draftStockNames.includes(
                                option.fundName,
                              )}
                              onChange={() => toggleStockName(option.fundName)}
                            />
                            <span>
                              <strong>{option.fundName}</strong>
                              <small>
                                {option.category ?? "Uncategorized"}
                              </small>
                            </span>
                          </label>
                        ))}
                        {filteredStockOptions.length === 0 ? (
                          <div className="empty-state">
                            No stocks match your search.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="stock-filter-footer">
              <button
                className="secondary-button"
                type="button"
                onClick={clearDraftFilters}
              >
                Clear
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={applyFilters}
              >
                Apply filter
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {query.error ? (
        <div className="form-error">Could not load stocks.</div>
      ) : null}
      {query.isLoading ? (
        <div className="empty-state">Loading stocks...</div>
      ) : null}

      {!query.isLoading && stocks.length === 0 ? (
        <div className="empty-state">No stock records found.</div>
      ) : null}

      {stocks.length > 0 ? (
        <>
          <div className="stock-results-bar">
            <span>
              {rangeStart}-{rangeEnd} of {total}
              {latestValidityDate ? ` | ${formatDate(latestValidityDate)}` : ""}
            </span>
            <label>
              Rows
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap stock-table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Validity date</th>
                  {visibleColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock) => (
                  <tr
                    key={stock.id}
                    className="clickable-row"
                    onClick={() => setSelectedStock(stock)}
                    onKeyDown={(event) => openStockFromKeyboard(event, stock)}
                    tabIndex={0}
                  >
                    <td>
                      <div className="stock-name-cell">
                        <StockTrendIcon stock={stock} />
                        <div className="stock-name-copy">
                          <strong>{stock.fundName}</strong>
                          <span>
                            {stock.category ?? "Uncategorized"}
                            {stock.isAverage
                              ? ` | ${stock.recordCount ?? 0} records averaged`
                              : ""}
                          </span>
                        </div>
                        <button
                          className={`stock-favorite-button ${stock.isFavorite ? "selected" : ""}`}
                          type="button"
                          aria-pressed={Boolean(stock.isFavorite)}
                          title={
                            stock.isFavorite
                              ? "Remove favorite"
                              : "Add favorite"
                          }
                          disabled={favoriteMutation.isPending}
                          onClick={(event) => toggleFavorite(event, stock)}
                        >
                          <Star size={17} />
                        </button>
                      </div>
                    </td>
                    <td>{formatDate(stock.validityDate)}</td>
                    {visibleColumns.map((column) => (
                      <td key={column.key}>{formatValue(stock[column.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stock-card-list">
            {stocks.map((stock) => (
              <div
                className="stock-card"
                role="button"
                tabIndex={0}
                key={stock.id}
                onClick={() => setSelectedStock(stock)}
                onKeyDown={(event) => openStockFromKeyboard(event, stock)}
              >
                <span className="stock-card-header">
                  <span className="stock-card-title-line">
                    <StockTrendIcon stock={stock} />
                    <span className="stock-name-copy">
                      <strong>{stock.fundName}</strong>
                      <small>
                        {stock.category ?? "Uncategorized"}
                        {stock.isAverage
                          ? ` | ${stock.recordCount ?? 0} records averaged`
                          : ""}
                      </small>
                    </span>
                    <button
                      className={`stock-favorite-button ${stock.isFavorite ? "selected" : ""}`}
                      type="button"
                      aria-pressed={Boolean(stock.isFavorite)}
                      title={
                        stock.isFavorite ? "Remove favorite" : "Add favorite"
                      }
                      disabled={favoriteMutation.isPending}
                      onClick={(event) => toggleFavorite(event, stock)}
                    >
                      <Star size={17} />
                    </button>
                  </span>
                  <time>{formatDate(stock.validityDate)}</time>
                </span>
                <span className="stock-price-strip">
                  <span>
                    <small>Repurchase</small>
                    <strong>{formatValue(stock.repurchasePrice)}</strong>
                  </span>
                  <span>
                    <small>Offer</small>
                    <strong>{formatValue(stock.offerPrice)}</strong>
                  </span>
                  <span>
                    <small>NAV</small>
                    <strong>{formatValue(stock.navPrice)}</strong>
                  </span>
                </span>
                <span className="stock-return-grid">
                  {visibleColumns.slice(3).map((column) => (
                    <span key={column.key}>
                      <small>{column.label}</small>
                      <strong>{formatValue(stock[column.key])}</strong>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="pagination-bar">
            <button
              className="secondary-button compact"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              className="secondary-button compact"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}

      {selectedStock ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Stock details"
        >
          <section className="modal-panel stock-detail-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Stock details</p>
                <h2>{selectedStock.fundName}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setSelectedStock(null)}
              >
                <X size={18} />
              </button>
            </div>
            <dl className="detail-list stock-detail-list">
              {detailRows.map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{detailValue(selectedStock, row)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      ) : null}
    </section>
  );
}

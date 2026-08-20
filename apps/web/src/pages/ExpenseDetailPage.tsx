import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  FileText,
  Image,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { api, formatCurrency } from "../lib/api";
import { useCloseActionMenu } from "../lib/useCloseActionMenu";

type Category = {
  id: string;
  name: string;
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
  mainAmount: string;
};

type Attachment = {
  id?: string;
  fileName?: string | null;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
};

type ExpenseTransaction = {
  id: string;
  purpose: string;
  transactionDate: string;
  mainCurrency: string;
  mainAmount: string;
  notes?: string | null;
  images?: string[];
  attachments?: Attachment[];
  amounts: ExpenseTransactionAmount[];
};

type Expense = {
  id: string;
  name?: string | null;
  purpose: string;
  amount: string;
  currency: string;
  mainCurrency?: string | null;
  category?: Category;
  currencies?: ExpenseCurrencyLine[];
  transactions?: ExpenseTransaction[];
};

type TransactionFormState = {
  purpose: string;
  transactionDate: string;
  notes: string;
  amounts: Record<string, string>;
  rates: Record<string, string>;
  attachments: Attachment[];
};

const maxImageBytes = 100 * 1024;

const emptyTransactionForm = (): TransactionFormState => ({
  purpose: "",
  transactionDate: new Date().toISOString().slice(0, 10),
  notes: "",
  amounts: {},
  rates: {},
  attachments: [],
});

function expenseCurrencyCodes(expense: Expense) {
  if (expense.currencies?.length)
    return expense.currencies.map((line) => line.currencyCode);
  return [expense.mainCurrency ?? expense.currency];
}

function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  return Math.ceil((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image."));
    image.src = dataUrl;
  });
}

async function compressImage(file: File): Promise<Attachment> {
  const original = await readFileAsDataUrl(file);
  const image = await loadImage(original);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Image compression is not available in this browser.");

  const maxSide = 1400;
  let scale = Math.min(
    1,
    maxSide / Math.max(image.naturalWidth, image.naturalHeight),
  );
  let quality = 0.82;
  let best = original;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const width = Math.max(120, Math.round(image.naturalWidth * scale));
    const height = Math.max(120, Math.round(image.naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    best = canvas.toDataURL("image/jpeg", quality);

    if (dataUrlByteSize(best) <= maxImageBytes) break;
    if (quality > 0.45) {
      quality = Math.max(0.45, quality - 0.09);
    } else {
      scale *= 0.78;
    }
  }

  return {
    fileName: file.name,
    mimeType: "image/jpeg",
    dataBase64: best,
    sizeBytes: dataUrlByteSize(best),
  };
}

async function compressFiles(files: FileList | null) {
  if (!files) return [];
  return Promise.all(Array.from(files).map((file) => compressImage(file)));
}

function transactionImages(transaction: ExpenseTransaction) {
  const attachmentImages =
    transaction.attachments?.map((attachment) => attachment.dataBase64) ?? [];
  return attachmentImages.length
    ? attachmentImages
    : (transaction.images ?? []);
}

function transactionSummary(
  transactions: ExpenseTransaction[],
  currencyCodes: string[],
) {
  return currencyCodes.map((currencyCode) => {
    const lines = transactions.flatMap((transaction) =>
      transaction.amounts.filter(
        (amount) => amount.currencyCode === currencyCode,
      ),
    );
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

function formatRate(rate: number) {
  return rate > 0 ? Number(rate.toFixed(6)).toString() : "-";
}

function formatNumber(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatAmountWithCode(value: number | string, currencyCode: string) {
  return `${formatNumber(value)} ${currencyCode}`;
}

function transactionAmountLines(
  transaction: ExpenseTransaction,
  mainCurrency: string,
) {
  return [...transaction.amounts].sort((left, right) => {
    if (left.currencyCode === mainCurrency) return -1;
    if (right.currencyCode === mainCurrency) return 1;
    return left.currencyCode.localeCompare(right.currencyCode);
  });
}

function compareTransactionsByDateDesc(
  left: ExpenseTransaction,
  right: ExpenseTransaction,
) {
  return (
    new Date(right.transactionDate).getTime() -
    new Date(left.transactionDate).getTime()
  );
}

export function ExpenseDetailPage() {
  const { expenseId } = useParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TransactionFormState>(() =>
    emptyTransactionForm(),
  );
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [detailTransaction, setDetailTransaction] =
    useState<ExpenseTransaction | null>(null);
  const [imageTransaction, setImageTransaction] =
    useState<ExpenseTransaction | null>(null);
  const [confirmTransaction, setConfirmTransaction] =
    useState<ExpenseTransaction | null>(null);
  const [undoTransaction, setUndoTransaction] =
    useState<ExpenseTransaction | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  useCloseActionMenu(Boolean(openActionMenu), () => setOpenActionMenu(null));
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [draftCurrency, setDraftCurrency] = useState("ALL");
  const [draftPurpose, setDraftPurpose] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [purposeFilter, setPurposeFilter] = useState("ALL");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: () => api<{ data: Expense }>(`/expenses/${expenseId}`),
    enabled: Boolean(expenseId),
  });
  const { data: purposeData } = useQuery({
    queryKey: ["expense-purposes"],
    queryFn: () => api<{ data: string[] }>("/expense-purposes"),
  });
  const createTransaction = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<{ data: ExpenseTransaction }>(`/expenses/${expenseId}/transactions`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => afterTransactionSaved(),
  });
  const updateTransaction = useMutation({
    mutationFn: ({
      transactionId,
      payload,
    }: {
      transactionId: string;
      payload: Record<string, unknown>;
    }) =>
      api<{ data: ExpenseTransaction }>(
        `/expenses/${expenseId}/transactions/${transactionId}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => afterTransactionSaved(),
  });
  const deleteTransaction = useMutation({
    mutationFn: (transactionId: string) =>
      api<void>(`/expenses/${expenseId}/transactions/${transactionId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense", expenseId] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const expense = data?.data;
  const mainCurrency = expense?.mainCurrency ?? expense?.currency ?? "USD";
  const isSaving = createTransaction.isPending || updateTransaction.isPending;
  const saveError = createTransaction.error ?? updateTransaction.error;
  const canSaveTransaction =
    Boolean(form.purpose.trim()) &&
    Number(form.amounts[mainCurrency] ?? 0) > 0 &&
    (!expense ||
      expenseCurrencyCodes(expense).every(
        (currencyCode) =>
          currencyCode === mainCurrency ||
          Number(form.rates[currencyCode] ?? 0) > 0,
      ));

  function afterTransactionSaved() {
    queryClient.invalidateQueries({ queryKey: ["expense", expenseId] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["expense-purposes"] });
    setForm(emptyTransactionForm());
    setEditingTransactionId(null);
    setShowTransactionForm(false);
  }

  function updateAmount(currencyCode: string, amount: string) {
    setForm((current) => ({
      ...current,
      amounts: { ...current.amounts, [currencyCode]: amount },
      rates: { ...current.rates, [mainCurrency]: "1" },
    }));
  }

  function updateRate(currencyCode: string, rate: string) {
    setForm((current) => ({
      ...current,
      rates: { ...current.rates, [currencyCode]: rate },
    }));
  }

  async function updateAttachments(event: ChangeEvent<HTMLInputElement>) {
    const attachments = await compressFiles(event.target.files);
    setForm((current) => ({ ...current, attachments }));
    event.target.value = "";
  }

  function transactionPayload() {
    if (!expense) return null;
    const mainAmount = Number(form.amounts[mainCurrency] ?? 0);
    const amounts = expenseCurrencyCodes(expense)
      .map((currencyCode) => {
        const rate =
          currencyCode === mainCurrency
            ? 1
            : Number(form.rates[currencyCode] || 0);
        const convertedAmount =
          currencyCode === mainCurrency
            ? mainAmount
            : rate > 0
              ? mainAmount * rate
              : 0;
        return {
          currency: currencyCode,
          amount: convertedAmount.toFixed(4),
          rateToMain: currencyCode === mainCurrency ? "1" : String(rate),
        };
      })
      .filter((line) => Number(line.amount) > 0);

    return {
      purpose: form.purpose,
      transactionDate: form.transactionDate,
      notes: form.notes || undefined,
      attachments: form.attachments,
      amounts,
    };
  }

  function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = transactionPayload();
    if (!payload) return;

    if (editingTransactionId) {
      updateTransaction.mutate({
        transactionId: editingTransactionId,
        payload,
      });
      return;
    }
    createTransaction.mutate(payload);
  }

  function startEdit(transaction: ExpenseTransaction) {
    const amounts: Record<string, string> = {};
    const rates: Record<string, string> = {};
    const mainLine = transaction.amounts.find(
      (amount) => amount.currencyCode === mainCurrency,
    );
    amounts[mainCurrency] = String(
      Number(mainLine?.amount ?? transaction.mainAmount),
    );
    transaction.amounts.forEach((amount) => {
      rates[amount.currencyCode] = String(Number(amount.rateToMain));
    });
    setOpenActionMenu(null);
    setEditingTransactionId(transaction.id);
    setShowTransactionForm(true);
    setForm({
      purpose: transaction.purpose,
      transactionDate: transaction.transactionDate.slice(0, 10),
      notes: transaction.notes ?? "",
      amounts,
      rates,
      attachments:
        transaction.attachments ??
        transaction.images?.map((image, index) => ({
          fileName: `image-${index + 1}.jpg`,
          mimeType: image.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg",
          dataBase64: image,
          sizeBytes: dataUrlByteSize(image),
        })) ??
        [],
    });
  }

  function openAddTransaction() {
    setEditingTransactionId(null);
    setForm(emptyTransactionForm());
    setShowTransactionForm(true);
  }

  function cancelEdit() {
    setEditingTransactionId(null);
    setForm(emptyTransactionForm());
    setShowTransactionForm(false);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCurrencyFilter(draftCurrency);
    setPurposeFilter(draftPurpose);
    setShowFilters(false);
  }

  function requestDelete(transaction: ExpenseTransaction) {
    setOpenActionMenu(null);
    setConfirmTransaction(transaction);
  }

  function scheduleDeleteTransaction(transaction: ExpenseTransaction) {
    setConfirmTransaction(null);
    setUndoTransaction(transaction);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = setTimeout(() => {
      deleteTransaction.mutate(transaction.id);
      setUndoTransaction(null);
      deleteTimer.current = null;
    }, 5000);
  }

  function undoDeleteTransaction() {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = null;
    setUndoTransaction(null);
  }

  function swipeDelete(transaction: ExpenseTransaction, endX: number) {
    if (touchStartX === null) return;
    if (touchStartX - endX > 70) requestDelete(transaction);
    setTouchStartX(null);
  }

  if (isLoading)
    return (
      <section className="page">
        <div className="empty-state">Loading expense...</div>
      </section>
    );
  if (error || !expense)
    return (
      <section className="page">
        <div className="form-error">Could not load this expense.</div>
      </section>
    );

  const currencyCodes = expenseCurrencyCodes(expense);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const transactions = [...(expense.transactions ?? [])].sort(
    compareTransactionsByDateDesc,
  );
  const purposeOptions = [
    ...new Set(transactions.map((transaction) => transaction.purpose)),
  ].sort((left, right) => left.localeCompare(right));
  const visibleTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      !normalizedSearch ||
      transaction.purpose.toLowerCase().includes(normalizedSearch) ||
      (transaction.notes ?? "").toLowerCase().includes(normalizedSearch);
    const matchesCurrency =
      currencyFilter === "ALL" ||
      transaction.amounts.some(
        (amount) => amount.currencyCode === currencyFilter,
      );
    const matchesPurpose =
      purposeFilter === "ALL" || transaction.purpose === purposeFilter;
    return matchesSearch && matchesCurrency && matchesPurpose;
  });
  const summaries = transactionSummary(visibleTransactions, currencyCodes);
  const rateSummaries = summaries.filter(
    (summary) => summary.currencyCode !== mainCurrency,
  );

  return (
    <section className="page">
      <header className="page-header records-header expense-detail-header">
        <div className="expense-header-row">
          <Link className="icon-button" to="/expenses" title="Back to expenses">
            <ArrowLeft size={17} />
          </Link>
          <h1>{expense.name ?? expense.purpose}</h1>
          <div className="header-icon-actions">
            <button
              className="icon-button"
              type="button"
              title="Filter transactions"
              onClick={() => setShowFilters(true)}
            >
              <SlidersHorizontal size={17} />
            </button>
            <button
              className="icon-button primary-icon"
              type="button"
              title="Add transaction"
              onClick={openAddTransaction}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="record-filters search-only">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Search transactions"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
      </div>

      <article className="expense-card expense-detail-summary">
        <div className="expense-meta-row">
          <div>
            <strong>{expense.category?.name ?? "Uncategorized"}</strong>
            <span>{currencyCodes.join(", ")}</span>
          </div>
          <div className="expense-transaction-count">
            <span>Transactions</span>
            <strong>{visibleTransactions.length}</strong>
          </div>
        </div>
        <div className="currency-summary-list">
          {summaries.map((summary) => (
            <div
              className={`currency-summary-line${summary.currencyCode === mainCurrency ? " main" : ""}`}
              key={summary.currencyCode}
            >
              <strong>
                {formatAmountWithCode(summary.total, summary.currencyCode)}
              </strong>
              {summary.currencyCode === mainCurrency ? null : (
                <div className="rate-stat-list">
                  <small>Avg {formatRate(summary.average)}</small>
                  <small>High {formatRate(summary.high)}</small>
                  <small>Low {formatRate(summary.low)}</small>
                </div>
              )}
            </div>
          ))}
          {rateSummaries.length === 0 && summaries.length <= 1 ? (
            <small className="no-rate-note">No other currencies</small>
          ) : null}
        </div>
      </article>

      <div className="transaction-list">
        {visibleTransactions.length === 0 ? (
          <div className="empty-state">No transactions match this view.</div>
        ) : null}
        {visibleTransactions.map((transaction) => {
          const images = transactionImages(transaction);
          const amountLines = transactionAmountLines(transaction, mainCurrency);
          return (
            <div
              className="transaction-row expense-transaction-tile"
              key={transaction.id}
              onTouchStart={(event) =>
                setTouchStartX(event.changedTouches[0]?.clientX ?? null)
              }
              onTouchEnd={(event) =>
                swipeDelete(transaction, event.changedTouches[0]?.clientX ?? 0)
              }
            >
              <div className="transaction-main-info">
                <strong>{transaction.purpose}</strong>
                <time>
                  {new Date(transaction.transactionDate).toLocaleDateString()}
                </time>
              </div>
              <div className="transaction-currency-strip">
                {amountLines.map((amount) => (
                  <span
                    className={
                      amount.currencyCode === mainCurrency ? "main" : undefined
                    }
                    key={amount.id}
                  >
                    <strong>
                      {formatAmountWithCode(amount.amount, amount.currencyCode)}
                    </strong>
                    <small>
                      {amount.currencyCode === mainCurrency
                        ? "Main amount"
                        : `Rate ${formatRate(Number(amount.rateToMain))}`}
                    </small>
                  </span>
                ))}
              </div>
              <div className="row-menu-wrap">
                <button
                  className="icon-button"
                  type="button"
                  title="Transaction actions"
                  onClick={() =>
                    setOpenActionMenu((current) =>
                      current === transaction.id ? null : transaction.id,
                    )
                  }
                >
                  <MoreVertical size={16} />
                </button>
                {openActionMenu === transaction.id ? (
                  <div className="action-menu">
                    <button
                      type="button"
                      onClick={() => startEdit(transaction)}
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenActionMenu(null);
                        setDetailTransaction(transaction);
                      }}
                    >
                      <FileText size={15} />
                      Details
                    </button>
                    <button
                      type="button"
                      disabled={!images.length}
                      onClick={() => {
                        setOpenActionMenu(null);
                        setImageTransaction(transaction);
                      }}
                    >
                      <Image size={15} />
                      Images
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(transaction)}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {showFilters ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Transaction filters"
        >
          <form className="modal-panel confirm-panel" onSubmit={applyFilters}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Filter</p>
                <h2>Transactions</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setShowFilters(false)}
              >
                <X size={16} />
              </button>
            </div>
            <label>
              Currency
              <select
                value={draftCurrency}
                onChange={(event) => setDraftCurrency(event.target.value)}
              >
                <option value="ALL">All currencies</option>
                {currencyCodes.map((currencyCode) => (
                  <option key={currencyCode} value={currencyCode}>
                    {currencyCode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Purpose
              <select
                value={draftPurpose}
                onChange={(event) => setDraftPurpose(event.target.value)}
              >
                <option value="ALL">All purposes</option>
                {purposeOptions.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </label>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setDraftCurrency("ALL");
                  setDraftPurpose("ALL");
                  setCurrencyFilter("ALL");
                  setPurposeFilter("ALL");
                  setShowFilters(false);
                }}
              >
                Clear
              </button>
              <button className="primary-button" type="submit">
                Apply
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {showTransactionForm ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={
            editingTransactionId ? "Edit transaction" : "Add transaction"
          }
        >
          <section className="modal-panel transaction-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Transaction</p>
                <h2>
                  {editingTransactionId
                    ? "Edit transaction"
                    : "Add transaction"}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={cancelEdit}
              >
                <X size={16} />
              </button>
            </div>
            <form className="transaction-entry" onSubmit={submitTransaction}>
              <datalist id="expense-purpose-options">
                {purposeData?.data.map((purpose) => (
                  <option key={purpose} value={purpose} />
                ))}
              </datalist>
              <div className="compact-form">
                <label>
                  Purpose
                  <input
                    list="expense-purpose-options"
                    value={form.purpose}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        purpose: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={form.transactionDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        transactionDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="transaction-rate-grid">
                <div className="rate-row main-rate-row">
                  <label>
                    {mainCurrency} amount
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.amounts[mainCurrency] ?? ""}
                      onChange={(event) =>
                        updateAmount(mainCurrency, event.target.value)
                      }
                      required
                    />
                  </label>
                  <span>
                    {formatCurrency(
                      form.amounts[mainCurrency] || 0,
                      mainCurrency,
                    )}
                  </span>
                </div>
                {currencyCodes
                  .filter((currencyCode) => currencyCode !== mainCurrency)
                  .map((currencyCode) => {
                    const rate = form.rates[currencyCode] || "";
                    const converted =
                      Number(form.amounts[mainCurrency] || 0) *
                      Number(rate || 0);
                    return (
                      <div className="rate-row" key={currencyCode}>
                        <label>
                          {currencyCode} exchange rate
                          <input
                            type="number"
                            min="0"
                            step="0.00000001"
                            value={rate}
                            onChange={(event) =>
                              updateRate(currencyCode, event.target.value)
                            }
                            required
                          />
                        </label>
                        <span>
                          {Number.isFinite(converted) && converted > 0
                            ? formatCurrency(converted, currencyCode)
                            : "-"}
                        </span>
                      </div>
                    );
                  })}
              </div>
              <label>
                Notes
                <input
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="file-input">
                <Camera size={16} />
                Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={updateAttachments}
                />
                <span>{form.attachments.length} selected</span>
              </label>
              {saveError ? (
                <div className="form-error">{saveError.message}</div>
              ) : null}
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={isSaving || !canSaveTransaction}
                >
                  {editingTransactionId
                    ? "Update transaction"
                    : "Save transaction"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {confirmTransaction ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Delete transaction"
        >
          <section className="modal-panel confirm-panel">
            <div>
              <p className="eyebrow">Delete</p>
              <h2>{confirmTransaction.purpose}</h2>
            </div>
            <p>
              This transaction will be deleted. You will have 5 seconds to undo.
            </p>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirmTransaction(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                onClick={() => scheduleDeleteTransaction(confirmTransaction)}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {detailTransaction ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Transaction details"
        >
          <section className="modal-panel">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Transaction</p>
                <h2>{detailTransaction.purpose}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setDetailTransaction(null)}
              >
                <X size={16} />
              </button>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Date</dt>
                <dd>
                  {new Date(
                    detailTransaction.transactionDate,
                  ).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  {formatCurrency(
                    detailTransaction.mainAmount,
                    detailTransaction.mainCurrency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{detailTransaction.notes || "No notes"}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
      {imageTransaction ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Transaction images"
        >
          <section className="modal-panel">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Images</p>
                <h2>{imageTransaction.purpose}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setImageTransaction(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="image-grid">
              {transactionImages(imageTransaction).map((image, index) => (
                <img
                  key={`${image.slice(0, 32)}-${index}`}
                  src={image}
                  alt={`Transaction ${index + 1}`}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {undoTransaction ? (
        <div className="undo-toast">
          <span>Deleting {undoTransaction.purpose}</span>
          <button type="button" onClick={undoDeleteTransaction}>
            Undo
          </button>
        </div>
      ) : null}
    </section>
  );
}

import { ChangeEvent, FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Copy,
  Image,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, formatCurrency } from "../lib/api";

type UserCurrency = {
  id: string;
  currencyCode: string;
};

type LoanBalance = {
  currency: string;
  balance: string;
};

type Attachment = {
  id?: string;
  fileName?: string | null;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
};

type LoanTransaction = {
  id: string;
  kind: "CREDIT" | "DEBIT";
  purpose: string;
  amount: string;
  currency: string;
  transactionDate: string;
  notes?: string | null;
  images?: string[];
  attachments?: Attachment[];
};

type Loan = {
  id: string;
  shareId: string;
  person: string;
  balances?: LoanBalance[];
  transactions?: LoanTransaction[];
};

type TransactionForm = {
  kind: "CREDIT" | "DEBIT";
  purpose: string;
  currency: string;
  amount: string;
  transactionDate: string;
  notes: string;
  attachments: Attachment[];
};

type LoanNameForm = {
  person: string;
};

type FilterForm = {
  kind: "ALL" | "CREDIT" | "DEBIT";
  purpose: string;
  from: string;
  to: string;
};

const emptyTransactionForm = (): TransactionForm => ({
  kind: "CREDIT",
  purpose: "",
  currency: "",
  amount: "",
  transactionDate: new Date().toISOString().slice(0, 10),
  notes: "",
  attachments: [],
});

const emptyFilters = (): FilterForm => ({
  kind: "ALL",
  purpose: "",
  from: "",
  to: "",
});

const loanKindOptions = [
  {
    value: "CREDIT",
    label: "Credit",
    description: "(Given to me)",
  },
  {
    value: "DEBIT",
    label: "Debit",
    description: "(Taken From me)",
  },
] as const;

function balanceClass(value: string | number) {
  const amount = Number(value);
  if (amount > 0) return "balance-positive";
  if (amount < 0) return "balance-negative";
  return "";
}

function shareUrl(shareId: string) {
  return `${window.location.origin}/l/${shareId}`;
}

const maxImageBytes = 100 * 1024;

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

function transactionImages(transaction: LoanTransaction) {
  const attachmentImages =
    transaction.attachments?.map((attachment) => attachment.dataBase64) ?? [];
  return attachmentImages.length
    ? attachmentImages
    : (transaction.images ?? []);
}

function compareTransactionsByDateDesc(
  left: LoanTransaction,
  right: LoanTransaction,
) {
  return (
    new Date(right.transactionDate).getTime() -
    new Date(left.transactionDate).getTime()
  );
}

function loanKindText(kind: LoanTransaction["kind"]) {
  return kind === "CREDIT" ? "Given" : "Taken";
}

function formatCurrencyValueOnly(value: number | string, currency: string) {
  return formatCurrency(value, currency).replace(currency, "").trim();
}

function TransactionKindPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: TransactionForm["kind"];
  onChange: (value: TransactionForm["kind"]) => void;
}) {
  return (
    <fieldset className="loan-kind-picker">
      <legend>Type</legend>
      <div className="loan-kind-options">
        {loanKindOptions.map((option) => (
          <label
            className={`loan-kind-option ${option.value.toLowerCase()}${
              option.value === value ? " selected" : ""
            }`}
            key={option.value}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function LoanDetailPage() {
  const { loanId, shareId } = useParams();
  const isPublicView = Boolean(shareId);
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showEditLoan, setShowEditLoan] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<TransactionForm>(() =>
    emptyTransactionForm(),
  );
  const [loanNameForm, setLoanNameForm] = useState<LoanNameForm>({
    person: "",
  });
  const [editingTransaction, setEditingTransaction] =
    useState<LoanTransaction | null>(null);
  const [imageTransaction, setImageTransaction] =
    useState<LoanTransaction | null>(null);
  const [editForm, setEditForm] = useState<TransactionForm>(() =>
    emptyTransactionForm(),
  );
  const [draftFilters, setDraftFilters] = useState<FilterForm>(() =>
    emptyFilters(),
  );
  const [filters, setFilters] = useState<FilterForm>(() => emptyFilters());
  const path = shareId ? `/public/loans/${shareId}` : `/loans/${loanId}`;
  const queryKey = shareId ? ["loan-share", shareId] : ["loan", loanId];
  const { data, error, isLoading } = useQuery({
    queryKey,
    queryFn: () => api<{ data: Loan }>(path),
    enabled: Boolean(loanId || shareId),
  });
  const { data: userCurrenciesData } = useQuery({
    queryKey: ["user-currencies"],
    queryFn: () => api<{ data: UserCurrency[] }>("/user-currencies"),
    enabled: !isPublicView,
  });
  const { data: purposeData } = useQuery({
    queryKey: ["loan-purposes"],
    queryFn: () => api<{ data: string[] }>("/loan-purposes"),
    enabled: !isPublicView,
  });
  const createTransaction = useMutation({
    mutationFn: (payload: TransactionForm) =>
      api<{ data: LoanTransaction }>(`/loans/${data?.data.id}/transactions`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-purposes"] });
      setForm(emptyTransactionForm());
      setShowAdd(false);
    },
  });
  const updateLoan = useMutation({
    mutationFn: (payload: LoanNameForm) =>
      api<{ data: Loan }>(`/loans/${loan?.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setShowEditLoan(false);
    },
  });
  const updateTransaction = useMutation({
    mutationFn: ({
      transactionId,
      payload,
    }: {
      transactionId: string;
      payload: TransactionForm;
    }) =>
      api<{ data: LoanTransaction }>(
        `/loans/${loan?.id}/transactions/${transactionId}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-purposes"] });
      setEditingTransaction(null);
      setEditForm(emptyTransactionForm());
    },
  });

  const loan = data?.data;
  const userCurrencies = userCurrenciesData?.data ?? [];
  const currencyOptions = userCurrencies.map((item) => item.currencyCode);
  const purposeOptions = purposeData?.data ?? [
    ...new Set(
      (loan?.transactions ?? []).map((transaction) => transaction.purpose),
    ),
  ];

  function openAddTransaction() {
    setForm({ ...emptyTransactionForm(), currency: currencyOptions[0] ?? "" });
    setShowAdd(true);
  }

  function openEditLoan() {
    if (!loan) return;
    setLoanNameForm({ person: loan.person });
    setShowEditLoan(true);
  }

  function openEditTransaction(transaction: LoanTransaction) {
    setEditingTransaction(transaction);
    setEditForm({
      kind: transaction.kind,
      purpose: transaction.purpose,
      currency: transaction.currency,
      amount: transaction.amount,
      transactionDate: transaction.transactionDate.slice(0, 10),
      notes: transaction.notes ?? "",
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

  async function updateAttachments(
    event: ChangeEvent<HTMLInputElement>,
    target: "add" | "edit",
  ) {
    const attachments = await compressFiles(event.target.files);
    if (target === "add") {
      setForm((current) => ({ ...current, attachments }));
    } else {
      setEditForm((current) => ({ ...current, attachments }));
    }
    event.target.value = "";
  }

  function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createTransaction.mutate(form);
  }

  function submitLoanName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateLoan.mutate(loanNameForm);
  }

  function submitTransactionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransaction) return;
    updateTransaction.mutate({
      transactionId: editingTransaction.id,
      payload: editForm,
    });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters(draftFilters);
    setShowFilters(false);
  }

  async function copyShareLink() {
    if (!loan) return;
    await navigator.clipboard?.writeText(shareUrl(loan.shareId));
  }

  if (isLoading)
    return (
      <section className="page">
        <div className="empty-state">Loading loan...</div>
      </section>
    );
  if (error || !loan)
    return (
      <section className="page">
        <div className="form-error">Could not load this loan.</div>
      </section>
    );

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleTransactions = [...(loan.transactions ?? [])]
    .sort(compareTransactionsByDateDesc)
    .filter((transaction) => {
      const transactionDay = transaction.transactionDate.slice(0, 10);
      const matchesSearch =
        !normalizedSearch ||
        transaction.purpose.toLowerCase().includes(normalizedSearch) ||
        (transaction.notes ?? "").toLowerCase().includes(normalizedSearch);
      const matchesKind =
        filters.kind === "ALL" || transaction.kind === filters.kind;
      const matchesPurpose =
        !filters.purpose || transaction.purpose === filters.purpose;
      const matchesFrom = !filters.from || transactionDay >= filters.from;
      const matchesTo = !filters.to || transactionDay <= filters.to;
      return (
        matchesSearch &&
        matchesKind &&
        matchesPurpose &&
        matchesFrom &&
        matchesTo
      );
    });

  return (
    <section className="page">
      <header className="page-header records-header">
        <div className="records-title-block">
          <p className="eyebrow">Loan</p>
          <div className="title-actions">
            {isPublicView ? null : (
              <Link className="icon-button" to="/loans" title="Back to loans">
                <ArrowLeft size={17} />
              </Link>
            )}
            <h1>{loan.person}</h1>
            {isPublicView ? null : (
              <button
                className="icon-button"
                type="button"
                title="Edit loan name"
                onClick={openEditLoan}
              >
                <Pencil size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="header-icon-actions">
          <button
            className="icon-button"
            type="button"
            title="Copy share link"
            onClick={copyShareLink}
          >
            <Copy size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Filter transactions"
            onClick={() => setShowFilters(true)}
          >
            <SlidersHorizontal size={17} />
          </button>
          {isPublicView ? null : (
            <button
              className="icon-button primary-icon"
              type="button"
              title="Add transaction"
              onClick={openAddTransaction}
            >
              <Plus size={18} />
            </button>
          )}
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

      <article className="expense-card loan-balance-card">
        <div className="loan-balance-grid">
          {(loan.balances?.length
            ? loan.balances
            : [{ currency: "USD", balance: "0" }]
          ).map((balance) => (
            <div className="loan-balance-item" key={balance.currency}>
              <span>{balance.currency}</span>
              <strong className={balanceClass(balance.balance)}>
                {formatCurrencyValueOnly(balance.balance, balance.currency)}
              </strong>
            </div>
          ))}
        </div>
      </article>

      <div className="transaction-list">
        {visibleTransactions.length === 0 ? (
          <div className="empty-state">No transactions match this view.</div>
        ) : null}
        {visibleTransactions.map((transaction) => {
          const images = transactionImages(transaction);
          return (
            <div
              className={`transaction-row loan-transaction-row ${transaction.kind.toLowerCase()}`}
              key={transaction.id}
            >
              <div className="loan-transaction-amount">
                <strong
                  className={
                    transaction.kind === "CREDIT"
                      ? "balance-positive"
                      : "balance-negative"
                  }
                >
                  {formatCurrency(transaction.amount, transaction.currency)
                    .replace(transaction.currency, "")
                    .trim()}
                </strong>
                <small>{transaction.currency}</small>
              </div>
              <time>
                {new Date(transaction.transactionDate).toLocaleDateString()}
              </time>
              <small>{transaction.purpose}</small>
              <span
                className={`loan-type-text ${transaction.kind.toLowerCase()}`}
              >
                {loanKindText(transaction.kind)}
              </span>
              {isPublicView ? null : (
                <div className="transaction-actions">
                  {images.length ? (
                    <button
                      className="icon-button"
                      type="button"
                      title="View images"
                      onClick={() => setImageTransaction(transaction)}
                    >
                      <Image size={15} />
                    </button>
                  ) : null}
                  <button
                    className="icon-button"
                    type="button"
                    title="Edit transaction"
                    onClick={() => openEditTransaction(transaction)}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showEditLoan ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit loan name"
        >
          <form className="modal-panel confirm-panel" onSubmit={submitLoanName}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Edit</p>
                <h2>Loan name</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setShowEditLoan(false)}
              >
                <X size={16} />
              </button>
            </div>
            <label>
              Person name
              <input
                value={loanNameForm.person}
                onChange={(event) =>
                  setLoanNameForm({ person: event.target.value })
                }
                required
              />
            </label>
            {updateLoan.error ? (
              <div className="form-error">{updateLoan.error.message}</div>
            ) : null}
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowEditLoan(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={updateLoan.isPending || !loanNameForm.person.trim()}
              >
                Save name
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showFilters ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Loan transaction filters"
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
              Type
              <select
                value={draftFilters.kind}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    kind: event.target.value as FilterForm["kind"],
                  }))
                }
              >
                <option value="ALL">All</option>
                <option value="CREDIT">Credit</option>
                <option value="DEBIT">Debit</option>
              </select>
            </label>
            <label>
              Purpose
              <select
                value={draftFilters.purpose}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    purpose: event.target.value,
                  }))
                }
              >
                <option value="">All purposes</option>
                {purposeOptions.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </label>
            <div className="compact-form">
              <label>
                From
                <input
                  type="date"
                  value={draftFilters.from}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={draftFilters.to}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setDraftFilters(emptyFilters());
                  setFilters(emptyFilters());
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

      {showAdd ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Add loan transaction"
        >
          <form
            className="modal-panel confirm-panel"
            onSubmit={submitTransaction}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Transaction</p>
                <h2>Add transaction</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setShowAdd(false)}
              >
                <X size={16} />
              </button>
            </div>
            <datalist id="loan-purpose-options">
              {purposeOptions.map((purpose) => (
                <option key={purpose} value={purpose} />
              ))}
            </datalist>
            <TransactionKindPicker
              name="loan-transaction-kind"
              value={form.kind}
              onChange={(kind) =>
                setForm((current) => ({
                  ...current,
                  kind,
                }))
              }
            />
            <label>
              Purpose
              <input
                list="loan-purpose-options"
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
            <div className="compact-form">
              <label>
                Currency
                <select
                  value={form.currency}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Choose currency</option>
                  {currencyOptions.map((currencyCode) => (
                    <option key={currencyCode} value={currencyCode}>
                      {currencyCode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>
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
                onChange={(event) => updateAttachments(event, "add")}
              />
              <span>{form.attachments.length} selected</span>
            </label>
            {createTransaction.error ? (
              <div className="form-error">
                {createTransaction.error.message}
              </div>
            ) : null}
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  createTransaction.isPending ||
                  !form.purpose ||
                  !form.currency ||
                  !form.amount
                }
              >
                Save transaction
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingTransaction ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit loan transaction"
        >
          <form
            className="modal-panel confirm-panel"
            onSubmit={submitTransactionEdit}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Transaction</p>
                <h2>Edit transaction</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={() => setEditingTransaction(null)}
              >
                <X size={16} />
              </button>
            </div>
            <datalist id="loan-purpose-edit-options">
              {purposeOptions.map((purpose) => (
                <option key={purpose} value={purpose} />
              ))}
            </datalist>
            <TransactionKindPicker
              name="loan-transaction-kind-edit"
              value={editForm.kind}
              onChange={(kind) =>
                setEditForm((current) => ({
                  ...current,
                  kind,
                }))
              }
            />
            <label>
              Purpose
              <input
                list="loan-purpose-edit-options"
                value={editForm.purpose}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    purpose: event.target.value,
                  }))
                }
                required
              />
            </label>
            <div className="compact-form">
              <label>
                Currency
                <select
                  value={editForm.currency}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Choose currency</option>
                  {currencyOptions.map((currencyCode) => (
                    <option key={currencyCode} value={currencyCode}>
                      {currencyCode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={editForm.amount}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>
            <label>
              Date
              <input
                type="date"
                value={editForm.transactionDate}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    transactionDate: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Notes
              <input
                value={editForm.notes}
                onChange={(event) =>
                  setEditForm((current) => ({
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
                onChange={(event) => updateAttachments(event, "edit")}
              />
              <span>{editForm.attachments.length} selected</span>
            </label>
            {updateTransaction.error ? (
              <div className="form-error">
                {updateTransaction.error.message}
              </div>
            ) : null}
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEditingTransaction(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  updateTransaction.isPending ||
                  !editForm.purpose ||
                  !editForm.currency ||
                  !editForm.amount
                }
              >
                Save transaction
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {imageTransaction ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Loan transaction images"
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
    </section>
  );
}

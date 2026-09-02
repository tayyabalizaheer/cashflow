import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  Landmark,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api, formatCurrency } from "../lib/api";
import { formatAppDate } from "../lib/dateformat";
import { useCloseActionMenu } from "../lib/usecloseactionmenu";

type UserCurrency = {
  id: string;
  currencyCode: string;
};

type Account = {
  id: string;
  accountName: string;
  bankName: string;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  swiftCode?: string | null;
  routingNumber?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  accountType: string;
  currency: string;
  openingBalance: string;
  currentBalance?: string | null;
  openedAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type AccountForm = {
  accountName: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  iban: string;
  swiftCode: string;
  routingNumber: string;
  branchName: string;
  branchAddress: string;
  accountType: string;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  openedAt: string;
  notes: string;
};

const emptyAccountForm: AccountForm = {
  accountName: "",
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  iban: "",
  swiftCode: "",
  routingNumber: "",
  branchName: "",
  branchAddress: "",
  accountType: "Savings",
  currency: "",
  openingBalance: "0",
  currentBalance: "",
  openedAt: "",
  notes: "",
};

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: string) {
  return value === "" ? null : value;
}

function optionalDate(value: string) {
  return value ? value : null;
}

function accountBalance(account: Account) {
  return account.currentBalance ?? account.openingBalance ?? "0";
}

function formFromAccount(account: Account): AccountForm {
  return {
    accountName: account.accountName,
    bankName: account.bankName,
    accountHolderName: account.accountHolderName ?? "",
    accountNumber: account.accountNumber ?? "",
    iban: account.iban ?? "",
    swiftCode: account.swiftCode ?? "",
    routingNumber: account.routingNumber ?? "",
    branchName: account.branchName ?? "",
    branchAddress: account.branchAddress ?? "",
    accountType: account.accountType,
    currency: account.currency,
    openingBalance: account.openingBalance ?? "0",
    currentBalance: account.currentBalance ?? "",
    openedAt: dateInputValue(account.openedAt),
    notes: account.notes ?? "",
  };
}

function payloadFromForm(form: AccountForm) {
  return {
    accountName: form.accountName.trim(),
    bankName: form.bankName.trim(),
    accountHolderName: optionalString(form.accountHolderName),
    accountNumber: optionalString(form.accountNumber),
    iban: optionalString(form.iban),
    swiftCode: optionalString(form.swiftCode),
    routingNumber: optionalString(form.routingNumber),
    branchName: optionalString(form.branchName),
    branchAddress: optionalString(form.branchAddress),
    accountType: form.accountType,
    currency: form.currency,
    openingBalance: form.openingBalance || "0",
    currentBalance: optionalNumber(form.currentBalance),
    openedAt: optionalDate(form.openedAt),
    notes: optionalString(form.notes),
  };
}

function AccountDetails({
  account,
  onClose,
  onEdit,
  onDelete,
}: {
  account: Account;
  onClose: () => void;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}) {
  const details = [
    ["Bank", account.bankName],
    ["Account type", account.accountType],
    ["Holder", account.accountHolderName],
    ["Account number", account.accountNumber],
    ["IBAN", account.iban],
    ["SWIFT/BIC", account.swiftCode],
    ["Routing number", account.routingNumber],
    ["Branch", account.branchName],
    ["Branch address", account.branchAddress],
    ["Opened", account.openedAt ? formatAppDate(account.openedAt) : null],
    [
      "Opening balance",
      formatCurrency(account.openingBalance, account.currency),
    ],
    [
      "Current balance",
      formatCurrency(accountBalance(account), account.currency),
    ],
    ["Notes", account.notes],
  ];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Account details"
    >
      <section className="modal-panel confirm-panel">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Account details</p>
            <h2>{account.accountName}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <dl className="detail-list">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "-"}</dd>
            </div>
          ))}
        </dl>
        <div className="confirm-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onEdit(account)}
          >
            Edit
          </button>
          <button
            className="primary-button danger-button"
            type="button"
            onClick={() => onDelete(account)}
          >
            Move to trash
          </button>
        </div>
      </section>
    </div>
  );
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyAccountForm);
  useCloseActionMenu(Boolean(activeMenuId), () => setActiveMenuId(null));

  const { data, error, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ data: Account[] }>("/accounts?pageSize=100"),
  });
  const { data: currencyData } = useQuery({
    queryKey: ["user-currencies"],
    queryFn: () => api<{ data: UserCurrency[] }>("/user-currencies"),
  });

  const userCurrencies = currencyData?.data ?? [];

  useEffect(() => {
    if (!form.currency && userCurrencies.length > 0) {
      setForm((current) => ({
        ...current,
        currency: userCurrencies[0]?.currencyCode ?? "",
      }));
    }
  }, [form.currency, userCurrencies]);

  const createAccount = useMutation({
    mutationFn: (payload: ReturnType<typeof payloadFromForm>) =>
      api<{ data: Account }>("/accounts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closeForm();
    },
  });

  const updateAccount = useMutation({
    mutationFn: (payload: {
      id: string;
      body: ReturnType<typeof payloadFromForm>;
    }) =>
      api<{ data: Account }>(`/accounts/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify(payload.body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closeForm();
    },
  });

  const deleteAccount = useMutation({
    mutationFn: (accountId: string) =>
      api<void>(`/accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAccountToDelete(null);
      setActiveMenuId(null);
    },
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const accounts = [...(data?.data ?? [])].filter((account) => {
    if (!normalizedSearch) return true;
    return [
      account.accountName,
      account.bankName,
      account.accountHolderName,
      account.accountNumber,
      account.iban,
      account.swiftCode,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });

  function updateField<K extends keyof AccountForm>(
    key: K,
    value: AccountForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingAccount(null);
    setForm({
      ...emptyAccountForm,
      currency: userCurrencies[0]?.currencyCode ?? "",
    });
    setShowForm(true);
  }

  function startEdit(account: Account) {
    setDetailAccount(null);
    setAccountToDelete(null);
    setEditingAccount(account);
    setForm(formFromAccount(account));
    setShowForm(true);
    setActiveMenuId(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingAccount(null);
    setForm({
      ...emptyAccountForm,
      currency: userCurrencies[0]?.currencyCode ?? "",
    });
  }

  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = payloadFromForm(form);
    if (editingAccount) {
      updateAccount.mutate({ id: editingAccount.id, body: payload });
      return;
    }
    createAccount.mutate(payload);
  }

  function requestDelete(account: Account) {
    setDetailAccount(null);
    setAccountToDelete(account);
    setActiveMenuId(null);
  }

  return (
    <section className="page">
      <header className="page-header records-header">
        <div className="records-title-block">
          <p className="eyebrow">Manage</p>
          <h1>Accounts</h1>
        </div>
        <div className="header-icon-actions">
          <button
            className="icon-button primary-icon"
            type="button"
            title="Add account"
            onClick={startCreate}
          >
            <Plus size={18} />
          </button>
        </div>
      </header>

      <div className="record-filters search-only">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Search accounts"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="form-error">Could not load accounts.</div>
      ) : null}
      {isLoading ? (
        <div className="empty-state">Loading accounts...</div>
      ) : null}
      {accounts.length === 0 && !isLoading ? (
        <div className="empty-state">
          No accounts yet. Add your first bank account.
        </div>
      ) : null}

      <div className="money-record-list">
        {accounts.map((account) => (
          <article className="money-record-card" key={account.id}>
            <button
              className="money-record-main"
              type="button"
              onClick={() => setDetailAccount(account)}
            >
              <div className="money-record-title">
                <Landmark size={18} />
                <div>
                  <strong>{account.accountName}</strong>
                  <span>{account.bankName}</span>
                </div>
              </div>
              <div className="money-record-grid">
                <div className="asset-value-cell">
                  <span>Type</span>
                  <strong>{account.accountType}</strong>
                </div>
                <div className="asset-value-cell">
                  <span>Balance</span>
                  <strong>
                    {formatCurrency(accountBalance(account), account.currency)}
                  </strong>
                </div>
                <div className="asset-value-cell">
                  <span>IBAN</span>
                  <strong>{account.iban || "-"}</strong>
                </div>
              </div>
            </button>
            <div className="row-menu-wrap">
              <button
                className="icon-button"
                type="button"
                title="Account actions"
                onClick={() =>
                  setActiveMenuId((current) =>
                    current === account.id ? null : account.id,
                  )
                }
              >
                <MoreVertical size={17} />
              </button>
              {activeMenuId === account.id ? (
                <div
                  className="action-menu"
                  role="menu"
                  aria-label={`${account.accountName} actions`}
                >
                  <button
                    type="button"
                    onClick={() => setDetailAccount(account)}
                  >
                    <Eye size={15} />
                    <span>Details</span>
                  </button>
                  <button type="button" onClick={() => startEdit(account)}>
                    <Pencil size={15} />
                    <span>Edit</span>
                  </button>
                  <button type="button" onClick={() => requestDelete(account)}>
                    <Trash2 size={15} />
                    <span>Move to trash</span>
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {showForm ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Account form"
        >
          <form className="modal-panel form-modal" onSubmit={submitAccount}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">
                  {editingAccount ? "Edit account" : "New account"}
                </p>
                <h2>Bank details</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close"
                onClick={closeForm}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-form-body">
              <div className="compact-form">
                <label>
                  Account name
                  <input
                    value={form.accountName}
                    onChange={(event) =>
                      updateField("accountName", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Bank name
                  <input
                    value={form.bankName}
                    onChange={(event) =>
                      updateField("bankName", event.target.value)
                    }
                    required
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Holder name
                  <input
                    value={form.accountHolderName}
                    onChange={(event) =>
                      updateField("accountHolderName", event.target.value)
                    }
                  />
                </label>
                <label>
                  Account type
                  <select
                    value={form.accountType}
                    onChange={(event) =>
                      updateField("accountType", event.target.value)
                    }
                  >
                    <option>Savings</option>
                    <option>Current</option>
                    <option>Checking</option>
                    <option>Fixed deposit</option>
                    <option>Business</option>
                    <option>Other</option>
                  </select>
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Account number
                  <input
                    value={form.accountNumber}
                    onChange={(event) =>
                      updateField("accountNumber", event.target.value)
                    }
                  />
                </label>
                <label>
                  IBAN
                  <input
                    value={form.iban}
                    onChange={(event) =>
                      updateField("iban", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  SWIFT/BIC
                  <input
                    value={form.swiftCode}
                    onChange={(event) =>
                      updateField("swiftCode", event.target.value)
                    }
                  />
                </label>
                <label>
                  Routing number
                  <input
                    value={form.routingNumber}
                    onChange={(event) =>
                      updateField("routingNumber", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Branch name
                  <input
                    value={form.branchName}
                    onChange={(event) =>
                      updateField("branchName", event.target.value)
                    }
                  />
                </label>
                <label>
                  Branch address
                  <input
                    value={form.branchAddress}
                    onChange={(event) =>
                      updateField("branchAddress", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Currency
                  <select
                    value={form.currency}
                    onChange={(event) =>
                      updateField("currency", event.target.value)
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
                <label>
                  Opened
                  <input
                    type="date"
                    value={form.openedAt}
                    onChange={(event) =>
                      updateField("openedAt", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Opening balance
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.openingBalance}
                    onChange={(event) =>
                      updateField("openingBalance", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Current balance
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.currentBalance}
                    onChange={(event) =>
                      updateField("currentBalance", event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  rows={3}
                />
              </label>
              {createAccount.error ? (
                <div className="form-error">{createAccount.error.message}</div>
              ) : null}
              {updateAccount.error ? (
                <div className="form-error">{updateAccount.error.message}</div>
              ) : null}
            </div>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={closeForm}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  createAccount.isPending ||
                  updateAccount.isPending ||
                  !form.accountName.trim() ||
                  !form.bankName.trim() ||
                  !form.currency
                }
              >
                {editingAccount ? "Save changes" : "Save account"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {detailAccount ? (
        <AccountDetails
          account={detailAccount}
          onClose={() => setDetailAccount(null)}
          onEdit={startEdit}
          onDelete={requestDelete}
        />
      ) : null}

      {accountToDelete ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Move account to trash"
        >
          <section className="modal-panel confirm-panel">
            <div>
              <p className="eyebrow">Move to trash</p>
              <h2>{accountToDelete.accountName}</h2>
            </div>
            <p className="muted-text">
              This account will be hidden from Accounts. Linked cards stay in
              Cards.
            </p>
            {deleteAccount.error ? (
              <div className="form-error">{deleteAccount.error.message}</div>
            ) : null}
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setAccountToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                disabled={deleteAccount.isPending}
                onClick={() => deleteAccount.mutate(accountToDelete.id)}
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

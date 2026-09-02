import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  Eye,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api, formatCurrency } from "../lib/api";
import { updateLocalCard } from "../lib/localsqlite";
import { useCloseActionMenu } from "../lib/usecloseactionmenu";

type UserCurrency = {
  id: string;
  currencyCode: string;
};

type AccountSummary = {
  id: string;
  accountName: string;
  bankName: string;
  currency: string;
};

type Card = {
  id: string;
  accountId?: string | null;
  cardName: string;
  cardholderName?: string | null;
  issuer?: string | null;
  network?: string | null;
  cardType: string;
  lastFour?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  currency: string;
  creditLimit?: string | null;
  availableLimit?: string | null;
  billingCycleDay?: number | null;
  paymentDueDay?: number | null;
  status: string;
  pinnedAt?: string | null;
  notes?: string | null;
  account?: AccountSummary | null;
  createdAt?: string;
  updatedAt?: string;
};

type CardForm = {
  accountId: string;
  cardName: string;
  cardholderName: string;
  issuer: string;
  network: string;
  cardType: string;
  lastFour: string;
  expiryMonth: string;
  expiryYear: string;
  currency: string;
  creditLimit: string;
  availableLimit: string;
  billingCycleDay: string;
  paymentDueDay: string;
  status: string;
  pinned: boolean;
  notes: string;
};

const emptyCardForm: CardForm = {
  accountId: "",
  cardName: "",
  cardholderName: "",
  issuer: "",
  network: "",
  cardType: "Debit",
  lastFour: "",
  expiryMonth: "",
  expiryYear: "",
  currency: "",
  creditLimit: "",
  availableLimit: "",
  billingCycleDay: "",
  paymentDueDay: "",
  status: "Active",
  pinned: false,
  notes: "",
};

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: string) {
  return value === "" ? null : Number(value);
}

function timeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareCards(left: Card, right: Card) {
  const pinnedSort = timeValue(right.pinnedAt) - timeValue(left.pinnedAt);
  if (pinnedSort !== 0) return pinnedSort;
  return (
    Math.max(timeValue(right.updatedAt), timeValue(right.createdAt)) -
    Math.max(timeValue(left.updatedAt), timeValue(left.createdAt))
  );
}

function expiryText(card: Pick<Card, "expiryMonth" | "expiryYear">) {
  if (!card.expiryMonth || !card.expiryYear) return "-";
  return `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`;
}

function cardNumberText(card: Card) {
  return card.lastFour ? `**** ${card.lastFour}` : "No number saved";
}

function formFromCard(card: Card): CardForm {
  return {
    accountId: card.accountId ?? "",
    cardName: card.cardName,
    cardholderName: card.cardholderName ?? "",
    issuer: card.issuer ?? "",
    network: card.network ?? "",
    cardType: card.cardType,
    lastFour: card.lastFour ?? "",
    expiryMonth: card.expiryMonth ? String(card.expiryMonth) : "",
    expiryYear: card.expiryYear ? String(card.expiryYear) : "",
    currency: card.currency,
    creditLimit: card.creditLimit ?? "",
    availableLimit: card.availableLimit ?? "",
    billingCycleDay: card.billingCycleDay ? String(card.billingCycleDay) : "",
    paymentDueDay: card.paymentDueDay ? String(card.paymentDueDay) : "",
    status: card.status,
    pinned: Boolean(card.pinnedAt),
    notes: card.notes ?? "",
  };
}

function payloadFromForm(form: CardForm, pinnedAt?: string | null) {
  return {
    accountId: form.accountId || null,
    cardName: form.cardName.trim(),
    cardholderName: optionalString(form.cardholderName),
    issuer: optionalString(form.issuer),
    network: optionalString(form.network),
    cardType: form.cardType,
    lastFour: optionalString(form.lastFour),
    expiryMonth: optionalNumber(form.expiryMonth),
    expiryYear: optionalNumber(form.expiryYear),
    currency: form.currency,
    creditLimit: form.creditLimit === "" ? null : form.creditLimit,
    availableLimit: form.availableLimit === "" ? null : form.availableLimit,
    billingCycleDay: optionalNumber(form.billingCycleDay),
    paymentDueDay: optionalNumber(form.paymentDueDay),
    status: form.status,
    pinnedAt: pinnedAt ?? (form.pinned ? new Date().toISOString() : null),
    notes: optionalString(form.notes),
  };
}

function payloadFromCard(card: Card, pinnedAt: string | null) {
  return payloadFromForm(formFromCard({ ...card, pinnedAt }), pinnedAt);
}

function CardDetails({
  card,
  onClose,
  onEdit,
  onDelete,
}: {
  card: Card;
  onClose: () => void;
  onEdit: (card: Card) => void;
  onDelete: (card: Card) => void;
}) {
  const details = [
    ["Card", card.cardName],
    ["Type", card.cardType],
    ["Status", card.status],
    ["Issuer", card.issuer],
    ["Network", card.network],
    [
      "Linked account",
      card.account
        ? `${card.account.accountName} - ${card.account.bankName}`
        : null,
    ],
    ["Cardholder", card.cardholderName],
    ["Number", cardNumberText(card)],
    ["Expiry", expiryText(card)],
    [
      "Credit limit",
      card.creditLimit ? formatCurrency(card.creditLimit, card.currency) : null,
    ],
    [
      "Available limit",
      card.availableLimit
        ? formatCurrency(card.availableLimit, card.currency)
        : null,
    ],
    [
      "Billing day",
      card.billingCycleDay ? `Day ${card.billingCycleDay}` : null,
    ],
    [
      "Payment due day",
      card.paymentDueDay ? `Day ${card.paymentDueDay}` : null,
    ],
    ["Pinned", card.pinnedAt ? "Yes" : "No"],
    ["Notes", card.notes],
  ];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Card details"
    >
      <section className="modal-panel confirm-panel">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Card details</p>
            <h2>{card.cardName}</h2>
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
            onClick={() => onEdit(card)}
          >
            Edit
          </button>
          <button
            className="primary-button danger-button"
            type="button"
            onClick={() => onDelete(card)}
          >
            Move to trash
          </button>
        </div>
      </section>
    </div>
  );
}

export function CardsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [cardToDelete, setCardToDelete] = useState<Card | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<CardForm>(emptyCardForm);
  useCloseActionMenu(Boolean(activeMenuId), () => setActiveMenuId(null));

  const { data, error, isLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: () => api<{ data: Card[] }>("/cards?pageSize=100"),
  });
  const { data: accountData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ data: AccountSummary[] }>("/accounts?pageSize=100"),
  });
  const { data: currencyData } = useQuery({
    queryKey: ["user-currencies"],
    queryFn: () => api<{ data: UserCurrency[] }>("/user-currencies"),
  });

  const accounts = accountData?.data ?? [];
  const userCurrencies = currencyData?.data ?? [];

  useEffect(() => {
    if (!form.currency && userCurrencies.length > 0) {
      setForm((current) => ({
        ...current,
        currency: userCurrencies[0]?.currencyCode ?? "",
      }));
    }
  }, [form.currency, userCurrencies]);

  const createCard = useMutation({
    mutationFn: (payload: ReturnType<typeof payloadFromForm>) =>
      api<{ data: Card }>("/cards", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closeForm();
    },
  });

  const updateCard = useMutation({
    mutationFn: (payload: {
      id: string;
      body: ReturnType<typeof payloadFromForm>;
    }) =>
      api<{ data: Card }>(`/cards/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify(payload.body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closeForm();
    },
  });

  const deleteCard = useMutation({
    mutationFn: (cardId: string) =>
      api<void>(`/cards/${cardId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setCardToDelete(null);
      setActiveMenuId(null);
    },
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const cards = [...(data?.data ?? [])].sort(compareCards).filter((card) => {
    if (!normalizedSearch) return true;
    return [
      card.cardName,
      card.cardholderName,
      card.issuer,
      card.network,
      card.cardType,
      card.lastFour,
      card.account?.accountName,
      card.account?.bankName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });

  function updateField<K extends keyof CardForm>(key: K, value: CardForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingCard(null);
    setForm({
      ...emptyCardForm,
      currency: userCurrencies[0]?.currencyCode ?? "",
    });
    setShowForm(true);
  }

  function startEdit(card: Card) {
    setDetailCard(null);
    setCardToDelete(null);
    setEditingCard(card);
    setForm(formFromCard(card));
    setShowForm(true);
    setActiveMenuId(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCard(null);
    setForm({
      ...emptyCardForm,
      currency: userCurrencies[0]?.currencyCode ?? "",
    });
  }

  function submitCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPinnedAt = editingCard
      ? form.pinned
        ? (editingCard.pinnedAt ?? new Date().toISOString())
        : null
      : undefined;
    const payload = payloadFromForm(form, nextPinnedAt);
    if (editingCard) {
      updateCard.mutate({ id: editingCard.id, body: payload });
      return;
    }
    createCard.mutate(payload);
  }

  function requestDelete(card: Card) {
    setDetailCard(null);
    setCardToDelete(card);
    setActiveMenuId(null);
  }

  function togglePinned(card: Card) {
    const pinnedAt = card.pinnedAt ? null : new Date().toISOString();
    const updatedCard = { ...card, pinnedAt };

    queryClient.setQueryData<{ data: Card[] }>(["cards"], (current) => ({
      data: (current?.data ?? []).map((item) =>
        item.id === card.id ? updatedCard : item,
      ),
    }));
    void updateLocalCard(card.id, { pinnedAt });
    setActiveMenuId(null);

    updateCard.mutate({
      id: card.id,
      body: payloadFromCard(card, pinnedAt),
    });
  }

  return (
    <section className="page">
      <header className="page-header records-header">
        <div className="records-title-block">
          <p className="eyebrow">Manage</p>
          <h1>Cards</h1>
        </div>
        <div className="header-icon-actions">
          <button
            className="icon-button primary-icon"
            type="button"
            title="Add card"
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
            aria-label="Search cards"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
      </div>

      {error ? <div className="form-error">Could not load cards.</div> : null}
      {isLoading ? <div className="empty-state">Loading cards...</div> : null}
      {cards.length === 0 && !isLoading ? (
        <div className="empty-state">
          No cards yet. Add a debit or credit card.
        </div>
      ) : null}

      <div className="money-record-list">
        {cards.map((card) => (
          <article
            className={`money-record-card card-record${card.pinnedAt ? " pinned" : ""}`}
            key={card.id}
          >
            <button
              className="money-record-main"
              type="button"
              onClick={() => setDetailCard(card)}
            >
              <div className="money-record-title">
                <CreditCard size={18} />
                <div>
                  <strong>
                    {card.cardName}
                    {card.pinnedAt ? (
                      <Pin
                        className="loan-pin-indicator"
                        size={14}
                        aria-label="Pinned card"
                      />
                    ) : null}
                  </strong>
                  <span>
                    {[card.issuer, card.network, cardNumberText(card)]
                      .filter(Boolean)
                      .join(" | ")}
                  </span>
                </div>
              </div>
              <div className="money-record-grid">
                <div className="asset-value-cell">
                  <span>Type</span>
                  <strong>{card.cardType}</strong>
                </div>
                <div className="asset-value-cell">
                  <span>Limit</span>
                  <strong>
                    {card.creditLimit
                      ? formatCurrency(card.creditLimit, card.currency)
                      : "-"}
                  </strong>
                </div>
                <div className="asset-value-cell">
                  <span>Due day</span>
                  <strong>
                    {card.paymentDueDay ? `Day ${card.paymentDueDay}` : "-"}
                  </strong>
                </div>
              </div>
            </button>
            <div className="row-menu-wrap">
              <button
                className="icon-button"
                type="button"
                title="Card actions"
                onClick={() =>
                  setActiveMenuId((current) =>
                    current === card.id ? null : card.id,
                  )
                }
              >
                <MoreVertical size={17} />
              </button>
              {activeMenuId === card.id ? (
                <div
                  className="action-menu"
                  role="menu"
                  aria-label={`${card.cardName} actions`}
                >
                  <button type="button" onClick={() => setDetailCard(card)}>
                    <Eye size={15} />
                    <span>Details</span>
                  </button>
                  <button type="button" onClick={() => togglePinned(card)}>
                    {card.pinnedAt ? <PinOff size={15} /> : <Pin size={15} />}
                    <span>{card.pinnedAt ? "Unpin card" : "Pin card"}</span>
                  </button>
                  <button type="button" onClick={() => startEdit(card)}>
                    <Pencil size={15} />
                    <span>Edit</span>
                  </button>
                  <button type="button" onClick={() => requestDelete(card)}>
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
          aria-label="Card form"
        >
          <form className="modal-panel form-modal" onSubmit={submitCard}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">
                  {editingCard ? "Edit card" : "New card"}
                </p>
                <h2>Card details</h2>
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
              <label>
                Linked account
                <select
                  value={form.accountId}
                  onChange={(event) =>
                    updateField("accountId", event.target.value)
                  }
                >
                  <option value="">No linked account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} - {account.bankName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="compact-form">
                <label>
                  Card name
                  <input
                    value={form.cardName}
                    onChange={(event) =>
                      updateField("cardName", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Cardholder
                  <input
                    value={form.cardholderName}
                    onChange={(event) =>
                      updateField("cardholderName", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Issuer
                  <input
                    value={form.issuer}
                    onChange={(event) =>
                      updateField("issuer", event.target.value)
                    }
                  />
                </label>
                <label>
                  Network
                  <input
                    value={form.network}
                    onChange={(event) =>
                      updateField("network", event.target.value)
                    }
                    placeholder="Visa, Mastercard, Amex"
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Card type
                  <select
                    value={form.cardType}
                    onChange={(event) =>
                      updateField("cardType", event.target.value)
                    }
                  >
                    <option>Debit</option>
                    <option>Credit</option>
                    <option>Prepaid</option>
                    <option>Virtual</option>
                    <option>Other</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateField("status", event.target.value)
                    }
                  >
                    <option>Active</option>
                    <option>Locked</option>
                    <option>Expired</option>
                    <option>Cancelled</option>
                  </select>
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Last 4 digits
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={form.lastFour}
                    onChange={(event) =>
                      updateField(
                        "lastFour",
                        event.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                  />
                </label>
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
              </div>
              <div className="compact-form">
                <label>
                  Expiry month
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={form.expiryMonth}
                    onChange={(event) =>
                      updateField("expiryMonth", event.target.value)
                    }
                  />
                </label>
                <label>
                  Expiry year
                  <input
                    type="number"
                    min="2000"
                    max="2100"
                    value={form.expiryYear}
                    onChange={(event) =>
                      updateField("expiryYear", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Credit limit
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.creditLimit}
                    onChange={(event) =>
                      updateField("creditLimit", event.target.value)
                    }
                  />
                </label>
                <label>
                  Available limit
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.availableLimit}
                    onChange={(event) =>
                      updateField("availableLimit", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="compact-form">
                <label>
                  Billing cycle day
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.billingCycleDay}
                    onChange={(event) =>
                      updateField("billingCycleDay", event.target.value)
                    }
                  />
                </label>
                <label>
                  Payment due day
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.paymentDueDay}
                    onChange={(event) =>
                      updateField("paymentDueDay", event.target.value)
                    }
                  />
                </label>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(event) =>
                    updateField("pinned", event.target.checked)
                  }
                />
                Pin card to top
              </label>
              <label>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  rows={3}
                />
              </label>
              {createCard.error ? (
                <div className="form-error">{createCard.error.message}</div>
              ) : null}
              {updateCard.error ? (
                <div className="form-error">{updateCard.error.message}</div>
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
                  createCard.isPending ||
                  updateCard.isPending ||
                  !form.cardName.trim() ||
                  !form.currency ||
                  (Boolean(form.lastFour) && form.lastFour.length !== 4)
                }
              >
                {editingCard ? "Save changes" : "Save card"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {detailCard ? (
        <CardDetails
          card={detailCard}
          onClose={() => setDetailCard(null)}
          onEdit={startEdit}
          onDelete={requestDelete}
        />
      ) : null}

      {cardToDelete ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Move card to trash"
        >
          <section className="modal-panel confirm-panel">
            <div>
              <p className="eyebrow">Move to trash</p>
              <h2>{cardToDelete.cardName}</h2>
            </div>
            <p className="muted-text">
              This card will be hidden from Cards. You can restore it from
              Settings, Trash.
            </p>
            {deleteCard.error ? (
              <div className="form-error">{deleteCard.error.message}</div>
            ) : null}
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setCardToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                disabled={deleteCard.isPending}
                onClick={() => deleteCard.mutate(cardToDelete.id)}
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

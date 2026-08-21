import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Copy, MoreVertical, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, formatCurrency } from "../lib/api";
import { useCloseActionMenu } from "../lib/useCloseActionMenu";

type LoanBalance = {
  currency: string;
  balance: string;
};

type Loan = {
  id: string;
  shareId: string;
  person: string;
  balances?: LoanBalance[];
};

function balanceClass(value: string | number) {
  const amount = Number(value);
  if (amount > 0) return "balance-positive";
  if (amount < 0) return "balance-negative";
  return "";
}

function shareUrl(shareId: string) {
  return `${window.location.origin}/l/${shareId}`;
}

export function LoansPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [loanToEdit, setLoanToEdit] = useState<Loan | null>(null);
  const [loanToDelete, setLoanToDelete] = useState<Loan | null>(null);
  const [person, setPerson] = useState("");
  const [editPerson, setEditPerson] = useState("");
  useCloseActionMenu(Boolean(activeMenuId), () => setActiveMenuId(null));
  const { data, error, isLoading } = useQuery({
    queryKey: ["loans"],
    queryFn: () => api<{ data: Loan[] }>("/loans")
  });
  const createLoan = useMutation({
    mutationFn: (payload: { person: string }) =>
      api<{ data: Loan }>("/loans", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setPerson("");
      setShowAdd(false);
    }
  });
  const deleteLoan = useMutation({
    mutationFn: (loanId: string) => api(`/loans/${loanId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setLoanToDelete(null);
      setActiveMenuId(null);
    }
  });
  const updateLoan = useMutation({
    mutationFn: (payload: { id: string; person: string }) =>
      api<{ data: Loan }>(`/loans/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify({ person: payload.person })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setLoanToEdit(null);
      setEditPerson("");
      setActiveMenuId(null);
    }
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const loans = (data?.data ?? []).filter((loan) => !normalizedSearch || loan.person.toLowerCase().includes(normalizedSearch));

  function submitLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createLoan.mutate({ person });
  }

  function openEditLoan(loan: Loan) {
    setLoanToEdit(loan);
    setEditPerson(loan.person);
    setActiveMenuId(null);
  }

  function submitEditLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loanToEdit) return;
    updateLoan.mutate({ id: loanToEdit.id, person: editPerson });
  }

  async function copyShareLink(shareId: string) {
    await navigator.clipboard?.writeText(shareUrl(shareId));
    setActiveMenuId(null);
  }

  return (
    <section className="page">
      <header className="page-header records-header">
        <div className="records-title-block">
          <p className="eyebrow">Manage</p>
          <h1>Loans</h1>
        </div>
        <div className="header-icon-actions">
          <button className="icon-button primary-icon" type="button" title="Add person" onClick={() => setShowAdd(true)}>
            <Plus size={18} />
          </button>
        </div>
      </header>

      <div className="record-filters search-only">
        <label className="search-box">
          <Search size={16} />
          <input aria-label="Search people" placeholder="Search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        </label>
      </div>

      {error ? <div className="form-error">Could not load loans.</div> : null}
      {isLoading ? <div className="empty-state">Loading loans...</div> : null}
      {loans.length === 0 && !isLoading ? <div className="empty-state">No loans yet. Add a person first.</div> : null}

      <div className="expense-list">
        {loans.map((loan) => (
          <article className="expense-card expense-card-row loan-tile" key={loan.id}>
            <Link className="expense-card-header" to={`/loans/${loan.id}`}>
              <div>
                <strong>{loan.person}</strong>
                <span>Share code {loan.shareId}</span>
              </div>
              <div className="expense-summary-row">
                {(loan.balances?.length ? loan.balances : [{ currency: "USD", balance: "0" }]).map((balance) => (
                  <div className="expense-summary-cell" key={balance.currency}>
                    <span>{balance.currency}</span>
                    <strong className={balanceClass(balance.balance)}>{formatCurrency(balance.balance, balance.currency)}</strong>
                  </div>
                ))}
              </div>
            </Link>
            <div className="row-menu-wrap">
              <button
                className="icon-button"
                type="button"
                title="Loan actions"
                onClick={() => setActiveMenuId((current) => (current === loan.id ? null : loan.id))}
              >
                <MoreVertical size={17} />
              </button>
              {activeMenuId === loan.id ? (
                <div className="action-menu" role="menu" aria-label={`${loan.person} actions`}>
                  <button type="button" onClick={() => copyShareLink(loan.shareId)}>
                    <Copy size={15} />
                    <span>Share link</span>
                  </button>
                  <button type="button" onClick={() => openEditLoan(loan)}>
                    <Pencil size={15} />
                    <span>Edit name</span>
                  </button>
                  <button type="button" onClick={() => setLoanToDelete(loan)}>
                    <Trash2 size={15} />
                    <span>Move to trash</span>
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {showAdd ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add loan person">
          <form className="modal-panel form-modal confirm-panel" onSubmit={submitLoan}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">New loan</p>
                <h2>Person</h2>
              </div>
              <button className="icon-button" type="button" title="Close" onClick={() => setShowAdd(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-form-body">
              <label>
                Person name
                <input value={person} onChange={(event) => setPerson(event.target.value)} required />
              </label>
              {createLoan.error ? <div className="form-error">{createLoan.error.message}</div> : null}
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button className="primary-button" disabled={createLoan.isPending || !person.trim()}>
                Save person
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {loanToEdit ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit loan name">
          <form className="modal-panel form-modal confirm-panel" onSubmit={submitEditLoan}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Edit</p>
                <h2>Loan name</h2>
              </div>
              <button className="icon-button" type="button" title="Close" onClick={() => setLoanToEdit(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-form-body">
              <label>
                Person name
                <input value={editPerson} onChange={(event) => setEditPerson(event.target.value)} required />
              </label>
              {updateLoan.error ? <div className="form-error">{updateLoan.error.message}</div> : null}
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setLoanToEdit(null)}>
                Cancel
              </button>
              <button className="primary-button" disabled={updateLoan.isPending || !editPerson.trim()}>
                Save name
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {loanToDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete loan">
          <div className="modal-panel confirm-panel">
            <div>
              <p className="eyebrow">Confirm</p>
              <h2>Move loan to Trash?</h2>
            </div>
            <p className="muted-text">
              {loanToDelete.person} will be hidden from Loans. You can restore it from Settings, Trash.
            </p>
            {deleteLoan.error ? <div className="form-error">{deleteLoan.error.message}</div> : null}
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setLoanToDelete(null)}>
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                disabled={deleteLoan.isPending}
                onClick={() => deleteLoan.mutate(loanToDelete.id)}
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

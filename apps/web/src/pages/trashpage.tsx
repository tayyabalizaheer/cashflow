import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type TrashItem = {
  id: string;
  type: string;
  label: string;
  title: string;
  archivedAt: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function sameTrashItem(left: TrashItem, right: TrashItem) {
  return left.id === right.id && left.type === right.type;
}

export function TrashPage() {
  const queryClient = useQueryClient();
  const [itemToDelete, setItemToDelete] = useState<TrashItem | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: () => api<{ data: TrashItem[] }>("/trash"),
  });

  function removeItemFromTrash(item: TrashItem) {
    queryClient.setQueryData<{ data: TrashItem[] }>(["trash"], (current) =>
      current
        ? {
            ...current,
            data: current.data.filter(
              (trashItem) => !sameTrashItem(trashItem, item),
            ),
          }
        : current,
    );
  }

  const restoreItem = useMutation({
    mutationFn: (item: TrashItem) =>
      api(`/trash/${item.type}/${item.id}/restore`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });

  const permanentlyDelete = useMutation({
    mutationFn: (item: TrashItem) =>
      api(`/trash/${item.type}/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      setItemToDelete(null);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });

  function restoreTrashItem(item: TrashItem) {
    removeItemFromTrash(item);
    restoreItem.mutate(item);
  }

  function deleteTrashItemForever(item: TrashItem) {
    removeItemFromTrash(item);
    setItemToDelete(null);
    permanentlyDelete.mutate(item);
  }

  const items = data?.data ?? [];

  return (
    <section className="page">
      <header className="page-header records-header">
        <div className="records-title-block">
          <p className="eyebrow">Settings</p>
          <div className="title-actions">
            <Link
              className="icon-button"
              to="/settings"
              title="Back to settings"
            >
              <ArrowLeft size={17} />
            </Link>
            <h1>Trash</h1>
          </div>
        </div>
      </header>

      {error ? <div className="form-error">Could not load Trash.</div> : null}
      {isLoading ? <div className="empty-state">Loading Trash...</div> : null}
      {!isLoading && items.length === 0 ? (
        <div className="empty-state">Trash is empty.</div>
      ) : null}

      <div className="trash-list">
        {items.map((item) => (
          <article
            className="expense-card trash-row"
            key={`${item.type}-${item.id}`}
          >
            <div>
              <span className="trash-label">{item.label}</span>
              <strong>{item.title}</strong>
              <small>Deleted {formatDate(item.archivedAt)}</small>
            </div>
            <div className="transaction-actions">
              <button
                className="icon-button"
                type="button"
                title="Restore"
                onClick={() => restoreTrashItem(item)}
                disabled={restoreItem.isPending}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="icon-button danger-icon"
                type="button"
                title="Delete permanently"
                onClick={() => setItemToDelete(item)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {itemToDelete ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Delete permanently"
        >
          <div className="modal-panel confirm-panel">
            <div>
              <p className="eyebrow">Permanent delete</p>
              <h2>Delete forever?</h2>
            </div>
            <p className="muted-text">
              {itemToDelete.title} will be permanently removed and cannot be
              restored.
            </p>
            {permanentlyDelete.error ? (
              <div className="form-error">
                {permanentlyDelete.error.message}
              </div>
            ) : null}
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                disabled={permanentlyDelete.isPending}
                onClick={() => deleteTrashItemForever(itemToDelete)}
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

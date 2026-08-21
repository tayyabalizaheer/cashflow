import initSqlJs from "sql.js";
import type { Database, SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { API_URL } from "./config";
import { getAccessToken } from "./sessionToken";

const storageDbName = "cash-flow-browser-sqlite";
const storageStoreName = "database";
const storageKey = "cash-flow.sqlite";

let dbPromise: Promise<Database> | null = null;

export type BootstrapProgress = {
  percent: number;
  message: string;
};

export type BootstrapSummary = {
  total: number;
  modules: Array<{ module: string; count: number }>;
};

export type OfflineMutation = {
  id: string;
  path: string;
  method: string;
  body?: string;
  createdAt: string;
  localData?: unknown;
};

type LocalAttachment = {
  id: string;
  entityType: string;
  entityId: string;
  fileName?: string | null;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  localMutationId?: string | null;
};

function openStorageDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(storageDbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storageStoreName)) {
        db.createObjectStore(storageStoreName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDatabaseBytes() {
  const storage = await openStorageDb();
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const transaction = storage.transaction(storageStoreName, "readonly");
    const request = transaction.objectStore(storageStoreName).get(storageKey);
    request.onsuccess = () => resolve(request.result as Uint8Array | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => storage.close();
  });
}

async function writeDatabaseBytes(bytes: Uint8Array) {
  const storage = await openStorageDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = storage.transaction(storageStoreName, "readwrite");
    transaction.objectStore(storageStoreName).put(bytes, storageKey);
    transaction.oncomplete = () => {
      storage.close();
      resolve();
    };
    transaction.onerror = () => {
      storage.close();
      reject(transaction.error);
    };
  });
}

async function persistDatabase(db: Database) {
  await writeDatabaseBytes(db.export());
}

function createSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS local_records (
      module TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (module, id)
    );

    CREATE TABLE IF NOT EXISTS local_mutations (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      method TEXT NOT NULL,
      body TEXT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS local_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_attachments (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      file_name TEXT,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      local_mutation_id TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_attachments_entity
      ON local_attachments (entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_local_attachments_mutation
      ON local_attachments (local_mutation_id);
  `);
}

export async function getLocalDatabase() {
  dbPromise ??= (async () => {
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    const bytes = await readDatabaseBytes();
    const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    createSchema(db);
    await persistDatabase(db);
    return db;
  })().catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function serialize(value: unknown) {
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested,
  );
}

function rowsFromResult<T>(values: SqlValue[][], columns: string[]) {
  return values.map((row) =>
    columns.reduce<Record<string, SqlValue>>((acc, column, index) => {
      acc[column] = row[index] ?? null;
      return acc;
    }, {}),
  ) as T[];
}

function replaceModule(
  db: Database,
  module: string,
  records: Array<Record<string, unknown>>,
  syncedAt: string,
) {
  db.run("DELETE FROM local_records WHERE module = ?", [module]);
  const statement = db.prepare(`
    INSERT OR REPLACE INTO local_records (module, id, payload, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    for (const record of records) {
      statement.run([
        module,
        String(record.id ?? crypto.randomUUID()),
        serialize(record),
        String(record.updatedAt ?? record.updated_at ?? syncedAt),
        syncedAt,
      ]);
    }
  } finally {
    statement.free();
  }
}

function upsertLocalRecord(
  db: Database,
  module: string,
  record: Record<string, unknown>,
  syncedAt: string,
) {
  db.run(
    `
    INSERT OR REPLACE INTO local_records (module, id, payload, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    [
      module,
      String(record.id ?? crypto.randomUUID()),
      serialize(record),
      String(record.updatedAt ?? record.updated_at ?? syncedAt),
      syncedAt,
    ],
  );
}

function readModuleRecords(db: Database, module: string) {
  const result = db.exec(
    "SELECT payload FROM local_records WHERE module = ? ORDER BY updated_at DESC",
    [module],
  )[0];
  if (!result) return [];
  return result.values
    .map((row) => {
      const payload = row[0];
      if (typeof payload !== "string") return null;
      return JSON.parse(payload) as Record<string, unknown>;
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function readActiveModuleRecords(db: Database, module: string) {
  return readModuleRecords(db, module).filter((record) => !record.archivedAt);
}

function deleteLocalRecord(db: Database, module: string, id: string) {
  db.run("DELETE FROM local_records WHERE module = ? AND id = ?", [module, id]);
}

function trashModuleForType(type: string) {
  const map: Record<string, string> = {
    loans: "loans",
    expenses: "expenses",
    investments: "investments",
    assets: "assets",
  };
  return map[type];
}

function trashLabelForType(type: string) {
  const map: Record<string, string> = {
    loans: "Loan",
    "loan-transactions": "Loan transaction",
    expenses: "Expense",
    investments: "Investment",
    assets: "Asset",
  };
  return map[type] ?? "Record";
}

function trashTitleForRecord(type: string, record: Record<string, unknown>) {
  if (type === "loans") return String(record.person ?? "Loan");
  if (type === "expenses")
    return String(record.name ?? record.purpose ?? "Expense");
  if (type === "investments")
    return String(record.name ?? record.type ?? "Investment");
  if (type === "assets") return String(record.name ?? "Asset");
  return "Record";
}

function localTrashItems(db: Database) {
  const types = ["loans", "expenses", "investments", "assets"];
  const moduleItems = types.flatMap((type) => {
    const module = trashModuleForType(type);
    if (!module) return [];
    return readModuleRecords(db, module)
      .filter((record) => record.archivedAt)
      .map((record) => ({
        id: String(record.id),
        type,
        label: trashLabelForType(type),
        title: trashTitleForRecord(type, record),
        archivedAt: String(record.archivedAt),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }));
  });
  const loanTransactionItems = readModuleRecords(db, "loans").flatMap((loan) => {
    const transactions = Array.isArray(loan.transactions)
      ? (loan.transactions.filter(isRecord) as Array<Record<string, unknown>>)
      : [];
    return transactions
      .filter((transaction) => transaction.archivedAt)
      .map((transaction) => ({
        id: String(transaction.id),
        type: "loan-transactions",
        label: trashLabelForType("loan-transactions"),
        title: String(transaction.purpose ?? loan.person ?? "Loan transaction"),
        archivedAt: String(transaction.archivedAt),
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      }));
  });
  return [...moduleItems, ...loanTransactionItems].sort(
    (left, right) =>
      new Date(right.archivedAt).getTime() -
      new Date(left.archivedAt).getTime(),
  );
}

function fiveCharId() {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from(
    { length: 5 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function balanceClassAmount(transaction: Record<string, unknown>) {
  return transaction.kind === "DEBIT"
    ? -Number(transaction.amount ?? 0)
    : Number(transaction.amount ?? 0);
}

function loanBalancesFromTransactions(
  transactions: Array<Record<string, unknown>>,
) {
  const balances = new Map<string, number>();
  transactions.forEach((transaction) => {
    const currency = String(transaction.currency ?? "USD");
    balances.set(
      currency,
      (balances.get(currency) ?? 0) + balanceClassAmount(transaction),
    );
  });
  return [...balances.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, balance]) => ({ currency, balance: balance.toFixed(4) }));
}

function writeLoanWithBalances(
  db: Database,
  loan: Record<string, unknown>,
  syncedAt: string,
) {
  const transactions = Array.isArray(loan.transactions)
    ? (loan.transactions.filter(isRecord) as Array<Record<string, unknown>>)
    : [];
  const activeTransactions = transactions.filter(
    (transaction) => !transaction.archivedAt,
  );
  upsertLocalRecord(
    db,
    "loans",
    {
      ...loan,
      balances: loanBalancesFromTransactions(activeTransactions),
      transactions,
    },
    syncedAt,
  );
}

function applyLocalMutation(db: Database, mutation: OfflineMutation) {
  const now = mutation.createdAt;
  const loanDeleteMatch = mutation.path.match(/^\/loans\/([^/]+)$/);
  if (mutation.method === "DELETE" && loanDeleteMatch) {
    const loanId = loanDeleteMatch[1]!;
    const loan = readModuleRecords(db, "loans").find(
      (item) => item.id === loanId,
    );
    if (loan) {
      const archivedLoan = { ...loan, archivedAt: now, updatedAt: now };
      writeLoanWithBalances(db, archivedLoan, now);
      return archivedLoan;
    }
    return { archivedAt: now };
  }

  const assetDeleteMatch = mutation.path.match(/^\/assets\/([^/]+)$/);
  if (mutation.method === "DELETE" && assetDeleteMatch) {
    const assetId = assetDeleteMatch[1]!;
    const assets = readModuleRecords(db, "assets");
    const asset = assets.find((item) => item.id === assetId);
    if (asset?.sourceExpenseId) {
      assets
        .filter((item) => item.sourceExpenseId === asset.sourceExpenseId)
        .forEach((item) =>
          upsertLocalRecord(
            db,
            "assets",
            { ...item, archivedAt: now, updatedAt: now },
            now,
          ),
        );
      return { archivedAt: now };
    }
    if (asset) {
      const archivedAsset = { ...asset, archivedAt: now, updatedAt: now };
      upsertLocalRecord(db, "assets", archivedAsset, now);
      return archivedAsset;
    }
    return { archivedAt: now };
  }

  const trashRestoreMatch = mutation.path.match(
    /^\/trash\/([^/]+)\/([^/]+)\/restore$/,
  );
  if (mutation.method === "POST" && trashRestoreMatch) {
    const [, type, id] = trashRestoreMatch;
    if (type === "loan-transactions" && id) {
      const loan = readModuleRecords(db, "loans").find(
        (item) =>
          Array.isArray(item.transactions) &&
          item.transactions.some(
            (transaction) => isRecord(transaction) && transaction.id === id,
          ),
      );
      if (loan) {
        const transactions = Array.isArray(loan.transactions)
          ? (loan.transactions.filter(isRecord) as Array<
              Record<string, unknown>
            >)
          : [];
        const updatedTransactions = transactions.map((transaction) =>
          transaction.id === id
            ? { ...transaction, archivedAt: null, updatedAt: now }
            : transaction,
        );
        writeLoanWithBalances(
          db,
          { ...loan, transactions: updatedTransactions, updatedAt: now },
          now,
        );
        return updatedTransactions.find((transaction) => transaction.id === id);
      }
    }
    const module = trashModuleForType(type ?? "");
    const record = module
      ? readModuleRecords(db, module).find((item) => item.id === id)
      : null;
    if (module && record) {
      const restoredRecord = { ...record, archivedAt: null, updatedAt: now };
      upsertLocalRecord(db, module, restoredRecord, now);
      return restoredRecord;
    }
  }

  const trashDeleteMatch = mutation.path.match(/^\/trash\/([^/]+)\/([^/]+)$/);
  if (mutation.method === "DELETE" && trashDeleteMatch) {
    const [, type, id] = trashDeleteMatch;
    if (type === "loan-transactions" && id) {
      const loan = readModuleRecords(db, "loans").find(
        (item) =>
          Array.isArray(item.transactions) &&
          item.transactions.some(
            (transaction) => isRecord(transaction) && transaction.id === id,
          ),
      );
      if (loan) {
        const transactions = Array.isArray(loan.transactions)
          ? (loan.transactions.filter(isRecord) as Array<
              Record<string, unknown>
            >)
          : [];
        writeLoanWithBalances(
          db,
          {
            ...loan,
            transactions: transactions.filter(
              (transaction) => transaction.id !== id,
            ),
            updatedAt: now,
          },
          now,
        );
        db.run(
          "DELETE FROM local_attachments WHERE entity_type = ? AND entity_id = ?",
          ["LOAN_TRANSACTION", id],
        );
      }
      return { deleted: true };
    }
    const module = trashModuleForType(type ?? "");
    if (module && id) deleteLocalRecord(db, module, id);
    return { deleted: true };
  }

  if (!mutation.body) return undefined;
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(mutation.body) as unknown;
    if (!isRecord(parsed)) return undefined;
    payload = parsed;
  } catch {
    return undefined;
  }

  if (mutation.method === "POST" && mutation.path === "/loans") {
    const localLoan = {
      id: typeof payload.id === "string" ? payload.id : crypto.randomUUID(),
      shareId:
        typeof payload.shareId === "string" ? payload.shareId : fiveCharId(),
      person: String(payload.person ?? ""),
      balances: [],
      transactions: [],
      createdAt: now,
      updatedAt: now,
    };
    mutation.body = serialize({
      ...payload,
      id: localLoan.id,
      shareId: localLoan.shareId,
    });
    writeLoanWithBalances(db, localLoan, now);
    return localLoan;
  }

  if (mutation.method === "POST" && mutation.path === "/assets") {
    const localAsset = {
      id: typeof payload.id === "string" ? payload.id : crypto.randomUUID(),
      name: String(payload.name ?? ""),
      assetType: String(payload.assetType ?? "Other"),
      value: payload.value ?? "0",
      currency: payload.currency,
      sourceExpenseId: payload.sourceExpenseId ?? null,
      sourceCurrency: payload.sourceCurrency ?? null,
      acquisitionDate: payload.acquisitionDate ?? null,
      valuationDate: payload.valuationDate ?? null,
      zakatEligible: Boolean(payload.zakatEligible),
      zakatPercentage: payload.zakatPercentage ?? 100,
      notes: payload.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    mutation.body = serialize({ ...payload, id: localAsset.id });
    upsertLocalRecord(db, "assets", localAsset, now);
    return localAsset;
  }

  if (mutation.method === "POST" && mutation.path === "/investments") {
    const localInvestment = {
      id: typeof payload.id === "string" ? payload.id : crypto.randomUUID(),
      type: String(payload.type ?? ""),
      name: payload.name ?? null,
      amountInvested: payload.amountInvested ?? "0",
      currency: payload.currency,
      quantity: payload.quantity ?? null,
      nav: payload.nav ?? null,
      currentValue: payload.currentValue ?? null,
      purchaseDate: payload.purchaseDate ?? null,
      latestValuationDate: payload.latestValuationDate ?? null,
      zakatEligible: Boolean(payload.zakatEligible),
      zakatPercentage: payload.zakatPercentage ?? 100,
      notes: payload.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    mutation.body = serialize({ ...payload, id: localInvestment.id });
    upsertLocalRecord(db, "investments", localInvestment, now);
    return localInvestment;
  }

  const loanUpdateMatch = mutation.path.match(/^\/loans\/([^/]+)$/);
  if (mutation.method === "PUT" && loanUpdateMatch) {
    const loanId = loanUpdateMatch[1]!;
    const loan = readActiveModuleRecords(db, "loans").find(
      (item) => item.id === loanId,
    );
    if (loan) {
      const updatedLoan = {
        ...loan,
        person: String(payload.person ?? loan.person ?? ""),
        purpose: String(payload.person ?? loan.purpose ?? ""),
        updatedAt: now,
      };
      writeLoanWithBalances(db, updatedLoan, now);
      return updatedLoan;
    }
  }

  const loanTransactionMatch = mutation.path.match(
    /^\/loans\/([^/]+)\/transactions$/,
  );
  if (mutation.method === "POST" && loanTransactionMatch) {
    const loanId = loanTransactionMatch[1]!;
    const loan = readActiveModuleRecords(db, "loans").find(
      (item) => item.id === loanId,
    );
    const localTransaction = {
      id: typeof payload.id === "string" ? payload.id : crypto.randomUUID(),
      loanId,
      kind: payload.kind,
      purpose: payload.purpose,
      amount: payload.amount,
      currency: payload.currency,
      transactionDate: payload.transactionDate ?? now,
      notes: payload.notes ?? null,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments
        : [],
      createdAt: now,
      updatedAt: now,
    };
    mutation.body = serialize({ ...payload, id: localTransaction.id });
    if (loan) {
      const transactions = Array.isArray(loan.transactions)
        ? [
            ...(loan.transactions.filter(isRecord) as Array<
              Record<string, unknown>
            >),
            localTransaction,
          ]
        : [localTransaction];
      writeLoanWithBalances(db, { ...loan, transactions, updatedAt: now }, now);
    }
    return localTransaction;
  }

  const loanTransactionUpdateMatch = mutation.path.match(
    /^\/loans\/([^/]+)\/transactions\/([^/]+)$/,
  );
  if (mutation.method === "PUT" && loanTransactionUpdateMatch) {
    const [, loanId, transactionId] = loanTransactionUpdateMatch;
    const loan = readActiveModuleRecords(db, "loans").find(
      (item) => item.id === loanId,
    );
    if (loan && transactionId) {
      const transactions = Array.isArray(loan.transactions)
        ? (loan.transactions.filter(isRecord) as Array<Record<string, unknown>>)
        : [];
      const updatedTransactions = transactions.map((transaction) =>
        transaction.id === transactionId
          ? {
              ...transaction,
              kind: payload.kind,
              purpose: payload.purpose,
              amount: payload.amount,
              currency: payload.currency,
              transactionDate:
                payload.transactionDate ?? transaction.transactionDate,
              notes: payload.notes ?? null,
              attachments: Array.isArray(payload.attachments)
                ? payload.attachments
                : transaction.attachments,
              updatedAt: now,
            }
          : transaction,
      );
      writeLoanWithBalances(
        db,
        { ...loan, transactions: updatedTransactions, updatedAt: now },
        now,
      );
      return updatedTransactions.find(
        (transaction) => transaction.id === transactionId,
      );
    }
  }

  if (mutation.method === "DELETE" && loanTransactionUpdateMatch) {
    const [, loanId, transactionId] = loanTransactionUpdateMatch;
    const loan = readActiveModuleRecords(db, "loans").find(
      (item) => item.id === loanId,
    );
    if (loan && transactionId) {
      const transactions = Array.isArray(loan.transactions)
        ? (loan.transactions.filter(isRecord) as Array<Record<string, unknown>>)
        : [];
      const updatedTransactions = transactions.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, archivedAt: now, updatedAt: now }
          : transaction,
      );
      writeLoanWithBalances(
        db,
        { ...loan, transactions: updatedTransactions, updatedAt: now },
        now,
      );
      return updatedTransactions.find(
        (transaction) => transaction.id === transactionId,
      );
    }
    return { archivedAt: now };
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function attachmentFromRecord(
  value: unknown,
  fallbackId: string,
): LocalAttachment | null {
  if (
    !isRecord(value) ||
    typeof value.dataBase64 !== "string" ||
    typeof value.mimeType !== "string"
  )
    return null;
  return {
    id: typeof value.id === "string" ? value.id : fallbackId,
    entityType: "",
    entityId: "",
    fileName: typeof value.fileName === "string" ? value.fileName : null,
    mimeType: value.mimeType,
    dataBase64: value.dataBase64,
    sizeBytes: Number(value.sizeBytes ?? 0),
  };
}

function collectBootstrapAttachments(
  module: string,
  records: Array<Record<string, unknown>>,
) {
  const attachments: LocalAttachment[] = [];

  records.forEach((record) => {
    if (module === "expenses" && Array.isArray(record.transactions)) {
      record.transactions.forEach((transaction) => {
        if (
          !isRecord(transaction) ||
          typeof transaction.id !== "string" ||
          !Array.isArray(transaction.attachments)
        )
          return;
        const transactionId = transaction.id;
        transaction.attachments.forEach((attachment, attachmentIndex) => {
          const item = attachmentFromRecord(
            attachment,
            `${transactionId}-${attachmentIndex}`,
          );
          if (item)
            attachments.push({
              ...item,
              entityType: "EXPENSE_TRANSACTION",
              entityId: transactionId,
            });
        });
      });
    }

    if (module === "loans" && Array.isArray(record.transactions)) {
      record.transactions.forEach((transaction) => {
        if (
          !isRecord(transaction) ||
          typeof transaction.id !== "string" ||
          !Array.isArray(transaction.attachments)
        )
          return;
        const transactionId = transaction.id;
        transaction.attachments.forEach((attachment, attachmentIndex) => {
          const item = attachmentFromRecord(
            attachment,
            `${transactionId}-${attachmentIndex}`,
          );
          if (item)
            attachments.push({
              ...item,
              entityType: "LOAN_TRANSACTION",
              entityId: transactionId,
            });
        });
      });
    }

    if (typeof record.id === "string" && Array.isArray(record.attachments)) {
      const recordId = record.id;
      record.attachments.forEach((attachment, attachmentIndex) => {
        const item = attachmentFromRecord(
          attachment,
          `${recordId}-${attachmentIndex}`,
        );
        if (item)
          attachments.push({
            ...item,
            entityType: module.toUpperCase(),
            entityId: recordId,
          });
      });
    }
  });

  return attachments;
}

function insertAttachments(
  db: Database,
  attachments: LocalAttachment[],
  syncedAt: string,
) {
  if (attachments.length === 0) return;

  const statement = db.prepare(`
    INSERT OR REPLACE INTO local_attachments
      (id, entity_type, entity_id, file_name, mime_type, data_base64, size_bytes, local_mutation_id, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    attachments.forEach((attachment) => {
      statement.run([
        attachment.id,
        attachment.entityType,
        attachment.entityId,
        attachment.fileName ?? null,
        attachment.mimeType,
        attachment.dataBase64,
        attachment.sizeBytes,
        attachment.localMutationId ?? null,
        syncedAt,
      ]);
    });
  } finally {
    statement.free();
  }
}

function mutationAttachmentTarget(path: string, mutationId: string) {
  const expenseTransactionMatch = path.match(
    /^\/expenses\/[^/]+\/transactions(?:\/([^/]+))?/,
  );
  if (expenseTransactionMatch) {
    return {
      entityType: "EXPENSE_TRANSACTION",
      entityId: expenseTransactionMatch[1] ?? mutationId,
    };
  }

  const loanTransactionMatch = path.match(
    /^\/loans\/[^/]+\/transactions(?:\/([^/]+))?/,
  );
  if (loanTransactionMatch) {
    return {
      entityType: "LOAN_TRANSACTION",
      entityId: loanTransactionMatch[1] ?? mutationId,
    };
  }

  return {
    entityType: "PENDING_MUTATION",
    entityId: mutationId,
  };
}

function collectMutationAttachments(mutation: OfflineMutation) {
  if (!mutation.body) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(mutation.body) as unknown;
  } catch {
    return [];
  }
  if (!isRecord(payload) || !Array.isArray(payload.attachments)) return [];

  const target = mutationAttachmentTarget(mutation.path, mutation.id);
  return payload.attachments.flatMap((attachment, index) => {
    const item = attachmentFromRecord(attachment, `${mutation.id}-${index}`);
    return item ? [{ ...item, ...target, localMutationId: mutation.id }] : [];
  });
}

export async function bootstrapLocalData(
  onProgress: (progress: BootstrapProgress) => void,
) {
  const token = getAccessToken();
  if (!token) throw new Error("Sign in again to load your data.");

  onProgress({ percent: 5, message: "Connecting to server" });
  const response = await fetch(`${API_URL}/sync/bootstrap`, {
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Could not load your server data.");
  }

  const body = (await response.json()) as { data: Record<string, unknown> };
  const syncedAt = String(body.data.fetchedAt ?? new Date().toISOString());
  const db = await getLocalDatabase();
  const modules = [
    ["expenses", body.data.expenses],
    ["loans", body.data.loans],
    ["investments", body.data.investments],
    ["assets", body.data.assets],
  ] as const;

  db.run("BEGIN TRANSACTION");
  try {
    db.run("DELETE FROM local_attachments WHERE local_mutation_id IS NULL");
    modules.forEach(([module, records], index) => {
      const safeRecords = Array.isArray(records)
        ? (records as Array<Record<string, unknown>>)
        : [];
      replaceModule(db, module, safeRecords, syncedAt);
      insertAttachments(
        db,
        collectBootstrapAttachments(module, safeRecords),
        syncedAt,
      );
      const percent = Math.round(((index + 1) / modules.length) * 90) + 5;
      onProgress({
        percent: Math.min(percent, 95),
        message: `Saving ${module}`,
      });
    });
    db.run("INSERT OR REPLACE INTO local_metadata (key, value) VALUES (?, ?)", [
      "last_bootstrap_at",
      syncedAt,
    ]);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await persistDatabase(db);
  onProgress({ percent: 100, message: "Local data ready" });
}

export async function resetLocalDatabase() {
  const db = await getLocalDatabase();
  db.run("BEGIN TRANSACTION");
  try {
    db.run("DELETE FROM local_attachments");
    db.run("DELETE FROM local_mutations");
    db.run("DELETE FROM local_metadata");
    db.run("DELETE FROM local_records");
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
  await persistDatabase(db);
}

export async function localResponseForPath(path: string) {
  const db = await getLocalDatabase();
  if (path === "/loans") {
    return { data: readActiveModuleRecords(db, "loans") };
  }
  const loanMatch = path.match(/^\/loans\/([^/]+)$/);
  if (loanMatch) {
    const loan = readActiveModuleRecords(db, "loans").find(
      (item) => item.id === loanMatch[1],
    );
    if (loan) return { data: loan };
  }
  const loanShareMatch = path.match(/^\/loans\/share\/([^/]+)$/);
  if (loanShareMatch) {
    const loan = readActiveModuleRecords(db, "loans").find(
      (item) => item.shareId === loanShareMatch[1],
    );
    if (loan) return { data: loan };
  }
  const publicLoanShareMatch = path.match(/^\/public\/loans\/([^/]+)$/);
  if (publicLoanShareMatch) {
    const loan = readActiveModuleRecords(db, "loans").find(
      (item) => item.shareId === publicLoanShareMatch[1],
    );
    if (loan) return { data: loan };
  }
  if (path === "/trash") return { data: localTrashItems(db) };
  const moduleMap: Record<string, string> = {
    "/expenses": "expenses",
    "/investments": "investments",
    "/assets": "assets",
  };
  const module = moduleMap[path.split("?")[0] ?? path];
  if (module) return { data: readActiveModuleRecords(db, module) };
  return null;
}

export async function queueLocalMutation(
  input: Pick<OfflineMutation, "path" | "method" | "body">,
) {
  const db = await getLocalDatabase();
  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  mutation.localData = applyLocalMutation(db, mutation);

  db.run(
    "INSERT INTO local_mutations (id, path, method, body, created_at, status) VALUES (?, ?, ?, ?, ?, 'PENDING')",
    [
      mutation.id,
      mutation.path,
      mutation.method,
      mutation.body ?? null,
      mutation.createdAt,
    ],
  );
  insertAttachments(
    db,
    collectMutationAttachments(mutation),
    mutation.createdAt,
  );
  await persistDatabase(db);
  return mutation;
}

export async function listLocalMutations() {
  const db = await getLocalDatabase();
  const result = db.exec(
    "SELECT id, path, method, body, created_at as createdAt FROM local_mutations WHERE status = 'PENDING' ORDER BY created_at ASC",
  )[0];

  if (!result) return [];
  return rowsFromResult<OfflineMutation>(result.values, result.columns);
}

export async function removeLocalMutation(id: string) {
  const db = await getLocalDatabase();
  db.run("DELETE FROM local_attachments WHERE local_mutation_id = ?", [id]);
  db.run("DELETE FROM local_mutations WHERE id = ?", [id]);
  await persistDatabase(db);
}

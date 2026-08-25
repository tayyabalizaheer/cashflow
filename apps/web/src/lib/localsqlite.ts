import initSqlJs from "sql.js";
import type { Database, SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { API_URL } from "./config";
import { getAccessToken } from "./sessiontoken";

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

function timeValue(value: unknown) {
  if (typeof value !== "string") return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortRecordsByLatest(records: Array<Record<string, unknown>>) {
  return [...records].sort((left, right) => {
    const leftPinned = timeValue(left.pinnedAt);
    const rightPinned = timeValue(right.pinnedAt);
    if (leftPinned || rightPinned) return rightPinned - leftPinned;
    const leftTransactions = Array.isArray(left.transactions)
      ? (left.transactions.filter(isRecord) as Array<Record<string, unknown>>)
      : [];
    const rightTransactions = Array.isArray(right.transactions)
      ? (right.transactions.filter(isRecord) as Array<Record<string, unknown>>)
      : [];
    const leftTime = Math.max(
      timeValue(left.updatedAt),
      timeValue(left.createdAt),
      ...leftTransactions.flatMap((transaction) => [
        timeValue(transaction.createdAt),
        timeValue(transaction.updatedAt),
        timeValue(transaction.transactionDate),
      ]),
    );
    const rightTime = Math.max(
      timeValue(right.updatedAt),
      timeValue(right.createdAt),
      ...rightTransactions.flatMap((transaction) => [
        timeValue(transaction.createdAt),
        timeValue(transaction.updatedAt),
        timeValue(transaction.transactionDate),
      ]),
    );
    return rightTime - leftTime;
  });
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
  return sortRecordsByLatest(
    readModuleRecords(db, module).filter((record) => !record.archivedAt),
  );
}

function activeRecordsByModule(db: Database) {
  return {
    expenses: readActiveModuleRecords(db, "expenses"),
    loans: readActiveModuleRecords(db, "loans"),
    investments: readActiveModuleRecords(db, "investments"),
    assets: readActiveModuleRecords(db, "assets"),
  };
}

function deleteLocalRecord(db: Database, module: string, id: string) {
  db.run("DELETE FROM local_records WHERE module = ? AND id = ?", [module, id]);
}

function deleteCachedTrashRecord(db: Database, type: string, id: string) {
  deleteLocalRecord(db, "trash", id);
  deleteLocalRecord(db, "trash", `${type}:${id}`);
}

function localCurrencyCodes(db: Database) {
  const records = activeRecordsByModule(db);
  const codes = new Set<string>();

  records.expenses.forEach((expense) => {
    if (typeof expense.currency === "string") codes.add(expense.currency);
    if (typeof expense.mainCurrency === "string")
      codes.add(expense.mainCurrency);
    if (Array.isArray(expense.currencies)) {
      expense.currencies.forEach((line) => {
        if (isRecord(line) && typeof line.currencyCode === "string") {
          codes.add(line.currencyCode);
        }
      });
    }
    if (Array.isArray(expense.transactions)) {
      expense.transactions.forEach((transaction) => {
        if (!isRecord(transaction) || !Array.isArray(transaction.amounts))
          return;
        transaction.amounts.forEach((amount) => {
          if (isRecord(amount) && typeof amount.currencyCode === "string") {
            codes.add(amount.currencyCode);
          }
        });
      });
    }
  });

  records.loans.forEach((loan) => {
    if (typeof loan.currency === "string") codes.add(loan.currency);
    if (Array.isArray(loan.balances)) {
      loan.balances.forEach((balance) => {
        if (isRecord(balance) && typeof balance.currency === "string") {
          codes.add(balance.currency);
        }
      });
    }
    if (Array.isArray(loan.transactions)) {
      loan.transactions.forEach((transaction) => {
        if (isRecord(transaction) && typeof transaction.currency === "string") {
          codes.add(transaction.currency);
        }
      });
    }
  });

  [...records.investments, ...records.assets].forEach((record) => {
    if (typeof record.currency === "string") codes.add(record.currency);
    if (typeof record.sourceCurrency === "string")
      codes.add(record.sourceCurrency);
  });

  return [...codes].filter(Boolean).sort();
}

function localUserCurrencies(db: Database) {
  const cachedCurrencies = readActiveModuleRecords(db, "user-currencies");
  if (cachedCurrencies.length > 0) return cachedCurrencies;

  const codes = localCurrencyCodes(db);
  const safeCodes = codes.length ? codes : ["USD"];
  return safeCodes.map((currencyCode, index) => ({
    id: `local-currency-${currencyCode}`,
    currencyCode,
    active: true,
    isDefault: index === 0,
    currency: {
      code: currencyCode,
      name: currencyCode,
      symbol: null,
      decimalPlaces: 2,
      active: true,
    },
  }));
}

function localCurrencies(db: Database) {
  const cachedCurrencies = readActiveModuleRecords(db, "currencies");
  if (cachedCurrencies.length > 0) return cachedCurrencies;
  return localUserCurrencies(db).map((item) => item.currency);
}

function localCategories(db: Database) {
  const cachedCategories = readActiveModuleRecords(db, "categories");
  if (cachedCategories.length > 0) return cachedCategories;

  const categories = new Map<string, Record<string, unknown>>();
  readActiveModuleRecords(db, "expenses").forEach((expense) => {
    if (isRecord(expense.category) && typeof expense.category.id === "string") {
      categories.set(expense.category.id, {
        id: expense.category.id,
        name:
          typeof expense.category.name === "string"
            ? expense.category.name
            : "Expense",
        color:
          typeof expense.category.color === "string"
            ? expense.category.color
            : "#047857",
        icon:
          typeof expense.category.icon === "string"
            ? expense.category.icon
            : "circle",
        active: true,
      });
    }
  });
  return [...categories.values()].sort((left, right) =>
    String(left.name).localeCompare(String(right.name)),
  );
}

function localDashboard(db: Database) {
  const records = activeRecordsByModule(db);
  const currencyCodes = localCurrencyCodes(db);
  const baseCurrency = currencyCodes[0] ?? "USD";
  return {
    baseCurrency,
    consolidatedTotalsAvailable: currencyCodes.length <= 1,
    currencyNote:
      currencyCodes.length > 1
        ? "Showing local mixed-currency records. Totals sync when you sign in."
        : "Showing local records from this device.",
    counts: {
      expenses: records.expenses.length,
      loans: records.loans.length,
      investments: records.investments.length,
      assets: records.assets.length,
    },
    latestZakat: null,
    recent: {
      expenses: records.expenses.slice(0, 5),
      loans: records.loans.slice(0, 5),
      investments: records.investments.slice(0, 5),
      assets: records.assets.slice(0, 5),
    },
  };
}

function localPurposes(records: Array<Record<string, unknown>>) {
  return [
    ...new Set(
      records
        .flatMap((record) =>
          Array.isArray(record.transactions)
            ? (record.transactions.filter(isRecord) as Array<
                Record<string, unknown>
              >)
            : [],
        )
        .map((transaction) => transaction.purpose)
        .filter((purpose): purpose is string => typeof purpose === "string"),
    ),
  ].sort();
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
  const cachedTrashItems = readModuleRecords(db, "trash")
    .map((record) => {
      const type = String(record.type ?? "");
      const id = String(record.recordId ?? record.id ?? "");
      if (!type || !id) return null;
      return {
        id,
        type,
        label:
          typeof record.label === "string"
            ? record.label
            : trashLabelForType(type),
        title:
          typeof record.title === "string"
            ? record.title
            : trashTitleForRecord(type, record),
        archivedAt: String(record.archivedAt ?? record.deletedAt ?? ""),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
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
  const loanTransactionItems = readModuleRecords(db, "loans").flatMap(
    (loan) => {
      const transactions = Array.isArray(loan.transactions)
        ? (loan.transactions.filter(isRecord) as Array<Record<string, unknown>>)
        : [];
      return transactions
        .filter((transaction) => transaction.archivedAt)
        .map((transaction) => ({
          id: String(transaction.id),
          type: "loan-transactions",
          label: trashLabelForType("loan-transactions"),
          title: String(
            transaction.purpose ?? loan.person ?? "Loan transaction",
          ),
          archivedAt: String(transaction.archivedAt),
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
        }));
    },
  );
  const byKey = new Map<string, Record<string, unknown>>();
  [...cachedTrashItems, ...moduleItems, ...loanTransactionItems].forEach(
    (item) => {
      byKey.set(`${item.type}:${item.id}`, item);
    },
  );

  return [...byKey.values()].sort(
    (left, right) =>
      new Date(String(right.archivedAt)).getTime() -
      new Date(String(left.archivedAt)).getTime(),
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
  const sortedTransactions = sortRecordsByLatest(transactions);
  upsertLocalRecord(
    db,
    "loans",
    {
      ...loan,
      balances: loanBalancesFromTransactions(activeTransactions),
      transactions: sortedTransactions,
    },
    syncedAt,
  );
}

function stableLoanActivity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableLoanActivity);
  if (!isRecord(value)) return value;

  return Object.keys(value)
    .filter((key) => !["pinnedAt", "updatedAt", "updated_at"].includes(key))
    .sort()
    .reduce<Record<string, unknown>>((activity, key) => {
      activity[key] = stableLoanActivity(value[key]);
      return activity;
    }, {});
}

function sameLoanActivity(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return (
    serialize(stableLoanActivity(left)) === serialize(stableLoanActivity(right))
  );
}

function preserveLoanActivityTimestamp(
  db: Database,
  loan: Record<string, unknown>,
) {
  const loanId = String(loan.id ?? "");
  const existingLoan = readModuleRecords(db, "loans").find(
    (item) => item.id === loanId,
  );
  if (!existingLoan || !sameLoanActivity(existingLoan, loan)) return loan;
  return {
    ...loan,
    updatedAt: existingLoan.updatedAt ?? loan.updatedAt,
    updated_at: existingLoan.updated_at ?? loan.updated_at,
  };
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
    const archivedLoan = {
      id: loanId,
      person: "Loan",
      balances: [],
      transactions: [],
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    writeLoanWithBalances(db, archivedLoan, now);
    return archivedLoan;
  }

  const expenseDeleteMatch = mutation.path.match(/^\/expenses\/([^/]+)$/);
  if (mutation.method === "DELETE" && expenseDeleteMatch) {
    const expenseId = expenseDeleteMatch[1]!;
    const expense = readModuleRecords(db, "expenses").find(
      (item) => item.id === expenseId,
    );
    if (expense) {
      const archivedExpense = { ...expense, archivedAt: now, updatedAt: now };
      upsertLocalRecord(db, "expenses", archivedExpense, now);
      return archivedExpense;
    }
    const archivedExpense = {
      id: expenseId,
      name: "Expense",
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    upsertLocalRecord(db, "expenses", archivedExpense, now);
    return archivedExpense;
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
    const archivedAsset = {
      id: assetId,
      name: "Asset",
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    upsertLocalRecord(db, "assets", archivedAsset, now);
    return archivedAsset;
  }

  const investmentDeleteMatch = mutation.path.match(/^\/investments\/([^/]+)$/);
  if (mutation.method === "DELETE" && investmentDeleteMatch) {
    const investmentId = investmentDeleteMatch[1]!;
    const investment = readModuleRecords(db, "investments").find(
      (item) => item.id === investmentId,
    );
    if (investment) {
      const archivedInvestment = {
        ...investment,
        archivedAt: now,
        updatedAt: now,
      };
      upsertLocalRecord(db, "investments", archivedInvestment, now);
      return archivedInvestment;
    }
    const archivedInvestment = {
      id: investmentId,
      name: "Investment",
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    upsertLocalRecord(db, "investments", archivedInvestment, now);
    return archivedInvestment;
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
        deleteCachedTrashRecord(db, type, id);
        return updatedTransactions.find((transaction) => transaction.id === id);
      }
      deleteCachedTrashRecord(db, type, id);
    }
    const module = trashModuleForType(type ?? "");
    const record = module
      ? readModuleRecords(db, module).find((item) => item.id === id)
      : null;
    if (module && record) {
      const restoredRecord = { ...record, archivedAt: null, updatedAt: now };
      upsertLocalRecord(db, module, restoredRecord, now);
      if (type && id) deleteCachedTrashRecord(db, type, id);
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
      deleteCachedTrashRecord(db, type, id);
      return { deleted: true };
    }
    const module = trashModuleForType(type ?? "");
    if (module && id) deleteLocalRecord(db, module, id);
    if (type && id) deleteCachedTrashRecord(db, type, id);
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
      pinnedAt: typeof payload.pinnedAt === "string" ? payload.pinnedAt : null,
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

  if (mutation.method === "POST" && mutation.path === "/expenses") {
    const selectedCurrencies = Array.isArray(payload.currencies)
      ? payload.currencies.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const mainCurrency =
      typeof payload.mainCurrency === "string"
        ? payload.mainCurrency
        : (selectedCurrencies[0] ?? "USD");
    const localExpense = {
      id: typeof payload.id === "string" ? payload.id : crypto.randomUUID(),
      categoryId:
        typeof payload.categoryId === "string" ? payload.categoryId : null,
      category: localCategories(db).find(
        (category) => category.id === payload.categoryId,
      ) ?? {
        id:
          typeof payload.categoryId === "string"
            ? payload.categoryId
            : crypto.randomUUID(),
        name: "Expense",
        color: "#047857",
        icon: "circle",
        active: true,
      },
      name: String(payload.name ?? ""),
      purpose: String(payload.name ?? ""),
      mainCurrency,
      amount: "0.0000",
      currency: mainCurrency,
      expenseDate: now,
      notes: payload.notes ?? null,
      currencies: (selectedCurrencies.length
        ? selectedCurrencies
        : [mainCurrency]
      ).map((currencyCode) => ({
        id: crypto.randomUUID(),
        currencyCode,
        isMain: currencyCode === mainCurrency,
      })),
      amounts: [],
      transactions: [],
      createdAt: now,
      updatedAt: now,
    };
    mutation.body = serialize({ ...payload, id: localExpense.id });
    upsertLocalRecord(db, "expenses", localExpense, now);
    return localExpense;
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
      stockFundName: payload.stockFundName ?? null,
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

  const assetUpdateMatch = mutation.path.match(/^\/assets\/([^/]+)$/);
  if (mutation.method === "PUT" && assetUpdateMatch) {
    const assetId = assetUpdateMatch[1]!;
    const existingAsset = readModuleRecords(db, "assets").find(
      (item) => item.id === assetId,
    );
    const localAsset = {
      ...(existingAsset ?? {}),
      id: assetId,
      name: String(payload.name ?? existingAsset?.name ?? ""),
      assetType: String(
        payload.assetType ?? existingAsset?.assetType ?? "Other",
      ),
      value: payload.value ?? existingAsset?.value ?? "0",
      currency: payload.currency ?? existingAsset?.currency,
      sourceExpenseId:
        payload.sourceExpenseId ?? existingAsset?.sourceExpenseId ?? null,
      sourceCurrency:
        payload.sourceCurrency ??
        payload.currency ??
        existingAsset?.sourceCurrency ??
        null,
      acquisitionDate:
        payload.acquisitionDate ?? existingAsset?.acquisitionDate ?? null,
      valuationDate:
        payload.valuationDate ?? existingAsset?.valuationDate ?? null,
      zakatEligible: Boolean(
        payload.zakatEligible ?? existingAsset?.zakatEligible,
      ),
      zakatPercentage:
        payload.zakatPercentage ?? existingAsset?.zakatPercentage ?? 100,
      notes: payload.notes ?? existingAsset?.notes ?? null,
      updatedAt: now,
      createdAt: existingAsset?.createdAt ?? now,
    };
    upsertLocalRecord(db, "assets", localAsset, now);
    return localAsset;
  }

  const investmentUpdateMatch = mutation.path.match(/^\/investments\/([^/]+)$/);
  if (mutation.method === "PUT" && investmentUpdateMatch) {
    const investmentId = investmentUpdateMatch[1]!;
    const existingInvestment = readModuleRecords(db, "investments").find(
      (item) => item.id === investmentId,
    );
    const localInvestment = {
      ...(existingInvestment ?? {}),
      id: investmentId,
      type: String(payload.type ?? existingInvestment?.type ?? ""),
      name: hasOwnRecordKey(payload, "name")
        ? payload.name
        : (existingInvestment?.name ?? null),
      stockFundName: hasOwnRecordKey(payload, "stockFundName")
        ? payload.stockFundName
        : (existingInvestment?.stockFundName ?? null),
      amountInvested:
        payload.amountInvested ?? existingInvestment?.amountInvested ?? "0",
      currency: payload.currency ?? existingInvestment?.currency,
      quantity: hasOwnRecordKey(payload, "quantity")
        ? payload.quantity
        : (existingInvestment?.quantity ?? null),
      nav: hasOwnRecordKey(payload, "nav")
        ? payload.nav
        : (existingInvestment?.nav ?? null),
      currentValue: hasOwnRecordKey(payload, "currentValue")
        ? payload.currentValue
        : (existingInvestment?.currentValue ?? null),
      purchaseDate: hasOwnRecordKey(payload, "purchaseDate")
        ? payload.purchaseDate
        : (existingInvestment?.purchaseDate ?? null),
      latestValuationDate: hasOwnRecordKey(payload, "latestValuationDate")
        ? payload.latestValuationDate
        : (existingInvestment?.latestValuationDate ?? null),
      zakatEligible: Boolean(
        payload.zakatEligible ?? existingInvestment?.zakatEligible,
      ),
      zakatPercentage:
        payload.zakatPercentage ?? existingInvestment?.zakatPercentage ?? 100,
      notes: hasOwnRecordKey(payload, "notes")
        ? payload.notes
        : (existingInvestment?.notes ?? null),
      updatedAt: now,
      createdAt: existingInvestment?.createdAt ?? now,
    };
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
      const nextPerson = String(payload.person ?? loan.person ?? "");
      const hasPinnedAtUpdate = Object.prototype.hasOwnProperty.call(
        payload,
        "pinnedAt",
      );
      const pinOnlyUpdate =
        hasPinnedAtUpdate &&
        nextPerson === loan.person &&
        Object.keys(payload).every((key) =>
          ["id", "person", "pinnedAt"].includes(key),
        );
      const nextUpdatedAt = pinOnlyUpdate ? String(loan.updatedAt ?? now) : now;
      const updatedLoan = {
        ...loan,
        person: nextPerson,
        purpose: String(payload.person ?? loan.purpose ?? ""),
        ...(hasPinnedAtUpdate ? { pinnedAt: payload.pinnedAt ?? null } : {}),
        updatedAt: nextUpdatedAt,
      };
      writeLoanWithBalances(db, updatedLoan, nextUpdatedAt);
      return updatedLoan;
    }
  }

  const expenseTransactionMatch = mutation.path.match(
    /^\/expenses\/([^/]+)\/transactions$/,
  );
  if (mutation.method === "POST" && expenseTransactionMatch) {
    const expenseId = expenseTransactionMatch[1]!;
    const expense = readActiveModuleRecords(db, "expenses").find(
      (item) => item.id === expenseId,
    );
    const mainCurrency = String(
      expense?.mainCurrency ?? expense?.currency ?? "USD",
    );
    const inputAmounts = Array.isArray(payload.amounts)
      ? (payload.amounts.filter(isRecord) as Array<Record<string, unknown>>)
      : [];
    const mainLine =
      inputAmounts.find((line) => line.currency === mainCurrency) ??
      inputAmounts[0];
    const mainAmount = Number(mainLine?.amount ?? 0);
    const localTransaction = {
      id: typeof payload.id === "string" ? payload.id : crypto.randomUUID(),
      expenseId,
      purpose: String(payload.purpose ?? ""),
      transactionDate: payload.transactionDate ?? now,
      mainCurrency,
      mainAmount: Number.isFinite(mainAmount)
        ? mainAmount.toFixed(4)
        : "0.0000",
      notes: payload.notes ?? null,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments
        : [],
      amounts: inputAmounts.map((line) => ({
        id: crypto.randomUUID(),
        amount: String(line.amount ?? "0"),
        currencyCode: String(line.currency ?? mainCurrency),
        rateToMain: String(line.rateToMain ?? "1"),
        mainAmount: Number.isFinite(mainAmount)
          ? mainAmount.toFixed(4)
          : "0.0000",
      })),
      createdAt: now,
      updatedAt: now,
    };
    mutation.body = serialize({ ...payload, id: localTransaction.id });
    if (expense) {
      const transactions: Array<Record<string, unknown>> = Array.isArray(
        expense.transactions,
      )
        ? [
            ...(expense.transactions.filter(isRecord) as Array<
              Record<string, unknown>
            >),
            localTransaction,
          ]
        : [localTransaction];
      const amount = transactions
        .filter((transaction) => !transaction.archivedAt)
        .reduce(
          (sum, transaction) => sum + Number(transaction.mainAmount ?? 0),
          0,
        );
      upsertLocalRecord(
        db,
        "expenses",
        {
          ...expense,
          amount: amount.toFixed(4),
          transactions: sortRecordsByLatest(transactions),
          updatedAt: now,
        },
        now,
      );
    }
    return localTransaction;
  }

  const expenseTransactionUpdateMatch = mutation.path.match(
    /^\/expenses\/([^/]+)\/transactions\/([^/]+)$/,
  );
  if (mutation.method === "DELETE" && expenseTransactionUpdateMatch) {
    const [, expenseId, transactionId] = expenseTransactionUpdateMatch;
    const expense = readActiveModuleRecords(db, "expenses").find(
      (item) => item.id === expenseId,
    );
    if (expense && transactionId) {
      const transactions = Array.isArray(expense.transactions)
        ? (expense.transactions.filter(isRecord) as Array<
            Record<string, unknown>
          >)
        : [];
      const updatedTransactions = transactions.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, archivedAt: now, updatedAt: now }
          : transaction,
      );
      const amount = updatedTransactions
        .filter((transaction) => !transaction.archivedAt)
        .reduce(
          (sum, transaction) => sum + Number(transaction.mainAmount ?? 0),
          0,
        );
      upsertLocalRecord(
        db,
        "expenses",
        {
          ...expense,
          amount: amount.toFixed(4),
          transactions: updatedTransactions,
          updatedAt: now,
        },
        now,
      );
      return updatedTransactions.find(
        (transaction) => transaction.id === transactionId,
      );
    }
    return { archivedAt: now };
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

function hasOwnRecordKey(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
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

export async function exportLocalDatabaseBackup() {
  const db = await getLocalDatabase();
  await persistDatabase(db);
  return db.export();
}

export async function hasLocalData() {
  const db = await getLocalDatabase();
  const records = db.exec("SELECT COUNT(*) AS count FROM local_records")[0];
  const mutations = db.exec(
    "SELECT COUNT(*) AS count FROM local_mutations WHERE status = 'PENDING'",
  )[0];
  const recordCount = Number(records?.values[0]?.[0] ?? 0);
  const mutationCount = Number(mutations?.values[0]?.[0] ?? 0);
  return recordCount > 0 || mutationCount > 0;
}

export async function hasPendingLocalMutations() {
  const db = await getLocalDatabase();
  const mutations = db.exec(
    "SELECT COUNT(*) AS count FROM local_mutations WHERE status = 'PENDING'",
  )[0];
  return Number(mutations?.values[0]?.[0] ?? 0) > 0;
}

function responseData(responseBody: unknown) {
  return isRecord(responseBody) ? responseBody.data : undefined;
}

function responseRecord(responseBody: unknown) {
  const data = responseData(responseBody);
  return isRecord(data) ? data : null;
}

function responseRecords(responseBody: unknown) {
  const data = responseData(responseBody);
  return Array.isArray(data) ? data.filter(isRecord) : null;
}

function upsertServerRecords(
  db: Database,
  module: string,
  records: Array<Record<string, unknown>>,
  syncedAt: string,
) {
  records.forEach((record) => {
    if (module === "loans") {
      writeLoanWithBalances(
        db,
        preserveLoanActivityTimestamp(db, record),
        syncedAt,
      );
      return;
    }
    upsertLocalRecord(db, module, record, syncedAt);
  });

  if (["expenses", "loans", "investments", "assets"].includes(module)) {
    insertAttachments(
      db,
      collectBootstrapAttachments(module, records),
      syncedAt,
    );
  }
}

type StoreServerResponseOptions = {
  allowWithPendingMutations?: boolean;
};

export async function storeServerResponseForPath(
  path: string,
  responseBody: unknown,
  options: StoreServerResponseOptions = {},
) {
  if (
    !options.allowWithPendingMutations &&
    (await hasPendingLocalMutations())
  ) {
    return false;
  }

  const pathOnly = path.split("?")[0] ?? path;
  const syncedAt = new Date().toISOString();
  const listModuleMap: Record<string, string> = {
    "/expenses": "expenses",
    "/loans": "loans",
    "/investments": "investments",
    "/assets": "assets",
    "/categories": "categories",
    "/user-currencies": "user-currencies",
    "/currencies": "currencies",
    "/trash": "trash",
  };
  const listModule = listModuleMap[pathOnly];
  const records = responseRecords(responseBody);

  if (listModule && records) {
    const db = await getLocalDatabase();
    db.run("BEGIN TRANSACTION");
    try {
      if (listModule === "trash") {
        replaceModule(
          db,
          listModule,
          records.map((record) => ({
            ...record,
            recordId: record.recordId ?? record.id,
            id:
              typeof record.type === "string" && record.id
                ? `${record.type}:${String(record.id)}`
                : String(record.id ?? crypto.randomUUID()),
          })),
          syncedAt,
        );
      } else {
        upsertServerRecords(db, listModule, records, syncedAt);
      }
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
    await persistDatabase(db);
    return true;
  }

  const createModuleMap: Record<string, string> = {
    "/expenses": "expenses",
    "/loans": "loans",
    "/investments": "investments",
    "/assets": "assets",
  };
  const createModule = createModuleMap[pathOnly];
  const detailModule = createModule
    ? createModule
    : pathOnly.match(/^\/expenses\/[^/]+$/)
      ? "expenses"
      : pathOnly.match(/^\/investments\/[^/]+$/)
        ? "investments"
        : pathOnly.match(/^\/assets\/[^/]+$/)
          ? "assets"
          : pathOnly.match(/^\/loans\/[^/]+$/) ||
              pathOnly.match(/^\/loans\/share\/[^/]+$/) ||
              pathOnly.match(/^\/public\/loans\/[^/]+$/)
            ? "loans"
            : null;
  const record = responseRecord(responseBody);

  if (detailModule && record) {
    const db = await getLocalDatabase();
    if (detailModule === "loans") {
      writeLoanWithBalances(
        db,
        preserveLoanActivityTimestamp(db, record),
        syncedAt,
      );
    } else {
      upsertLocalRecord(db, detailModule, record, syncedAt);
    }
    insertAttachments(
      db,
      collectBootstrapAttachments(detailModule, [record]),
      syncedAt,
    );
    await persistDatabase(db);
    return true;
  }

  return false;
}

function mutationBodyWithServerId(
  body: string | undefined,
  responseBody: unknown,
) {
  const record = responseRecord(responseBody);
  if (!record || (!record.id && !record.shareId)) return body;

  let payload: unknown = {};
  if (body) {
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      payload = {};
    }
  }

  if (!isRecord(payload)) return body;
  return serialize({
    ...payload,
    ...(record.id ? { id: record.id } : {}),
    ...(record.shareId ? { shareId: record.shareId } : {}),
  });
}

export async function applySuccessfulMutationToLocal(
  input: Pick<OfflineMutation, "path" | "method" | "body">,
  responseBody?: unknown,
) {
  const db = await getLocalDatabase();
  const body = mutationBodyWithServerId(input.body, responseBody);
  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    path: input.path,
    method: input.method,
    ...(body ? { body } : {}),
  };
  const localData = applyLocalMutation(db, mutation);
  await persistDatabase(db);
  return localData;
}

export async function updateLocalLoan(
  loanId: string,
  patch: Record<string, unknown>,
) {
  const db = await getLocalDatabase();
  const loan = readModuleRecords(db, "loans").find(
    (item) => item.id === loanId,
  );
  if (!loan) return null;

  const updatedAt =
    typeof patch.updatedAt === "string"
      ? patch.updatedAt
      : String(loan.updatedAt ?? new Date().toISOString());
  const updatedLoan = { ...loan, ...patch, updatedAt };
  writeLoanWithBalances(db, updatedLoan, updatedAt);
  await persistDatabase(db);
  return updatedLoan;
}

export async function localResponseForPath(path: string) {
  const db = await getLocalDatabase();
  const pathOnly = path.split("?")[0] ?? path;
  if (pathOnly === "/dashboard") return { data: localDashboard(db) };
  if (pathOnly === "/profile") {
    return {
      data: {
        fullName: "Local user",
        email: "",
        preferences: {
          baseCurrency: localCurrencyCodes(db)[0] ?? "USD",
          locale: "en-US",
          timeZone: "UTC",
          theme: "system",
        },
      },
    };
  }
  if (pathOnly === "/user-currencies") {
    return { data: localUserCurrencies(db) };
  }
  if (pathOnly === "/currencies") {
    return { data: localCurrencies(db) };
  }
  if (pathOnly === "/categories") return { data: localCategories(db) };
  if (pathOnly === "/expense-purposes") {
    return { data: localPurposes(readActiveModuleRecords(db, "expenses")) };
  }
  if (pathOnly === "/loan-purposes") {
    return { data: localPurposes(readActiveModuleRecords(db, "loans")) };
  }
  if (pathOnly === "/loans") {
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
  if (pathOnly === "/trash") return { data: localTrashItems(db) };
  const expenseMatch = pathOnly.match(/^\/expenses\/([^/]+)$/);
  if (expenseMatch) {
    const expense = readActiveModuleRecords(db, "expenses").find(
      (item) => item.id === expenseMatch[1],
    );
    if (expense) return { data: expense };
  }
  const moduleMap: Record<string, string> = {
    "/expenses": "expenses",
    "/investments": "investments",
    "/assets": "assets",
  };
  const module = moduleMap[pathOnly];
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

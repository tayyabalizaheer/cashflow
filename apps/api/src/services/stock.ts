import { Prisma } from "@prisma/client";
import * as cheerio from "cheerio";
import { prisma } from "../config/prisma.js";

const SOURCE_URL = "https://www.almeezangroup.com/fund-prices/";
const SOURCE_URL_HTTP = "http://www.almeezangroup.com/fund-prices/";
const JINA_READER_PREFIX = "https://r.jina.ai/http://r.jina.ai/http://";

const stockSources = [
  { label: "Al Meezan direct", url: SOURCE_URL },
  {
    label: "Al Meezan readable mirror (https)",
    url: `${JINA_READER_PREFIX}${SOURCE_URL}`,
  },
  {
    label: "Al Meezan readable mirror (http)",
    url: `${JINA_READER_PREFIX}${SOURCE_URL_HTTP}`,
  },
] as const;

const headers = [
  "fundName",
  "launchDate",
  "validityDate",
  "repurchasePrice",
  "offerPrice",
  "navPrice",
  "managementFee",
  "trusteeFee",
  "regulatoryFee",
  "leviesAndTaxes",
  "transactionExpenses",
  "thirdPartyExpenses",
  "otherExpenses",
  "terWithLevies",
  "terWithoutLevies",
  "mtdReturn",
  "fytdReturn",
  "cytdReturn",
  "fy25Return",
  "fy24Return",
  "sinceInceptionReturn",
] as const;

type HeaderKey = (typeof headers)[number];

export type StockRow = {
  [key in HeaderKey]: key extends "fundName" ? string : string | null;
} & {
  category: string | null;
  rawValues: Record<string, string | null>;
};

type ImportRow = Omit<StockRow, "rawValues"> & {
  rawValues: Prisma.InputJsonObject;
};

const columnLabels: Record<HeaderKey, string> = {
  fundName: "Funds Category",
  launchDate: "Launch Date",
  validityDate: "Validity Date",
  repurchasePrice: "Repurchase (Rs.)",
  offerPrice: "Offer (Rs.)",
  navPrice: "NAV (Rs.)",
  managementFee: "M. Fee (%)",
  trusteeFee: "Trustee Fee (%)",
  regulatoryFee: "Regulatory. Fee (%)",
  leviesAndTaxes: "Levies and Taxes",
  transactionExpenses:
    "Transaction Expenses (Broker, Bank, PSX, CDC, NCCPL etc)",
  thirdPartyExpenses:
    "Third Party Expenses (Auditor, Rating Agency, Legal, Shariah Advisor)",
  otherExpenses: "Other Expenses",
  terWithLevies: "TER with Levies",
  terWithoutLevies: "TER without Levies",
  mtdReturn: "MTD Return",
  fytdReturn: "FYTD Return",
  cytdReturn: "CYTD Return",
  fy25Return: "FY25 (%) Return",
  fy24Return: "FY24 (%) Return",
  sinceInceptionReturn: "Since Inception Return",
};

function cleanCell(value: string | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized === "" || normalized === "-" ? null : normalized;
}

function parseMarkdownTable(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function parseHtmlTables(html: string) {
  const $ = cheerio.load(html);
  const tables: string[][][] = [];

  $("table").each((_, table) => {
    const rows: string[][] = [];

    $(table)
      .find("tr")
      .each((__, row) => {
        const cells = $(row)
          .find("th,td")
          .map((___, cell) => $(cell).text().trim())
          .get();

        if (cells.length > 0) {
          rows.push(cells);
        }
      });

    if (rows.length > 0) {
      tables.push(rows);
    }
  });

  return (
    tables.find((table) =>
      table.some((row) => row.some((cell) => cell.includes("Repurchase"))),
    ) ?? []
  );
}

function normalizeRows(tableRows: string[][]) {
  const dataRows = tableRows.filter((row) => {
    const firstCell = cleanCell(row[0]);
    if (!firstCell) {
      return false;
    }

    const normalizedFirstCell = firstCell.toLowerCase();
    const isHeader = normalizedFirstCell === "funds category";
    const isSeparator = row.every((cell) => /^-+$/.test(cell.trim()));

    return !isHeader && !isSeparator;
  });

  const records: StockRow[] = [];
  let currentCategory: string | null = null;

  for (const row of dataRows) {
    const cells = headers.map((_, index) => cleanCell(row[index]));
    const [fundName, launchDate, validityDate] = cells;

    if (!fundName) {
      continue;
    }

    if (!launchDate || !validityDate) {
      currentCategory = fundName;
      continue;
    }

    const values = Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? null]),
    ) as Record<HeaderKey, string | null>;

    const rawValues = Object.fromEntries(
      headers.map((header) => [columnLabels[header], values[header]]),
    ) as Record<string, string | null>;

    records.push({
      ...values,
      fundName,
      category: currentCategory,
      rawValues,
    });
  }

  return records;
}

export function parseStockRows(content: string) {
  const markdownRows = parseMarkdownTable(content);
  if (markdownRows.length > 0) {
    return normalizeRows(markdownRows);
  }

  return normalizeRows(parseHtmlTables(content));
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

export async function fetchStockRows() {
  const failures: string[] = [];

  for (const source of stockSources) {
    try {
      const content = await fetchText(source.url);
      const rows = parseStockRows(content);

      if (rows.length > 0) {
        return rows;
      }

      failures.push(`${source.label}: no stock rows found`);
      console.warn(`Stock scrape source returned no rows: ${source.label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${source.label}: ${message}`);
      console.warn(`Stock scrape source failed: ${source.label}. ${message}`);
    }
  }

  throw new Error(
    `No stock rows were found. Sources tried: ${failures.join(" | ")}`,
  );
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(`${value} UTC`);
  if (Number.isNaN(parsed)) {
    throw new Error(`Unable to parse Al Meezan date value: ${value}`);
  }

  const date = new Date(parsed);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseDecimal(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").replace(/%/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  return new Prisma.Decimal(normalized);
}

function toImportRow(row: StockRow): ImportRow {
  return {
    ...row,
    rawValues: row.rawValues as Prisma.InputJsonObject,
  };
}

export async function scrapeAndSaveStocks() {
  const rows = (await fetchStockRows()).map(toImportRow);
  const scrapedAt = new Date();

  for (const row of rows) {
    const validityDate = parseDate(row.validityDate);

    if (!validityDate) {
      continue;
    }

    await prisma.stock.upsert({
      where: {
        fundName_validityDate: {
          fundName: row.fundName,
          validityDate,
        },
      },
      create: {
        fundName: row.fundName,
        category: row.category,
        launchDate: parseDate(row.launchDate),
        validityDate,
        repurchasePrice: parseDecimal(row.repurchasePrice),
        offerPrice: parseDecimal(row.offerPrice),
        navPrice: parseDecimal(row.navPrice),
        managementFee: parseDecimal(row.managementFee),
        trusteeFee: parseDecimal(row.trusteeFee),
        regulatoryFee: parseDecimal(row.regulatoryFee),
        leviesAndTaxes: parseDecimal(row.leviesAndTaxes),
        transactionExpenses: parseDecimal(row.transactionExpenses),
        thirdPartyExpenses: parseDecimal(row.thirdPartyExpenses),
        otherExpenses: parseDecimal(row.otherExpenses),
        terWithLevies: parseDecimal(row.terWithLevies),
        terWithoutLevies: parseDecimal(row.terWithoutLevies),
        mtdReturn: parseDecimal(row.mtdReturn),
        fytdReturn: parseDecimal(row.fytdReturn),
        cytdReturn: parseDecimal(row.cytdReturn),
        fy25Return: parseDecimal(row.fy25Return),
        fy24Return: parseDecimal(row.fy24Return),
        sinceInceptionReturn: parseDecimal(row.sinceInceptionReturn),
        rawValues: row.rawValues,
        sourceUrl: SOURCE_URL,
        scrapedAt,
      },
      update: {
        category: row.category,
        launchDate: parseDate(row.launchDate),
        repurchasePrice: parseDecimal(row.repurchasePrice),
        offerPrice: parseDecimal(row.offerPrice),
        navPrice: parseDecimal(row.navPrice),
        managementFee: parseDecimal(row.managementFee),
        trusteeFee: parseDecimal(row.trusteeFee),
        regulatoryFee: parseDecimal(row.regulatoryFee),
        leviesAndTaxes: parseDecimal(row.leviesAndTaxes),
        transactionExpenses: parseDecimal(row.transactionExpenses),
        thirdPartyExpenses: parseDecimal(row.thirdPartyExpenses),
        otherExpenses: parseDecimal(row.otherExpenses),
        terWithLevies: parseDecimal(row.terWithLevies),
        terWithoutLevies: parseDecimal(row.terWithoutLevies),
        mtdReturn: parseDecimal(row.mtdReturn),
        fytdReturn: parseDecimal(row.fytdReturn),
        cytdReturn: parseDecimal(row.cytdReturn),
        fy25Return: parseDecimal(row.fy25Return),
        fy24Return: parseDecimal(row.fy24Return),
        sinceInceptionReturn: parseDecimal(row.sinceInceptionReturn),
        rawValues: row.rawValues,
        sourceUrl: SOURCE_URL,
        scrapedAt,
      },
    });
  }

  return rows.length;
}

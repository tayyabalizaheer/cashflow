import { config } from "dotenv";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { ensureDatabaseUrl } from "../src/config/database-url.js";

config();
config({ path: "../../.env" });
ensureDatabaseUrl();

const prisma = new PrismaClient();

const currencies = [
  { code: "AED", name: "United Arab Emirates Dirham", symbol: "د.إ" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "SAR", name: "Saudi Riyal", symbol: "ر.س" },
  { code: "USD", name: "United States Dollar", symbol: "$" }
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed data is disabled in production.");
  }

  await Promise.all(
    currencies.map((currency) =>
      prisma.currency.upsert({
        where: { code: currency.code },
        update: { ...currency, active: true },
        create: currency
      })
    )
  );

  const email = "demo@cashflow.local";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      fullName: "Demo User",
      email,
      passwordHash: await argon2.hash("DemoPassword123", { type: argon2.argon2id }),
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      preferences: {
        create: {
          baseCurrency: "USD",
          locale: "en-US",
          timeZone: "Asia/Dubai",
          theme: "system"
        }
      }
    }
  });

  await Promise.all(
    ["USD", "AED", "PKR"].map((currencyCode) =>
      prisma.userCurrency.upsert({
        where: { userId_currencyCode: { userId: user.id, currencyCode } },
        update: { active: true, isDefault: currencyCode === "USD" },
        create: {
          userId: user.id,
          currencyCode,
          active: true,
          isDefault: currencyCode === "USD"
        }
      })
    )
  );

  const category = await prisma.expenseCategory.upsert({
    where: { userId_name: { userId: user.id, name: "Food" } },
    update: {},
    create: {
      userId: user.id,
      name: "Food",
      color: "#65a30d",
      icon: "utensils"
    }
  });

  await prisma.expense.create({
    data: {
      userId: user.id,
      categoryId: category.id,
      name: "Household food",
      mainCurrency: "USD",
      purpose: "Groceries",
      amount: "82.4500",
      currency: "USD",
      expenseDate: new Date(),
      currencies: {
        create: {
          userId: user.id,
          currencyCode: "USD",
          isMain: true
        }
      },
      transactions: {
        create: {
          userId: user.id,
          purpose: "Groceries",
          transactionDate: new Date(),
          mainCurrency: "USD",
          mainAmount: "82.4500",
          amounts: {
            create: {
              userId: user.id,
              amount: "82.4500",
              currencyCode: "USD",
              rateToMain: "1.00000000",
              mainAmount: "82.4500"
            }
          }
        }
      },
      amounts: {
        create: {
          userId: user.id,
          amount: "82.4500",
          currencyCode: "USD"
        }
      }
    }
  });

  await prisma.asset.create({
    data: {
      userId: user.id,
      name: "Emergency fund",
      assetType: "Cash",
      value: "5000.0000",
      currency: "USD",
      zakatEligible: true
    }
  });

  await prisma.investment.create({
    data: {
      userId: user.id,
      type: "ETF",
      name: "Global index fund",
      amountInvested: "2500.0000",
      quantity: "25",
      nav: "112.50000000",
      currency: "USD",
      latestValuationDate: new Date(),
      zakatEligible: true
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed data is disabled in production.");
  }

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
      purpose: "Groceries",
      amount: "82.4500",
      currency: "USD",
      expenseDate: new Date()
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

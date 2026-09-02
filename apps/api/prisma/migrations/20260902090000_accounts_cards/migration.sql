CREATE TABLE `BankAccount` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `accountName` VARCHAR(191) NOT NULL,
  `bankName` VARCHAR(191) NOT NULL,
  `accountHolderName` VARCHAR(191) NULL,
  `accountNumber` VARCHAR(191) NULL,
  `iban` VARCHAR(191) NULL,
  `swiftCode` VARCHAR(191) NULL,
  `routingNumber` VARCHAR(191) NULL,
  `branchName` VARCHAR(191) NULL,
  `branchAddress` TEXT NULL,
  `accountType` VARCHAR(191) NOT NULL DEFAULT 'Savings',
  `currency` VARCHAR(191) NOT NULL,
  `openingBalance` DECIMAL(19, 4) NOT NULL DEFAULT 0,
  `currentBalance` DECIMAL(19, 4) NULL,
  `openedAt` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `archivedAt` DATETIME(3) NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BankCard` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NULL,
  `cardName` VARCHAR(191) NOT NULL,
  `cardholderName` VARCHAR(191) NULL,
  `issuer` VARCHAR(191) NULL,
  `network` VARCHAR(191) NULL,
  `cardType` VARCHAR(191) NOT NULL DEFAULT 'Debit',
  `lastFour` VARCHAR(191) NULL,
  `expiryMonth` INTEGER NULL,
  `expiryYear` INTEGER NULL,
  `currency` VARCHAR(191) NOT NULL,
  `creditLimit` DECIMAL(19, 4) NULL,
  `availableLimit` DECIMAL(19, 4) NULL,
  `billingCycleDay` INTEGER NULL,
  `paymentDueDay` INTEGER NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
  `notes` TEXT NULL,
  `pinnedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `archivedAt` DATETIME(3) NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `BankAccount_userId_bankName_idx` ON `BankAccount`(`userId`, `bankName`);
CREATE INDEX `BankAccount_userId_currency_idx` ON `BankAccount`(`userId`, `currency`);
CREATE INDEX `BankAccount_userId_archivedAt_idx` ON `BankAccount`(`userId`, `archivedAt`);
CREATE INDEX `BankCard_userId_pinnedAt_idx` ON `BankCard`(`userId`, `pinnedAt`);
CREATE INDEX `BankCard_userId_accountId_idx` ON `BankCard`(`userId`, `accountId`);
CREATE INDEX `BankCard_userId_cardType_idx` ON `BankCard`(`userId`, `cardType`);
CREATE INDEX `BankCard_userId_archivedAt_idx` ON `BankCard`(`userId`, `archivedAt`);

ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BankCard` ADD CONSTRAINT `BankCard_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BankCard` ADD CONSTRAINT `BankCard_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `BankAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

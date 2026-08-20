-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `mainCurrency` VARCHAR(191) NULL,
    ADD COLUMN `name` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ExpenseCurrency` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `isMain` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExpenseCurrency_userId_currencyCode_idx`(`userId`, `currencyCode`),
    UNIQUE INDEX `ExpenseCurrency_expenseId_currencyCode_key`(`expenseId`, `currencyCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mainCurrency` VARCHAR(191) NOT NULL,
    `mainAmount` DECIMAL(19, 4) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `images` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `ExpenseTransaction_userId_expenseId_idx`(`userId`, `expenseId`),
    INDEX `ExpenseTransaction_userId_purpose_idx`(`userId`, `purpose`),
    INDEX `ExpenseTransaction_userId_transactionDate_idx`(`userId`, `transactionDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseTransactionAmount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `rateToMain` DECIMAL(19, 8) NOT NULL,
    `mainAmount` DECIMAL(19, 4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExpenseTransactionAmount_userId_currencyCode_idx`(`userId`, `currencyCode`),
    UNIQUE INDEX `ExpenseTransactionAmount_transactionId_currencyCode_key`(`transactionId`, `currencyCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ExpenseCurrency` ADD CONSTRAINT `ExpenseCurrency_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseCurrency` ADD CONSTRAINT `ExpenseCurrency_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseCurrency` ADD CONSTRAINT `ExpenseCurrency_currencyCode_fkey` FOREIGN KEY (`currencyCode`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseTransaction` ADD CONSTRAINT `ExpenseTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseTransaction` ADD CONSTRAINT `ExpenseTransaction_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseTransactionAmount` ADD CONSTRAINT `ExpenseTransactionAmount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseTransactionAmount` ADD CONSTRAINT `ExpenseTransactionAmount_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `ExpenseTransaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseTransactionAmount` ADD CONSTRAINT `ExpenseTransactionAmount_currencyCode_fkey` FOREIGN KEY (`currencyCode`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

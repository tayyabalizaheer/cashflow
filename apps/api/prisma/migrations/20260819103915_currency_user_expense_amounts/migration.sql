-- CreateTable
CREATE TABLE `Currency` (
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NULL,
    `decimalPlaces` INTEGER NOT NULL DEFAULT 2,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCurrency` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserCurrency_userId_active_idx`(`userId`, `active`),
    UNIQUE INDEX `UserCurrency_userId_currencyCode_key`(`userId`, `currencyCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseAmount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExpenseAmount_userId_currencyCode_idx`(`userId`, `currencyCode`),
    UNIQUE INDEX `ExpenseAmount_expenseId_currencyCode_key`(`expenseId`, `currencyCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserCurrency` ADD CONSTRAINT `UserCurrency_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCurrency` ADD CONSTRAINT `UserCurrency_currencyCode_fkey` FOREIGN KEY (`currencyCode`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseAmount` ADD CONSTRAINT `ExpenseAmount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseAmount` ADD CONSTRAINT `ExpenseAmount_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseAmount` ADD CONSTRAINT `ExpenseAmount_currencyCode_fkey` FOREIGN KEY (`currencyCode`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `termsAcceptedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `baseCurrency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en-US',
    `timeZone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `theme` VARCHAR(191) NOT NULL DEFAULT 'system',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserPreference_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `userAgent` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedByTokenId` VARCHAR(191) NULL,
    `reuseDetectedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RefreshSession_tokenHash_key`(`tokenHash`),
    INDEX `RefreshSession_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `RefreshSession_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseCategory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#047857',
    `icon` VARCHAR(191) NOT NULL DEFAULT 'circle',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `ExpenseCategory_userId_active_idx`(`userId`, `active`),
    UNIQUE INDEX `ExpenseCategory_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `expenseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `recurring` BOOLEAN NOT NULL DEFAULT false,
    `frequency` VARCHAR(191) NULL,
    `receiptName` VARCHAR(191) NULL,
    `receiptUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Expense_userId_expenseDate_idx`(`userId`, `expenseDate`),
    INDEX `Expense_userId_currency_idx`(`userId`, `currency`),
    INDEX `Expense_userId_categoryId_idx`(`userId`, `categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Loan` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `person` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `loanDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Loan_userId_loanDate_idx`(`userId`, `loanDate`),
    INDEX `Loan_userId_status_idx`(`userId`, `status`),
    INDEX `Loan_userId_currency_idx`(`userId`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoanRepayment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `adjustment` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `LoanRepayment_userId_loanId_idx`(`userId`, `loanId`),
    INDEX `LoanRepayment_userId_paymentDate_idx`(`userId`, `paymentDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Investment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `amountInvested` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(19, 8) NULL,
    `nav` DECIMAL(19, 8) NULL,
    `currentValue` DECIMAL(19, 4) NULL,
    `purchaseDate` DATETIME(3) NULL,
    `latestValuationDate` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `zakatEligible` BOOLEAN NOT NULL DEFAULT false,
    `zakatPercentage` DECIMAL(5, 2) NOT NULL DEFAULT 100,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Investment_userId_type_idx`(`userId`, `type`),
    INDEX `Investment_userId_currency_idx`(`userId`, `currency`),
    INDEX `Investment_userId_purchaseDate_idx`(`userId`, `purchaseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `assetType` VARCHAR(191) NOT NULL DEFAULT 'Other',
    `value` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `acquisitionDate` DATETIME(3) NULL,
    `valuationDate` DATETIME(3) NULL,
    `zakatEligible` BOOLEAN NOT NULL DEFAULT false,
    `zakatPercentage` DECIMAL(5, 2) NOT NULL DEFAULT 100,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Asset_userId_assetType_idx`(`userId`, `assetType`),
    INDEX `Asset_userId_currency_idx`(`userId`, `currency`),
    INDEX `Asset_userId_valuationDate_idx`(`userId`, `valuationDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExchangeRate` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `baseCurrency` VARCHAR(191) NOT NULL,
    `quoteCurrency` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(19, 8) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `rateDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExchangeRate_userId_rateDate_idx`(`userId`, `rateDate`),
    UNIQUE INDEX `ExchangeRate_userId_baseCurrency_quoteCurrency_rateDate_key`(`userId`, `baseCurrency`, `quoteCurrency`, `rateDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZakatCalculation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `calculationDate` DATETIME(3) NOT NULL,
    `yearLabel` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL DEFAULT 'Configurable standard method',
    `rate` DECIMAL(8, 6) NOT NULL DEFAULT 0.025,
    `nisabBasis` VARCHAR(191) NOT NULL,
    `nisabThreshold` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `goldSilverPrice` DECIMAL(19, 4) NULL,
    `priceSource` VARCHAR(191) NULL,
    `priceDate` DATETIME(3) NULL,
    `totalZakatableWealth` DECIMAL(19, 4) NOT NULL,
    `thresholdMet` BOOLEAN NOT NULL,
    `estimatedZakatDue` DECIMAL(19, 4) NOT NULL,
    `breakdown` JSON NOT NULL,
    `disclaimerAcceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `ZakatCalculation_userId_calculationDate_idx`(`userId`, `calculationDate`),
    INDEX `ZakatCalculation_userId_currency_idx`(`userId`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZakatCalculationItem` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `calculationId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `sourceEntityId` VARCHAR(191) NULL,
    `label` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `included` BOOLEAN NOT NULL DEFAULT true,
    `eligibilityPct` DECIMAL(5, 2) NOT NULL DEFAULT 100,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ZakatCalculationItem_userId_calculationId_idx`(`userId`, `calculationId`),
    INDEX `ZakatCalculationItem_userId_kind_idx`(`userId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZakatPayment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `calculationId` VARCHAR(191) NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `recipient` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `ZakatPayment_userId_paymentDate_idx`(`userId`, `paymentDate`),
    INDEX `ZakatPayment_userId_currency_idx`(`userId`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `AuditEvent_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncOutbox` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clientMutationId` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `operation` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `lastAttemptAt` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SyncOutbox_clientMutationId_key`(`clientMutationId`),
    INDEX `SyncOutbox_userId_status_idx`(`userId`, `status`),
    INDEX `SyncOutbox_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserPreference` ADD CONSTRAINT `UserPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshSession` ADD CONSTRAINT `RefreshSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseCategory` ADD CONSTRAINT `ExpenseCategory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Loan` ADD CONSTRAINT `Loan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoanRepayment` ADD CONSTRAINT `LoanRepayment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoanRepayment` ADD CONSTRAINT `LoanRepayment_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Investment` ADD CONSTRAINT `Investment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExchangeRate` ADD CONSTRAINT `ExchangeRate_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZakatCalculation` ADD CONSTRAINT `ZakatCalculation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZakatCalculationItem` ADD CONSTRAINT `ZakatCalculationItem_calculationId_fkey` FOREIGN KEY (`calculationId`) REFERENCES `ZakatCalculation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZakatPayment` ADD CONSTRAINT `ZakatPayment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZakatPayment` ADD CONSTRAINT `ZakatPayment_calculationId_fkey` FOREIGN KEY (`calculationId`) REFERENCES `ZakatCalculation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SyncOutbox` ADD CONSTRAINT `SyncOutbox_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


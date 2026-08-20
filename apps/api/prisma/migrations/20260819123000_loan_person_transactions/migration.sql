-- Add short share codes to existing and new loan ledgers.
ALTER TABLE `Loan` ADD COLUMN `shareId` VARCHAR(5) NULL;

UPDATE `Loan`
SET `shareId` = SUBSTRING(REPLACE(UUID(), '-', ''), 1, 5)
WHERE `shareId` IS NULL;

ALTER TABLE `Loan`
  MODIFY `shareId` VARCHAR(5) NOT NULL,
  MODIFY `purpose` VARCHAR(191) NOT NULL DEFAULT 'Opening',
  MODIFY `amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
  MODIFY `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  MODIFY `direction` VARCHAR(191) NOT NULL DEFAULT 'LENT';

CREATE UNIQUE INDEX `Loan_shareId_key` ON `Loan`(`shareId`);
CREATE INDEX `Loan_userId_shareId_idx` ON `Loan`(`userId`, `shareId`);

-- CreateTable
CREATE TABLE `LoanTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `LoanTransaction_userId_loanId_idx`(`userId`, `loanId`),
    INDEX `LoanTransaction_userId_kind_idx`(`userId`, `kind`),
    INDEX `LoanTransaction_userId_purpose_idx`(`userId`, `purpose`),
    INDEX `LoanTransaction_userId_transactionDate_idx`(`userId`, `transactionDate`),
    INDEX `LoanTransaction_userId_currency_idx`(`userId`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LoanTransaction` ADD CONSTRAINT `LoanTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoanTransaction` ADD CONSTRAINT `LoanTransaction_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

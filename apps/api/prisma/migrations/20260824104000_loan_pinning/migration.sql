ALTER TABLE `Loan` ADD COLUMN `pinnedAt` DATETIME(3) NULL;

CREATE INDEX `Loan_userId_pinnedAt_idx` ON `Loan`(`userId`, `pinnedAt`);

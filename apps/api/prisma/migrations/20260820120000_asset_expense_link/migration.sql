ALTER TABLE `Asset`
  ADD COLUMN `sourceExpenseId` VARCHAR(191) NULL,
  ADD COLUMN `sourceCurrency` VARCHAR(191) NULL;

CREATE INDEX `Asset_userId_sourceExpenseId_idx` ON `Asset`(`userId`, `sourceExpenseId`);

CREATE UNIQUE INDEX `Asset_userId_sourceExpenseId_currency_key` ON `Asset`(`userId`, `sourceExpenseId`, `currency`);

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_sourceExpenseId_fkey`
  FOREIGN KEY (`sourceExpenseId`) REFERENCES `Expense`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

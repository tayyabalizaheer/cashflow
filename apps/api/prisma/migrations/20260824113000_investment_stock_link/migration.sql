ALTER TABLE `Investment` ADD COLUMN `stockFundName` VARCHAR(191) NULL;

CREATE INDEX `Investment_userId_stockFundName_idx` ON `Investment`(`userId`, `stockFundName`);

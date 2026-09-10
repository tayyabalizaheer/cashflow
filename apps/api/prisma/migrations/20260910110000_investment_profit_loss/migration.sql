ALTER TABLE `Investment`
  ADD COLUMN `profitLossType` VARCHAR(191) NULL,
  ADD COLUMN `profitLossAmount` DECIMAL(19, 4) NULL;

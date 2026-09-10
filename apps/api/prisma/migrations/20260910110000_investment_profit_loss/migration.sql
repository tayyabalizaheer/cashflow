CREATE TABLE `InvestmentProfitLossRecord` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `investmentId` VARCHAR(191) NULL,
  `groupKey` VARCHAR(255) NOT NULL,
  `groupTitle` VARCHAR(191) NOT NULL,
  `stockType` VARCHAR(191) NOT NULL,
  `resultType` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(19, 4) NOT NULL,
  `currency` VARCHAR(191) NOT NULL,
  `recordDate` DATETIME(3) NULL,
  `notes` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `archivedAt` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  INDEX `InvestmentProfitLossRecord_userId_groupKey_idx`(`userId`, `groupKey`),
  INDEX `InvestmentProfitLossRecord_userId_investmentId_idx`(`userId`, `investmentId`),
  INDEX `InvestmentProfitLossRecord_userId_recordDate_idx`(`userId`, `recordDate`),
  CONSTRAINT `InvestmentProfitLossRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `InvestmentProfitLossRecord_investmentId_fkey` FOREIGN KEY (`investmentId`) REFERENCES `Investment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

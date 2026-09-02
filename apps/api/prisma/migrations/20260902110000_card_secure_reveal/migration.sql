ALTER TABLE `BankCard`
  ADD COLUMN `cardNumberEncrypted` TEXT NULL,
  ADD COLUMN `cardNumberFirstFour` VARCHAR(191) NULL,
  ADD COLUMN `cardNumberLastTwo` VARCHAR(191) NULL;

UPDATE `BankCard`
SET `cardNumberLastTwo` = RIGHT(`lastFour`, 2)
WHERE `lastFour` IS NOT NULL AND `cardNumberLastTwo` IS NULL;

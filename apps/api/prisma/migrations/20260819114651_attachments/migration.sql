-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `dataBase64` LONGTEXT NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `Attachment_userId_entityType_entityId_idx`(`userId`, `entityType`, `entityId`),
    INDEX `Attachment_userId_archivedAt_idx`(`userId`, `archivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - Added the required column `country` to the `TrainerProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateOfBirth` to the `TrainerProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `TrainerProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `TrainerProfile` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[TrainerProfile] ADD [country] NVARCHAR(1000) NOT NULL,
[dateOfBirth] DATETIME2 NOT NULL,
[firstName] NVARCHAR(1000) NOT NULL,
[lastName] NVARCHAR(1000) NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

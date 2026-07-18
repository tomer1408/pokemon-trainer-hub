BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[TrainerProfile] ADD [deletedAt] DATETIME2,
[deletedBy] NVARCHAR(1000),
[deletionType] NVARCHAR(1000),
[purgeAt] DATETIME2;

-- CreateIndex
CREATE NONCLUSTERED INDEX [TrainerProfile_purgeAt_idx] ON [dbo].[TrainerProfile]([purgeAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

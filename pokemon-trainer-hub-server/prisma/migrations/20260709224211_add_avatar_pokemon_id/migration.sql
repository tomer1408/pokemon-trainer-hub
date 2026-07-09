BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[TrainerProfile] DROP CONSTRAINT [TrainerProfile_updatedAt_df];
ALTER TABLE [dbo].[TrainerProfile] ADD [avatarPokemonId] INT;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

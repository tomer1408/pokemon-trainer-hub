-- Reconciles migration history with the schema that was actually applied to
-- the database via `prisma db push` in earlier sessions. No data is altered
-- by this migration for the existing dev database (it is recorded via
-- `prisma migrate resolve --applied`, not executed there) — the statements
-- below exist so that a FRESH database (e.g. a new clone following the
-- README) ends up with the exact same schema the dev database already has.

BEGIN TRY

BEGIN TRAN;

-- DreamTeamMember: drag-and-drop slot order, added via db push, never
-- previously captured in a migration.
IF COL_LENGTH('dbo.DreamTeamMember', 'position') IS NULL
BEGIN
    ALTER TABLE [dbo].[DreamTeamMember] ADD [position] INT NOT NULL CONSTRAINT [DreamTeamMember_position_df] DEFAULT 0;
END

-- TrainerProfile: real server-side Starter Quiz completion flag, added via
-- db push, never previously captured in a migration.
IF COL_LENGTH('dbo.TrainerProfile', 'hasCompletedStarterQuiz') IS NULL
BEGIN
    ALTER TABLE [dbo].[TrainerProfile] ADD [hasCompletedStarterQuiz] BIT NOT NULL CONSTRAINT [TrainerProfile_hasCompletedStarterQuiz_df] DEFAULT 0;
END

-- TrainerNote: the previous migration (20260710084921_add_trainer_note)
-- recorded the wrong shape (a NOT NULL `updatedAt` with no default, plus a
-- unique constraint) — the schema/app have always used a nullable-default
-- `createdAt` with no unique constraint (notes are a running log, not a
-- single editable record per Pokémon). This step corrects that.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'TrainerNote_auth0UserId_pokemonId_key')
BEGIN
    ALTER TABLE [dbo].[TrainerNote] DROP CONSTRAINT [TrainerNote_auth0UserId_pokemonId_key];
END

IF COL_LENGTH('dbo.TrainerNote', 'updatedAt') IS NOT NULL
BEGIN
    ALTER TABLE [dbo].[TrainerNote] DROP COLUMN [updatedAt];
END

IF COL_LENGTH('dbo.TrainerNote', 'createdAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[TrainerNote] ADD [createdAt] DATETIME2 NOT NULL CONSTRAINT [TrainerNote_createdAt_df] DEFAULT CURRENT_TIMESTAMP;
END

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

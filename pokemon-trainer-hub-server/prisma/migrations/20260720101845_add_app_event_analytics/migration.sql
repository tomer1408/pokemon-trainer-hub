BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[TrainerProfile] ADD [lastActiveAt] DATETIME2;

-- CreateTable
CREATE TABLE [dbo].[AppEvent] (
    [id] INT NOT NULL IDENTITY(1,1),
    [auth0UserId] NVARCHAR(1000),
    [eventType] NVARCHAR(1000) NOT NULL,
    [pageName] NVARCHAR(1000),
    [metadataJson] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AppEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AppEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AppEvent_auth0UserId_idx] ON [dbo].[AppEvent]([auth0UserId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AppEvent_eventType_idx] ON [dbo].[AppEvent]([eventType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AppEvent_createdAt_idx] ON [dbo].[AppEvent]([createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

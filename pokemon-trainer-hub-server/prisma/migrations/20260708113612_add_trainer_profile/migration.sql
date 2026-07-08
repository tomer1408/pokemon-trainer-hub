BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[TrainerProfile] (
    [id] INT NOT NULL IDENTITY(1,1),
    [auth0UserId] NVARCHAR(1000) NOT NULL,
    [trainerName] NVARCHAR(1000) NOT NULL,
    [favoriteType] NVARCHAR(1000) NOT NULL,
    [experienceLevel] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TrainerProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TrainerProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TrainerProfile_auth0UserId_key] UNIQUE NONCLUSTERED ([auth0UserId])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

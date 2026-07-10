BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[TrainerNote] (
    [id] INT NOT NULL IDENTITY(1,1),
    [auth0UserId] NVARCHAR(1000) NOT NULL,
    [pokemonId] INT NOT NULL,
    [text] NVARCHAR(1000) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [TrainerNote_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TrainerNote_auth0UserId_pokemonId_key] UNIQUE NONCLUSTERED ([auth0UserId],[pokemonId])
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

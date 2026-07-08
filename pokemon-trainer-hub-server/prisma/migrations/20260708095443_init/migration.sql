BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[DreamTeamMember] (
    [id] INT NOT NULL IDENTITY(1,1),
    [auth0UserId] NVARCHAR(1000) NOT NULL,
    [pokemonId] INT NOT NULL,
    [pokemonName] NVARCHAR(1000) NOT NULL,
    [spriteUrl] NVARCHAR(1000) NOT NULL,
    [addedAt] DATETIME2 NOT NULL CONSTRAINT [DreamTeamMember_addedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DreamTeamMember_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DreamTeamMember_auth0UserId_pokemonId_key] UNIQUE NONCLUSTERED ([auth0UserId],[pokemonId])
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

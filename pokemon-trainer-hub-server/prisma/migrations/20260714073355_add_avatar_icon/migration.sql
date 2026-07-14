BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[AvatarIcon] (
    [id] INT NOT NULL IDENTITY(1,1),
    [pokemonId] INT NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [category] NVARCHAR(1000) NOT NULL,
    [spriteUrl] NVARCHAR(1000) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [AvatarIcon_sortOrder_df] DEFAULT 0,
    CONSTRAINT [AvatarIcon_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AvatarIcon_pokemonId_key] UNIQUE NONCLUSTERED ([pokemonId])
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

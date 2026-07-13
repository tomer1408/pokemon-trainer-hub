BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[BattleMatch] (
    [id] INT NOT NULL IDENTITY(1,1),
    [auth0UserId] NVARCHAR(1000) NOT NULL,
    [opponentName] NVARCHAR(1000) NOT NULL,
    [difficulty] NVARCHAR(1000) NOT NULL,
    [rounds] INT NOT NULL,
    [roundsPlayed] INT NOT NULL,
    [opponentType] NVARCHAR(1000) NOT NULL,
    [luckFactor] NVARCHAR(1000) NOT NULL,
    [result] NVARCHAR(1000) NOT NULL,
    [yourWins] INT NOT NULL,
    [oppWins] INT NOT NULL,
    [roundsJson] NVARCHAR(1000) NOT NULL,
    [teamSnapshotJson] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BattleMatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [BattleMatch_pkey] PRIMARY KEY CLUSTERED ([id])
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

BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[TrainerProfile] ADD [acceptedPolicy] BIT NOT NULL CONSTRAINT [TrainerProfile_acceptedPolicy_df] DEFAULT 0,
[acceptedPolicyAt] DATETIME2,
[marketingEmailsOptIn] BIT NOT NULL CONSTRAINT [TrainerProfile_marketingEmailsOptIn_df] DEFAULT 0,
[policyVersion] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

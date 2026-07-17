/*
  Warnings:

  - Added the required column `updatedAt` to the `SupportRequest` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[SupportRequest] ADD [adminNotes] NVARCHAR(1000),
[assignedTo] NVARCHAR(1000),
[priority] NVARCHAR(1000) NOT NULL CONSTRAINT [SupportRequest_priority_df] DEFAULT 'normal',
[resolvedAt] DATETIME2,
[status] NVARCHAR(1000) NOT NULL CONSTRAINT [SupportRequest_status_df] DEFAULT 'open',
[updatedAt] DATETIME2 NOT NULL;

-- CreateTable
CREATE TABLE [dbo].[AdminAuditLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [adminAuth0UserId] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [targetType] NVARCHAR(1000) NOT NULL,
    [targetId] NVARCHAR(1000),
    [detailsJson] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AdminAuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AdminAuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
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

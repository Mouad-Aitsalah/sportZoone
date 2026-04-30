-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Utilisateur"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "LoginApprovalRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "LoginApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Utilisateur_approvalStatus_idx" ON "Utilisateur"("approvalStatus");

-- CreateIndex
CREATE INDEX "LoginApprovalRequest_userId_idx" ON "LoginApprovalRequest"("userId");

-- CreateIndex
CREATE INDEX "LoginApprovalRequest_status_idx" ON "LoginApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "LoginApprovalRequest_createdAt_idx" ON "LoginApprovalRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "LoginApprovalRequest"
ADD CONSTRAINT "LoginApprovalRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "Utilisateur"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

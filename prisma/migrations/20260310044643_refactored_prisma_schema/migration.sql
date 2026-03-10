/*
  Warnings:

  - You are about to drop the column `locationId` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,dayOfWeek]` on the table `Availability` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_locationId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "locationId";

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Availability_userId_idx" ON "Availability"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_userId_dayOfWeek_key" ON "Availability"("userId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "AvailabilityException_userId_date_idx" ON "AvailabilityException"("userId", "date");

-- CreateIndex
CREATE INDEX "DropRequest_shiftId_status_idx" ON "DropRequest"("shiftId", "status");

-- CreateIndex
CREATE INDEX "DropRequest_expiresAt_idx" ON "DropRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "Shift_startTime_endTime_idx" ON "Shift"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "ShiftAssignment_userId_shiftId_idx" ON "ShiftAssignment"("userId", "shiftId");

-- CreateIndex
CREATE INDEX "ShiftRequirement_skillId_idx" ON "ShiftRequirement"("skillId");

-- CreateIndex
CREATE INDEX "SwapRequest_shiftId_status_idx" ON "SwapRequest"("shiftId", "status");

-- CreateIndex
CREATE INDEX "SwapRequest_fromUserId_idx" ON "SwapRequest"("fromUserId");

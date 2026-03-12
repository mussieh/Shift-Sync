-- CreateIndex
CREATE INDEX "DropRequest_status_expiresAt_idx" ON "DropRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SwapRequest_toUserId_status_idx" ON "SwapRequest"("toUserId", "status");

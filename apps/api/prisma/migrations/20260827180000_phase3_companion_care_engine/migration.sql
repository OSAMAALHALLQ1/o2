-- CreateTable
CREATE TABLE "companion_care_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hunger" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    "cleanliness" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    "energy" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    "mood" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    "isSleeping" BOOLEAN NOT NULL DEFAULT false,
    "sleepStartedAt" TIMESTAMP(3),
    "lastSimulatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companion_care_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_action_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsePayload" JSONB NOT NULL,

    CONSTRAINT "companion_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companion_care_states_userId_key" ON "companion_care_states"("userId");

-- CreateIndex
CREATE INDEX "companion_action_logs_userId_idx" ON "companion_action_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "companion_action_logs_userId_clientActionId_key" ON "companion_action_logs"("userId", "clientActionId");

-- AddForeignKey
ALTER TABLE "companion_care_states" ADD CONSTRAINT "companion_care_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_action_logs" ADD CONSTRAINT "companion_action_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

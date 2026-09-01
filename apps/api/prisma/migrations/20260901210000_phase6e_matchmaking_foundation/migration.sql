BEGIN;

CREATE TYPE "MatchmakingTicketStatus" AS ENUM ('QUEUED', 'MATCHING', 'MATCHED', 'CANCELLED', 'EXPIRED', 'FAILED');

CREATE TABLE "matchmaking_tickets" (
  "id" TEXT NOT NULL,
  "gameMode" "PartyGameMode" NOT NULL,
  "status" "MatchmakingTicketStatus" NOT NULL DEFAULT 'QUEUED',
  "partyId" TEXT,
  "partyVersion" INTEGER,
  "leaderUserId" TEXT NOT NULL,
  "memberCount" INTEGER NOT NULL DEFAULT 1,
  "matchId" TEXT,
  "roomId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "matchmaking_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "matchmaking_ticket_members" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "matchmaking_ticket_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_matchmaking_ticket_member_ticket" FOREIGN KEY ("ticketId") REFERENCES "matchmaking_tickets" ("id") ON DELETE CASCADE,
  CONSTRAINT "fk_matchmaking_ticket_member_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "matchmaking_ticket_members_ticketId_userId_key" ON "matchmaking_ticket_members"("ticketId", "userId");
CREATE INDEX "matchmaking_ticket_members_userId_idx" ON "matchmaking_ticket_members"("userId");

CREATE INDEX "matchmaking_tickets_gameMode_status_createdAt_idx" ON "matchmaking_tickets"("gameMode", "status", "createdAt");
CREATE INDEX "matchmaking_tickets_leaderUserId_status_idx" ON "matchmaking_tickets"("leaderUserId", "status");
CREATE INDEX "matchmaking_tickets_partyId_status_idx" ON "matchmaking_tickets"("partyId", "status");

COMMIT;

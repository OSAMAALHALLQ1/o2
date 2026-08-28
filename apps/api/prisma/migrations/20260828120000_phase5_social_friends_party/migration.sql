BEGIN;

CREATE TYPE "FriendRequestPolicy" AS ENUM ('EVERYONE', 'NOBODY');
CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "PartyReadyState" AS ENUM ('READY', 'NOT_READY');
CREATE TYPE "PartyGameMode" AS ENUM ('ATRASH', 'MAFIA_CLASSIC', 'TARNEEB', 'HIDE_AND_SEEK', 'O2_IMPOSTER');
CREATE TYPE "PartyInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "friendships" (
  "id" TEXT NOT NULL,
  "userLowId" TEXT NOT NULL,
  "userHighId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "friendships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_friendship_canonical_pair" CHECK ("userLowId" < "userHighId")
);

CREATE TABLE "friend_requests" (
  "id" TEXT NOT NULL,
  "userLowId" TEXT NOT NULL,
  "userHighId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "receiverId" TEXT NOT NULL,
  "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_friend_request_canonical_pair" CHECK ("userLowId" < "userHighId"),
  CONSTRAINT "chk_friend_request_not_self" CHECK ("senderId" <> "receiverId"),
  CONSTRAINT "chk_friend_request_pair_matches_participants" CHECK (
    ("senderId" = "userLowId" AND "receiverId" = "userHighId") OR
    ("senderId" = "userHighId" AND "receiverId" = "userLowId")
  )
);

CREATE TABLE "user_blocks" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_user_block_not_self" CHECK ("blockerId" <> "blockedId")
);

CREATE TABLE "social_privacy" (
  "userId" TEXT NOT NULL,
  "friendRequestPolicy" "FriendRequestPolicy" NOT NULL DEFAULT 'EVERYONE',
  "allowPartyInvites" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "social_privacy_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "parties" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "leaderUserId" TEXT NOT NULL,
  "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
  "desiredGameMode" "PartyGameMode",
  "allowJoinByCode" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "parties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_party_code_format" CHECK ("code" ~ '^[A-Z2-9]{6}$'),
  CONSTRAINT "chk_party_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "party_members" (
  "id" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readyState" "PartyReadyState" NOT NULL DEFAULT 'NOT_READY',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_invites" (
  "id" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "inviteeId" TEXT NOT NULL,
  "status" "PartyInviteStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "party_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_party_invite_not_self" CHECK ("inviterId" <> "inviteeId"),
  CONSTRAINT "chk_party_invite_expiry" CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "friendships_userLowId_userHighId_key" ON "friendships"("userLowId", "userHighId");
CREATE INDEX "friendships_userLowId_createdAt_idx" ON "friendships"("userLowId", "createdAt");
CREATE INDEX "friendships_userHighId_createdAt_idx" ON "friendships"("userHighId", "createdAt");
CREATE UNIQUE INDEX "friend_requests_one_pending_pair_key" ON "friend_requests"("userLowId", "userHighId") WHERE "status" = 'PENDING';
CREATE INDEX "friend_requests_receiverId_status_createdAt_idx" ON "friend_requests"("receiverId", "status", "createdAt");
CREATE INDEX "friend_requests_senderId_status_createdAt_idx" ON "friend_requests"("senderId", "status", "createdAt");
CREATE INDEX "friend_requests_userLowId_userHighId_status_idx" ON "friend_requests"("userLowId", "userHighId", "status");
CREATE UNIQUE INDEX "user_blocks_blockerId_blockedId_key" ON "user_blocks"("blockerId", "blockedId");
CREATE INDEX "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");
CREATE UNIQUE INDEX "parties_code_key" ON "parties"("code");
CREATE INDEX "parties_leaderUserId_idx" ON "parties"("leaderUserId");
CREATE INDEX "parties_status_updatedAt_idx" ON "parties"("status", "updatedAt");
CREATE UNIQUE INDEX "party_members_userId_key" ON "party_members"("userId");
CREATE UNIQUE INDEX "party_members_partyId_userId_key" ON "party_members"("partyId", "userId");
CREATE INDEX "party_members_partyId_joinedAt_idx" ON "party_members"("partyId", "joinedAt");
CREATE UNIQUE INDEX "party_invites_one_pending_invitee_key" ON "party_invites"("partyId", "inviteeId") WHERE "status" = 'PENDING';
CREATE INDEX "party_invites_inviteeId_status_createdAt_idx" ON "party_invites"("inviteeId", "status", "createdAt");
CREATE INDEX "party_invites_partyId_status_idx" ON "party_invites"("partyId", "status");
CREATE INDEX "player_profiles_normalized_username_prefix_idx" ON "player_profiles" ("normalizedUsername" text_pattern_ops);

ALTER TABLE "friendships" ADD CONSTRAINT "friendships_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_privacy" ADD CONSTRAINT "social_privacy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parties" ADD CONSTRAINT "parties_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "party_members" ADD CONSTRAINT "party_members_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_members" ADD CONSTRAINT "party_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_invites" ADD CONSTRAINT "party_invites_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_invites" ADD CONSTRAINT "party_invites_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_invites" ADD CONSTRAINT "party_invites_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parties" ADD CONSTRAINT "parties_leader_must_be_member_fkey"
  FOREIGN KEY ("id", "leaderUserId") REFERENCES "party_members"("partyId", "userId")
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;

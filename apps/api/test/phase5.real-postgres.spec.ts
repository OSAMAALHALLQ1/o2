import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const databaseUrl = process.env.PHASE5_REAL_DATABASE_URL;

describe('Phase 5 real PostgreSQL 17 social and party concurrency', { skip: !databaseUrl }, () => {
  let prisma: any;
  let social: any;
  let parties: any;
  let characterId: string;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const { PrismaService } = require('../dist/prisma/prisma.service.js');
    const { PartyService } = require('../dist/modules/social/party.service.js');
    const { SocialService } = require('../dist/modules/social/social.service.js');
    prisma = new PrismaService();
    await prisma.$connect();
    parties = new PartyService(prisma);
    social = new SocialService(prisma, parties);
    const character = await prisma.character.upsert({
      where: { slug: 'phase5-audit-companion' },
      update: {},
      create: {
        slug: 'phase5-audit-companion', nameAr: 'رفيق التدقيق', nameEn: 'Audit Companion',
        descriptionAr: 'رفيق اختبار', archetype: 'AUDIT', placeholderAsset: 'audit_companion',
      },
    });
    characterId = character.id;
  });

  after(async () => { await prisma.$disconnect(); });

  async function createUser(prefix = 'user') {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    return prisma.user.create({
      data: {
        profile: {
          create: {
            username: `${prefix}_${suffix}`,
            normalizedUsername: `${prefix}_${suffix}`.toLowerCase(),
            displayName: `${prefix} ${suffix}`,
            selectedCharacterId: characterId,
            isOnboarded: true,
          },
        },
      },
      include: { profile: true },
    });
  }

  async function makeFriends(firstId: string, secondId: string) {
    const sent = await social.sendFriendRequest(firstId, secondId);
    if (sent.status === 'PENDING') await social.acceptFriendRequest(secondId, sent.requestId);
  }

  async function directInvite(partyId: string, inviterId: string, inviteeId: string) {
    return prisma.partyInvite.create({
      data: { partyId, inviterId, inviteeId, expiresAt: new Date(Date.now() + 600_000) },
    });
  }

  it('resolves mirrored friend requests into one friendship', async () => {
    const [a, b] = await Promise.all([createUser('crossa'), createUser('crossb')]);
    await Promise.all([social.sendFriendRequest(a.id, b.id), social.sendFriendRequest(b.id, a.id)]);
    const low = a.id < b.id ? a.id : b.id;
    const high = a.id < b.id ? b.id : a.id;
    assert.equal(await prisma.friendship.count({ where: { userLowId: low, userHighId: high } }), 1);
    assert.equal(await prisma.friendRequest.count({ where: { userLowId: low, userHighId: high, status: 'PENDING' } }), 0);
    assert.equal(await prisma.friendRequest.count({ where: { userLowId: low, userHighId: high, status: 'ACCEPTED' } }), 1);
  });

  it('makes simultaneous double accept deterministic', async () => {
    const [sender, receiver] = await Promise.all([createUser('sender'), createUser('receiver')]);
    const request = await social.sendFriendRequest(sender.id, receiver.id);
    const [first, second] = await Promise.all([
      social.acceptFriendRequest(receiver.id, request.requestId),
      social.acceptFriendRequest(receiver.id, request.requestId),
    ]);
    assert.deepEqual(first, second);
    assert.equal(await prisma.friendship.count({ where: { OR: [{ userLowId: sender.id }, { userHighId: sender.id }] } }), 1);
  });

  it('prevents two concurrent party creations for one user', async () => {
    const user = await createUser('creator');
    const [first, second] = await Promise.all([parties.createParty(user.id), parties.createParty(user.id)]);
    assert.equal(first.partyId, second.partyId);
    assert.equal(await prisma.partyMember.count({ where: { userId: user.id } }), 1);
    assert.equal(await prisma.party.count({ where: { leaderUserId: user.id, status: 'ACTIVE' } }), 1);
  });

  it('allows only one user to take the final party slot', async () => {
    const leader = await createUser('slotleader');
    const party = await parties.createParty(leader.id);
    await prisma.party.update({ where: { id: party.partyId }, data: { desiredGameMode: 'MAFIA_CLASSIC' } });
    for (let index = 0; index < 12; index += 1) {
      const member = await createUser(`slot${index}`);
      await prisma.partyMember.create({ data: { partyId: party.partyId, userId: member.id } });
    }
    const [firstUser, secondUser] = await Promise.all([createUser('lastone'), createUser('lasttwo')]);
    const [firstInvite, secondInvite] = await Promise.all([
      directInvite(party.partyId, leader.id, firstUser.id), directInvite(party.partyId, leader.id, secondUser.id),
    ]);
    const settled = await Promise.allSettled([
      parties.acceptInvite(firstUser.id, firstInvite.id), parties.acceptInvite(secondUser.id, secondInvite.id),
    ]);
    assert.equal(settled.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(await prisma.partyMember.count({ where: { partyId: party.partyId } }), 14);
  });

  it('allows a user to accept only one of two party invites concurrently', async () => {
    const [leaderA, leaderB, invitee] = await Promise.all([createUser('leadA'), createUser('leadB'), createUser('dual')]);
    const [partyA, partyB] = await Promise.all([parties.createParty(leaderA.id), parties.createParty(leaderB.id)]);
    const [inviteA, inviteB] = await Promise.all([
      directInvite(partyA.partyId, leaderA.id, invitee.id), directInvite(partyB.partyId, leaderB.id, invitee.id),
    ]);
    const settled = await Promise.allSettled([
      parties.acceptInvite(invitee.id, inviteA.id), parties.acceptInvite(invitee.id, inviteB.id),
    ]);
    assert.equal(settled.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(await prisma.partyMember.count({ where: { userId: invitee.id } }), 1);
  });

  it('keeps a valid leader during concurrent leader leave and ready mutation', async () => {
    const [leader, member] = await Promise.all([createUser('leavelead'), createUser('readymember')]);
    const party = await parties.createParty(leader.id);
    await prisma.partyMember.create({ data: { partyId: party.partyId, userId: member.id } });
    await Promise.all([
      parties.leave(leader.id, party.partyId),
      parties.setReady(member.id, party.partyId, 'READY'),
    ]);
    const finalParty = await prisma.party.findUniqueOrThrow({ where: { id: party.partyId } });
    assert.equal(finalParty.leaderUserId, member.id);
    assert.equal(await prisma.partyMember.count({ where: { partyId: party.partyId } }), 1);
    assert.equal((await prisma.partyMember.findUniqueOrThrow({ where: { userId: member.id } })).readyState, 'READY');
  });

  it('makes block win over concurrent friend acceptance', async () => {
    const [sender, receiver] = await Promise.all([createUser('blocksender'), createUser('blockreceiver')]);
    const request = await social.sendFriendRequest(sender.id, receiver.id);
    await Promise.allSettled([
      social.blockUser(sender.id, receiver.id),
      social.acceptFriendRequest(receiver.id, request.requestId),
    ]);
    const low = sender.id < receiver.id ? sender.id : receiver.id;
    const high = sender.id < receiver.id ? receiver.id : sender.id;
    assert.equal(await prisma.userBlock.count({ where: { blockerId: sender.id, blockedId: receiver.id } }), 1);
    assert.equal(await prisma.friendship.count({ where: { userLowId: low, userHighId: high } }), 0);
    assert.equal(await prisma.friendRequest.count({ where: { userLowId: low, userHighId: high, status: 'PENDING' } }), 0);
  });

  it('enforces authorization and privacy without exposing block direction', async () => {
    const [sender, receiver, stranger] = await Promise.all([createUser('authsend'), createUser('authrecv'), createUser('stranger')]);
    const request = await social.sendFriendRequest(sender.id, receiver.id);
    await assert.rejects(social.acceptFriendRequest(stranger.id, request.requestId));
    await assert.rejects(social.cancelFriendRequest(stranger.id, request.requestId));
    await social.updatePrivacy(receiver.id, 'NOBODY', undefined);
    await social.rejectFriendRequest(receiver.id, request.requestId);
    await assert.rejects(social.sendFriendRequest(sender.id, receiver.id));
  });

  it('supports normalized search and bounded pagination', async () => {
    const requester = await createUser('searcher');
    const target = await createUser('MixedCase');
    const exact = await social.searchPlayers(requester.id, target.profile.normalizedUsername.toUpperCase());
    assert.equal(exact.some((row: any) => row.userId === target.id), true);
    const prefix = await social.searchPlayers(requester.id, target.profile.normalizedUsername.slice(0, 5));
    assert.equal(prefix.length <= 10, true);
    const list = await social.listFriends(requester.id, 1, 20);
    assert.equal(list.limit, 20);
  });

  it('transfers leadership, resets readiness on game change, and enforces leader actions', async () => {
    const [leader, member] = await Promise.all([createUser('ruleslead'), createUser('rulesmember')]);
    await makeFriends(leader.id, member.id);
    const party = await parties.createParty(leader.id);
    const invite = await parties.invite(leader.id, party.partyId, member.id);
    await parties.acceptInvite(member.id, invite.id);
    await parties.setReady(member.id, party.partyId, 'READY');
    await assert.rejects(parties.selectGame(member.id, party.partyId, 'ATRASH'));
    const changed = await parties.selectGame(leader.id, party.partyId, 'ATRASH');
    assert.equal(changed.members.every((row: any) => row.readyState === 'NOT_READY'), true);
    await parties.leave(leader.id, party.partyId);
    const final = await parties.getMyParty(member.id);
    assert.equal(final.leaderId, member.id);
  });

  it('covers friend request validation, retry, reject, cancel, remove, and unblock lifecycle', async () => {
    const [a, b, c] = await Promise.all([createUser('lifea'), createUser('lifeb'), createUser('lifec')]);
    await assert.rejects(social.sendFriendRequest(a.id, a.id));

    const sent = await social.sendFriendRequest(a.id, b.id);
    assert.deepEqual(await social.sendFriendRequest(a.id, b.id), sent);
    assert.deepEqual(await social.rejectFriendRequest(b.id, sent.requestId), { status: 'REJECTED' });
    assert.deepEqual(await social.rejectFriendRequest(b.id, sent.requestId), { status: 'REJECTED' });

    const cancellable = await social.sendFriendRequest(a.id, c.id);
    assert.deepEqual(await social.cancelFriendRequest(a.id, cancellable.requestId), { status: 'CANCELLED' });
    assert.deepEqual(await social.cancelFriendRequest(a.id, cancellable.requestId), { status: 'CANCELLED' });

    const replacement = await social.sendFriendRequest(a.id, b.id);
    await social.acceptFriendRequest(b.id, replacement.requestId);
    await assert.rejects(social.sendFriendRequest(a.id, b.id));
    assert.deepEqual(await social.removeFriend(a.id, b.id), { status: 'REMOVED' });
    assert.deepEqual(await social.removeFriend(a.id, b.id), { status: 'REMOVED' });

    await social.blockUser(a.id, b.id);
    await assert.rejects(social.sendFriendRequest(b.id, a.id));
    assert.deepEqual(await social.unblockUser(a.id, b.id), { status: 'UNBLOCKED' });
    assert.equal((await social.sendFriendRequest(b.id, a.id)).status, 'PENDING');
  });

  it('atomically removes friendship, requests, invites, and shared-party contact when blocking', async () => {
    const [leader, member] = await Promise.all([createUser('blocklead'), createUser('blockmember')]);
    await makeFriends(leader.id, member.id);
    const party = await parties.createParty(leader.id);
    const invite = await parties.invite(leader.id, party.partyId, member.id);
    await parties.acceptInvite(member.id, invite.id);
    await social.blockUser(leader.id, member.id);
    assert.equal(await prisma.friendship.count({ where: { OR: [{ userLowId: leader.id }, { userHighId: leader.id }] } }), 0);
    assert.equal(await prisma.friendRequest.count({ where: { status: 'PENDING', OR: [{ senderId: leader.id, receiverId: member.id }, { senderId: member.id, receiverId: leader.id }] } }), 0);
    assert.equal(await prisma.partyInvite.count({ where: { status: 'PENDING', partyId: party.partyId, inviteeId: member.id } }), 0);
    assert.equal(await prisma.partyMember.count({ where: { partyId: party.partyId, userId: member.id } }), 0);
    assert.equal((await parties.getMyParty(leader.id)).leaderId, leader.id);
  });

  it('enforces party invite expiry, duplicate prevention, friendship, and leader authorization', async () => {
    const [leader, friend, stranger] = await Promise.all([createUser('invlead'), createUser('invfriend'), createUser('invstranger')]);
    await makeFriends(leader.id, friend.id);
    const party = await parties.createParty(leader.id);
    await assert.rejects(parties.invite(stranger.id, party.partyId, friend.id));
    await assert.rejects(parties.invite(leader.id, party.partyId, stranger.id));
    const first = await parties.invite(leader.id, party.partyId, friend.id);
    const duplicate = await parties.invite(leader.id, party.partyId, friend.id);
    assert.equal(duplicate.id, first.id);
    await prisma.partyInvite.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - 20 * 60_000), expiresAt: new Date(Date.now() - 10 * 60_000) },
    });
    await assert.rejects(parties.acceptInvite(friend.id, first.id));
    assert.equal((await prisma.partyInvite.findUniqueOrThrow({ where: { id: first.id } })).status, 'EXPIRED');
  });

  it('enforces game capacity and supports private code access explicitly', async () => {
    const leader = await createUser('codelead');
    const party = await parties.createParty(leader.id);
    const joiner = await createUser('codejoin');
    await assert.rejects(parties.joinByCode(joiner.id, party.roomCode));
    await parties.setCodeAccess(leader.id, party.partyId, true);
    const joined = await parties.joinByCode(joiner.id, party.roomCode.toLowerCase());
    assert.equal(joined.members.length, 2);
    for (let index = 0; index < 4; index += 1) {
      const member = await createUser(`overcap${index}`);
      await prisma.partyMember.create({ data: { partyId: party.partyId, userId: member.id } });
    }
    await assert.rejects(parties.selectGame(leader.id, party.partyId, 'ATRASH'));
    const codes = await prisma.party.findMany({ select: { code: true } });
    assert.equal(new Set(codes.map((row: any) => row.code)).size, codes.length);
  });

  it('supports kick, idempotent leave, and closing the last-member party', async () => {
    const [leader, member] = await Promise.all([createUser('kicklead'), createUser('kickmember')]);
    const party = await parties.createParty(leader.id);
    await prisma.partyMember.create({ data: { partyId: party.partyId, userId: member.id } });
    await assert.rejects(parties.kick(member.id, party.partyId, leader.id));
    await assert.rejects(parties.kick(leader.id, party.partyId, leader.id));
    const kicked = await parties.kick(leader.id, party.partyId, member.id);
    assert.equal(kicked.members.length, 1);
    assert.equal((await parties.kick(leader.id, party.partyId, member.id)).members.length, 1);
    assert.equal((await parties.leave(member.id, party.partyId)).status, 'LEFT');
    assert.equal((await parties.leave(leader.id, party.partyId)).status, 'CLOSED');
    assert.equal(await prisma.party.count({ where: { id: party.partyId } }), 0);
  });

  it('serializes concurrent kick and leave without orphaning party state', async () => {
    const [leader, member, survivor] = await Promise.all([createUser('racelead'), createUser('racemember'), createUser('racesurvivor')]);
    const party = await parties.createParty(leader.id);
    await prisma.partyMember.createMany({ data: [{ partyId: party.partyId, userId: member.id }, { partyId: party.partyId, userId: survivor.id }] });
    await Promise.allSettled([
      parties.kick(leader.id, party.partyId, member.id),
      parties.leave(member.id, party.partyId),
    ]);
    const finalParty = await prisma.party.findUniqueOrThrow({ where: { id: party.partyId } });
    assert.equal(await prisma.partyMember.count({ where: { partyId: party.partyId, userId: member.id } }), 0);
    assert.equal(await prisma.partyMember.count({ where: { partyId: party.partyId } }), 2);
    assert.equal(await prisma.partyMember.count({ where: { partyId: party.partyId, userId: finalParty.leaderUserId } }), 1);
  });
});

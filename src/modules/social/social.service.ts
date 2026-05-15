import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/database/prisma.service';
import type {
  CreateCommentDto,
  CreatePostDto,
  FriendshipActionDto,
  SendFriendRequestDto,
} from './dto/social.dto';

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Friendships ──────────────────────────────────────────────────────

  async sendRequest(requesterUserId: string, dto: SendFriendRequestDto) {
    const requester = await this.requireOperator(requesterUserId);
    const receiver = await this.prisma.operator.findUnique({
      where: { callsign: dto.callsign },
    });
    if (!receiver) throw new NotFoundException('Callsign not found.');
    if (receiver.id === requester.id) {
      throw new ConflictException('Cannot send a friend request to yourself.');
    }

    // De-dupe: also reject if the inverse pair already exists.
    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: requester.id, receiverId: receiver.id },
          { requesterId: receiver.id, receiverId: requester.id },
        ],
      },
    });
    if (existing) {
      throw new ConflictException(
        `Friendship already exists in status ${existing.status}.`,
      );
    }

    return this.prisma.friendship.create({
      data: { requesterId: requester.id, receiverId: receiver.id },
    });
  }

  async respondToRequest(
    receiverUserId: string,
    friendshipId: string,
    dto: FriendshipActionDto,
  ) {
    const receiver = await this.requireOperator(receiverUserId);
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship) throw new NotFoundException('Friendship not found.');
    if (friendship.receiverId !== receiver.id) {
      throw new ForbiddenException('Only the receiver can respond.');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new ConflictException(
        `Friendship is in status ${friendship.status}; can only act on PENDING.`,
      );
    }

    const newStatus =
      dto.action === 'accept'
        ? FriendshipStatus.ACCEPTED
        : dto.action === 'block'
          ? FriendshipStatus.BLOCKED
          : null;

    if (!newStatus) {
      // decline: hard delete so the requester can re-send later
      return this.prisma.friendship.delete({ where: { id: friendshipId } });
    }
    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: newStatus, acceptedAt: new Date() },
    });
  }

  async listFriends(userId: string) {
    const op = await this.requireOperator(userId);
    return this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: op.id }, { receiverId: op.id }],
      },
      include: {
        requester: { select: { id: true, callsign: true } },
        receiver: { select: { id: true, callsign: true } },
      },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  async listPendingIncoming(userId: string) {
    const op = await this.requireOperator(userId);
    return this.prisma.friendship.findMany({
      where: { receiverId: op.id, status: FriendshipStatus.PENDING },
      include: { requester: { select: { id: true, callsign: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Feed ─────────────────────────────────────────────────────────────

  async createPost(userId: string, dto: CreatePostDto) {
    const op = await this.requireOperator(userId);
    return this.prisma.feedPost.create({
      data: { authorId: op.id, ...dto },
    });
  }

  async listFeed(userId: string, params: { cursor?: string; take?: number }) {
    const op = await this.requireOperator(userId);
    // Friends-only feed: ACCEPTED friendships of this operator + own posts
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: op.id }, { receiverId: op.id }],
      },
      select: { requesterId: true, receiverId: true },
    });
    const friendIds = friendships.flatMap((f) =>
      f.requesterId === op.id ? [f.receiverId] : [f.requesterId],
    );

    return this.prisma.feedPost.findMany({
      where: { authorId: { in: [op.id, ...friendIds] } },
      include: {
        author: { select: { id: true, callsign: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.take ?? 20, 50),
      ...(params.cursor && { cursor: { id: params.cursor }, skip: 1 }),
    });
  }

  async likePost(userId: string, postId: string) {
    const op = await this.requireOperator(userId);
    return this.prisma.$transaction(async (tx) => {
      try {
        await tx.postLike.create({ data: { postId, operatorId: op.id } });
      } catch (err) {
        // P2002 unique violation = already liked, idempotent.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return tx.feedPost.findUnique({ where: { id: postId } });
        }
        throw err;
      }
      return tx.feedPost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
    });
  }

  async unlikePost(userId: string, postId: string) {
    const op = await this.requireOperator(userId);
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.postLike.deleteMany({
        where: { postId, operatorId: op.id },
      });
      if (deleted.count === 0) {
        return tx.feedPost.findUnique({ where: { id: postId } });
      }
      return tx.feedPost.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });
    });
  }

  async commentOnPost(userId: string, postId: string, dto: CreateCommentDto) {
    const op = await this.requireOperator(userId);
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.create({
        data: { postId, operatorId: op.id, body: dto.body },
      });
      await tx.feedPost.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
      return comment;
    });
  }

  async listComments(postId: string) {
    return this.prisma.postComment.findMany({
      where: { postId },
      include: { operator: { select: { id: true, callsign: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async requireOperator(userId: string) {
    const op = await this.prisma.operator.findUnique({ where: { userId } });
    if (!op) {
      throw new NotFoundException(
        'No operator profile for this user. Create one before using social features.',
      );
    }
    return op;
  }
}

import { z } from 'zod';

export const sendFriendRequestSchema = z.object({
  callsign: z.string().min(3).max(40),
});

export const friendshipActionSchema = z.object({
  action: z.enum(['accept', 'decline', 'block']),
});

export const createPostSchema = z.object({
  kind: z.enum(['CLIP', 'PHOTO', 'TEXT', 'ACHIEVEMENT']).default('TEXT'),
  caption: z.string().max(500).optional(),
  mediaUrl: z.string().url().optional(),
  eventId: z.string().uuid().optional(),
});

export const createCommentSchema = z.object({
  body: z.string().min(1).max(500),
});

export type SendFriendRequestDto = z.infer<typeof sendFriendRequestSchema>;
export type FriendshipActionDto = z.infer<typeof friendshipActionSchema>;
export type CreatePostDto = z.infer<typeof createPostSchema>;
export type CreateCommentDto = z.infer<typeof createCommentSchema>;

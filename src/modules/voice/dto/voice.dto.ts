import { z } from 'zod';

/**
 * Voice channels. Mapped 1:1 to LiveKit rooms by name:
 *   SQUAD   → `squad:{channelId}`     channelId = Squad.id
 *   TEAM    → `team:{channelId}`      channelId = Team.id   (a.k.a. faction)
 *   COMMAND → `command:{channelId}`   channelId = Event.id  (admins only)
 *
 * Stored as a string literal union rather than a Prisma enum because there
 * is no persisted side — tokens are stateless artifacts (CLAUDE.md §3.6).
 */
export const VOICE_CHANNELS = ['SQUAD', 'TEAM', 'COMMAND'] as const;
export type VoiceChannel = (typeof VOICE_CHANNELS)[number];

export const issueVoiceTokenSchema = z.object({
  channel: z.enum(VOICE_CHANNELS),
  channelId: z.string().uuid(),
});

export type IssueVoiceTokenDto = z.infer<typeof issueVoiceTokenSchema>;

/**
 * Response from POST /voice/tokens. Mobile clients hand `token` to the
 * LiveKit SDK along with `url`. `identity` is what shows up on peers as the
 * speaker label. `canPublish` is the policy decision (operator-member or
 * COMMAND-admin: true; admin observing a squad/team: false).
 */
export interface VoiceTokenView {
  url: string;
  token: string;
  identity: string;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  expiresAt: string;
  mode: 'stub' | 'livekit';
}

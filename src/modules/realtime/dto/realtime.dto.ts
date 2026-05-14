import { z } from 'zod';

/** Channel pattern: `event:<uuid>:positions`. Used by both publisher (PositionsProcessor)
 *  and subscriber (RealtimeSubscriber). */
export const POSITIONS_CHANNEL_PATTERN = 'event:*:positions';
export const positionsChannelOf = (eventId: string): string => `event:${eventId}:positions`;

/** Parses an event channel name into the eventId, or null if it doesn't match. */
export function eventIdFromChannel(channel: string): string | null {
  const match = /^event:([^:]+):positions$/.exec(channel);
  return match ? match[1] : null;
}

export const subscribeEventSchema = z.object({
  eventId: z.string().uuid(),
});

export type SubscribeEventDto = z.infer<typeof subscribeEventSchema>;

export interface SubscribeAck {
  ok: true;
}

export interface ErrorAck {
  ok: false;
  error: string;
}

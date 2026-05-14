import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';

import { loadEnv } from '../../config/env';
import type { AuthenticatedUser } from '../auth/dto/auth.dto';
import { AuthService } from '../auth/auth.service';
import { type ErrorAck, type SubscribeAck, subscribeEventSchema } from './dto/realtime.dto';

/**
 * Lightweight typing for the `socket.data` slot so we don't sprinkle
 * `(socket.data as any)` everywhere.
 */
interface AuthSocketData {
  user: AuthenticatedUser;
}

@WebSocketGateway({
  cors: {
    // CORS is intentionally permissive for now — real allow-list lands when
    // the admin web is wired up (sessão 3.x). Token auth is the actual gate.
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly env = loadEnv();

  @WebSocketServer()
  io!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  /**
   * socket.io middleware: runs on every handshake. Calling `next(err)` aborts
   * the connection with a `connect_error` on the client side — the right tool
   * for refusing unauthenticated/unauthorized clients.
   */
  afterInit(server: Server): void {
    server.use((socket: Socket, next: (err?: Error) => void) => {
      this.authenticate(socket).then(
        (user) => {
          (socket.data as AuthSocketData).user = user;
          next();
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : 'unauthorized';
          this.logger.debug({ message }, 'rejected ws handshake');
          next(new Error(message));
        },
      );
    });
  }

  handleConnection(socket: Socket): void {
    const user = (socket.data as AuthSocketData).user;
    this.logger.debug({ socketId: socket.id, userId: user.id }, 'admin connected');
  }

  @SubscribeMessage('subscribe:event')
  handleSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): SubscribeAck | ErrorAck {
    const parsed = subscribeEventSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: 'invalid eventId' };
    }
    void socket.join(parsed.data.eventId);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe:event')
  handleUnsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): SubscribeAck | ErrorAck {
    const parsed = subscribeEventSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: 'invalid eventId' };
    }
    void socket.leave(parsed.data.eventId);
    return { ok: true };
  }

  /**
   * Called by RealtimeSubscriber when a position lands on the Redis pub/sub
   * channel. Fans out to every connected admin in that event's room.
   */
  broadcastPosition(eventId: string, snapshot: unknown): void {
    this.io.to(eventId).emit('position', snapshot);
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private async authenticate(socket: Socket): Promise<AuthenticatedUser> {
    const token = this.extractToken(socket);
    if (!token) {
      throw new Error('missing token');
    }

    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new Error('invalid or expired token');
    }
    if (payload.type !== 'access') {
      throw new Error('wrong token type');
    }

    const user = await this.auth.getAuthenticatedUser(payload.sub);
    if (user.role !== Role.ADMIN) {
      throw new Error('admin role required for realtime channel');
    }
    return user;
  }

  private extractToken(socket: Socket): string | undefined {
    const handshake = socket.handshake as {
      auth?: { token?: unknown };
      headers: { authorization?: string };
      query?: { token?: string | string[] };
    };

    // Modern socket.io style: io(url, { auth: { token } })
    const authToken = handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    // Header fallback: Authorization: Bearer <token>
    const header = handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    // Query string fallback (least secure — logs may capture).
    const query = handshake.query?.token;
    if (typeof query === 'string' && query.length > 0) {
      return query;
    }
    return undefined;
  }
}

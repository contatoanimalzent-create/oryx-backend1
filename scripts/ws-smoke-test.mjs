/* eslint-disable */
// Manual WS smoke test (NOT in the test suite). Run while the dev server is up.
// Usage: node scripts/ws-smoke-test.mjs <baseUrl> <adminToken> <eventId>
import { io } from 'socket.io-client';

const [, , baseUrl, token, eventId] = process.argv;
if (!baseUrl || !token || !eventId) {
  console.error('Usage: node scripts/ws-smoke-test.mjs <baseUrl> <adminToken> <eventId>');
  process.exit(1);
}

const socket = io(baseUrl, { auth: { token }, transports: ['websocket'] });

socket.on('connect', () => {
  console.log('[ws] connected', socket.id);
  socket.emit('subscribe:event', { eventId }, (ack) => {
    console.log('[ws] subscribe ack:', ack);
  });
});

socket.on('connect_error', (err) => {
  console.error('[ws] connect_error:', err.message);
  process.exit(1);
});

socket.on('position', (snapshot) => {
  console.log('[ws] received position:', JSON.stringify(snapshot));
});

setTimeout(() => {
  console.log('[ws] 30s elapsed; closing');
  socket.close();
  process.exit(0);
}, 30000);

// Idempotent seed script.
// Domain seeds (operators, events, etc.) are added per module in Fase 1.x sessions.
// Until the first model exists, this script is a no-op so `prisma db seed` succeeds in CI/dev.

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[seed] no domain models yet — Fase 1.x sessions will populate this');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err);
  process.exit(1);
});

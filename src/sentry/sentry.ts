import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

import { loadEnv } from '../config/env';

let initialized = false;

/**
 * Initialise Sentry as early as possible (before any Nest module is loaded)
 * so error capture covers boot-time failures too.
 *
 * Tolerant: when SENTRY_DSN is empty (typical for local dev) this is a no-op
 * and the app boots without contacting Sentry.
 */
export function initSentry(): void {
  if (initialized) return;
  const env = loadEnv();
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE,
  });

  initialized = true;
}

export { Sentry };

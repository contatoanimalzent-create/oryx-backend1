import { Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Forward unhandled exceptions to Sentry while preserving Nest's normal
 * response behaviour (HttpException error envelopes still reach the client).
 *
 * 4xx HttpExceptions are NOT forwarded — they're typically client errors
 * (validation, auth) and would just create noise in the dashboard.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown): void {
    const isClientError = exception instanceof HttpException && exception.getStatus() < 500;

    if (!isClientError) {
      Sentry.captureException(exception);
    }

    // Re-raise so Nest's built-in filter renders the response.
    if (exception instanceof HttpException) {
      throw exception;
    }
    this.logger.error(exception);
    throw exception;
  }
}

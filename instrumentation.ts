/**
 * Next.js instrumentation hook. Runs once when the server process
 * starts; here it loads the right Sentry config for the runtime.
 *
 * The client config (sentry.client.config.ts) is loaded automatically
 * by @sentry/nextjs in the browser — only server and edge need wiring
 * up here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Captures errors thrown in nested React Server Components, surfaced by
 * Next.js via this hook.
 */
export async function onRequestError(
  ...args: Parameters<
    typeof import('@sentry/nextjs').captureRequestError
  >
) {
  const { captureRequestError } = await import('@sentry/nextjs');
  return captureRequestError(...args);
}

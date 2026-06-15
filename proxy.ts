import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * Composite proxy (Next.js 16's renamed "middleware" convention; this file
 * was `middleware.ts` until Next 16). Two responsibilities:
 *
 *   1. Refresh the Supabase session cookie on every request, so a
 *      logged-in user's session token stays current. Without this, the
 *      cookie-based client falls out of sync and authenticated requests
 *      start failing silently.
 *
 *   2. Run next-intl's locale routing afterward.
 *
 * Order matters: Supabase reads cookies from the request and may write
 * fresh cookies on the response. We must preserve those cookie writes
 * when next-intl creates its own response, or the session is lost.
 */

const intlMiddleware = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  // Start with a passthrough response so Supabase has somewhere to set
  // cookies. We'll replace it with the intl response further down,
  // but copy cookies over.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mutate the request's cookies so any downstream code in this
          // request sees the new values.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Also write them onto the response that goes back to the browser.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // Touching getUser() is what triggers the cookie refresh if the
  // access token has expired and a refresh token is available.
  await supabase.auth.getUser();

  // Now run next-intl routing on the (potentially-cookie-updated)
  // request.
  const intlResponse = intlMiddleware(request);

  // Carry Supabase's cookie writes over to whatever response next-intl
  // produced (it may be a redirect, a rewrite, or a passthrough).
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value, cookie);
  });

  return intlResponse;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};

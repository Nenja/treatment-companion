/**
 * Single source of truth for the app version shown to users and testers.
 *
 * Bump APP_VERSION and BUILD_DATE on every RELEASED build, and keep
 * `package.json` "version" in sync. The version is surfaced on the login and
 * profile screens (see components/layout/VersionTag.tsx) so a tester can always
 * report exactly which build they were on. After bumping, tag the release in
 * GitHub Desktop (e.g. `v1.0.0`) so the locked build is immutable.
 *
 * Versioning scheme: semantic versioning (MAJOR.MINOR.PATCH).
 *   - PATCH  bug fixes / copy / non-breaking tweaks
 *   - MINOR  new capability, backwards-compatible
 *   - MAJOR  breaking change to data model or user-facing flow
 */
export const APP_VERSION = '1.0.0';
export const BUILD_DATE = '2026-06-17';

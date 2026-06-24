// The clinician patient view is auth-gated and session-dependent: it
// renders entirely on the client after a visit-code unlock, so its
// statically prerendered shell is empty and useless. In this Next
// version, statically prerendering it also trips an RSC client-manifest
// bundler error. Forcing this segment dynamic skips static generation
// for this route only (every other route is unaffected) and matches how
// the page actually behaves — rendered per request, never cached.
export const dynamic = 'force-dynamic';

export default function ClinicianPatientLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}

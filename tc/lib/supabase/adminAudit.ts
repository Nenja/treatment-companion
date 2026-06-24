import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Writes an append-only audit event for an admin action.
 *
 * The admin API routes act through the service-role client (which
 * bypasses RLS), so unlike the in-database RPCs they cannot rely on
 * `auth.uid()` inside a SQL function. This helper records the same
 * shape the rest of the app uses (see migration 0002's `audit_event`
 * table): who did it, in what role, what action, on what entity.
 *
 * It is intentionally best-effort and never throws: an audit-write
 * failure must not roll back or 500 an otherwise-successful admin
 * action, but it is logged server-side so the gap is visible.
 *
 * @param admin       a service-role Supabase client
 * @param actorId     the acting admin's profile id
 * @param actorRole   the acting admin's base role (profile.role)
 * @param action      a stable verb, e.g. 'admin_account_created'
 * @param entity      the entity type, e.g. 'profile'
 * @param entityId    the affected entity's id (as text)
 * @param metadata    optional small JSON payload (no health data)
 */
export async function writeAdminAudit(
  admin: SupabaseClient,
  actorId: string,
  actorRole: string,
  action: string,
  entity: string,
  entityId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await admin.from('audit_event').insert({
      actor_profile_id: actorId,
      actor_role: actorRole,
      action,
      entity,
      entity_id: entityId,
      metadata: metadata ?? null
    });
    if (error) {
      // Surface the gap without failing the request.
      console.error('[adminAudit] failed to write audit event', {
        action,
        entity,
        entityId,
        error: error.message
      });
    }
  } catch (err) {
    console.error('[adminAudit] unexpected error writing audit event', err);
  }
}

import { dataTransaction } from "../api/data-service.mjs";
import { setVerifiedIdentity } from "./verified-data.mjs";

// The reader login has selected-column access to Auth metadata and the scoped
// identity binding. Provisioning those grants is an operator responsibility.
export function postgresSessionReader(pool, { issuer, maximumSessionMs }) {
  return async ({ issuer: requested, subject, sessionId }) => {
    if (requested !== issuer) return null;
    const row = await dataTransaction(pool, async (client) => {
      await setVerifiedIdentity(client, { issuer, subject });
      await client.query("SELECT set_config('mawid.verified_session',$1,true)", [sessionId]);
      const result = await client.query(
        `SELECT s.created_at, s.updated_at, s.not_after,
            u.banned_until, u.deleted_at, u.email_confirmed_at,
            b.actor_id, b.binding_version, b.revoked_at AS binding_revoked_at
          FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
          JOIN mawid_core.identity_bindings b ON b.subject=u.id AND b.issuer=$3
          WHERE s.id=$1 AND s.user_id=$2`,
        [sessionId, subject, issuer],
      );
      return result.rows[0];
    });
    if (!row) return null;
    return {
      issuer,
      subject,
      sessionId,
      principal: row.actor_id,
      bindingVersion: row.binding_version,
      bindingRevokedAt: row.binding_revoked_at,
      createdAt: +row.created_at,
      lastSeenAt: Math.max(+row.created_at, +row.updated_at),
      expiresAt: row.not_after ? +row.not_after : +row.created_at + maximumSessionMs,
      revokedAt: null,
      disabled: !!row.deleted_at || !row.email_confirmed_at || +row.banned_until > Date.now(),
    };
  };
}

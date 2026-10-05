// Zápis do audit_log. Best effort: chyba auditu nezhodí požiadavku. Do data nepatria osobné údaje.
export async function audit(db, { actor = null, action, entity = null, entity_id = null, data = null }, log = console) {
  try {
    await db.insert('audit_log', { actor, action, entity, entity_id: entity_id == null ? null : String(entity_id), data });
  } catch (err) {
    log.error('[audit] zápis zlyhal', action, err?.message);
  }
}

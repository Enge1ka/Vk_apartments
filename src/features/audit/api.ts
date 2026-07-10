import { supabase } from '@/shared/lib/supabase'

// The only module allowed to query the `audit_log` table. Admin-only read is
// enforced by RLS (see supabase-audit-log.sql).

export interface AuditEntry {
  id: string
  actor_name: string | null
  entity_type: string
  entity_id: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_name, entity_type, entity_id, action, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as AuditEntry[]
}

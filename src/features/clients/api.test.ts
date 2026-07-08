import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import { findOrCreateClient } from './api'

vi.mock('@/shared/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
const mockFrom = vi.mocked(supabase.from)

afterEach(() => {
  vi.restoreAllMocks()
  mockFrom.mockReset()
})

// Fakes the clients table: a phone lookup returns `candidates`, and any insert
// returns `insertedId`.
function mockClients(candidates: { id: string; full_name: string }[], insertedId = 'new-client') {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      ilike: () => Promise.resolve({ data: candidates, error: null }),
      eq: () => Promise.resolve({ data: candidates, error: null }),
    }),
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: insertedId }, error: null }) }) }),
  }) as unknown as ReturnType<typeof supabase.from>)
}

describe('findOrCreateClient', () => {
  it('reuses an existing client when phone AND name match', async () => {
    mockClients([{ id: 'frank', full_name: 'Frank' }])
    await expect(findOrCreateClient({ full_name: 'frank', phone: '0977123456' })).resolves.toBe('frank')
  })

  it('creates a NEW client when the phone matches but the name differs', async () => {
    // The bug: two guests with a shared/mistyped phone previously both became
    // the same earlier client. Now the differing name forces a new client.
    mockClients([{ id: 'frank', full_name: 'Frank' }], 'john')
    await expect(findOrCreateClient({ full_name: 'John Banda', phone: '0977123456' })).resolves.toBe('john')
  })

  it('creates a new client when nothing matches the phone', async () => {
    mockClients([], 'jane')
    await expect(findOrCreateClient({ full_name: 'Jane', phone: '0999999999' })).resolves.toBe('jane')
  })

  it('ignores case and extra whitespace when comparing names', async () => {
    mockClients([{ id: 'frank', full_name: 'Frank  Mwale' }])
    await expect(findOrCreateClient({ full_name: '  frank mwale ', phone: '0977123456' })).resolves.toBe('frank')
  })
})

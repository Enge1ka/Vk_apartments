import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import { listAuditLog } from './api'

vi.mock('@/shared/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
const mockFrom = vi.mocked(supabase.from)

afterEach(() => {
  vi.restoreAllMocks()
  mockFrom.mockReset()
})

describe('listAuditLog', () => {
  it('orders newest-first and applies the limit', async () => {
    const chain = {
      select: () => chain,
      order: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve({ data: [{ id: 'a1', action: 'payment' }], error: null })),
    }
    mockFrom.mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)

    const result = await listAuditLog(50)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(50)
    expect(result).toEqual([{ id: 'a1', action: 'payment' }])
  })

  it('throws on error', async () => {
    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: null, error: { message: 'denied' } }),
    }
    mockFrom.mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await expect(listAuditLog()).rejects.toMatchObject({ message: 'denied' })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import { listMetrics, logMetric } from './api'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

afterEach(() => {
  vi.restoreAllMocks()
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('logMetric', () => {
  it('calls log_client_metric with the expected shape', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await logMetric({ metricType: 'web-vital', metricName: 'LCP', value: 1234, rating: 'good', path: '/dashboard' })

    expect(supabase.rpc).toHaveBeenCalledWith('log_client_metric', {
      p_metric_type: 'web-vital',
      p_metric_name: 'LCP',
      p_value: 1234,
      p_rating: 'good',
      p_path: '/dashboard',
      p_metadata: null,
    })
  })

  it('warns instead of throwing when the RPC fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(logMetric({ metricType: 'query', metricName: 'listBookings', value: 1500 })).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to log metric'), 'permission denied')
  })
})

describe('listMetrics', () => {
  it('defaults to a limit of 100, most recent first', async () => {
    const chain = { select: () => chain, order: () => chain, limit: vi.fn(() => Promise.resolve({ data: [{ id: 'm1' }], error: null })) }
    supabase.from.mockReturnValue(chain)

    const result = await listMetrics()
    expect(chain.limit).toHaveBeenCalledWith(100)
    expect(result).toEqual([{ id: 'm1' }])
  })

  it('filters by metricType and since when given', async () => {
    const chain = { select: () => chain, order: () => chain, limit: () => chain, eq: vi.fn(() => chain), gte: vi.fn(() => Promise.resolve({ data: [], error: null })) }
    supabase.from.mockReturnValue(chain)

    await listMetrics({ metricType: 'query', since: '2026-01-01' })
    expect(chain.eq).toHaveBeenCalledWith('metric_type', 'query')
    expect(chain.gte).toHaveBeenCalledWith('created_at', '2026-01-01')
  })
})

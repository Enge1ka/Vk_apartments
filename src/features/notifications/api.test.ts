import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/shared/lib/supabase'
import { listBookingNotifications, sendBookingConfirmation, summarizeSendResults } from './api'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}))
const mockFrom = vi.mocked(supabase.from)
const mockInvoke = vi.mocked(supabase.functions.invoke)

afterEach(() => {
  mockFrom.mockReset()
  mockInvoke.mockReset()
})

describe('sendBookingConfirmation', () => {
  it('sends only the booking id and channels, and returns the per-channel results', async () => {
    const results = [{ channel: 'email', status: 'sent', error: null }]
    mockInvoke.mockResolvedValue({ data: { results }, error: null } as never)

    await expect(sendBookingConfirmation('b1', ['email'])).resolves.toEqual(results)
    expect(mockInvoke).toHaveBeenCalledWith('send-booking-confirmation', {
      body: { booking_id: 'b1', channels: ['email'] },
    })
  })

  it('defaults to both channels', async () => {
    mockInvoke.mockResolvedValue({ data: { results: [] }, error: null } as never)
    await sendBookingConfirmation('b1')
    expect(mockInvoke).toHaveBeenCalledWith('send-booking-confirmation', {
      body: { booking_id: 'b1', channels: ['email', 'whatsapp'] },
    })
  })

  it('throws when the function cannot be reached', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') } as never)
    await expect(sendBookingConfirmation('b1')).rejects.toThrow('boom')
  })
})

describe('listBookingNotifications', () => {
  it('reads newest-first for one booking', async () => {
    const chain = {
      select: () => chain,
      eq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve({ data: [{ id: 'n1' }], error: null })),
    }
    mockFrom.mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)

    await expect(listBookingNotifications('b1')).resolves.toEqual([{ id: 'n1' }])
    expect(chain.eq).toHaveBeenCalledWith('booking_id', 'b1')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})

describe('summarizeSendResults', () => {
  it('reports success across channels', () => {
    expect(summarizeSendResults([
      { channel: 'email', status: 'sent', error: null },
      { channel: 'whatsapp', status: 'sent', error: null },
    ])).toEqual({ ok: true, message: 'Confirmation sent by Email and WhatsApp' })
  })

  it('treats a skipped channel as fine when another one was sent', () => {
    expect(summarizeSendResults([
      { channel: 'email', status: 'skipped', error: 'Client has no email address' },
      { channel: 'whatsapp', status: 'sent', error: null },
    ])).toEqual({ ok: true, message: 'Confirmation sent by WhatsApp' })
  })

  it('surfaces a failure even if the other channel was sent', () => {
    expect(summarizeSendResults([
      { channel: 'email', status: 'sent', error: null },
      { channel: 'whatsapp', status: 'failed', error: 'Template not approved' },
    ])).toEqual({ ok: false, message: 'WhatsApp failed: Template not approved' })
  })

  it('explains why nothing was sent', () => {
    const s = summarizeSendResults([
      { channel: 'email', status: 'skipped', error: 'Client has no email address' },
      { channel: 'whatsapp', status: 'skipped', error: 'WhatsApp sending is not configured yet' },
    ])
    expect(s.ok).toBe(false)
    expect(s.message).toBe('Email: Client has no email address. WhatsApp: WhatsApp sending is not configured yet')
  })
})

import { describe, expect, it } from 'vitest'
import { BOOKING_STATUS_BADGE, getBadge } from './status'

describe('getBadge', () => {
  it('returns the mapped badge for a known status', () => {
    expect(getBadge(BOOKING_STATUS_BADGE, 'checked_in')).toEqual({ variant: 'purple', label: 'Checked In' })
  })

  it('falls back to a default badge for an unknown status', () => {
    expect(getBadge(BOOKING_STATUS_BADGE, 'weird')).toEqual({ variant: 'default', label: 'weird' })
  })
})

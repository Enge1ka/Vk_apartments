import { describe, expect, it } from 'vitest'
import {
  validateApartmentStep,
  validateCancellationReason,
  validateClientStep,
  validateInitialPayment,
} from './validators'

describe('validateClientStep', () => {
  it('requires full name and phone', () => {
    expect(validateClientStep({ full_name: 'John', phone: '0970000000' }).valid).toBe(true)
    expect(validateClientStep({ full_name: '', phone: '0970000000' }).valid).toBe(false)
    expect(validateClientStep({ full_name: 'John', phone: '' }).valid).toBe(false)
  })
})

describe('validateApartmentStep', () => {
  const BASE = { location_id: 'loc-1', apartment_id: 'apt-1', check_in_date: '2026-01-01', check_out_date: '2026-01-04', rate_per_day: '500' }

  it('accepts a complete step with check-out after check-in', () => {
    expect(validateApartmentStep(BASE).valid).toBe(true)
  })

  it('rejects missing fields', () => {
    expect(validateApartmentStep({ ...BASE, location_id: '' }).valid).toBe(false)
    expect(validateApartmentStep({ ...BASE, apartment_id: '' }).valid).toBe(false)
  })

  it('rejects check-out on or before check-in', () => {
    const result = validateApartmentStep({ ...BASE, check_out_date: '2026-01-01' })
    expect(result.valid).toBe(false)
    expect(result.errors.check_out_date).toMatch(/after check-in/)
  })

  it('rejects a zero, negative, or blank rate per day', () => {
    expect(validateApartmentStep({ ...BASE, rate_per_day: '0' }).valid).toBe(false)
    expect(validateApartmentStep({ ...BASE, rate_per_day: '-100' }).valid).toBe(false)
    const blank = validateApartmentStep({ ...BASE, rate_per_day: '' })
    expect(blank.valid).toBe(false)
    expect(blank.errors.rate_per_day).toMatch(/greater than 0|Enter a rate/)
  })
})

describe('validateInitialPayment', () => {
  it('allows zero (pay later)', () => {
    expect(validateInitialPayment('0', 1000).valid).toBe(true)
    expect(validateInitialPayment('', 1000).valid).toBe(true)
  })

  it('rejects a negative amount or one exceeding the total', () => {
    expect(validateInitialPayment('-1', 1000).valid).toBe(false)
    expect(validateInitialPayment('1500', 1000).valid).toBe(false)
  })

  it('allows paying the full total upfront', () => {
    expect(validateInitialPayment('1000', 1000).valid).toBe(true)
  })

  it('accepts the exact total even when float drift leaves it a hair short', () => {
    // 15 × 1799.99 in raw float is 26999.849999999999; typing 26999.85 must pass.
    const driftedTotal = 15 * 1799.99
    expect(validateInitialPayment('26999.85', driftedTotal).valid).toBe(true)
  })

  it('still rejects a real overpayment', () => {
    expect(validateInitialPayment('27000', 26999.85).valid).toBe(false)
  })
})

describe('validateCancellationReason', () => {
  it('requires a non-blank reason', () => {
    expect(validateCancellationReason('Guest cancelled').valid).toBe(true)
    expect(validateCancellationReason('   ').valid).toBe(false)
    expect(validateCancellationReason('').valid).toBe(false)
  })

  it('trims the returned value', () => {
    expect(validateCancellationReason('  Date change  ').value).toBe('Date change')
  })
})

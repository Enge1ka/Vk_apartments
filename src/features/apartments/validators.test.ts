import { describe, expect, it } from 'vitest'
import { validateApartment } from './validators'

const BASE = {
  location_id: 'loc-1',
  apartment_number: 'A01',
  type: 'Studio',
  daily_rate: '150',
  weekly_rate: '',
  monthly_rate: '',
  status: 'available',
  notes: '',
}

describe('validateApartment', () => {
  it('accepts a valid form and coerces rate strings to numbers', () => {
    const result = validateApartment(BASE)
    expect(result.valid).toBe(true)
    expect(result.data?.daily_rate).toBe(150)
    expect(result.data?.weekly_rate).toBeUndefined()
  })

  it('rejects a missing location, apartment number, or daily rate', () => {
    expect(validateApartment({ ...BASE, location_id: '' }).valid).toBe(false)
    expect(validateApartment({ ...BASE, apartment_number: '' }).valid).toBe(false)
    expect(validateApartment({ ...BASE, daily_rate: '' }).valid).toBe(false)
  })

  it('rejects a non-positive daily rate', () => {
    const result = validateApartment({ ...BASE, daily_rate: '0' })
    expect(result.valid).toBe(false)
    expect(result.errors.daily_rate).toMatch(/greater than 0/)
  })

  it('rejects a negative weekly/monthly rate but allows blank', () => {
    expect(validateApartment({ ...BASE, weekly_rate: '-5' }).valid).toBe(false)
    expect(validateApartment({ ...BASE, weekly_rate: '500' }).valid).toBe(true)
  })

  it('rejects an unknown status', () => {
    expect(validateApartment({ ...BASE, status: 'demolished' }).valid).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { validateLocation } from './validators'

describe('validateLocation', () => {
  it('accepts a name with an optional city', () => {
    const result = validateLocation({ name: 'Nkana East', city: 'Kitwe' })
    expect(result.valid).toBe(true)
    expect(result.data).toEqual({ name: 'Nkana East', city: 'Kitwe' })
  })

  it('trims whitespace from the name', () => {
    const result = validateLocation({ name: '  Ndola  ', city: '' })
    expect(result.valid).toBe(true)
    expect(result.data.name).toBe('Ndola')
  })

  it('rejects a missing or blank name', () => {
    expect(validateLocation({ name: '' }).valid).toBe(false)
    expect(validateLocation({ name: '   ' }).valid).toBe(false)
    expect(validateLocation({ name: '' }).errors.name).toBe('Location name is required')
  })
})

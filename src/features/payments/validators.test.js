import { describe, expect, it } from 'vitest'
import { validatePaymentAmount } from './validators'

describe('validatePaymentAmount', () => {
  it('accepts an amount within the outstanding balance', () => {
    const result = validatePaymentAmount('500', 1000)
    expect(result.valid).toBe(true)
    expect(result.value).toBe(500)
  })

  it('rejects zero, negative, blank, or non-numeric amounts', () => {
    expect(validatePaymentAmount('0', 1000).valid).toBe(false)
    expect(validatePaymentAmount('-5', 1000).valid).toBe(false)
    expect(validatePaymentAmount('', 1000).valid).toBe(false)
    expect(validatePaymentAmount('abc', 1000).valid).toBe(false)
  })

  it('rejects an amount exceeding the outstanding balance', () => {
    const result = validatePaymentAmount('1500', 1000)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/exceed/)
  })

  it('allows paying exactly the outstanding balance', () => {
    expect(validatePaymentAmount('1000', 1000).valid).toBe(true)
  })
})

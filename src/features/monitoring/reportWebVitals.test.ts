import { afterEach, describe, expect, it, vi } from 'vitest'
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import * as api from './api'
import { reportWebVitals } from './reportWebVitals'

vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}))

const mockOnCLS = vi.mocked(onCLS)
const mockOnFCP = vi.mocked(onFCP)
const mockOnINP = vi.mocked(onINP)
const mockOnLCP = vi.mocked(onLCP)
const mockOnTTFB = vi.mocked(onTTFB)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reportWebVitals', () => {
  it('registers a callback with every web-vitals metric', () => {
    reportWebVitals()
    for (const fn of [mockOnCLS, mockOnFCP, mockOnINP, mockOnLCP, mockOnTTFB]) {
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith(expect.any(Function))
    }
  })

  it('forwards a finalized metric to logMetric with the expected shape', () => {
    vi.spyOn(api, 'logMetric').mockResolvedValue()
    reportWebVitals()

    const callback = mockOnLCP.mock.calls[0][0] as (metric: any) => void
    callback({ name: 'LCP', value: 2500, rating: 'good', navigationType: 'navigate' })

    expect(api.logMetric).toHaveBeenCalledWith({
      metricType: 'web-vital',
      metricName: 'LCP',
      value: 2500,
      rating: 'good',
      path: expect.any(String),
      metadata: { navigationType: 'navigate' },
    })
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceTab from './PerformanceTab'
import * as monitoringApi from '../api'
import type { PerformanceMetric } from '../api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PerformanceTab', () => {
  it('shows the most recent value per web-vital and recent slow queries', async () => {
    vi.spyOn(monitoringApi, 'listMetrics').mockResolvedValue([
      { id: 'm1', metric_type: 'web-vital', metric_name: 'LCP', value: 2500, rating: 'good', created_at: '2026-01-02' },
      { id: 'm2', metric_type: 'web-vital', metric_name: 'LCP', value: 9000, rating: 'poor', created_at: '2026-01-01' },
      { id: 'm3', metric_type: 'query', metric_name: 'reports.loadAll', value: 1500, path: '/reports', created_at: '2026-01-02' },
    ] as unknown as PerformanceMetric[])

    render(<PerformanceTab />)

    await waitFor(() => expect(screen.getByText('LCP')).toBeInTheDocument())
    // The newest LCP row (good, 2500) should win over the older poor one.
    expect(screen.getByText('good')).toBeInTheDocument()
    expect(screen.queryByText('poor')).not.toBeInTheDocument()

    expect(screen.getByText('reports.loadAll')).toBeInTheDocument()
    expect(screen.getByText('1500ms')).toBeInTheDocument()
  })

  it('shows empty states when nothing has been recorded', async () => {
    vi.spyOn(monitoringApi, 'listMetrics').mockResolvedValue([])
    render(<PerformanceTab />)

    await waitFor(() => expect(screen.getByText('No web-vitals recorded yet.')).toBeInTheDocument())
    expect(screen.getByText('None recorded — good sign.')).toBeInTheDocument()
  })
})

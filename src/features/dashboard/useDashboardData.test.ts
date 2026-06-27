import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDashboardData } from './useDashboardData'
import * as apartmentsApi from '@/features/apartments/api'
import type { Apartment } from '@/features/apartments/api'
import * as locationsApi from '@/features/locations/api'
import type { Location } from '@/features/locations/api'
import * as bookingsApi from '@/features/bookings/api'
import * as paymentsApi from '@/features/payments/api'
import type { Payment } from '@/features/payments/api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDashboardData', () => {
  it('computes apartment status counts and per-location occupancy', async () => {
    vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue([
      { location_id: 'loc-1', status: 'occupied' },
      { location_id: 'loc-1', status: 'available' },
      { location_id: 'loc-2', status: 'maintenance' },
    ] as Apartment[])
    vi.spyOn(locationsApi, 'listLocations').mockResolvedValue([
      { id: 'loc-1', name: 'Nkana East' },
      { id: 'loc-2', name: 'Ndola' },
    ] as Location[])
    vi.spyOn(bookingsApi, 'listUpcomingCheckIns').mockResolvedValue([])
    vi.spyOn(bookingsApi, 'listUpcomingCheckOuts').mockResolvedValue([])
    vi.spyOn(paymentsApi, 'listPayments').mockResolvedValue([])

    const { result } = renderHook(() => useDashboardData({ isRestricted: false, locationId: null }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats).toMatchObject({ total: 3, occupied: 1, available: 1, maintenance: 1 })
    expect(result.current.locationStats).toEqual([
      { id: 'loc-1', name: 'Nkana East', total: 2, occupied: 1 },
      { id: 'loc-2', name: 'Ndola', total: 1, occupied: 0 },
    ])
  })

  it("sums today's payments into todayRevenue", async () => {
    vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue([])
    vi.spyOn(locationsApi, 'listLocations').mockResolvedValue([])
    vi.spyOn(bookingsApi, 'listUpcomingCheckIns').mockResolvedValue([])
    vi.spyOn(bookingsApi, 'listUpcomingCheckOuts').mockResolvedValue([])
    vi.spyOn(paymentsApi, 'listPayments').mockImplementation(async (filters) => {
      // Distinguish the "today" call (has dateFrom) from the "recent" call (has limit).
      if (filters?.dateFrom) return [{ amount: '100' }, { amount: '50' }] as unknown as Payment[]
      return []
    })

    const { result } = renderHook(() => useDashboardData({ isRestricted: false, locationId: null }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats.todayRevenue).toBe(150)
  })

  it('scopes the apartments query and restricts visible locations for restricted users', async () => {
    vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue([])
    vi.spyOn(locationsApi, 'listLocations').mockResolvedValue([
      { id: 'loc-1', name: 'Nkana East' },
      { id: 'loc-2', name: 'Ndola' },
    ] as Location[])
    vi.spyOn(bookingsApi, 'listUpcomingCheckIns').mockResolvedValue([])
    vi.spyOn(bookingsApi, 'listUpcomingCheckOuts').mockResolvedValue([])
    vi.spyOn(paymentsApi, 'listPayments').mockResolvedValue([])

    const { result } = renderHook(() => useDashboardData({ isRestricted: true, locationId: 'loc-1' }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(apartmentsApi.listApartments).toHaveBeenCalledWith({ locationId: 'loc-1' })
    expect(result.current.locationStats.map(l => l.id)).toEqual(['loc-1'])
  })
})

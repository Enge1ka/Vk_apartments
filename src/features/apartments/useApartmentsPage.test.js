import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useApartmentsPage } from './useApartmentsPage'
import * as apartmentsApi from './api'
import * as locationsApi from '@/features/locations/api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useApartmentsPage', () => {
  it('loads apartments and locations together', async () => {
    vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue([{ id: 'apt-1' }])
    vi.spyOn(locationsApi, 'listLocations').mockResolvedValue([{ id: 'loc-1' }])
    vi.spyOn(apartmentsApi, 'subscribeToApartmentChanges').mockReturnValue(() => {})

    const { result } = renderHook(() => useApartmentsPage({ isRestricted: false, locationId: null }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.apartments).toEqual([{ id: 'apt-1' }])
    expect(result.current.locations).toEqual([{ id: 'loc-1' }])
    expect(apartmentsApi.listApartments).toHaveBeenCalledWith({})
  })

  it('scopes the apartments query to the location when restricted', async () => {
    vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue([])
    vi.spyOn(locationsApi, 'listLocations').mockResolvedValue([])
    vi.spyOn(apartmentsApi, 'subscribeToApartmentChanges').mockReturnValue(() => {})

    const { result } = renderHook(() => useApartmentsPage({ isRestricted: true, locationId: 'loc-1' }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(apartmentsApi.listApartments).toHaveBeenCalledWith({ locationId: 'loc-1' })
  })

  it('skips the query entirely for a restricted user with no assigned location', async () => {
    vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue([{ id: 'should-not-be-returned' }])
    vi.spyOn(locationsApi, 'listLocations').mockResolvedValue([])
    vi.spyOn(apartmentsApi, 'subscribeToApartmentChanges').mockReturnValue(() => {})

    const { result } = renderHook(() => useApartmentsPage({ isRestricted: true, locationId: null }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(apartmentsApi.listApartments).not.toHaveBeenCalled()
    expect(result.current.apartments).toEqual([])
  })
})

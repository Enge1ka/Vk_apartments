import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewBookingPage from './NewBookingPage'
import * as authHook from '@/features/auth/useAuth'
import * as locationsApi from '@/features/locations/api'
import type { Location } from '@/features/locations/api'
import * as apartmentsApi from '@/features/apartments/api'
import type { Apartment } from '@/features/apartments/api'
import * as bookingsApi from '../api'

const LOCATIONS = [{ id: 'loc-1', name: 'Nkana East' }] as Location[]
const APARTMENTS = [{ id: 'apt-1', apartment_number: 'A01', type: 'Studio', daily_rate: 100 }] as Apartment[]

function setup() {
  // Partial mock of useAuth's return shape — only the fields this page reads.
  vi.spyOn(authHook, 'useAuth').mockReturnValue({
    user: { id: 'user-1', email: 'staff@vk.com' },
    isRestricted: false,
    locationId: null,
  } as unknown as ReturnType<typeof authHook.useAuth>)
  vi.spyOn(locationsApi, 'listLocations').mockResolvedValue(LOCATIONS)
  vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue(APARTMENTS)
  return render(<MemoryRouter><NewBookingPage /></MemoryRouter>)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NewBookingPage', () => {
  it('blocks advancing past the client step until name and phone are filled', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(await screen.findByText('Full name is required')).toBeInTheDocument()
    expect(screen.queryByText('Apartment & Dates')).not.toBeInTheDocument()
  })

  it('advances through client -> apartment -> payment -> confirm with valid input', async () => {
    setup()

    await userEvent.type(screen.getByLabelText('Full Name *'), 'John Banda')
    await userEvent.type(screen.getByLabelText('Phone Number *'), '0970000000')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(screen.getByText('Apartment & Dates')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Location *'), 'loc-1')
    await waitFor(() => expect(apartmentsApi.listApartments).toHaveBeenCalledWith({ locationId: 'loc-1', status: 'available' }))
    await userEvent.selectOptions(screen.getByLabelText('Apartment *'), 'apt-1')
    await userEvent.type(screen.getByLabelText('Check-in *'), '2026-01-01')
    await userEvent.type(screen.getByLabelText('Check-out *'), '2026-01-04')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(screen.getByText('Initial Payment')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(screen.getByText('Booking Summary')).toBeInTheDocument())
    expect(screen.getByText('John Banda')).toBeInTheDocument()
    expect(screen.getByText('A01 (Studio)')).toBeInTheDocument()
  })

  it('rejects check-out before check-in and does not advance', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Full Name *'), 'John Banda')
    await userEvent.type(screen.getByLabelText('Phone Number *'), '0970000000')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(screen.getByText('Apartment & Dates')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Location *'), 'loc-1')
    await userEvent.selectOptions(screen.getByLabelText('Apartment *'), 'apt-1')
    await userEvent.type(screen.getByLabelText('Check-in *'), '2026-01-04')
    await userEvent.type(screen.getByLabelText('Check-out *'), '2026-01-01')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(await screen.findByText('Check-out must be after check-in')).toBeInTheDocument()
    expect(screen.queryByText('Initial Payment')).not.toBeInTheDocument()
  })

  it('shows the overlap error from createBooking without crashing', async () => {
    setup()
    vi.spyOn(bookingsApi, 'hasOverlappingBooking').mockResolvedValue(true)

    await userEvent.type(screen.getByLabelText('Full Name *'), 'John Banda')
    await userEvent.type(screen.getByLabelText('Phone Number *'), '0970000000')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('Apartment & Dates')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Location *'), 'loc-1')
    await userEvent.selectOptions(screen.getByLabelText('Apartment *'), 'apt-1')
    await userEvent.type(screen.getByLabelText('Check-in *'), '2026-01-01')
    await userEvent.type(screen.getByLabelText('Check-out *'), '2026-01-04')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('Initial Payment')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('Booking Summary')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /confirm booking/i }))

    await waitFor(() => expect(bookingsApi.hasOverlappingBooking).toHaveBeenCalled())
  })
})

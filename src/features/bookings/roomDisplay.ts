import type { RoomSummary } from './api'

// A booking can now cover several apartments. These format the room set for
// summary rows (dashboard, lists, receipts) without each caller re-deriving it.

export function roomNumbers(rooms: RoomSummary[] | undefined | null): string {
  const nums = (rooms ?? []).map(r => r.apartment?.apartment_number).filter(Boolean)
  return nums.length ? nums.join(', ') : '—'
}

// Location is shown once per booking; take the first room that has one.
// (Staff book within their location, so a booking's rooms share a location.)
export function roomLocationName(rooms: RoomSummary[] | undefined | null): string {
  return (rooms ?? []).find(r => r.apartment?.location?.name)?.apartment?.location?.name ?? '—'
}

// e.g. "3 rooms" / "1 room" for badges/subtitles.
export function roomCountLabel(rooms: RoomSummary[] | undefined | null): string {
  const n = (rooms ?? []).length
  return `${n} ${n === 1 ? 'room' : 'rooms'}`
}

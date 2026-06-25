# Database Schema

Supabase Postgres. Apply in this order:

1. `supabase-schema.sql` — base tables, RLS, seed data.
2. `supabase-fixes.sql` — `next_booking_ref()`, `record_payment()`.
3. `supabase-publish-update.sql` — RLS policy update for staff-managed locations/apartments.
4. `supabase-refactor.sql` — `update_booking_status()`, the booking-overlap exclusion constraint.

## Tables

### `locations`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | required |
| `city` | text | |
| `created_at` | timestamptz | |

### `apartments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `location_id` | uuid FK → `locations.id` | `ON DELETE CASCADE` |
| `apartment_number` | text | required |
| `type` | text | default `'Studio'` |
| `daily_rate` | numeric(10,2) | required |
| `weekly_rate`, `monthly_rate` | numeric(10,2) | optional |
| `status` | text | `available` \| `occupied` \| `maintenance` (CHECK) |
| `notes` | text | |

### `clients`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `full_name`, `phone` | text | required |
| `nrc_or_passport`, `email`, `company` | text | optional |

### `bookings`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `booking_reference` | text | unique, generated via `next_booking_ref()` |
| `client_id` | uuid FK → `clients.id` | |
| `apartment_id` | uuid FK → `apartments.id` | |
| `check_in_date`, `check_out_date` | date | required |
| `number_of_days` | integer | **generated**: `check_out_date - check_in_date` |
| `rate_per_day`, `total_amount`, `amount_paid` | numeric(10,2) | |
| `outstanding_balance` | numeric(10,2) | **generated**: `total_amount - amount_paid` |
| `payment_status` | text | `unpaid` \| `partial` \| `paid` (CHECK) |
| `booking_status` | text | `confirmed` \| `checked_in` \| `checked_out` \| `cancelled` (CHECK) |
| `created_by` | uuid FK → `auth.users.id` | |

**Constraint (added by `supabase-refactor.sql`):** `no_overlapping_bookings` — a gist exclusion constraint on `(apartment_id, daterange(check_in_date, check_out_date, '[)'))` for any non-cancelled booking. The database rejects an overlapping insert/update outright, regardless of any client-side pre-check race.

### `payments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `booking_id` | uuid FK → `bookings.id` | |
| `client_id` | uuid FK → `clients.id` | |
| `amount` | numeric(10,2) | required, `> 0` (enforced in `record_payment()`) |
| `payment_date` | date | |
| `payment_method` | text | `cash` \| `mobile_money` \| `bank_transfer` \| `card` (CHECK) |
| `receipt_number` | text | unique, generated via `record_payment()`'s sequence |
| `recorded_by` | uuid FK → `auth.users.id` | |

### `profiles`
Extends `auth.users`. `role` (`admin` \| `employee`) and `location_id` drive Row Level Security: non-admins ("restricted" staff) only see/manage data for their assigned `location_id`.

## RPCs (`SECURITY DEFINER`, used instead of direct table writes for anything that must be atomic)

- **`next_booking_ref()`** — returns the next `VKL-YYYY-NNNN` reference from a sequence (collision-free).
- **`record_payment(p_booking_id, p_amount, p_payment_date, p_payment_method)`** — locks the booking row, validates the amount against the outstanding balance, inserts the payment, and updates `bookings.amount_paid`/`payment_status` in one transaction. Client/recorder identity is derived server-side from the booking row and `auth.uid()`, not from caller-supplied parameters.
- **`update_booking_status(p_booking_id, p_new_status, p_notes DEFAULT NULL)`** — locks the booking row, checks the caller's role/location against the booking's apartment, updates `apartments.status` and `bookings.booking_status`/`notes` together. Replaces what used to be two separate, unguarded client-side `UPDATE`s (the source of an apartment/booking status desync bug) and adds the server-side admin check that cancellation previously relied on the UI alone to enforce.

## Row Level Security summary

All tables have RLS enabled. Authenticated users can read everything. Non-admin ("restricted") staff are scoped to their `profiles.location_id` for managing `apartments`/`locations`; `bookings`/`payments` row-level writes are further constrained by the RPCs above, since plain `UPDATE`/`INSERT` policies on those tables don't have enough context (e.g. role) to gate a specific status transition like cancellation.

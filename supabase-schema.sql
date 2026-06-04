-- VK Luxurious Apartments — Supabase Schema
-- Run this in your Supabase SQL Editor

-- 1. Locations
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  created_at timestamptz DEFAULT now()
);

-- 2. Apartments
CREATE TABLE apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  apartment_number text NOT NULL,
  type text DEFAULT 'Studio',
  daily_rate numeric(10,2) NOT NULL,
  weekly_rate numeric(10,2),
  monthly_rate numeric(10,2),
  status text DEFAULT 'available' CHECK (status IN ('available','occupied','maintenance')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 3. Clients
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  nrc_or_passport text,
  phone text NOT NULL,
  email text,
  company text,
  created_at timestamptz DEFAULT now()
);

-- 4. Bookings
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text UNIQUE NOT NULL,
  client_id uuid REFERENCES clients(id),
  apartment_id uuid REFERENCES apartments(id),
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  number_of_days integer GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
  rate_per_day numeric(10,2) NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  amount_paid numeric(10,2) DEFAULT 0,
  outstanding_balance numeric(10,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  booking_status text DEFAULT 'confirmed' CHECK (booking_status IN ('confirmed','checked_in','checked_out','cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Payments
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id),
  client_id uuid REFERENCES clients(id),
  amount numeric(10,2) NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text CHECK (payment_method IN ('cash','mobile_money','bank_transfer','card')),
  receipt_number text UNIQUE NOT NULL,
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- 6. Profiles (extends Supabase Auth users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  role text DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  location_id uuid REFERENCES locations(id),
  created_at timestamptz DEFAULT now()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ========== ROW LEVEL SECURITY ==========

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything
CREATE POLICY "auth_read_locations" ON locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_apartments" ON apartments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_clients" ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_bookings" ON bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_payments" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_profiles" ON profiles FOR SELECT TO authenticated USING (true);

-- Authenticated users can insert/update bookings, clients, payments
CREATE POLICY "auth_insert_bookings" ON bookings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_bookings" ON bookings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_insert_clients" ON clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_clients" ON clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_insert_payments" ON payments FOR INSERT TO authenticated WITH CHECK (true);

-- Authenticated staff can manage apartments and locations
CREATE POLICY "auth_manage_apartments" ON apartments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_manage_locations" ON locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_manage_profiles" ON profiles FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ========== SEED DATA ==========

INSERT INTO locations (name, city) VALUES
  ('Nkana East', 'Kitwe'),
  ('Ndola', 'Ndola'),
  ('Kalulushi', 'Kalulushi');

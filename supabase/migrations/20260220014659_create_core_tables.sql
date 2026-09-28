
-- 建立 courses 表
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  content TEXT DEFAULT '',
  price INTEGER NOT NULL,
  duration TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 建立 bookings 表
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 建立 booking_closed_dates 表（含時段支援）
CREATE TABLE IF NOT EXISTS booking_closed_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  closed_slots TEXT[] DEFAULT '{}',
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date)
);

-- 建立 products 表
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  stock INTEGER DEFAULT 0 CHECK (stock >= 0),
  description TEXT DEFAULT '',
  images TEXT[] DEFAULT '{}',
  category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 建立 orders 表
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_address TEXT,
  transfer_code TEXT,
  items JSONB NOT NULL,
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 建立 gallery 表
CREATE TABLE IF NOT EXISTS gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_closed_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;

-- 建立公開讀取 policies
CREATE POLICY "Allow public read courses" ON courses FOR SELECT USING (true);
CREATE POLICY "Allow public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow public read gallery" ON gallery FOR SELECT USING (true);
CREATE POLICY "Allow public read booking_closed_dates" ON booking_closed_dates FOR SELECT USING (true);
CREATE POLICY "Allow public read bookings" ON bookings FOR SELECT USING (true);
CREATE POLICY "Allow public read orders" ON orders FOR SELECT USING (true);

-- 建立公開寫入 policies（前台表單用）
CREATE POLICY "Allow public insert bookings" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert orders" ON orders FOR INSERT WITH CHECK (true);

-- 建立 authenticated 使用者完整 policies（後台管理用）
CREATE POLICY "Allow auth all courses" ON courses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth all products" ON products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth all gallery" ON gallery FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth all booking_closed_dates" ON booking_closed_dates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth all bookings" ON bookings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth all orders" ON orders FOR ALL USING (auth.role() = 'authenticated');

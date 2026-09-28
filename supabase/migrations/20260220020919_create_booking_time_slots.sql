
-- 建立可設定的預約時段表
CREATE TABLE IF NOT EXISTS booking_time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE booking_time_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read booking_time_slots" ON booking_time_slots FOR SELECT USING (true);
CREATE POLICY "Allow auth all booking_time_slots" ON booking_time_slots FOR ALL USING (auth.role() = 'authenticated');

-- 寫入預設時段
INSERT INTO booking_time_slots (label, start_time, end_time, sort_order) VALUES
('上午班', '09:30', '13:00', 1),
('下午班', '14:00', '17:30', 2);

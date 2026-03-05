-- Migration: Add check_out_date column to attendance table
-- Purpose: Support overnight/cross-day shifts where check-in and check-out dates differ
-- Date: 2026-03-01

BEGIN;

-- Add check_out_date column if it doesn't exist
ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS check_out_date DATE;

-- Add index for finding open attendance records
CREATE INDEX IF NOT EXISTS idx_attendance_open_records 
ON attendance(employee_id, check_out_time) 
WHERE check_out_time IS NULL;

COMMIT;

-- Verification queries
SELECT 'Migration completed. Checking attendance table structure:' as message;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'attendance' 
ORDER BY ordinal_position;

-- Add email_verified_at column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN employees.email_verified_at IS 'Timestamp when email was verified';

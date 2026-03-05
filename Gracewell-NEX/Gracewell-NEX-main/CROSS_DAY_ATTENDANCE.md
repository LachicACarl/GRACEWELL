# Cross-Day Attendance Records Implementation

## Overview
The system now supports overnight shifts where employees check in on one day and check out on the next day (e.g., Monday 8AM check-in, Tuesday 8AM check-out).

## Changes Made

### 1. Backend Endpoints

#### `/qr-attendance/check-in` (Enhanced)
- **Old Behavior**: Only looked for today's attendance record
- **New Behavior**: 
  - Searches for any OPEN attendance record (check_out_time IS NULL) regardless of date
  - Allows verification of existing records before creating new ones
  - Logs warnings about previous unclosed records
  - Prevents duplicate check-ins on the same day

#### `/qr-attendance/check-out` (Fixed)
- **Old Behavior**: Only searched for today's attendance record; failed if employee checked in yesterday
- **New Behavior**:
  - Searches for ANY open attendance record (not limited to today)
  - Automatically calculates hours worked across dates
  - Supports overnight shifts seamlessly
  - Sets both `check_out_time` and `check_out_date` to properly track when checkout occurred
  - Returns detailed info including check-in date and check-out date

#### `/attendance/check-in` (Enhanced)
- **Old Behavior**: Only worked with today's records
- **New Behavior**:
  - Searches for any open record from any date
  - Intelligently determines if scan should be check-in or check-out
  - Properly handles overnight shifts
  - Returns comprehensive response including dates and hours worked

### 2. Database Schema Changes

#### New Field: `check_out_date`
- **Type**: DATE
- **Purpose**: Records the actual date when an employee checked out
- **Example**: 
  - Employee checks in Monday: `attendance_date = 2026-03-01`, `check_out_date = NULL`
  - Employee checks out Tuesday: `check_out_date = 2026-03-02`
  - Hours are calculated from Monday check-in time to Tuesday check-out time

#### New Index: `idx_attendance_open_records`
- Efficiently finds open attendance records (where `check_out_time IS NULL`)
- Indexed on `(employee_id, check_out_time)` for optimal query performance
- Speeds up cross-day record lookups

### 3. Calculation Logic

#### Hours Worked
For overnight shifts, hours are calculated correctly across the date boundary:
```
checkInDateTime = Date(Monday + check_in_time)      // e.g., 2026-03-01 08:00:00
checkOutDateTime = Date(Tuesday + check_out_time)   // e.g., 2026-03-02 08:30:00
hoursWorked = (checkOutDateTime - checkInDateTime) / 3600000
// Result: 24.5 hours worked
```

## Test Scenarios

### Test 1: Monday 8AM Check-in, Tuesday 8AM Check-out
```
Step 1: Employee checks in on Monday 8:00 AM
  - Record created: attendance_date=Monday, check_in_time=08:00, check_out_time=NULL

Step 2: Employee checks out on Tuesday 8:00 AM
  - System finds Monday's open record
  - Record updated: check_out_time=08:00, check_out_date=Tuesday, hours_worked=24.0
```

### Test 2: Prevent Duplicate Check-ins
```
Step 1: Employee checks in on Monday 08:00
Step 2: Employee scans again on Monday 09:00 (attempt duplicate check-in)
  - System detects today's record is open
  - Response: "Employee already checked in. Please check out."
```

### Test 3: Missing Check-in
```
Step 1: Employee attempts to check out on Tuesday without checking in first
  - System looks for any open record
  - Response: "Employee has not checked in yet"
```

### Test 4: Already Checked Out
```
Step 1: Employee checks in Monday 08:00
Step 2: Employee checks out Monday 17:00
Step 3: Employee attempts to check out again on Monday
  - System detects check_out_time is not NULL
  - Response: "Employee already checked out"
```

## Database Migration

To apply the new `check_out_date` column to existing databases:

```bash
# Option 1: Run migration script
psql -U postgres -d your_database -f add-check-out-date-column.sql

# Option 2: Manual SQL (Supabase dashboard)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_date DATE;
CREATE INDEX IF NOT EXISTS idx_attendance_open_records 
ON attendance(employee_id, check_out_time) 
WHERE check_out_time IS NULL;
```

## API Response Examples

### Check-in Success (Monday 8AM)
```json
{
  "action": "check_in",
  "message": "Check-in recorded successfully",
  "employee": {
    "id": "E001",
    "name": "John Doe",
    "checkInTime": "08:00:00",
    "checkInDate": "2026-03-01"
  }
}
```

### Check-out Success (Tuesday 8AM after Monday check-in)
```json
{
  "action": "check_out",
  "message": "Check-out recorded successfully",
  "employee": {
    "id": "E001",
    "name": "John Doe",
    "checkInDate": "2026-03-01",
    "checkOutDate": "2026-03-02",
    "checkOutTime": "08:00:00",
    "hoursWorked": 24.0
  }
}
```

### Overnight Shift Detected (Check-out after previous unclosed record)
```json
{
  "action": "check_out",
  "message": "Check-out recorded successfully (overnight shift)",
  "employee": {
    "id": "E001",
    "name": "John Doe",
    "checkInDate": "2026-02-28",
    "checkOutDate": "2026-03-01",
    "checkOutTime": "06:00:00",
    "hoursWorked": 22.0
  }
}
```

## Backward Compatibility

- Existing same-day attendance records work unchanged
- The `check_out_date` column defaults to NULL for open records
- For completed records within a single day, `check_out_date` will be populated with the same date as `attendance_date`
- All queries remain backward compatible

## Performance Considerations

- Index on `(employee_id, check_out_time)` makes open record lookups O(1) in best case
- Queries filter for `check_out_time IS NULL` to find open records efficiently
- Ordered by `attendance_date DESC` to get most recent open record first

## Future Enhancements

1. **Shift Management**: Add shift definitions to allow/restrict overnight shifts
2. **Alerts**: Notify admins of employees with unclosed records from previous days
3. **Reports**: Generate overnight shift reports
4. **Schedule Integration**: Auto-validate overnight shifts against employee schedules
5. **Approval Workflow**: Require manager approval for overnight shifts over a certain duration

## Notes

- Payroll computation is independent of this change (no direct salary impact)
- This change applies only to attendance recording logic
- Cross-day records are fully supported for reporting and analytics

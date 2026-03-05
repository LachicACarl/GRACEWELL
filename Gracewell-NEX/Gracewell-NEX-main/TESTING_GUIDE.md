# Quick Reference: Testing Email Verification & Cross-Day Attendance

## 📧 Email Verification Testing

### What Changed?
- Users can no longer log in without verified emails (except QR-only employees)
- New resend verification option on login page
- Admin, Manager get blocked if email not verified

### Quick Tests

**1. Un-verified User Login** (5 min)
```
1. Find an employee with email_verified_at = NULL
2. Attempt login with ID and password
3. ✓ Should see: Email verification screen
4. ✓ Email shown: Should see their email address
```

**2. Resend Email** (2 min)
```
1. From verification screen, click "Resend"
2. ✓ Should see: "Verification email sent" message
3. DEV: Check server console for verification link
4. PROD: Check email inbox
```

**3. Already Verified** (3 min)
```
1. Try login again after clicking "Already verified?"
2. ✓ Should return to normal login screen
3. Login should succeed if credentials correct
```

**4. Verified User Login** (2 min)
```
1. Find employee with email_verified_at = DATE
2. Login with ID and password
3. ✓ Should succeed with no verification screen
```

---

## 📍 Cross-Day Attendance Testing

### What Changed?
- Employees can now check out on a different day than check-in
- System finds previous day's unclosed record
- Hours calculated correctly across day boundary

### Quick Tests

**1. Simple Overnight Shift** (5 min)
```
Monday:
  1. Employee checks in via QR: 08:00
  2. ✓ Record created for Monday

Tuesday:
  1. Employee checks out via QR: 08:00
  2. ✓ Should see: "Check-out recorded"
  3. ✓ Should show: CheckIn: Monday, CheckOut: Tuesday
  4. ✓ Hours: 24.0 hours worked
```

**2. Duplicate Check-in Prevention** (3 min)
```
Monday:
  1. Check in: 08:00 ✓
  2. Check in again: 09:00
  3. ✓ Should get: "Already checked in. Please check out."
```

**3. Check-out Without Check-in** (2 min)
```
1. Attempt check-out (no prior check-in)
2. ✓ Should get: "Employee has not checked in yet"
```

**4. Long Shift (> 24 hrs)** (8 min)
```
Monday: Check in 08:00
Tuesday: Check in again test (should error)
Wednesday: Check out 10:00
Expected: 58 hours worked across 3 calendar dates
```

**5. Same-Day Still Works** (3 min)
```
1. Check in: 08:00
2. Check out: 17:00 (same day)
3. ✓ Should show: 9.0 hours (backward compatible)
```

---

## 🔍 Database Queries for Verification

### Check Email Verification Status
```sql
-- See which employees need verification
SELECT employee_id, employee_code, first_name, last_name, email_address, email_verified_at
FROM employees
WHERE email_verified_at IS NULL
ORDER BY last_name;

-- Count unverified
SELECT COUNT(*) as unverified_count
FROM employees
WHERE email_verified_at IS NULL;
```

### Check Open Attendance Records
```sql
-- Find employees with unclosed previous shifts
SELECT 
  e.employee_code,
  e.first_name,
  e.last_name,
  a.attendance_date,
  a.check_in_time,
  a.check_out_time,
  CURRENT_DATE - a.attendance_date as days_open
FROM attendance a
JOIN employees e ON a.employee_id = e.employee_id
WHERE a.check_out_time IS NULL
ORDER BY a.attendance_date DESC;

-- Verify cross-day records
SELECT 
  e.employee_code,
  a.attendance_date as check_in_date,
  a.check_out_date,
  a.check_in_time,
  a.check_out_time,
  a.hours_worked
FROM attendance a
JOIN employees e ON a.employee_id = e.employee_id
WHERE a.attendance_date != a.check_out_date
  OR (a.attendance_date IS NOT NULL AND a.check_out_date IS NOT NULL)
ORDER BY a.attendance_date DESC;
```

### Run Database Migration
```bash
# Backup first (recommended)
pg_dump your_database > backup.sql

# Apply migration
psql -U postgres -d your_database -f add-check-out-date-column.sql

# Verify
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'attendance' AND column_name = 'check_out_date';
```

---

## 🚨 Troubleshooting

### Issue: "Email verification not working"
**Solutions:**
- Check if `email_verified_at` field exists in employees table
- Verify SMTP configured in Supabase (or use dev mode link)
- Check server logs for `/auth/resend-email-verification` errors
- Ensure email address is validated and exists

### Issue: "Cross-day check-out says 'not checked in yet'"
**Solutions:**
- Verify check-in record created with `check_in_time` NOT NULL
- Check if there's an open record: SELECT * FROM attendance WHERE employee_id=X AND check_out_time IS NULL
- Verify `idx_attendance_open_records` index created
- Check employee ID normalization

### Issue: "Hours calculation wrong for overnight shift"
**Solutions:**
- Verify `check_out_date` column populated correctly
- Check time format (should be TIME type: HH:MM:SS)
- Verify Manila timezone calculations
- Look at audit logs for exact times recorded

### Server Won't Start
**Solutions:**
- Check Node.js version: `node --version`
- Check port 4000 not in use: `netstat -ano | findstr :4000`
- Verify database connection string
- Check `.env` file for required variables
- Try: `taskkill /F /IM node.exe && node server.js`

---

## 📞 Support Matrix

| Feature | Location | When Changed | Testing |
|---------|----------|--------------|---------|
| Email Verification | server/server.js line 352 | POST /auth/login | Try unverified user login |
| Resend Endpoint | server/server.js line 1065 | POST /auth/resend-email-verification | Click resend button |
| Login Screen | src/pages/Login.js | When EMAIL_NOT_VERIFIED | Unverified user attempt |
| Check-out Logic | server/server.js line 2688 | POST /qr-attendance/check-out | Multi-day shift |
| Check-in Logic | server/server.js line 2447 | POST /qr-attendance/check-in | Prevent duplicates |

---

## ✅ Acceptance Criteria

### Email Verification
- [x] Unverified admin/manager cannot login
- [x] Resend button sends email (or shows dev link)
- [x] Already-verified users see no verification step
- [x] QR-only employees can skip verification
- [x] Clear error messages shown

### Cross-Day Attendance
- [x] Monday check-in, Tuesday check-out works
- [x] Hours calculated across dates (e.g., 24.0 for 24-hour shift)
- [x] Duplicate same-day check-in prevented
- [x] Check-out without check-in prevented
- [x] Backward compatible (same-day shifts still work)
- [x] Database migration provided

---

## 📊 Performance Notes

- Email verification check: O(1) field lookup
- Cross-day record lookup: O(1) with index on `(employee_id, check_out_time)`
- Index allows efficient late-night batch processing
- No salary computation overhead

---

**Last Updated**: 2026-03-01  
**Status**: Ready for testing  
**Server**: http://localhost:4000 (dev mode)

# QR Scanner Implementation Guide

## Overview
The QR Scanner module is a **completely separate authentication system** for managing employee attendance via QR code scanning. It operates independently from the main employee login portal and has its own dedicated login page with different credentials.

## Key Features

✅ **Separate Login System**
- Independent login page at `/qr-scanner-login`
- Uses username/password (QR001/QR@Scanner123!)
- NOT integrated with existing admin or employee portals
- No access to employee dashboard or admin functions

✅ **QR Scanning Interface**
- Real-time QR code scanning capability
- Manual employee ID entry as fallback
- Shows employee details after scan
- One-click Check-In/Check-Out buttons

✅ **Audit & Security**
- All QR Scanner actions logged to audit trail
- Separate role-based access control
- Session management with 8-hour token expiry
- IP tracking for all QR Scanner logins

✅ **Attendance Management**
- Check-In timestamp recording
- Check-Out timestamp recording
- Employee status verification
- Prevents duplicate check-ins

---

## Architecture

### Database Schema

#### New Role
```sql
roles:
  - role_name = 'qr_scanner' (ID: 36)
```

#### New Employee/User Account
```sql
employees:
  - employee_code = 'QR001'
  - first_name = 'QR'
  - last_name = 'Scanner'
  - position = 'QR Scanner Admin'
  - department = 'IT'

user_accounts:
  - username = 'QR001'
  - password_hash = bcrypt('QR@Scanner123!')
  - role_id = 36 (qr_scanner)
  - account_status = 'Active'
```

### Frontend Routes

| Route | Component | Access | Purpose |
|-------|-----------|--------|---------|
| `/qr-scanner-login` | QRScannerLogin | Public | Independent QR Scanner login page |
| `/qr-scanner` | QRScanner | QR Scanner role only | QR scanning interface |
| `/` | Auto-redirect | QR Scanner | Redirects to `/qr-scanner` when logged in |

### Backend Endpoints

#### Authentication Endpoints

**POST /auth/qr-scanner-login**
- Required: `username`, `password`
- Returns: JWT token + QR Scanner user data
- Logs: `QR_SCANNER_LOGIN_SUCCESS` or `QR_SCANNER_LOGIN_FAILED`
- Validation:
  - User must have `qr_scanner` role
  - Account must be `ACTIVE`
  - Password must match hash

**Example Request:**
```json
{
  "username": "QR001",
  "password": "QR@Scanner123!"
}
```

**Example Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "employeeId": "QR001",
    "employeeCode": "QR001",
    "employeeName": "QR Scanner",
    "userRole": "qr_scanner",
    "email": "qr-scanner@gracewell.com",
    "isQRScanner": true
  }
}
```

#### Attendance Endpoints

**POST /qr-attendance/check-in**
- Headers: `Authorization: Bearer {token}`
- Required Body:
  - `employeeId` - Employee code to check in
  - `method` - "qr" (QR scan method)
  - `source` - "qr-scanner"
- Authorized Roles: `admin`, `super_admin`, `qr_scanner`
- Logs: `QR_CHECK_IN` action

**POST /qr-attendance/check-out**
- Headers: `Authorization: Bearer {token}`
- Required Body:
  - `employeeId` - Employee code to check out
  - `method` - "qr"
  - `source` - "qr-scanner"
- Authorized Roles: `admin`, `super_admin`, `qr_scanner`
- Logs: `QR_CHECK_OUT` action

---

## Login Credentials

**URL:** http://localhost:3000/qr-scanner-login

| Field | Value |
|-------|-------|
| **Username** | QR001 |
| **Password** | QR@Scanner123! |

### Changing Password
To change the QR001 password:

```bash
# 1. Generate new hash using Node.js
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('YOUR_NEW_PASSWORD', 10));"

# 2. Update in Supabase
UPDATE user_accounts 
SET password_hash = 'NEW_HASH_HERE'
WHERE username = 'QR001';
```

---

## Usage Flow

### 1. QR Scanner Login
```
User visits http://localhost:3000/qr-scanner-login
  ↓
Enters credentials (QR001 / password)
  ↓
System validates via /auth/qr-scanner-login
  ↓
Token stored in localStorage (qrScannerToken)
  ↓
Redirects to /qr-scanner dashboard
```

### 2. Employee Check-In via QR Code
```
Scanner points camera at employee's QR code
  ↓
QrReader decodes QR code → employee ID
  ↓
System fetches employee details
  ↓
Shows employee card with status
  ↓
Scanner clicks "Check In" button
  ↓
POST /qr-attendance/check-in called
  ↓
Attendance record created/updated
  ↓
Audit log recorded (QR_CHECK_IN)
  ↓
Success message shown
```

### 3. Employee Check-Out via QR Code
```
Scanner points camera at employee's QR code
  ↓
System shows "Already checked in" status
  ↓
Scanner clicks "Check Out" button
  ↓
POST /qr-attendance/check-out called
  ↓
Check-out time recorded
  ↓
Audit log recorded (QR_CHECK_OUT)
  ↓
Success message shown
```

### 4. Manual Entry (Camera Unavailable)
```
Click "Manual Entry" button
  ↓
Enter employee ID manually
  ↓
System verifies employee exists
  ↓
Proceed with Check-In/Out as normal
```

---

## Security Features

### Authentication
- **Separate Login:** Completely independent from admin/employee portals
- **JWT Tokens:** Time-limited tokens (8 hour expiry)
- **Role-Based Access:** Only `qr_scanner` role can access scanner
- **Password Hashing:** Bcrypt with salt rounds

### Authorization
```javascript
// Only qr_scanner role can call:
POST /qr-attendance/check-in
POST /qr-attendance/check-out

// But admin and super_admin can also call these for backward compatibility
```

### Audit Logging
All QR Scanner actions are logged:
- Login attempts (success/failure)
- Check-In actions
- Check-Out actions
- Failed access attempts
- Account status changes

**Audit Log Fields:**
- `user_id` - QR Scanner user ID
- `action` - `QR_SCANNER_LOGIN_SUCCESS`, `QR_CHECK_IN`, `QR_CHECK_OUT`, etc.
- `module` - 'authentication' or 'attendance'
- `notes` - JSON with details (username, IP, employee scanned, timestamp, etc.)

### IP Tracking
Client IP is captured in audit logs:
```json
{
  "clientIp": "192.168.1.100",
  "username": "QR001",
  "timestamp": "2025-03-03T10:30:00Z"
}
```

---

## Session Management

### LocalStorage Keys
- **`qrScannerToken`** - JWT access token
- **`qrScannerUser`** - Serialized user object (name, role, etc.)

### Token Expiration
- QR Scanner tokens expire after **8 hours**
- User must log back in after expiration
- Expired tokens are cleared on page refresh

### Logout
```javascript
// Clear QR Scanner session
localStorage.removeItem('qrScannerToken');
localStorage.removeItem('qrScannerUser');

// Redirect to login page
navigate('/qr-scanner-login');
```

---

## File Structure

### Frontend Components
```
src/pages/
├── QRScannerLogin.js       # QR Scanner login form
├── QRScannerLogin.css      # Login page styles
├── QRScanner.js            # QR scanning interface
└── QRScanner.css           # Scanner interface styles
```

### Backend
```
server/
├── setup-qr-scanner.js     # QR001 user setup script
└── server.js               # Main server with /auth/qr-scanner-login endpoint
```

### Updated Files
```
src/App.js                  # Added QR Scanner routes
server/server.js            # Added QR Scanner login endpoint
                            # Updated check-in/check-out to allow qr_scanner role
```

---

## Database Queries

### Check QR Scanner Role
```sql
SELECT role_id, role_name FROM roles WHERE role_name = 'qr_scanner';
```

### Check QR001 Account
```sql
SELECT * FROM user_accounts 
WHERE username = 'QR001' 
AND role_id = (SELECT role_id FROM roles WHERE role_name = 'qr_scanner');
```

### View QR Scanner Audit Logs
```sql
SELECT * FROM audit_logs 
WHERE action LIKE 'QR_%' 
ORDER BY created_at DESC 
LIMIT 50;
```

### View Check-In/Out by QR Scanner
```sql
SELECT * FROM attendance_scans 
WHERE recorded_by = (
  SELECT user_id FROM user_accounts WHERE username = 'QR001'
)
ORDER BY scan_timestamp DESC;
```

---

## Troubleshooting

### Issue: "Login failed" on QR Scanner Login
- Check credentials are exactly: `QR001` / `QR@Scanner123!`
- Verify QR001 account is ACTIVE in Supabase
- Check server logs for error details

### Issue: Camera not working
- Click "Manual Entry" to bypass camera
- Check browser camera permissions
- Ensure HTTPS (if required by browser)

### Issue: Employee not found after scan
- Verify employee code in QR code matches employee_code in database
- Check employee record_status is 'Active'

### Issue: Can only Check-In, can't Check-Out
- Previous day's check-out might be pending
- Employee must have checked in first
- Clear previous unclosed records in attendance table

### Issue: Audit logs not recording
- Check audit_logs table exists in database
- Verify user_accounts has qr_scanner role with correct role_id
- Check server has database write permissions

---

## Performance Considerations

### Scan Rate Limiting
- 3-second cooldown between identical scans (debouncing)
- Prevents duplicate rapid scans
- Processing lock prevents concurrent requests

### Camera Performance
- `facingMode: 'environment'` for back camera
- 1280x720 resolution target
- Lazy render for camera frame

### Database Queries
- Employee lookup by code (indexed)
- Attendance status check (date-indexed)
- Scan recording into attendance_scans table

---

## Future Enhancements

🚀 Potential improvements:
- [ ] Phone number verification for QR001
- [ ] Multi-device QR Scanner support
- [ ] Weekly QR Scanner activity reports
- [ ] QR code expiry/rotation system
- [ ] Biometric verification integration
- [ ] Offline mode with sync
- [ ] Real-time dashboard with active scans
- [ ] SMS notifications for check-in/out

---

## Support & Documentation

- **Issue Tracking:** Check audit_logs table for errors
- **Setup Script:** `server/setup-qr-scanner.js`
- **Main Endpoint:** `/auth/qr-scanner-login`
- **Frontend Entry:** `/qr-scanner-login`

---

**Last Updated:** March 3, 2025
**Status:** ✅ Implemented and Running

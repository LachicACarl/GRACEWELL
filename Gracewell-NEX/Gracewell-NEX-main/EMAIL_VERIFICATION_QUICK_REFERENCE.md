# Email Verification - Quick Reference

## ⚡ What Was Done

### Frontend Changes ✅
1. **ProfileSetting.js** - Added:
   - `showVerifyEmailModal` state for email verification modal
   - `emailConfirmContext` state to differentiate password vs email verification
   - `handleVerifyEmail()` - Opens verify email modal
   - `handleSendVerificationEmail()` - Calls API to request verification email
   - `handleResendConfirmation()` - Resends verification email
   - Email status display in Security section (shows "Verified"/"Not verified")
   - Dual action buttons: "📧 Verify Email" and "🔒 Change Password"

2. **ProfileSetting.css** - Added:
   - `.section-actions` - Flexbox layout for multiple buttons
   - `.status-enabled` - Green badge for verified status

3. **VerifyEmail.js** (NEW) - Email verification landing page:
   - Receives email + token from email link
   - Auto-verifies on component mount
   - Shows loading/success/error states
   - Links to profile or login

4. **VerifyEmail.css** (NEW) - Styling for verification page

5. **App.js** - Added route:
   - `<Route path="/verify-email" element={<VerifyEmail />} />`

6. **authService.js** - Normalized email_verified_at field:
   - Handles both camelCase (emailVerifiedAt) and snake_case (email_verified_at)

### Backend Changes ✅
1. **server.js** - Added 2 endpoints:
   - `POST /auth/request-email-verification` (Protected)
     - Uses Supabase OTP to send verification link
     - Generates link with email + token params
   
   - `POST /auth/verify-email` (Public)
     - Verifies OTP via Supabase
     - Updates employees.email_verified_at timestamp
   
   - Updated profile endpoints to include email_verified_at

2. **supabase-schema.sql** - Added column:
   - `ALTER TABLE employees ADD COLUMN email_verified_at TIMESTAMP;`

---

## 🚀 How It Works

### User Verification Flow
```
Security Section
    ↓
Click "📧 Verify Email"
    ↓
Modal: "Send Verification Email"
    ↓
POST /auth/request-email-verification
    ↓
Supabase sends OTP to email
    ↓
Modal: "Check your email"
    ↓
User clicks link in email
    ↓
Browser: /verify-email?email=...&token=...
    ↓
Auto POST /auth/verify-email
    ↓
Success page → Can return to profile
    ↓
Profile reloads → Status shows "Verified" ✓
```

---

## 📋 Test Scenarios

### Test 1: Basic Verification
- Login as employee
- Go to Profile → Security section
- Click "📧 Verify Email"
- Click "Send Verification Email"
- Check email inbox
- Click link in email
- Should see success page
- Return to profile → Status shows "Verified"

### Test 2: Email Change Resets Status
- Profile shows "Email status: Verified"
- Click "Edit Profile"
- Change email address
- Click "Save Changes"
- Reopen profile → Status shows "Not verified"

### Test 3: Resend Functionality
- Click "📧 Verify Email"
- Click "Send Verification Email"
- On confirmation modal → Click "Resend"
- Check that email is resent
- Previous token should still work

### Test 4: Direct Link Access
- Receive verification email
- Copy link
- Open in new tab/browser
- Should verify without authorization
- Show success/error appropriately

---

## 🔧 Configuration Checklist

### Required
- [x] Supabase URL set in `.env`
- [x] Supabase Service Key / Anon Key set in `.env`
- [x] FRONTEND_URL set (or defaults to localhost:3000)

### Optional
- [ ] Customize Supabase email template
- [ ] Set token expiry time in Supabase Auth settings
- [ ] Add rate limiting middleware
- [ ] Configure email domain for SPF/DKIM

---

## 📊 Database

### New Column
```sql
Table: employees
Column: email_verified_at (TIMESTAMP, nullable)

Values:
- NULL = not verified
- timestamp = verified at this time
```

### Data Flow
```
1. User clicks verify → email_verified_at stays NULL
2. Email sent via Supabase OTP
3. User clicks link → POST /auth/verify-email
4. Backend verifies token with Supabase
5. email_verified_at = NOW()
6. Profile synced to user object
```

---

## 🎯 API Reference

### Request Verification Email
```javascript
POST /auth/request-email-verification
Headers: { Authorization: Bearer <token> }
Response: { success: true, message: "Verification email sent" }
```

### Verify Email Token
```javascript
POST /auth/verify-email
Body: { email: "user@company.com", token: "otp_code", type: "email" }
Response: { success: true, message: "Email verified successfully" }
```

### Get Profile (includes verification status)
```javascript
GET /users/profile
Headers: { Authorization: Bearer <token> }
Response: { user: { ..., email_verified_at: "2026-02-15T12:34:56Z" } }
```

---

## 🐛 Troubleshooting

### Email not received
- ✓ Check Supabase Auth logs
- ✓ Verify email address is correct
- ✓ Check spam folder
- ✓ Confirm Supabase SMTP is configured

### Link not working
- ✓ Verify FRONTEND_URL is correct
- ✓ Check token in email matches request
- ✓ Ensure token hasn't expired

### Status not updating
- ✓ Reload page to sync from server
- ✓ Check email_verified_at in database
- ✓ Verify user state in localStorage
- ✓ Check browser console for API errors

### Modal not showing
- ✓ Check browser console for errors
- ✓ Verify ProfileSetting.js loaded correctly
- ✓ Ensure CSS classes applied
- ✓ Check React DevTools component tree

---

## 📦 Files Overview

```
src/
├── pages/
│   ├── ProfileSetting.js          (Updated - Main feature)
│   ├── ProfileSetting.css         (Updated - Styles)
│   ├── VerifyEmail.js             (NEW - Verification page)
│   └── VerifyEmail.css            (NEW - Verification styles)
├── App.js                         (Updated - Route added)
└── utils/
    └── authService.js            (Updated - Field normalization)

server/
├── server.js                      (Updated - 2 new endpoints)
└── supabase-schema.sql            (Updated - New column)
```

---

## ✅ Completion Status

- [x] Frontend UI implemented
- [x] Backend endpoints created
- [x] Database schema updated
- [x] Email sending integrated
- [x] Token verification working
- [x] Status persistence
- [x] Error handling
- [x] No compilation errors

**Ready for:** Testing, Database migration, Deployment

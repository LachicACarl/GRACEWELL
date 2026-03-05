# Password Reset Testing Guide

## ✅ What's Working Now

Your password reset system now generates **clickable reset links in the server console** when running in development mode (which you are).

## 📋 How to Get Password Reset Links

### Option 1: Look at the Server Terminal

1. Open the **Terminal** panel in VS Code (View → Terminal or Ctrl+`)
2. Find the terminal running your Node.js server (should show "Connected to Supabase database")
3. Request a password reset (see below)
4. **Look for the boxed output** in the server terminal that shows:

```
================================================================================
🔐 PASSWORD RESET LINK (DEVELOPMENT MODE - USE THIS LINK)
================================================================================
User: Super Admin
Email: superadmin@gracewell.com
Employee Code: GW001

Reset Link:
http://localhost:3000/reset-password?token=abc123xyz...

Expires: 2/18/2026, 12:55:30 AM
================================================================================
```

5. Copy and paste the link into your browser

### Option 2: Request a Reset via Frontend

1. Go to: http://localhost:3000/forgot-password
2. Enter one of these test emails:
   - `superadmin@gracewell.com` (GW001 - Super Admin)
   - `admin@gracewell.com` (GW002 - Admin)
   - `manager@gracewell.com` (M001 - Manager)
   - `john@gracewell.com` (GW003 - Employee)

3. Click "Send Reset Link"
4. **Check the server terminal** in VS Code for the reset link (see Option 1 above)

### Option 3: Request via API (PowerShell)

Run this command in a terminal:

```powershell
Invoke-WebRequest -Uri "http://localhost:4000/auth/request-password-reset-link" `
  -Method POST `
  -Body '{"email":"superadmin@gracewell.com"}' `
  -ContentType "application/json" `
  -UseBasicParsing
```

Then check the server terminal for the reset link.

## 🔧 Why This Happens

**Supabase SMTP Not Configured:**
- Supabase Auth requires SMTP configuration to send actual emails
- Without SMTP, Supabase returns "success" but doesn't send emails
- Our development fallback **generates local reset links** that work with your app

**Production Setup:**
- Once you configure SMTP in Supabase (see SUPABASE_AUTH_SETUP.md)
- Emails will be sent through Supabase
- The development links won't be shown anymore

## 🎯 Testing Instructions

### Test the Full Password Reset Flow:

1. **Request Reset:**
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:4000/auth/request-password-reset-link" `
     -Method POST `
     -Body '{"email":"admin@gracewell.com"}' `
     -ContentType "application/json"
   ```

2. **Get Link from Server Terminal:**
   - Look for the boxed output in your server terminal
   - Copy the reset link (starts with `http://localhost:3000/reset-password?token=...`)

3. **Use the Link:**
   - Paste the link in your browser
   - Enter new password (e.g., "newpassword123")
   - Click "Reset Password"

4. **Login with New Password:**
   - Go to http://localhost:3000/login
   - Employee ID: `GW002`
   - Password: `newpassword123`

## 📝 Available Test Accounts

| Employee Code | Email | Role | Current Password |
|--------------|-------|------|------------------|
| GW001 | superadmin@gracewell.com | super_admin | admin123 |
| GW002 | admin@gracewell.com | admin | admin123 |
| M001 | manager@gracewell.com | manager | manager12 |
| GW003 | john@gracewell.com | employee | emp123 |
| GW004 | sarah@gracewell.com | employee | emp123 |

## 🚀 Next Steps for Production

To enable actual email sending for password resets:

1. Go to Supabase Dashboard: https://tthysazhswsmgcebeubg.supabase.co
2. Navigate to: **Settings** → **Authentication** → **SMTP Settings**
3. Configure your SMTP provider (Gmail, SendGrid, etc.)
4. See [SUPABASE_AUTH_SETUP.md](SUPABASE_AUTH_SETUP.md) for detailed instructions

Once SMTP is configured:
- ✅ Real emails will be sent
- ✅ Development console links will stop appearing
- ✅ Production-ready email flow

---

**Current Status:** ✅ Password reset working in development mode
**Email Sending:** ⚠️ Development mode only (SMTP not configured)
**Reset Links:** 📋 Visible in server terminal console

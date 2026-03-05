# Supabase Authentication Setup Guide

## ✅ What's Already Connected

Your Gracewell NEX system is now integrated with Supabase Authentication for:

1. **Password Reset** - Uses Supabase Auth's `/auth/v1/recover` endpoint
2. **Email Verification** - Uses Supabase Auth's `/auth/v1/otp` endpoint
3. **Database Storage** - Email verification timestamps stored in `employees` table

## 📋 Required Supabase Configuration

To enable email sending, you need to configure SMTP in your Supabase project:

### Step 1: Add email_verified_at Column (REQUIRED)

1. Go to: https://tthysazhswsmgcebeubg.supabase.co
2. Navigate to: **SQL Editor** (left sidebar)
3. Run this SQL:

```sql
-- Add email_verified_at column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN employees.email_verified_at IS 'Timestamp when email was verified';
```

### Step 2: Configure SMTP Email (OPTIONAL - For Production)

1. Go to: **Settings** → **Authentication** → **SMTP Settings**
2. Enable Custom SMTP
3. Configure your SMTP provider:

**Gmail Example:**
```
SMTP Host: smtp.gmail.com
SMTP Port: 587
SMTP Username: your-email@gmail.com
SMTP Password: your-app-password
Sender Email: your-email@gmail.com
Sender Name: Gracewell NEX
```

**SendGrid Example:**
```
SMTP Host: smtp.sendgrid.net
SMTP Port: 587
SMTP Username: apikey
SMTP Password: your-sendgrid-api-key
Sender Email: noreply@yourdomain.com
Sender Name: Gracewell NEX
```

### Step 3: Configure Email Templates

1. Go to: **Authentication** → **Email Templates**
2. Customize these templates:

**Password Reset Email:**
```html
<h2>Reset Your Password</h2>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>If you didn't request this, please ignore this email.</p>
```

**Email Verification:**
```html
<h2>Verify Your Email</h2>
<p>Click the link below to verify your email address:</p>
<p><a href="{{ .ConfirmationURL }}">Verify Email</a></p>
```

### Step 4: Set Redirect URLs

1. Go to: **Authentication** → **URL Configuration**
2. Add your redirect URLs:

```
Site URL: http://localhost:3000
Redirect URLs:
  - http://localhost:3000/reset-password
  - http://localhost:3000/verify-email
  - https://yourdomain.com/reset-password
  - https://yourdomain.com/verify-email
```

## 🔧 How It Works

### Password Reset Flow:

1. User enters email on **Forgot Password** page
2. Backend calls Supabase `/auth/v1/recover`
3. Supabase sends password reset email
4. User clicks link → Redirected to `/reset-password?token=xxx`
5. Frontend submits new password with token
6. Backend updates password in `user_accounts` table

### Email Verification Flow:

1. User clicks **Verify Email** button in Profile Settings
2. Backend calls Supabase `/auth/v1/otp`
3. Supabase sends verification email with OTP
4. User receives email and clicks link or enters OTP
5. Backend verifies token and updates `email_verified_at` in `employees` table

## 🚀 Development Mode (Current Setup)

**Email Sending:** Currently disabled (SMTP not configured)
**Fallback Behavior:**
- Password Reset: Returns success message but doesn't send email (log shows link in console)
- Email Verification: Auto-verifies emails immediately

**To see password reset links during development:**
- Check the server console/logs
- Look for: `[PASSWORD_RESET] Sending reset email via Supabase Auth for: email@example.com`

## 📝 Environment Variables

Ensure your `.env` file has:

```env
SUPABASE_URL=https://tthysazhswsmgcebeubg.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
FRONTEND_URL=http://localhost:3000
```

## ✅ Testing

### Test Password Reset:
1. Go to: http://localhost:3000/forgot-password
2. Enter a registered email (e.g., superadmin@gracewell.com)
3. Check server logs for reset link
4. Use the link to test password reset

### Test Email Verification:
1. Login as any user
2. Go to Profile Settings
3. Click "📧 Verify Email"
4. Check server logs for verification status

## 🔐 Security Features

✅ Rate limiting on password reset requests
✅ CAPTCHA after 3 failed attempts
✅ Secure token-based verification
✅ Audit logging for all auth events
✅ Email enumeration protection

## 📞 Support

If emails are not sending after SMTP configuration:
1. Check Supabase logs: **Logs** → **Auth Logs**
2. Verify SMTP credentials are correct
3. Check spam folder
4. Test with a different email provider

---

**Status:** ✅ Connected to Supabase Auth
**Email Sending:** ⚠️ Pending SMTP configuration
**Database Integration:** ✅ Complete

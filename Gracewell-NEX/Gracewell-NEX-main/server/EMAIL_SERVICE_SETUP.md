# Email Service Setup Guide

The Gracewell NEXUS system now includes Nodemailer integration for sending emails, including password reset emails, email verification, and notifications.

## Quick Start

### Development Mode (No Configuration)
- **Default behavior**: Emails are logged to the server console
- **No SMTP setup required**
- Useful for testing without a real email service

### Production Mode (Send Real Emails)
Configure one of the email services below in your `.env` file.

---

## Email Service Configuration Options

### Option 1: Gmail SMTP ⭐ Recommended for Testing

**Prerequisites:**
1. A Gmail account (personal or G Suite)
2. Enable 2-Factor Authentication in Gmail
3. Create an App Password (not your regular Gmail password)

**Setup Steps:**

1. **Generate Gmail App Password:**
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification if not already enabled
   - Generate an App Password for "Mail" and "Windows"
   - Copy the 16-character password

2. **Update `.env` file:**
   ```dotenv
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
   EMAIL_FROM=your-gmail@gmail.com
   ```

3. **Test the configuration:**
   ```bash
   # Terminal in server directory
   curl -X POST http://localhost:4000/auth/test-email-config \
     -H "Content-Type: application/json" \
     -d '{"email":"your-test@gmail.com"}'
   ```

---

### Option 2: Outlook / Office 365

**Setup in `.env`:**
```dotenv
EMAIL_SERVICE=outlook
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-password
EMAIL_FROM=your-email@outlook.com
```

---

### Option 3: SendGrid (Free or Paid)

**Prerequisites:**
- SendGrid account at [sendgrid.com](https://sendgrid.com)
- API Key from SendGrid dashboard

**Setup in `.env`:**
```dotenv
EMAIL_SERVICE=sendgrid
EMAIL_PASSWORD=SG.your-sendgrid-api-key
EMAIL_FROM=noreply@your-domain.com
```

---

### Option 4: Custom SMTP (Any Provider)

For any SMTP provider not listed above (Postmark, Mailgun, etc.):

**Setup in `.env`:**
```dotenv
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_USER=your-email@your-domain.com
EMAIL_PASSWORD=your-password
EMAIL_FROM=noreply@your-domain.com
```

**SMTP_PORT Guidelines:**
- **587**: TLS encryption (SMTP_SECURE=false) - Most common
- **465**: SSL encryption (SMTP_SECURE=true)
- **25**: Unencrypted (rarely used)

---

## Testing Email Configuration

### 1. Test Endpoint via API

```bash
# Test sending email to yourself
curl -X POST http://localhost:4000/auth/test-email-config \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@example.com"}'
```

**Success Response:**
```json
{
  "success": true,
  "message": "Email configuration test successful!",
  "details": {
    "recipient": "your-test-email@example.com",
    "messageId": "abc123@example.com",
    "emailService": "gmail",
    "note": "Check your inbox for the test email"
  }
}
```

**Failure Response:**
```json
{
  "success": false,
  "message": "Email configuration test failed",
  "error": "Invalid login credentials",
  "config": {
    "emailService": "gmail",
    "hasEmailUser": true,
    "hasEmailPassword": true,
    "hasSmtpHost": false,
    "hasSmtpPort": false
  }
}
```

### 2. Check Server Console

When running the server, you'll see logs like:
```
[EMAIL_SERVICE] Configuring Gmail SMTP
[EMAIL_SERVICE] Test email sent to: test@example.com
```

Or in development mode:
```
[EMAIL_SERVICE] Running in development mode - emails will be logged to console

========== EMAIL (DEV MODE) ==========
To: test@example.com
Subject: Test Email
---
<html>...</html>
=====================================
```

---

## Features Enabled by Email Service

### 1. Password Reset Email 🔐
- Users can reset forgotten passwords
- Endpoint: `POST /auth/request-password-reset-link`
- Email contains reset link with expiration (15 minutes)

### 2. Email Verification 📧
- Verify user email addresses
- Endpoint: `POST /auth/request-email-verification`
- Required for admin/manager/employee login (in future release)

### 3. OTP Email
- Send one-time passwords for secure operations
- Used by future authentication flows
- Customizable expiration time

---

## Production Deployment Checklist

- [ ] Email service configured in `.env`
- [ ] Test email sending works (`/auth/test-email-config`)
- [ ] Verify `EMAIL_FROM` is set to a legitimate sender address
- [ ] Test password reset flow with real email account
- [ ] Monitor email delivery rates in email provider dashboard
- [ ] Set up bounce and complaint handling (provider-specific)
- [ ] Document email credentials in secure password manager
- [ ] Enable email logging/monitoring in application

---

## Troubleshooting

### "Email failed to send" Error

**Check list:**
1. Is `.env` properly configured?
   ```bash
   grep -E "EMAIL|SMTP" server/.env
   ```

2. Verify service credentials are correct
   - Gmail: Use App Password, not your regular password
   - SendGrid: Use correct API key format (SG.xxxxx)
   - Outlook: Use account password

3. Check firewall/network settings
   - Ensure port 587 (TLS) or 465 (SSL) is not blocked
   - Test with: `telnet smtp.gmail.com 587`

4. Review server console logs for detailed error messages

5. Test with development mode first
   - Remove EMAIL configuration
   - Restart server
   - Emails will log to console instead

### Emails Logged to Console but Not Sending

**Solution:** Configure an email service in `.env`. The system defaults to console logging when no service is configured.

### Gmail Specific Issues

**"Invalid login:" error**
- Solution: Use App Password (16 characters), not your Gmail password
- 2FA must be enabled on the Gmail account

**"Fewer secure apps allowed"**
- Solution: Switch to using App Passwords instead of account password

### Custom SMTP Connection Issues

**"Connection refused"**
- Check SMTP_HOST and SMTP_PORT are correct
- Verify firewall allows outbound connections
- Test connectivity: `telnet smtp.example.com 587`

**"SMTP_SECURE mismatch"**
- Port 587 typically uses TLS (SMTP_SECURE=false)
- Port 465 typically uses SSL (SMTP_SECURE=true)
- Check your provider's documentation

---

## Security Notes

1. **Never commit credentials to git** - Use `.env` file in `.gitignore`
2. **Rotate API keys regularly** - Especially for production accounts
3. **Use App-Specific Passwords** - For Gmail and Microsoft accounts
4. **Monitor email logs** - Watch for failed deliveries or abuse
5. **Enforce SMTP security** - Always use TLS/SSL
6. **Rate limiting** - System has built-in rate limiting for password resets

---

## API Endpoints

### Test Email Configuration
```
POST /auth/test-email-config
Body: { "email": "test@example.com" }
```

### Request Password Reset Link
```
POST /auth/request-password-reset-link
Body: { "email": "user@example.com" }
```

### Request Email Verification
```
POST /auth/request-email-verification
Headers: { "Authorization": "Bearer {token}" }
```

---

## Email Service Module

The email service is implemented in `emailService.js` with the following functions:

- `sendPasswordResetEmail(email, resetToken, resetLink)` - Password reset emails
- `sendEmailVerificationEmail(email, verificationLink, employeeName)` - Email verification
- `sendOTPEmail(email, otp, expiryMinutes)` - One-time password emails
- `sendEmail(to, subject, htmlContent, textContent)` - Generic email sending
- `testEmailConfiguration(testEmail)` - Test email setup

---

## Support

For issues with specific email providers:
- **Gmail**: [Gmail App Passwords Guide](https://support.google.com/accounts/answer/185833)
- **Outlook**: [Outlook App Passwords](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission)
- **SendGrid**: [SendGrid SMTP Guide](https://docs.sendgrid.com/for-developers/sending-email/integrating-with-the-smtp-api)
- **Nodemailer**: [Official Documentation](https://nodemailer.com/)

---

**Last Updated:** March 5, 2026

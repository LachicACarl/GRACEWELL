# Email Verification - Deployment Guide

## 🚀 Pre-Deployment Steps

### 1. Database Migration

Run the following SQL in your Supabase SQL Editor:

```sql
-- Add email verification timestamp column to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Optional: Create an index for faster queries (if needed later)
CREATE INDEX IF NOT EXISTS idx_employees_email_verified ON employees(email_verified_at);
```

**Verification:**
```sql
-- Check column exists and is null for existing users
SELECT employee_id, email_address, email_verified_at 
FROM employees 
LIMIT 5;
```

### 2. Environment Variables

Ensure your `.env` files are configured:

**Backend (.env in /server):**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_ANON_KEY=your-anon-key
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your-jwt-secret
```

**Frontend (.env in root):**
```
REACT_APP_API_BASE_URL=http://localhost:4000
```

### 3. Supabase Configuration

#### OTP Settings
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable "Email OTP"
3. Configure OTP template (optional, defaults to generic message)
4. Set token expiry (default 24h is reasonable)

#### Email Template Customization (Optional)
1. Dashboard → Authentication → Email Templates
2. Edit "Confirmation Link" template
3. Customize to match your branding

---

## 🧪 Testing Before Deployment

### Unit Tests (Manual)

#### Test 1: Email Verification Request
```bash
# Prerequisites: User must be logged in, have valid JWT

curl -X POST http://localhost:4000/auth/request-email-verification \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json"

# Expected Response:
# {
#   "success": true,
#   "message": "Verification email sent"
# }
```

#### Test 2: Email Verification Completion
```bash
# Receive email, extract token from link /verify-email?email=...&token=...

curl -X POST http://localhost:4000/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employee@company.com",
    "token": "your-otp-from-email",
    "type": "email"
  }'

# Expected Response:
# {
#   "success": true,
#   "message": "Email verified successfully"
# }
```

#### Test 3: Profile Check
```bash
curl -X GET http://localhost:4000/users/profile \
  -H "Authorization: Bearer <your-jwt-token>"

# Expected Response includes:
# "email_verified_at": "2026-02-15T12:34:56.000Z"
```

### UI Tests (Manual)

- [ ] Login to profile
- [ ] Navigate to Security section
- [ ] Click "📧 Verify Email" button
- [ ] See "Verify Email" modal
- [ ] Click "Send Verification Email"
- [ ] See confirmation modal
- [ ] Check email inbox
- [ ] Click verification link in email
- [ ] See success page
- [ ] Click "Go to Profile"
- [ ] Profile shows "Email status: Verified" ✓

### Edge Cases

- [ ] Click resend multiple times
- [ ] Use expired token in URL
- [ ] Change email while verification pending
- [ ] Logout and click verification link
- [ ] Close browser and click verification link later
- [ ] Verify same email twice

---

## 📊 Deployment Stages

### Stage 1: Development Verification (Current)
- [x] All code written and tested locally
- [x] No compilation errors
- [x] Backend running on localhost:4000
- [x] Frontend running on localhost:3000
- [x] Database schema prepared

### Stage 2: Pre-Production (Next)
- [ ] Run full test suite
- [ ] Code review completed
- [ ] Move to staging environment
- [ ] Test with real email delivery
- [ ] Load testing (optional)

### Stage 3: Production Deployment
- [ ] Deploy backend to production
- [ ] Deploy frontend to production
- [ ] Run database migration
- [ ] Verify email sending works
- [ ] Monitor error logs
- [ ] Notify users of new feature

---

## 🔄 Rollback Plan

If issues occur after deployment:

### Minimal Rollback (Disable Feature)
```javascript
// src/pages/ProfileSetting.js - Comment out button
{/* <button className="btn-change-password" onClick={handleVerifyEmail}>
  📧 Verify Email
</button> */}
```

### Full Rollback (Revert Column)
```sql
-- Only if absolutely necessary
ALTER TABLE employees DROP COLUMN email_verified_at;
```

---

## 📈 Monitoring

### What to Monitor

**API Errors:**
```
- POST /auth/request-email-verification failures
- POST /auth/verify-email failures
- Email delivery failures
```

**User Metrics:**
- How many users click "Verify Email"
- Success rate of verifications
- Time taken for users to verify
- Number of resend requests

**Database:**
- email_verified_at field populated correctly
- No NULL values where timestamp expected
- Proper reset on email changes

### Logs to Check

```bash
# Backend logs
tail -f server.js.log

# Supabase Auth logs
# Dashboard → Auth → Authentication logs

# Email delivery logs
# Dashboard → Email
```

---

## 🔐 Security Checklist

- [x] JWT token required for requesting verification
- [x] No tokens stored in code/logs
- [x] Supabase handles token expiry
- [x] Email address cannot be spoofed
- [x] One-time use tokens only
- [x] CORS properly configured
- [x] Verification link includes email (prevents wrong person from verifying)
- [ ] Rate limiting recommended (add middleware)
- [ ] Email domain SPF/DKIM configured (mail admin task)

---

## 📞 Support Resources

### If Email Not Received
1. Check Supabase Auth logs
2. Verify email address in database
3. Check spam/junk folder
4. Resend verification email
5. Contact mail administrator

### If Link Not Working
1. Check FRONTEND_URL is accessible
2. Verify token in email matches system
3. Ensure browser cache cleared
4. Try incognito/private mode
5. Check browser console errors

### If Status Not Updating
1. Reload page (⌘/Ctrl + R)
2. Clear localStorage (F12 → Application → Clear All)
3. Check database directly
4. Logout and login again
5. Contact support

---

## 📋 Post-Deployment Checklist

- [ ] Database migration completed successfully
- [ ] Feature accessible to all users
- [ ] Email delivery working
- [ ] Verification links working
- [ ] Status displaying correctly
- [ ] No error messages in logs
- [ ] Users can verify emails
- [ ] Users can resend emails
- [ ] Email change resets status
- [ ] All browser compatibility checked

---

## 🎉 Deployment Success Indicators

| Indicator | ✓ Success |
|-----------|----------|
| API endpoints returning 200 | ✓ |
| Emails being delivered | ✓ |
| Verification links work | ✓ |
| Status updating in DB | ✓ |
| UI displaying correctly | ✓ |
| No error logs | ✓ |
| Users report feature working | ✓ |
| Email reset on change | ✓ |

---

## 🆘 Emergency Contacts

- **Backend Issues**: Check server logs, verify Supabase connection
- **Email Issues**: Contact mail administrator, check SMTP settings
- **Database Issues**: Verify migration ran, check table structure
- **Frontend Issues**: Clear cache, check browser console, verify routes

---

## 📞 Questions?

Refer to:
- `EMAIL_VERIFICATION_IMPLEMENTATION.md` - Full technical docs
- `EMAIL_VERIFICATION_QUICK_REFERENCE.md` - Quick reference
- Source code comments - Implementation details

---

**Ready to deploy?** Follow the steps above and you're good to go! 🚀

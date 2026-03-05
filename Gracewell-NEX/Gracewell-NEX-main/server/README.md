# Gracewell NEXUS Backend

Backend API for Gracewell NEXUS Attendance System.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   - `JWT_SECRET` - Strong secret key
   - `SUPABASE_URL` - Your Supabase project URL (optional)
   - `SUPABASE_SERVICE_KEY` - Your Supabase service role key (optional)

3. **Run the server:**
   ```bash
   npm start
   ```
   
   Or with auto-reload:
   ```bash
   npm run dev
   ```

## Default Test Users

| Employee ID | Password | Role |
|------------|----------|------|
| GW001 | admin123 | super_admin |
| GW002 | admin123 | admin |
| M001 | manager123 | manager |
| GW003 | emp123 | employee |
| GW004 | emp123 | employee |

## API Endpoints

### Authentication
- `POST /auth/login` - Login with employeeId and password
- `GET /auth/me` - Get current user (requires token)

### Attendance
- `POST /attendance/check-in` - Record check-in/check-out (supports image upload)

### Audit
- `POST /audit/log` - Log audit trail
- `GET /audit/logs` - Get audit logs (admin only)

### Health
- `GET /health` - Health check

## Database

SQLite database with WAL mode enabled.

Tables:
- `users` - User accounts
- `attendance` - Attendance records
- `salary` - Salary records
- `audit_log` - Audit trail

## Image Storage

Optional Supabase Storage integration for face/QR images. If not configured, attendance works without images.

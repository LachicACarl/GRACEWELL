# Supabase Migration Guide

## Steps to migrate to Supabase:

### 1. Create a Supabase Project
1. Go to https://supabase.com
2. Create a new project
3. Copy your project URL and anon key

### 2. Run the SQL Schema
1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `supabase-schema.sql`
4. Click "Run"

### 3. Update Environment Variables
Create a `.env` file in the `server` directory with:
```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
JWT_SECRET=your-existing-jwt-secret
PORT=4000
```

### 4. Get Your Supabase Credentials
- **URL**: Found in Project Settings → API → Project URL
- **Anon Key**: Found in Project Settings → API → anon public key

### 5. Restart the Server
```bash
cd server
npm start
```

## Database Structure

### Tables Created:
- **users**: Employee information and authentication
- **attendance**: Daily attendance records
- **salary**: Salary and payment records  
- **audit_log**: System audit trail

### Default Users:
After running the server, these users will be seeded:
- SA001 / admin123 (Super Admin)
- A001 / admin123 (Admin)
- M001 / manager123 (Manager)
- E001 / emp123 (Employee - Trucker)
- E002 / emp123 (Employee - Finance Head)

## Notes:
- The database.js file now uses Supabase instead of SQLite
- All queries in server.js will need to be updated to use Supabase syntax
- Row Level Security (RLS) is enabled - adjust policies as needed

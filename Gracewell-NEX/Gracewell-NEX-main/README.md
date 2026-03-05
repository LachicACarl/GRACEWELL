# Gracewell NEXUS - Full Stack Attendance System

Complete Employee Management System with **Backend API**, JWT authentication, QR/Face attendance, and audit logging.

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd server
# Install dependencies first
npm install
# Start backend (PowerShell)
Start-Sleep -Seconds 1; node server.js
```

Backend runs on `http://localhost:4000`

### 2. Frontend Setup

```bash
# Install dependencies first
npm install
# Start frontend
npm start
```

Frontend runs on `http://localhost:3000`

## ✨ Features

### ✅ Implemented
- **Multi-Step JWT Authentication** (Welcome → ID Input → Password → Login)
- **Role-Based Access Control** (Super Admin, Admin, Employee)
- **Intelligent Employee Auto-Login** (Employees bypass password, go straight to QR scanner)
- **QR Code Attendance** (Webcam scanning with improved reliability)
- **Face Capture** (Live webcam with image upload)
- **Audit Logging** (Login, logout, attendance, salary actions)
- **CSV Export** (Salary records)
- **Supabase Database** (PostgreSQL with real-time sync)
- **Attendance Corrections** (Employee request → Admin approval/denial workflow)
- **Correction Notifications** (Real-time bell notifications for approved corrections)

### 📋 Core Modules
1. **Authentication & User Access** (Multi-step login, role-based routing)
2. **Attendance Monitoring** (QR scanning, face capture, correction requests)
3. **Correction Workflow** (Employee request → Admin approval/denial → Real-time notifications)
4. **Salary Tracking** (Admin manage, Employee view own)
5. **Employee Records Management** (Admin access)
6. **User Management** (Admin-only account controls)
7. **Audit Trail** (Comprehensive action logging)

## 🔐 Test Credentials

| Employee ID | Password | Role | Login Flow |
|------------|----------|------|------------|
| SA001 | admin123 | Super Admin | ID → Password → Sign In |
| A001 | admin123 | Admin | ID → Password → Sign In |
| E001 | emp123 | Employee | ID → Auto-redirect to QR Attendance |
| E002 | emp123 | Employee | ID → Auto-redirect to QR Attendance |

## Project Structure

```
src/
├── components/
│   ├── Navbar.js
│   ├── Navbar.css
│   └── ProtectedRoute.js
├── pages/
│   ├── Login.js
│   ├── Login.css
│   ├── AdminDashboard.js
│   ├── AdminDashboard.css
│   ├── ManagerDashboard.js
│   ├── ManagerDashboard.css
│   ├── EmployeeDashboard.js
│   ├── EmployeeDashboard.css
│   ├── FaceDetection.js
│   └── FaceDetection.css
├── App.js
├── App.css
├── index.js
└── index.css
```

## Technologies Used

- **React**: Frontend framework
- **React Router**: Client-side routing
- **Chart.js & react-chartjs-2**: Data visualization
- **CSS3**: Styling

## Features by Role

### Super Admin & Admin
- Full system access and controls
- View all employee attendance records
- Manage attendance corrections (approve/deny with reason)
- Admin denial reasons visible to employees
- View system logs and audit trails
- Salary management (add, release, track)
- Employee records management
- User role and permission management

### Employee
- QR code attendance check-in/check-out
- View personal attendance history
- Request attendance corrections with reason
- Receive notifications for approved/denied corrections
- View correction history with admin feedback
- Check personal salary status
- View personal records and profile

## Security

- Protected routes based on user role
- LocalStorage authentication
- Automatic redirects for unauthorized access
- Session management with logout functionality

## Recent Enhancements (v2.0)

✅ Multi-step login flow with smart role detection
✅ Seamless card transformation animations
✅ Employee auto-redirect to QR attendance
✅ Attendance correction workflow with notifications
✅ Admin denial reason tracking and visibility
✅ Real-time correction notifications
✅ Enhanced security (generic error messages)
✅ Form state reset on logo click

## Future Enhancements

- Email notifications for attendance/salary events
- Advanced analytics and reporting
- Biometric face detection authentication
- Mobile app for employees
- Batch attendance import
- Custom approval workflows

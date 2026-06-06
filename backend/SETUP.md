# VendorBridge — Auth System Setup Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+
- A Google Cloud Console project (for OAuth)
- A Gmail account with App Password (for email)

---

## 1. Database Setup

```bash
# Create database
psql -U postgres
CREATE DATABASE vendorbridge;
\q

# Run schema
psql -U postgres -d vendorbridge -f database/schema.sql
```

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DB_*` | PostgreSQL connection details |
| `JWT_SECRET` | Random string ≥ 32 chars |
| `EMAIL_USER` / `EMAIL_PASS` | Gmail + App Password |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | Must match OAuth redirect URI |

---

## 3. Seed Admin Account

```bash
node database/seed-admin.js
```
Default credentials: `admin@vendorbridge.com` / `Admin@12345!`
**Change these before production.**

---

## 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Google+ API** / **Google Identity**
3. Create OAuth 2.0 credentials (Web application)
4. Add Authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy Client ID and Secret into `.env`

---

## 5. Run the Server

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server: `http://localhost:3000`

---

## 6. Pages

| Page | URL |
|---|---|
| Landing | `http://localhost:3000` |
| Login | `http://localhost:3000/pages/login.html` |
| Sign Up | `http://localhost:3000/pages/signup.html` |
| Forgot Password | `http://localhost:3000/pages/forgot-password.html` |
| Reset Password | `http://localhost:3000/pages/reset-password.html?token=...` |

---

## 7. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/signup` | Register new user |
| GET | `/auth/verify-email/:token` | Verify email |
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |
| POST | `/auth/logout` | Clear session |
| GET | `/auth/me` | Get current user (JWT required) |
| GET | `/auth/google` | Initiate Google OAuth |
| GET | `/auth/google/callback` | Google OAuth callback |

---

## 8. Roles

| Role | Default | Description |
|---|---|---|
| `admin` | Manual seed only | Full platform access |
| `procurement_officer` | Public signup default | RFQs, vendors, POs |
| `manager` | Admin-assigned | Approvals, reports |
| `vendor` | Admin-assigned | Quotations, orders |

# Campus Inn+ — Backend Documentation

**Tagline:** Connect. Manage. Grow.  
**Version:** 1.0.0 (Express + PostgreSQL Production Backend)

---

## 1. Overview

The Campus Inn+ backend provides an enterprise REST API and authentication layer powering the 6 campus stakeholder roles:
- **Student Portal:** Academic profiles, placement drive discovery, persistent drive applications, and resume management.
- **Faculty Mentorship Desk:** Mentee tracking, attendance analytics, and academic NOC issuance.
- **Training & Placement Office (TPO):** Corporate recruiter accreditation, MoU signoff, and placement drive approvals.
- **Recruiter ATS Gateway:** Company profile onboarding, campus hiring requirements, candidate pipelines, interview slotting, and offer letters.
- **Campus Coordinator Hub:** Hackathon squads, innovation lab allotments, and campus event moderation.
- **University Administrator:** SPPU census sync, examination cell ledger, partner accreditation, and system broadcasts.

---

## 2. Directory Structure

```
backend/
├── .env.example              # Environment variables template
├── .env                      # Local environment configuration (ignored by git)
├── .gitignore                # Backend-specific ignore rules
├── package.json              # Backend dependencies, scripts, and engine specifications
├── src/
│   ├── app.js                # Express app, Helmet, CORS, Cookie parser, Rate limiter, /api/v1 router
│   ├── server.js             # Server bootstrap, PostgreSQL connection test, graceful shutdown
│   ├── config/
│   │   └── index.js          # Typed environment configuration
│   ├── db/
│   │   ├── pool.js           # PostgreSQL connection pool with connection test & transactions
│   │   ├── migrate.js        # Programmatic schema migration script
│   │   └── seed.js           # Database seeding script for development
│   ├── middleware/
│   │   ├── auth.js           # JWT verification & Role-Based Access Control (RBAC)
│   │   ├── error.js          # Centralized error handler with PostgreSQL ECONNREFUSED reporting
│   │   └── validate.js       # Payload validation schemas (auth, student registration)
│   └── routes/
│       ├── auth.js           # /api/v1/auth (login, register, me, logout, google OAuth)
│       ├── students.js       # /api/v1/students (me, drives, apply)
│       ├── events.js         # /api/v1/events (list, rsvp)
│       ├── faculty.js        # /api/v1/faculty (mentees, noc grant)
│       ├── tpo.js            # /api/v1/tpo (pending companies, MoU signoff)
│       ├── recruiter.js      # /api/v1/recruiter (register, requirements, candidates, offer)
│       ├── coordinator.js    # /api/v1/coordinator (hackathon teams, team approval)
│       └── admin.js          # /api/v1/admin (census sync, partner approval)
├── migrations/
│   └── 001_initial_schema.sql # Complete 27-table relational PostgreSQL schema definition
└── tests/
    ├── api.test.js           # Jest automated test suite (16 tests passing)
    └── test_e2e_integration.js # Multi-role end-to-end integration test runner
```

---

## 3. Environment Configuration (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and update credentials:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | Backend listening port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://campus_inn_user:PASSWORD@localhost:5432/campus_inn_db` |
| `JWT_SECRET` | Secret key for signing JWT tokens | 64-character random string |
| `JWT_EXPIRES_IN` | Token validity | `24h` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth Client ID | `<id>.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth Secret | `GOCSPX-...` |
| `GOOGLE_CALLBACK_URL`| Google OAuth redirect callback URI | `http://localhost:3000/api/v1/auth/google/callback` |
| `CORS_ORIGIN` | Allowed frontend origins (comma-separated)| `http://localhost:3000,http://localhost:5500` |
| `COOKIE_SECRET` | Cookie signing secret | Random secret string |

> [!IMPORTANT]
> **Google OAuth Redirect URI:**  
> When configuring your OAuth Client ID in Google Cloud Console, register the exact redirect URI:  
> `http://localhost:3000/api/v1/auth/google/callback`

---

## 4. PostgreSQL Database Setup

### Connection Status
- If PostgreSQL service is running and credentials match, the pool connects on startup:
  `[DB] PostgreSQL database pool ready and connected.`
- If PostgreSQL is offline (`ECONNREFUSED` on port 5432), the backend logs:
  `[DB] PostgreSQL not reachable at configured DATABASE_URL. Running in degraded mode or using mocks.`
  And database-backed writes safely return `503 Service Unavailable` with `DATABASE_OFFLINE` code.

### Running Migrations & Seeding
Once PostgreSQL is running:
```bash
cd backend
npm run migrate   # Applies migrations/001_initial_schema.sql (safe idempotency via IF NOT EXISTS)
npm run seed      # Populates default accounts and campus drives
```

---

## 5. Startup & Testing Commands

### Start Backend Server
```bash
cd backend
npm start
# Alternatively for live reload:
npm run dev
```

The backend server listens on:
👉 **`http://localhost:3000`**

### Run Automated Tests
```bash
cd backend
npm test
```
Executes Jest with `--forceExit --detectOpenHandles`.
All 16 test suites validate health checks, events, rate limiting, RBAC route protection, Google OAuth URL generation, state parameter security, and logout.

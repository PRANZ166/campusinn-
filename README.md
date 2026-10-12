# Campus Inn+

> **Connect. Manage. Grow.**  
> Next-Generation Collegiate Ecosystem for Students, Faculty, Recruiters, and Academic Leadership.

---

## 1. Project Architecture

Campus Inn+ is organized into cleanly separated, independently deployable frontend and backend architectures:

```
Campus-Inn-Plus/
├── frontend/                     # Pure static client application (HTML5, Tailwind, Vanilla JS, Stitch Design)
│   ├── index.html                # Public Ecosystem Homepage
│   ├── login.html                # Unified Multi-Role Authentication Portal
│   ├── student.html              # Student Career & Placement Portal
│   ├── placement.html            # Training & Placement Officer (TPO) Portal
│   ├── faculty.html              # Faculty Mentorship & Academic NOC Desk
│   ├── coordinator.html          # Campus Innovation & Hackathon Guild Hub
│   ├── company.html              # Corporate Recruiter ATS & Talent Gateway
│   ├── admin.html                # Enterprise Admin Console & Examination Census
│   ├── events.html               # Campus Events, Hackathons & Cultural Extravaganza
│   ├── about.html                # Institutional Ecosystem & Platform Governance
│   ├── companies.html            # Corporate Hiring Partners Directory
│   ├── hiring-builder.html       # Recruiter Requisition Builder
│   ├── hr-register.html          # Corporate Partner Registration Wizard
│   ├── css/
│   │   └── theme.css             # Google Stitch color tokens, elevation & typography
│   ├── js/
│   │   ├── api.js                # Resilient API service with auto-origin detection & cookie credentials
│   │   ├── shared.js             # Shared UI header, profile dropdown, navigation, and theme toggling
│   │   └── mock-data.js          # Development mock data & fallback catalog
│   ├── assets/                   # High-resolution screenshots and visual assets
│   ├── package.json              # Frontend scripts (start, dev, verify)
│   ├── serve.js                  # Zero-dependency local dev server (Port 5500)
│   ├── verify.js                 # Automated HTML/CSS/JS verification test suite
│   └── README.md                 # Frontend documentation
│
├── backend/                      # Production REST API & Authentication Server (Node.js + Express + PostgreSQL)
│   ├── src/
│   │   ├── app.js                # Express app, Helmet, CORS, cookies, rate limiter, static fallback
│   │   ├── server.js             # Server bootstrap, DB health check, graceful shutdown
│   │   ├── config/               # Typed environment configuration
│   │   ├── db/                   # Connection pool, migrate runner, seed script
│   │   ├── middleware/           # JWT authentication, RBAC authorization, input validation, error handling
│   │   └── routes/               # Modular REST endpoints (/api/v1/auth, students, faculty, tpo, etc.)
│   ├── migrations/
│   │   └── 001_initial_schema.sql # 27-table relational PostgreSQL schema
│   ├── tests/
│   │   ├── api.test.js           # 16 automated Jest unit & integration tests
│   │   └── test_e2e_integration.js # Multi-role E2E validation script
│   ├── package.json              # Backend dependencies and scripts
│   ├── .env.example              # Environment variables template
│   ├── .env                      # Local environment configuration (git ignored)
│   └── README.md                 # Backend documentation
│
├── render.yaml                   # Infrastructure-as-code deployment blueprint
├── .gitignore                    # Root git ignore protecting credentials & artifacts
└── README.md                     # Root project documentation
```

---

## 2. Quick Start: Local Development

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 14 (Optional for development; server handles offline DB gracefully)

### Running Frontend and Backend Separately

#### **Terminal 1: Start the Backend (Port 3000)**
```bash
cd backend
npm install       # Install dependencies (only required once)
npm start         # Starts backend at http://localhost:3000
```

#### **Terminal 2: Start the Frontend (Port 5500)**
```bash
cd frontend
npm start         # Starts frontend at http://localhost:5500
```

---

## 3. Local URLs & Routing

| Component | URL | Description |
| :--- | :--- | :--- |
| **Frontend Homepage** | `http://localhost:5500/index.html` | Public landing page (or `http://localhost:3000/index.html` when served by backend) |
| **Unified Login** | `http://localhost:5500/login.html` | Multi-role portal login & Google Sign-In |
| **Backend API Root** | `http://localhost:3000/api/v1` | Express REST API endpoints |
| **Health Check** | `http://localhost:3000/api/health` | Service health status (`{"status":"healthy"}`) |
| **Google OAuth Init** | `http://localhost:3000/api/v1/auth/google` | Initiates Google OAuth 2.0 flow with state parameter |
| **Google OAuth Callback** | `http://localhost:3000/api/v1/auth/google/callback` | OAuth redirect URI registered in Google Cloud Console |

---

## 4. Verification & Testing

### 1. Run Backend Automated Test Suite (Jest)
```bash
cd backend
npm test
```
**Results:** 16 / 16 tests passing across health checks, event listings, validation schemas, RBAC guards, Google OAuth URL generation, state cookies, and session clearance.

### 2. Run Frontend Asset & Link Verification
```bash
cd frontend
npm run verify
```
**Results:** All 13 HTML pages, CSS stylesheets, and JS client scripts verified with HTTP 200 responses.

---

## 5. PostgreSQL Database

### Configuration
Database settings are configured in `backend/.env`:
```env
DATABASE_URL=postgresql://campus_inn_user:your_password_here@localhost:5432/campus_inn_db
```

### Applying Migrations & Seeding Data
When PostgreSQL is online:
```bash
cd backend
npm run migrate   # Idempotent execution of 001_initial_schema.sql
npm run seed      # Seeds student, faculty, TPO, recruiter, coordinator, and admin records
```

### Offline Handling
When PostgreSQL is offline (`ECONNREFUSED` on port 5432):
- The backend continues running in degraded mode.
- Non-database endpoints (health check, static frontend files, OAuth URL generation) operate normally.
- Database write endpoints (e.g., student drive applications) return `503 Service Unavailable` with explicit `DATABASE_OFFLINE` error details explaining the exact issue without fabricating mock persistence.

---

## 6. Deployment Readiness

- **Separate Deployment:**
  - **Backend:** Deploy to Render, AWS EC2, or Railway as a Node.js web service running `cd backend && npm start`.
  - **Frontend:** Deploy to Render Static Site, Vercel, Netlify, or AWS S3/CloudFront with publish directory `frontend`.
- **Unified Deployment:**
  - The Express backend is preconfigured to serve the `frontend/` static directory automatically from `http://localhost:3000` or the production domain if both are hosted as a single service.
- **Render Blueprint:** Preconfigured in root [`render.yaml`](file:///render.yaml).

---

## 7. Security Best Practices

- Real secrets (`GOOGLE_CLIENT_SECRET`, database passwords, `JWT_SECRET`) are strictly kept in `backend/.env` and excluded from git via [`.gitignore`](file:///.gitignore).
- No secrets exist in client-side HTML, JavaScript, or public repositories.
- HTTP security headers are enforced via `helmet`.
- Authentication endpoints are protected with rate limiting (`express-rate-limit`).
- Cross-site request forgery (CSRF) protection is applied to Google OAuth using cryptographically random state tokens stored in HTTP-only cookies.

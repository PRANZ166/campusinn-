# Campus Inn+ — Frontend Documentation

**Tagline:** Connect. Manage. Grow.  
**Version:** 1.0.0 (Production Architecture)

---

## 1. Overview

The `frontend/` directory contains the complete client-side presentation layer for Campus Inn+, implementing the Google Stitch design system, Tailwind CSS styling, Google Fonts typography (Bricolage Grotesque & Hanken Grotesk), Material Symbols, and responsive layouts across all 6 stakeholder portals.

---

## 2. Directory Structure

```
frontend/
├── index.html            # Main Campus Inn+ Public Homepage
├── login.html            # Unified Multi-Role Authentication Portal (Students, Faculty, TPO, Recruiter, Coordinator, Admin)
├── student.html          # Student Career & Placement Portal
├── placement.html        # Training & Placement Officer (TPO) Portal
├── faculty.html          # Faculty Mentorship & Academic NOC Desk
├── coordinator.html      # Campus Innovation & Hackathon Guild Hub
├── company.html          # Corporate Recruiter ATS & Talent Gateway
├── admin.html            # Enterprise Administration & Academic Census Console
├── events.html           # Campus Events, Hackathons & Cultural Hub
├── about.html            # Institutional Ecosystem & Platform Governance
├── companies.html        # Corporate Hiring Partners Directory
├── hiring-builder.html   # Recruiter Job Requisition Builder
├── hr-register.html      # Corporate Partner Registration Wizard
├── css/
│   └── theme.css         # Google Stitch custom design tokens, dark/light mode, and animations
├── js/
│   ├── api.js            # Enterprise API service client with auto-origin routing & credential handling
│   ├── shared.js         # Shared navigation, role profile menu, session state, theme switcher
│   └── mock-data.js      # Structured mock datasets and fallback seeds
├── assets/               # Visual assets, branding icons, and screenshots
├── package.json          # Frontend scripts (start, dev, verify)
├── serve.js              # Zero-dependency local static development server (Port 5500)
└── verify.js             # Automated frontend asset & HTTP verification script
```

---

## 3. Running the Frontend Standalone

### Prerequisites
- Node.js >= 18 (no external npm dependencies required)

### Startup Commands
```bash
# In Terminal:
cd frontend
npm start
# Alternatively:
node serve.js
```

The frontend server starts immediately at:
👉 **`http://localhost:5500`**

### Configurable Port
To run on a custom port:
```bash
PORT=8080 node serve.js
```

---

## 4. Backend API Connectivity & CORS

The frontend client in `js/api.js` is engineered to communicate seamlessly with the backend:

1. **Auto-Discovery:** When loaded from port 5500 (or any non-3000 port), `api.js` automatically targets the backend at:
   `http://localhost:3000/api/v1`
2. **Same-Origin Mode:** When served directly by the backend Express server on port 3000, `api.js` uses relative `/api/v1`.
3. **Custom Origin Override:** To direct API requests to a remote backend, set `window.CAMPUS_INN_API_URL` prior to script execution:
   ```html
   <script>window.CAMPUS_INN_API_URL = "https://your-api.onrender.com/api/v1";</script>
   ```
4. **CORS & Credentials:** All cross-origin fetch requests include `credentials: "include"`, enabling HTTP-only cookies (`ci_session`) and `Authorization: Bearer <token>` authentication.

---

## 5. Verification & Testing

To test all 13 HTML pages, verify script syntax, and validate HTTP 200 responses:
```bash
cd frontend
npm run verify
# or
node verify.js
```

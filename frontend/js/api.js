/**
 * Campus Inn+ — Central API Service Client
 * Enterprise-grade client with endpoint degradation, missing endpoint audit,
 * and clearly labelled development mock fallbacks.
 */

const API = (() => {
  // Built-in build-time injected API URL (populated during Vercel build if env var is provided)
  const INJECTED_API_URL = '';

  // Configurable base URL (can be overridden by window.CAMPUS_INN_API_URL, meta tag, or localStorage)
  const resolveBaseUrl = () => {
    if (typeof window !== 'undefined' && window.CAMPUS_INN_API_URL) {
      return window.CAMPUS_INN_API_URL;
    }
    if (INJECTED_API_URL) {
      return INJECTED_API_URL;
    }
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="campus-inn-api-url"]');
      if (meta && meta.content) return meta.content;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem('ci_api_url');
      if (stored) return stored;
    }
    // When served separately (e.g. frontend dev server on port 5500, 5173, etc. or file:)
    if (typeof window !== 'undefined' && window.location) {
      const { protocol, port, hostname } = window.location;
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
      if (protocol === 'file:' || (isLocal && port && port !== '3000')) {
        return 'http://localhost:3000/api/v1';
      }
      // When hosted on Vercel (*.vercel.app), use relative '/api/v1' to route through
      // Vercel's edge rewrites directly to Render, eliminating cross-origin CORS latency
      if (hostname && typeof hostname.endsWith === 'function' && hostname.endsWith('.vercel.app')) {
        return '/api/v1';
      }
      // In remote / production environment (e.g. Render backend directly or other origin), route directly to Render backend
      if (!isLocal) {
        return 'https://campus-inn-backend.onrender.com/api/v1';
      }
    }
    return '/api/v1';
  };
  const BASE_URL = resolveBaseUrl();

  // Config flag: Allow mock fallback when backend endpoint returns 404 or connection fails
  const ALLOW_DEV_MOCK = true;

  // Audit list of missing endpoints encountered during execution
  const missingEndpoints = new Set();

  /**
   * Core request wrapper
   * Handles timeout, error catching, loading states, and endpoint audit
   */
  async function request(endpoint, options = {}) {
    let url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (options.body && typeof FormData !== 'undefined' && options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    // Attach Bearer token if session exists
    const token = localStorage.getItem('ci_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const executeFetch = async (targetUrl) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(targetUrl, {
          ...options,
          headers,
          credentials: 'include',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    };

    try {
      let response;
      try {
        response = await executeFetch(url);
      } catch (fetchErr) {
        // Fallback: If running on Vercel and relative /api/v1 failed with a network error,
        // retry directly against the production Render backend URL.
        const isRelative = url.startsWith('/api/');
        if (isRelative && typeof window !== 'undefined' && window.location && window.location.hostname && typeof window.location.hostname.endsWith === 'function' && window.location.hostname.endsWith('.vercel.app')) {
          const directUrl = `https://campus-inn-backend.onrender.com${url}`;
          console.warn(`[Campus Inn+ API] Proxy request ${url} encountered network issue (${fetchErr.message}). Retrying via direct Render endpoint...`);
          response = await executeFetch(directUrl);
          url = directUrl;
        } else {
          throw fetchErr;
        }
      }

      if (!response.ok) {
        if (response.status === 404) {
          missingEndpoints.add(`${options.method || 'GET'} ${url}`);
          console.warn(`[Campus Inn+ API] Endpoint not found on backend (404): ${url}`);
        }
        const errJson = await response.json().catch(() => null);
        const error = new Error((errJson && errJson.message) || `HTTP Error ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const json = await response.json();
      return { data: json, error: null, isMock: false, endpoint: url };
    } catch (err) {
      missingEndpoints.add(`${options.method || 'GET'} ${url}`);
      let errorMessage = err.message || 'Network request failed';
      if (err.name === 'AbortError') {
        errorMessage = 'Server response timed out. The backend server may be waking up from cold start; please retry in a few seconds.';
      } else if (
        errorMessage === 'Failed to fetch' ||
        (err.name === 'TypeError' && typeof err.message === 'string' && err.message.toLowerCase().includes('fetch')) ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Load failed')
      ) {
        errorMessage = 'Unable to reach backend server. Please verify your connection or retry in a moment.';
      }
      return {
        data: null,
        error: errorMessage,
        isMock: false,
        endpoint: url,
        status: err.status || 0
      };
    }
  }

  /* ═══════════════════════════════════════════
     1. AUTHENTICATION SERVICE (STRICT REAL BACKEND)
     ═══════════════════════════════════════════ */
  const auth = {
    async login(identifier, password, role) {
      const payload = { identifier, password };
      if (role) payload.role = role;
      const res = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.data && res.data.token) {
        localStorage.setItem('ci_token', res.data.token);
        return { data: res.data.user, token: res.data.token, error: null, isMock: false };
      }

      // STRICT POLICY: Never fall back to mock accounts or invent names
      return {
        data: null,
        error: res.error || 'Authentication failed. Please verify your credentials.',
        isMock: false,
        status: res.status
      };
    },

    async registerStudent(payload) {
      const clean = { ...(payload || {}) };
      if (!clean.fullName && (clean.firstName || clean.lastName)) {
        clean.fullName = `${clean.firstName || ''} ${clean.lastName || ''}`.trim();
      } else if (!clean.fullName && clean.name) {
        clean.fullName = clean.name.trim();
      }
      if (clean.fullName) {
        clean.fullName = clean.fullName.trim();
        const parts = clean.fullName.split(/\s+/);
        if (!clean.firstName) clean.firstName = parts[0] || '';
        if (!clean.lastName) clean.lastName = parts.slice(1).join(' ') || '';
      }
      const res = await request('/auth/register/student', {
        method: 'POST',
        body: JSON.stringify(clean)
      });

      if (res.data && res.data.success) {
        return { data: res.data, error: null, isMock: false };
      }

      return {
        data: null,
        error: res.error || (res.data && res.data.message) || 'Student registration failed. Please check the provided information.',
        isMock: false,
        status: res.status
      };
    },

    async registerFaculty(payload) {
      const clean = { ...(payload || {}) };
      if (!clean.fullName && clean.name) clean.fullName = clean.name.trim();
      if (clean.fullName) clean.fullName = clean.fullName.trim();
      const res = await request('/auth/register/faculty', {
        method: 'POST',
        body: JSON.stringify(clean)
      });

      if (res.data && res.data.success) {
        return { data: res.data, error: null, isMock: false };
      }

      return {
        data: null,
        error: res.error || (res.data && res.data.message) || 'Faculty registration failed. Please check the provided information.',
        isMock: false,
        status: res.status
      };
    },

    async registerCoordinator(payload) {
      const clean = { ...(payload || {}) };
      if (!clean.fullName && clean.name) clean.fullName = clean.name.trim();
      if (clean.fullName) clean.fullName = clean.fullName.trim();
      const res = await request('/auth/register/coordinator', {
        method: 'POST',
        body: JSON.stringify(clean)
      });

      if (res.data && res.data.success) {
        return { data: res.data, error: null, isMock: false };
      }

      return {
        data: null,
        error: res.error || (res.data && res.data.message) || 'Coordinator registration failed. Please check the provided information.',
        isMock: false,
        status: res.status
      };
    },

    async registerRecruiter(payload) {
      const clean = { ...(payload || {}) };
      if (!clean.fullName && clean.recruiterName) clean.fullName = clean.recruiterName.trim();
      if (!clean.fullName && clean.name) clean.fullName = clean.name.trim();
      if (clean.fullName) clean.fullName = clean.fullName.trim();
      const res = await request('/auth/register/recruiter', {
        method: 'POST',
        body: JSON.stringify(clean)
      });

      if (res.data && res.data.success) {
        return { data: res.data, error: null, isMock: false };
      }

      return {
        data: null,
        error: res.error || (res.data && res.data.message) || 'Recruiter registration failed. Please check the provided information.',
        isMock: false,
        status: res.status
      };
    },

    async getAdminSetupStatus() {
      const res = await request('/auth/admin-setup-status', { method: 'GET' });
      if (res.data && res.data.success) {
        return { data: res.data, error: null, isMock: false };
      }
      return {
        data: null,
        error: res.error || (res.data && res.data.message) || 'Failed to determine admin setup status.',
        isMock: false,
        status: res.status
      };
    },

    async bootstrapAdmin(payload) {
      const clean = { ...(payload || {}) };
      const headers = {};
      const secret = clean.operatorSecret || clean.bootstrapSecret;
      if (secret) {
        headers['x-admin-operator-secret'] = secret;
        headers['x-admin-bootstrap-secret'] = secret;
      }
      const res = await request('/auth/bootstrap/admin', {
        method: 'POST',
        headers,
        body: JSON.stringify(clean)
      });
      if (res.data && res.data.success) {
        return { data: res.data, error: null, isMock: false };
      }
      return {
        data: null,
        error: res.error || (res.data && res.data.message) || 'Primary administrator bootstrap provisioning failed.',
        code: (res.data && res.data.code) || null,
        isMock: false,
        status: res.status
      };
    },

    async me() {
      const res = await request('/auth/me', { method: 'GET' });
      if (res.data && res.data.user) {
        return { data: res.data.user, error: null, isMock: false };
      }
      return { data: null, error: res.error || 'Session expired or unauthenticated.', isMock: false, status: res.status };
    },

    async googleSso(credential) {
      const res = await request('/auth/google-sso', {
        method: 'POST',
        body: JSON.stringify({ credential })
      });

      if (res.data && res.data.token) {
        localStorage.setItem('ci_token', res.data.token);
        return { data: res.data.user, error: null, isMock: false };
      }

      return {
        data: null,
        error: res.error || 'Google OAuth verification requires GOOGLE_CLIENT_ID configuration on Google Cloud Console. Please sign in with your campus email and password.',
        isMock: false,
        endpoint: res.endpoint
      };
    },

    async logout() {
      await request('/auth/logout', { method: 'POST' }).catch(() => {});
      localStorage.removeItem('ci_token');
      localStorage.removeItem('ci_auth');
      return { success: true };
    },

    async forgotPassword(email, identifier = null) {
      const payload = { email };
      if (identifier) payload.identifier = identifier;
      const res = await request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res;
    },

    async resetPassword(token, newPassword, confirmPassword) {
      const res = await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword, confirmPassword })
      });
      return res;
    }
  };

  /* ═══════════════════════════════════════════
     2. STUDENT PORTAL SERVICE (AUTHENTICATED)
     ═══════════════════════════════════════════ */
  const student = {
    async getProfile() {
      const res = await request('/students/me');
      if (res.data && res.data.student) {
        return { data: res.data.student, error: null, isMock: false };
      }
      return { data: null, error: res.error || 'Failed to retrieve student profile.', isMock: false };
    },

    async getResume() {
      const res = await request('/students/resume');
      return res;
    },

    async uploadResume(file) {
      const formData = new FormData();
      formData.append('cvFile', file);
      const url = `${BASE_URL}/students/resume`;
      const headers = {};
      const token = localStorage.getItem('ci_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
          credentials: 'include'
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          return {
            data: null,
            error: (json && json.message) || `Upload failed with status ${response.status}`,
            status: response.status
          };
        }
        return { data: json, error: null, status: response.status };
      } catch (err) {
        return {
          data: null,
          error: err.message || 'Network error encountered during resume upload.',
          status: 0
        };
      }
    },

    async deleteResume() {
      const res = await request('/students/resume', { method: 'DELETE' });
      return res;
    },

    getResumeDownloadUrl() {
      return `${BASE_URL}/students/resume/download`;
    },

    async apply(driveId, company, title) {
      const res = await request(`/students/drives/${encodeURIComponent(driveId)}/apply`, {
        method: 'POST',
        body: JSON.stringify({ company, title })
      });
      return res;
    },

    async getEvents() {
      const res = await request('/students/events');
      return res;
    },

    async updateProfile(payload) {
      return await request('/students/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    }
  };

  /* ═══════════════════════════════════════════
     3. PLACEMENT & DRIVES SERVICE
     ═══════════════════════════════════════════ */
  const placements = {
    async getDrives() {
      const res = await request('/students/drives');
      if (res.data) return res;

      if (ALLOW_DEV_MOCK && window.CampusInnDevMock) {
        return {
          data: window.CampusInnDevMock.placementDrives,
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async apply(driveId) {
      const res = await request(`/students/drives/${encodeURIComponent(driveId)}/apply`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: {
            success: true,
            driveId,
            status: 'Applied',
            appliedAt: new Date().toISOString(),
            _source: 'DEV_MOCK'
          },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    }
  };

  /* ═══════════════════════════════════════════
     3. TPO OVERSIGHT SERVICE
     ═══════════════════════════════════════════ */
  const tpo = {
    async getVettingQueue() {
      const res = await request('/tpo/companies/pending');
      if (res.data) return res;

      if (ALLOW_DEV_MOCK && window.CampusInnDevMock) {
        return {
          data: window.CampusInnDevMock.vettingQueue,
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async signoffMOU(companyId) {
      const res = await request(`/tpo/companies/${encodeURIComponent(companyId)}/signoff`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, companyId, signedAt: new Date().toISOString(), _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    }
  };

  /* ═══════════════════════════════════════════
     4. CAMPUS EVENTS & HACKATHONS SERVICE
     ═══════════════════════════════════════════ */
  const events = {
    async getEvents() {
      const res = await request('/events');
      return res;
    },

    async getFreshers() {
      const res = await request('/events/freshers');
      return res;
    },

    async getMyRegistrations() {
      const res = await request('/events/registrations/me');
      return res;
    },

    async register(eventId, payload = {}) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/register`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res;
    },

    async verifyAttendance(eventId, rollNumber) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/attendance/verify`, {
        method: 'POST',
        body: JSON.stringify({ rollNumber })
      });
      return res;
    },

    async getAttendancePass(eventId) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/attendance/pass`);
      return res;
    },

    async getAttendance(eventId) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/attendance`);
      return res;
    },

    async getPhotos(eventId) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/photos`);
      return res;
    },

    async uploadPhoto(eventId, formData) {
      const url = `${BASE_URL}/events/${encodeURIComponent(eventId)}/photos`;
      const headers = {};
      const token = localStorage.getItem('ci_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
          credentials: 'include'
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          return { data: null, error: (json && json.message) || `Upload failed (${response.status})`, status: response.status };
        }
        return { data: json, error: null, status: response.status };
      } catch (err) {
        return { data: null, error: err.message || 'Network error during photo upload.', status: 0 };
      }
    },

    async deletePhoto(photoId) {
      const res = await request(`/events/photos/${encodeURIComponent(photoId)}`, {
        method: 'DELETE'
      });
      return res;
    },

    async rsvp(eventId) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/rsvp`, {
        method: 'POST'
      });
      return res;
    },

    async registerHackathon(payload) {
      const res = await request('/events/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res;
    },

    getPhotoDownloadUrl(photoId) {
      return `${BASE_URL}/events/photos/${encodeURIComponent(photoId)}/download`;
    }
  };

  /* ═══════════════════════════════════════════
     5. FACULTY MENTORSHIP SERVICE
     ═══════════════════════════════════════════ */
  const faculty = {
    async getMentees() {
      const res = await request('/faculty/mentees');
      if (res.data) return res;

      if (ALLOW_DEV_MOCK && window.CampusInnDevMock) {
        return {
          data: window.CampusInnDevMock.facultyMentees,
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async grantNoc(menteeId) {
      const res = await request(`/faculty/noc/${encodeURIComponent(menteeId)}/grant`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, menteeId, grantedAt: new Date().toISOString(), _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async getProfile() {
      return await request('/faculty/profile');
    },

    async updateProfile(payload) {
      return await request('/faculty/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },

    async getDashboard() {
      return await request('/faculty/dashboard');
    },

    async submitMenteeFeedback(studentId, feedback) {
      return await request(`/faculty/mentees/${encodeURIComponent(studentId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback })
      });
    }
  };

  /* ═══════════════════════════════════════════
     6. RECRUITER ATS SERVICE
     ═══════════════════════════════════════════ */
  const recruiter = {
    async registerCompany(payload) {
      const res = await request('/recruiter/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, registeredAt: new Date().toISOString(), _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async publishRequirement(payload) {
      const res = await request('/recruiter/requirements', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, requirementId: 'REQ-' + Date.now(), _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async getCandidates() {
      const res = await request('/recruiter/candidates');
      if (res.data) return res;

      if (ALLOW_DEV_MOCK && window.CampusInnDevMock) {
        return {
          data: window.CampusInnDevMock.recruiterCandidates,
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async shortlist(candidateId) {
      const res = await request(`/recruiter/candidates/${encodeURIComponent(candidateId)}/shortlist`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, candidateId, status: 'Shortlisted', _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async slotInterview(candidateId, slot) {
      const res = await request(`/recruiter/candidates/${encodeURIComponent(candidateId)}/slot-interview`, {
        method: 'POST',
        body: JSON.stringify({ slot })
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, candidateId, slot, status: 'Interview Slotted', _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async extendOffer(candidateId) {
      const res = await request(`/recruiter/candidates/${encodeURIComponent(candidateId)}/offer`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, candidateId, status: 'Offer Extended', _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    }
  };

  /* ═══════════════════════════════════════════
     7. COORDINATOR & GUILDS SERVICE
     ═══════════════════════════════════════════ */
  const coordinator = {
    async getEvents() {
      const res = await request('/coordinator/events');
      return res;
    },

    async createEvent(payload) {
      const isForm = (typeof FormData !== 'undefined') && (payload instanceof FormData);
      const res = await request('/coordinator/events', {
        method: 'POST',
        body: isForm ? payload : JSON.stringify(payload)
      });
      return res;
    },

    async updateEvent(eventId, payload) {
      const isForm = (typeof FormData !== 'undefined') && (payload instanceof FormData);
      const res = await request(`/coordinator/events/${encodeURIComponent(eventId)}`, {
        method: 'PUT',
        body: isForm ? payload : JSON.stringify(payload)
      });
      return res;
    },

    async getAttendance(eventId) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/attendance`);
      return res;
    },

    async markAttendance(eventId, payload) {
      const res = await request(`/coordinator/events/${encodeURIComponent(eventId)}/attendance/mark`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res;
    },

    async getHackathonTeams() {
      const res = await request('/coordinator/hackathons/teams');
      if (res.data) return res;

      if (ALLOW_DEV_MOCK && window.CampusInnDevMock) {
        return {
          data: window.CampusInnDevMock.hackathonTeams,
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async approveTeam(teamId) {
      const res = await request(`/coordinator/hackathons/teams/${encodeURIComponent(teamId)}/approve`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, teamId, status: 'Approved', _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async launchEvent(payload) {
      return this.createEvent(payload);
    },

    async updateEventStatus(eventId, status) {
      return await request(`/coordinator/events/${encodeURIComponent(eventId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    }
  };

  /* ═══════════════════════════════════════════
     8. ADMIN & CENSUS SERVICE
     ═══════════════════════════════════════════ */
  const admin = {
    async syncRegistry() {
      const res = await request('/admin/census/sync', { method: 'POST' });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: {
            success: true,
            recordsSynced: 4820,
            syncedWith: 'SPPU Exam Cell Ledger (MET Nashik)',
            timestamp: new Date().toISOString(),
            _source: 'DEV_MOCK'
          },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async approvePartner(partnerId) {
      const res = await request(`/admin/partners/${encodeURIComponent(partnerId)}/approve`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, partnerId, status: 'Accredited Partner', _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async broadcastAnnouncement(payload) {
      const res = await request('/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, broadcastId: 'BRD-' + Date.now(), sentAt: new Date().toISOString(), _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async getFaculty() {
      return await request('/admin/faculty');
    },

    async createFaculty(payload) {
      return await request('/admin/faculty', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async updateFacultyStatus(id, status) {
      return await request(`/admin/faculty/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    },

    async getPending() {
      return await request('/admin/pending');
    },

    async getUsers(params = {}) {
      const qs = new URLSearchParams();
      if (params.role) qs.set('role', params.role);
      if (params.status) qs.set('status', params.status);
      if (params.search) qs.set('search', params.search);
      if (params.limit) qs.set('limit', params.limit);
      if (params.offset) qs.set('offset', params.offset);
      const queryStr = qs.toString();
      return await request('/admin/users' + (queryStr ? '?' + queryStr : ''));
    },

    async getCoordinators() {
      return await request('/admin/coordinators');
    },

    async approveUser(id, payload = {}) {
      return await request(`/admin/users/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async rejectUser(id, payload = {}) {
      return await request(`/admin/users/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async updateUserStatus(id, status) {
      return await request(`/admin/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    },

    async grantAdmin(id, payload = { confirm: true }) {
      return await request(`/admin/users/${encodeURIComponent(id)}/grant-admin`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async revokeAdmin(id, payload = { confirm: true, fallbackRole: 'faculty' }) {
      return await request(`/admin/users/${encodeURIComponent(id)}/revoke-admin`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async getAuditLog(params = {}) {
      const qs = new URLSearchParams();
      if (params.limit) qs.set('limit', params.limit);
      if (params.offset) qs.set('offset', params.offset);
      const queryStr = qs.toString();
      return await request('/admin/audit-log' + (queryStr ? '?' + queryStr : ''));
    },

    async getReplaceStatus(operatorSecret = null) {
      const headers = {};
      if (operatorSecret) {
        headers['x-admin-operator-secret'] = operatorSecret;
        headers['x-admin-bootstrap-secret'] = operatorSecret;
      }
      return await request('/admin/replace/status', { headers });
    },

    async initiateAdminReplacement(payload) {
      const clean = { ...(payload || {}) };
      const headers = {};
      const secret = clean.operatorSecret || clean.bootstrapSecret;
      if (secret) {
        headers['x-admin-operator-secret'] = secret;
        headers['x-admin-bootstrap-secret'] = secret;
      }
      return await request('/admin/replace/initiate', {
        method: 'POST',
        headers,
        body: JSON.stringify(clean)
      });
    },

    async confirmAdminReplacement(payload) {
      const clean = { ...(payload || {}) };
      const headers = {};
      const secret = clean.operatorSecret || clean.bootstrapSecret;
      if (secret) {
        headers['x-admin-operator-secret'] = secret;
        headers['x-admin-bootstrap-secret'] = secret;
      }
      return await request('/admin/replace/confirm', {
        method: 'POST',
        headers,
        body: JSON.stringify(clean)
      });
    }
  };

  /* ═══════════════════════════════════════════
     9. NOTIFICATIONS CENTER SERVICE
     ═══════════════════════════════════════════ */
  const notifications = {
    async getAll() {
      const res = await request('/notifications', { method: 'GET' });
      return res;
    },
    async markAsRead(id) {
      const res = await request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
      return res;
    },
    async markAllAsRead() {
      const res = await request('/notifications/read-all', { method: 'PATCH' });
      return res;
    }
  };

  /* ═══════════════════════════════════════════
     10. GLOBAL CAMPUS SEARCH SERVICE
     ═══════════════════════════════════════════ */
  async function search(query) {
    const res = await request(`/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
    return res;
  }

  return {
    BASE_URL,
    missingEndpoints,
    request,
    auth,
    student,
    placements,
    tpo,
    events,
    faculty,
    recruiter,
    coordinator,
    admin,
    notifications,
    search
  };
})();

if (typeof window !== 'undefined') {
  window.CampusInnAPI = API;
  window.CampusInn = window.CampusInn || {};
  window.CampusInn.API = API;
  window.CampusInn.admin = API.admin;
  window.CampusInn.Admin = API.admin;
}

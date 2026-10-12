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
      const { protocol, port } = window.location;
      if (protocol === 'file:' || (port && port !== '3000')) {
        return 'http://localhost:3000/api/v1';
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
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    // Attach Bearer token if session exists
    const token = localStorage.getItem('ci_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

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
      return {
        data: null,
        error: err.message || 'Network request failed',
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
    async login(identifier, password) {
      const res = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
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
      const res = await request('/auth/register/student', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.data && res.data.success) {
        return { data: res.data, error: null, isMock: false };
      }

      return {
        data: null,
        error: res.error || 'Registration failed. Please check the provided information.',
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

    async apply(driveId, company, title) {
      const res = await request(`/students/drives/${encodeURIComponent(driveId)}/apply`, {
        method: 'POST',
        body: JSON.stringify({ company, title })
      });
      return res;
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
      if (res.data) return res;

      if (ALLOW_DEV_MOCK && window.CampusInnDevMock) {
        return {
          data: window.CampusInnDevMock.events,
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
    },

    async rsvp(eventId) {
      const res = await request(`/events/${encodeURIComponent(eventId)}/rsvp`, {
        method: 'POST'
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, eventId, rsvpAt: new Date().toISOString(), _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
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
      const res = await request('/coordinator/events', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.data) return res;

      if (ALLOW_DEV_MOCK) {
        return {
          data: { success: true, eventId: 'EVT-' + Date.now(), _source: 'DEV_MOCK' },
          error: null,
          isMock: true,
          endpoint: res.endpoint
        };
      }
      return res;
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
    }
  };

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
    admin
  };
})();

if (typeof window !== 'undefined') {
  window.CampusInnAPI = API;
}

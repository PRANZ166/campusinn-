/**
 * Campus Inn+ — Automated Unit & Integration Tests
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const app = require('../src/app');

describe('Campus Inn+ Backend API Suite', () => {
  it('GET /api/health should return 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('healthy');
  });

  it('GET /api/v1/events should return campus events', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/auth/login with missing payload should return 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});
    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/auth/register/student with invalid data should return 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/student')
      .send({ email: 'invalid-email' });
    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/students/me without token should return 401', async () => {
    const res = await request(app).get('/api/v1/students/me');
    expect(res.statusCode).toEqual(401);
    expect(res.body.code).toEqual('AUTH_REQUIRED');
  });

  it('GET /api/v1/faculty/mentees without token should return 401', async () => {
    const res = await request(app).get('/api/v1/faculty/mentees');
    expect(res.statusCode).toEqual(401);
  });

  it('GET /api/v1/tpo/companies/pending without token should return 401', async () => {
    const res = await request(app).get('/api/v1/tpo/companies/pending');
    expect(res.statusCode).toEqual(401);
  });

  it('GET /api/v1/recruiter/candidates without token should return 401', async () => {
    const res = await request(app).get('/api/v1/recruiter/candidates');
    expect(res.statusCode).toEqual(401);
  });

  it('GET /api/v1/coordinator/hackathons/teams without token should return 401', async () => {
    const res = await request(app).get('/api/v1/coordinator/hackathons/teams');
    expect(res.statusCode).toEqual(401);
  });

  it('POST /api/v1/admin/census/sync without token should return 401', async () => {
    const res = await request(app).post('/api/v1/admin/census/sync');
    expect(res.statusCode).toEqual(401);
  });

  // Google OAuth Flow & Security Tests
  it('GET /api/v1/auth/google should redirect to accounts.google.com and set ci_oauth_state cookie', async () => {
    const res = await request(app).get('/api/v1/auth/google');
    expect(res.statusCode).toEqual(302);
    expect(res.headers.location).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.location).toContain('client_id=');
    expect(res.headers.location).toContain('redirect_uri=');
    expect(res.headers['set-cookie']).toBeDefined();
    const cookieHeader = res.headers['set-cookie'].join(';');
    expect(cookieHeader).toContain('ci_oauth_state=');
  });

  it('GET /api/v1/auth/google/callback with user cancellation should redirect with error to frontend', async () => {
    const res = await request(app).get('/api/v1/auth/google/callback?error=access_denied');
    expect(res.statusCode).toEqual(302);
    expect(res.headers.location).toContain('/login.html?error=');
    expect(res.headers.location).toContain('cancelled');
    // Location must redirect to Vercel production frontend or configured frontendUrl
    expect(res.headers.location).toMatch(/campusinn-frontend.*\.vercel\.app|localhost:5500/);
  });

  it('GET /api/v1/auth/google/callback with missing or mismatched state should reject with error', async () => {
    const res = await request(app).get('/api/v1/auth/google/callback?code=fake_code&state=bad_state');
    expect(res.statusCode).toEqual(302);
    expect(res.headers.location).toContain('/login.html?error=');
    expect(res.headers.location).toContain('state');
    expect(res.headers.location).toMatch(/campusinn-frontend.*\.vercel\.app|localhost:5500/);
  });

  it('GET /api/v1/auth/google should track frontend_url and set secure state cookie', async () => {
    const res = await request(app).get('/api/v1/auth/google?frontend_url=https://campusinn-frontend-9nxrritaj-pranz.vercel.app');
    expect(res.statusCode).toEqual(302);
    expect(res.headers.location).toContain('accounts.google.com');
    const cookieHeader = res.headers['set-cookie'].join(';');
    expect(cookieHeader).toContain('ci_oauth_state=');
    expect(cookieHeader).toContain('ci_oauth_frontend=');
  });

  it('POST /api/v1/auth/google-sso with missing credential should return 400', async () => {
    const res = await request(app).post('/api/v1/auth/google-sso').send({});
    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toEqual('CREDENTIAL_REQUIRED');
  });

  it('POST /api/v1/auth/google-sso with invalid token should return 401', async () => {
    const res = await request(app).post('/api/v1/auth/google-sso').send({ credential: 'invalid.jwt.token' });
    expect(res.statusCode).toEqual(401);
    expect(res.body.code).toEqual('INVALID_GOOGLE_TOKEN');
  });

  it('POST /api/v1/auth/logout should clear session cookie and return 200', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    const cookieHeader = res.headers['set-cookie'].join(';');
    expect(cookieHeader).toContain('ci_session=;');
  });

  describe('OAuth State Validation Suite (RFC 6749 & Production Security)', () => {
    const oauthStateStore = require('../src/services/oauthStateStore');

    it('1. Valid state succeeds and retains initiating frontendUrl and return path', () => {
      const record = oauthStateStore.createState({
        frontendUrl: 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app',
        redirect: 'student.html',
      });
      expect(record.stateToken).toBeDefined();
      expect(record.nonce).toBeDefined();

      const result = oauthStateStore.verifyAndConsumeState(record.stateToken);
      expect(result.valid).toBe(true);
      expect(result.stateRecord.frontendUrl).toEqual('https://campusinn-frontend-9nxrritaj-pranz.vercel.app');
      expect(result.stateRecord.redirect).toEqual('student.html');
    });

    it('2. Missing state is rejected both in store and HTTP callback', async () => {
      expect(oauthStateStore.verifyAndConsumeState(null).valid).toBe(false);
      expect(oauthStateStore.verifyAndConsumeState('').valid).toBe(false);
      expect(oauthStateStore.verifyAndConsumeState(undefined).valid).toBe(false);

      const res = await request(app).get('/api/v1/auth/google/callback');
      expect(res.statusCode).toEqual(302);
      expect(res.headers.location).toContain('/login.html?error=');
      expect(res.headers.location).toContain('state');
    });

    it('3. Mismatched or tampered state is rejected', async () => {
      const record = oauthStateStore.createState();
      // Tamper signature
      const tampered = record.stateToken + 'modified';
      const result = oauthStateStore.verifyAndConsumeState(tampered);
      expect(result.valid).toBe(false);

      // Cookie mismatch
      const mismatchCookie = oauthStateStore.verifyAndConsumeState(record.stateToken, 'different_cookie_token');
      expect(mismatchCookie.valid).toBe(false);
      expect(mismatchCookie.error).toEqual('COOKIE_MISMATCH');

      const res = await request(app).get('/api/v1/auth/google/callback?state=completely_fake_state');
      expect(res.statusCode).toEqual(302);
      expect(res.headers.location).toContain('Invalid%20or%20expired%20OAuth%20state');
    });

    it('4. Expired state is rejected', async () => {
      // Create state already expired 5 seconds ago
      const expired = oauthStateStore.createState({ ttlMs: -5000 });
      const result = oauthStateStore.verifyAndConsumeState(expired.stateToken);
      expect(result.valid).toBe(false);
      expect(result.error).toEqual('EXPIRED_STATE');

      const res = await request(app).get(`/api/v1/auth/google/callback?state=${encodeURIComponent(expired.stateToken)}`);
      expect(res.statusCode).toEqual(302);
      expect(res.headers.location).toContain('Invalid%20or%20expired%20OAuth%20state');
    });

    it('5. Reused state is strictly rejected upon second consumption', () => {
      const record = oauthStateStore.createState();
      const firstUse = oauthStateStore.verifyAndConsumeState(record.stateToken);
      expect(firstUse.valid).toBe(true);

      // Second consumption must fail
      const secondUse = oauthStateStore.verifyAndConsumeState(record.stateToken);
      expect(secondUse.valid).toBe(false);
    });

    it('6. Cookie and state encoding (URL encoding, quotes) is handled correctly', () => {
      const record = oauthStateStore.createState();
      const urlEncodedState = encodeURIComponent(record.stateToken);
      const quotedCookie = `"${record.nonce}"`;

      const result = oauthStateStore.verifyAndConsumeState(urlEncodedState, quotedCookie);
      expect(result.valid).toBe(true);
    });

    it('7. Production HTTPS cookie configuration is correct (SameSite=None, Secure)', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const res = await request(app).get('/api/v1/auth/google');
        expect(res.statusCode).toEqual(302);
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const stateCookie = cookies.find(c => c.startsWith('ci_oauth_state='));
        expect(stateCookie).toBeDefined();
        expect(stateCookie.toLowerCase()).toContain('samesite=none');
        expect(stateCookie.toLowerCase()).toContain('secure');
        expect(stateCookie.toLowerCase()).toContain('httponly');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    describe('Google OAuth Callback Production Regression Suite', () => {
      const { OAuth2Client } = require('google-auth-library');

      it('Regression: valid state with trusted frontendUrl does not throw TypeError: Assignment to constant variable', async () => {
        const stateRecord = oauthStateStore.createState({
          frontendUrl: 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app',
          redirect: 'student.html',
        });
        const res = await request(app)
          .get(`/api/v1/auth/google/callback?state=${encodeURIComponent(stateRecord.stateToken)}`)
          .set('Cookie', [`ci_oauth_state=${stateRecord.stateToken}`]);

        expect(res.statusCode).toEqual(302);
        expect(res.headers.location).toContain('https://campusinn-frontend-9nxrritaj-pranz.vercel.app/login.html?error=');
        expect(res.headers.location).toContain('No%20authorization%20code');
      });

      it('Regression: untrusted frontend origin is rejected and falls back to configured trusted frontend', async () => {
        const stateRecord = oauthStateStore.createState({
          frontendUrl: 'https://malicious-phishing-attacker.com',
        });
        const res = await request(app)
          .get(`/api/v1/auth/google/callback?state=${encodeURIComponent(stateRecord.stateToken)}`)
          .set('Cookie', [`ci_oauth_state=${stateRecord.stateToken}`]);

        expect(res.statusCode).toEqual(302);
        expect(res.headers.location).not.toContain('malicious-phishing-attacker.com');
        expect(res.headers.location).toMatch(/campusinn-frontend.*\.vercel\.app|localhost:5500/);
      });

      it('Regression: missing OAuth code with valid state redirects to frontend with safe error', async () => {
        const stateRecord = oauthStateStore.createState({
          frontendUrl: 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app',
        });
        const res = await request(app)
          .get(`/api/v1/auth/google/callback?state=${encodeURIComponent(stateRecord.stateToken)}`)
          .set('Cookie', [`ci_oauth_state=${stateRecord.stateToken}`]);

        expect(res.statusCode).toEqual(302);
        expect(res.headers.location).toContain('/login.html?error=');
        expect(res.headers.location).toContain('No%20authorization%20code%20provided%20by%20Google');
      });

      it('Regression: invalid OAuth state is safely rejected without crash', async () => {
        const res = await request(app)
          .get('/api/v1/auth/google/callback?state=invalid_tampered_token&code=some_code');

        expect(res.statusCode).toEqual(302);
        expect(res.headers.location).toContain('/login.html?error=');
        expect(res.headers.location).toContain('Invalid%20or%20expired%20OAuth%20state');
      });

      it('Regression: callback runtime exception is caught by top-level try/catch and never crashes server', async () => {
        const stateRecord = oauthStateStore.createState();
        const origGetToken = OAuth2Client.prototype.getToken;
        OAuth2Client.prototype.getToken = jest.fn().mockRejectedValue(new Error('Simulated Google network timeout'));

        try {
          const res = await request(app)
            .get(`/api/v1/auth/google/callback?state=${encodeURIComponent(stateRecord.stateToken)}&code=valid_test_code`)
            .set('Cookie', [`ci_oauth_state=${stateRecord.stateToken}`]);

          expect(res.statusCode).toEqual(302);
          expect(res.headers.location).toContain('/login.html?error=');
          expect(res.headers.location).toContain('Simulated%20Google%20network%20timeout');
        } finally {
          OAuth2Client.prototype.getToken = origGetToken;
        }
      });

      it('Regression: successful OAuth exchange provisions session, clears temp cookies, and redirects with auth_payload', async () => {
        const stateRecord = oauthStateStore.createState({
          frontendUrl: 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app',
          redirect: 'student.html',
        });

        const origGetToken = OAuth2Client.prototype.getToken;
        const origVerifyIdToken = OAuth2Client.prototype.verifyIdToken;

        OAuth2Client.prototype.getToken = jest.fn().mockResolvedValue({
          tokens: { id_token: 'mock_valid_id_token', access_token: 'mock_access_token' }
        });
        OAuth2Client.prototype.verifyIdToken = jest.fn().mockResolvedValue({
          getPayload: () => ({
            sub: 'google_test_sub_99999',
            email: 'test.student@metbkc.edu.in',
            email_verified: true,
            given_name: 'Regression',
            family_name: 'Tester',
            picture: 'https://example.com/avatar.png',
          })
        });

        try {
          const res = await request(app)
            .get(`/api/v1/auth/google/callback?state=${encodeURIComponent(stateRecord.stateToken)}&code=auth_code_12345`)
            .set('Cookie', [
              `ci_oauth_state=${stateRecord.stateToken}`,
              `ci_oauth_frontend=https://campusinn-frontend-9nxrritaj-pranz.vercel.app`,
              `ci_oauth_redirect=student.html`
            ]);

          expect(res.statusCode).toEqual(302);
          expect(res.headers.location).toContain('https://campusinn-frontend-9nxrritaj-pranz.vercel.app/login.html?google_auth_success=1');
          expect(res.headers.location).toContain('auth_payload=');
          expect(res.headers.location).toContain('redirect=student.html');

          const cookies = res.headers['set-cookie'];
          expect(cookies).toBeDefined();
          const sessionCookie = cookies.find(c => c.startsWith('ci_session='));
          expect(sessionCookie).toBeDefined();
        } finally {
          OAuth2Client.prototype.getToken = origGetToken;
          OAuth2Client.prototype.verifyIdToken = origVerifyIdToken;
        }
      });
    });
  });

  describe('CORS & Preflight Regression Suite', () => {
    it('should allow production Vercel frontend origin with credentials', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app');

      expect(res.statusCode).toEqual(200);
      expect(res.headers['access-control-allow-origin']).toEqual('https://campusinn-frontend-9nxrritaj-pranz.vercel.app');
      expect(res.headers['access-control-allow-credentials']).toEqual('true');
    });

    it('should allow any Vercel deployment preview domain', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://campusinn-frontend-pr-42.vercel.app');

      expect(res.statusCode).toEqual(200);
      expect(res.headers['access-control-allow-origin']).toEqual('https://campusinn-frontend-pr-42.vercel.app');
      expect(res.headers['access-control-allow-credentials']).toEqual('true');
    });

    it('should allow localhost development origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5500');

      expect(res.statusCode).toEqual(200);
      expect(res.headers['access-control-allow-origin']).toEqual('http://localhost:5500');
    });

    it('should reject unauthorized origins with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://unauthorized-malicious-site.com');

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toEqual('CORS_NOT_ALLOWED');
    });

    it('should respond to OPTIONS preflight with allowed methods and headers', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

      expect([200, 204]).toContain(res.statusCode);
      expect(res.headers['access-control-allow-origin']).toEqual('https://campusinn-frontend-9nxrritaj-pranz.vercel.app');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
    });
  });

  describe('Notification Center Suite', () => {
    it('GET /api/v1/notifications without auth should return 401', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.statusCode).toEqual(401);
      expect(res.body.code).toEqual('AUTH_REQUIRED');
    });

    it('GET /api/v1/notifications with valid token should return user notifications', async () => {
      const token = jwt.sign(
        { sub: 'test-user-id', email: 'test.student@campus.edu.in', role: 'student', firstName: 'Test', lastName: 'User' },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(typeof res.body.unreadCount).toBe('number');
    });

    it('PATCH /api/v1/notifications/read-all with valid token should mark all as read', async () => {
      const token = jwt.sign(
        { sub: 'test-user-id', email: 'test.student@campus.edu.in', role: 'student' },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Global Campus Search Suite', () => {
    it('GET /api/v1/search?q=hackathon should return matched results', async () => {
      const res = await request(app).get('/api/v1/search?q=hackathon');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.query).toEqual('hackathon');
    });

    it('GET /api/v1/search with empty query should return empty results', async () => {
      const res = await request(app).get('/api/v1/search?q=');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results).toEqual([]);
    });
  });

  describe('Hackathon Registration Suite', () => {
    it('POST /api/v1/events/register without auth should return 401', async () => {
      const res = await request(app)
        .post('/api/v1/events/register')
        .send({ teamName: 'Incomplete Team' });

      expect(res.statusCode).toEqual(401);
      expect(res.body.code).toEqual('AUTH_REQUIRED');
    });

    it('POST /api/v1/events/register with missing fields should return 400', async () => {
      const token = jwt.sign(
        { sub: 'test-user-id', email: 'aarav.mehta@campus.edu.in', role: 'student' },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/v1/events/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ teamName: 'Incomplete Team' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/events/register with complete payload should persist registration and issue pass token', async () => {
      const token = jwt.sign(
        { sub: 'test-user-id', email: 'aarav.mehta@campus.edu.in', role: 'student', firstName: 'Aarav', lastName: 'Mehta' },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/v1/events/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          eventName: 'HackBKC 2026',
          participantName: 'Aarav Mehta',
          email: 'aarav.mehta@campus.edu.in',
          phone: '+91 98765 43210',
          college: 'MET Institute of Engineering',
          department: 'Computer Engineering',
          teamName: 'CyberTitans ' + Date.now(),
          teamMembers: ['Rohan Gupta', 'Pooja Patil'],
          rulesAgreed: true
        });

      expect([200, 201]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
      expect(res.body.registration).toBeDefined();
      expect(res.body.registration.passToken).toMatch(/^MET-PASS-/);
    });
  });
});

/**
 * Campus Inn+ — Automated Unit & Integration Tests
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../src/config');
const emailService = require('../src/services/email');
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

  describe('Password Recovery & Reset Suite', () => {
    it('POST /api/v1/auth/forgot-password with invalid email should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-an-email' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('INVALID_EMAIL');
    });

    it('POST /api/v1/auth/forgot-password with missing email should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({});
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('INVALID_EMAIL');
    });

    it('POST /api/v1/auth/forgot-password when SMTP is unconfigured should return 503', async () => {
      const isConfiguredSpy = jest.spyOn(emailService, 'isConfigured').mockReturnValue(false);
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'student@met.edu' });
      expect(res.statusCode).toEqual(503);
      expect(res.body.code).toEqual('EMAIL_SERVICE_UNAVAILABLE');
      isConfiguredSpy.mockRestore();
    });

    it('POST /api/v1/auth/forgot-password with configured SMTP should return generic success without leaking existence', async () => {
      const isConfiguredSpy = jest.spyOn(emailService, 'isConfigured').mockReturnValue(true);
      const sendEmailSpy = jest.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({ success: true });
      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown.nonexistent@met.edu' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an account exists');

      isConfiguredSpy.mockRestore();
      sendEmailSpy.mockRestore();
      querySpy.mockRestore();
    });

    it('POST /api/v1/auth/forgot-password with valid registered email should generate token and dispatch reset email with correct production reset link', async () => {
      const isConfiguredSpy = jest.spyOn(emailService, 'isConfigured').mockReturnValue(true);
      const sendEmailSpy = jest.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({ success: true, messageId: 'test-msg-1' });

      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('FROM users WHERE LOWER(email) = $1')) {
          return Promise.resolve({
            rows: [{ id: 'user_priya_1', email: 'priya.sharma@met.edu', first_name: 'Priya', status: 'active' }]
          });
        }
        if (typeof sql === 'string' && sql.includes('FROM password_reset_tokens WHERE user_id = $1 AND created_at >')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'priya.sharma@met.edu' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const emailArgs = sendEmailSpy.mock.calls[0][0];
      expect(emailArgs.to).toEqual('priya.sharma@met.edu');
      expect(emailArgs.firstName).toEqual('Priya');
      expect(emailArgs.resetUrl).toMatch(/campusinn-frontend.*\.vercel\.app\/reset-password\.html\?token=[a-f0-9]{64}|localhost.*\/reset-password\.html\?token=[a-f0-9]{64}/);
      expect(emailArgs.expiresInMinutes).toEqual(15);

      isConfiguredSpy.mockRestore();
      sendEmailSpy.mockRestore();
      querySpy.mockRestore();
    });

    it('POST /api/v1/auth/forgot-password should apply anti-flood duplicate suppression for rapid requests within 60 seconds', async () => {
      const isConfiguredSpy = jest.spyOn(emailService, 'isConfigured').mockReturnValue(true);
      const sendEmailSpy = jest.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({ success: true });

      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('FROM users WHERE LOWER(email) = $1')) {
          return Promise.resolve({
            rows: [{ id: 'user_priya_1', email: 'priya.sharma@met.edu', first_name: 'Priya', status: 'active' }]
          });
        }
        if (typeof sql === 'string' && sql.includes('password_reset_tokens') && sql.includes('created_at >')) {
          return Promise.resolve({ rows: [{ id: 'existing_token_id' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'priya.sharma@met.edu' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(sendEmailSpy).not.toHaveBeenCalled();

      isConfiguredSpy.mockRestore();
      sendEmailSpy.mockRestore();
      querySpy.mockRestore();
    });

    it('POST /api/v1/auth/forgot-password should handle SMTP delivery failures safely with 503 EMAIL_DELIVERY_FAILED', async () => {
      const isConfiguredSpy = jest.spyOn(emailService, 'isConfigured').mockReturnValue(true);
      const sendEmailSpy = jest.spyOn(emailService, 'sendPasswordResetEmail').mockRejectedValue(new Error('SMTP connection timeout'));

      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('FROM users WHERE LOWER(email) = $1')) {
          return Promise.resolve({
            rows: [{ id: 'user_priya_1', email: 'priya.sharma@met.edu', first_name: 'Priya', status: 'active' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'priya.sharma@met.edu' });

      expect(res.statusCode).toEqual(503);
      expect(res.body.code).toEqual('EMAIL_DELIVERY_FAILED');
      expect(res.body.message).toContain('Unable to deliver password reset email');

      isConfiguredSpy.mockRestore();
      sendEmailSpy.mockRestore();
      querySpy.mockRestore();
    });

    it('POST /api/v1/auth/reset-password with missing token should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ newPassword: 'NewPassword123', confirmPassword: 'NewPassword123' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('INVALID_TOKEN');
    });

    it('POST /api/v1/auth/reset-password with password mismatch should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'abcdef1234567890abcdef1234567890',
          newPassword: 'Password123',
          confirmPassword: 'DifferentPassword123'
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('PASSWORD_MISMATCH');
    });

    it('POST /api/v1/auth/reset-password with weak password should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'abcdef1234567890abcdef1234567890',
          newPassword: 'short',
          confirmPassword: 'short'
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('WEAK_PASSWORD');
    });

    it('POST /api/v1/auth/reset-password with non-existent token should return 400', async () => {
      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockResolvedValue({ rows: [] });
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          newPassword: 'ValidPassword123',
          confirmPassword: 'ValidPassword123'
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('INVALID_TOKEN');
      querySpy.mockRestore();
    });

    it('POST /api/v1/auth/reset-password with expired token should return 400 TOKEN_EXPIRED', async () => {
      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((text) => {
        if (typeof text === 'string' && text.includes('FROM password_reset_tokens')) {
          return Promise.resolve({
            rows: [{
              id: 'token_id_expired',
              user_id: 'user_123',
              expires_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              consumed_at: null,
              status: 'active',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'expired_test_token_1234567890abcdef',
          newPassword: 'BrandNewPassword123',
          confirmPassword: 'BrandNewPassword123',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('TOKEN_EXPIRED');
      querySpy.mockRestore();
    });

    it('POST /api/v1/auth/reset-password with already consumed token should return 400 TOKEN_ALREADY_USED', async () => {
      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((text) => {
        if (typeof text === 'string' && text.includes('FROM password_reset_tokens')) {
          return Promise.resolve({
            rows: [{
              id: 'token_id_consumed',
              user_id: 'user_123',
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              consumed_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
              status: 'active',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'reused_test_token_1234567890abcdef',
          newPassword: 'BrandNewPassword123',
          confirmPassword: 'BrandNewPassword123',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('TOKEN_ALREADY_USED');
      querySpy.mockRestore();
    });

    it('POST /api/v1/auth/reset-password with valid token should update password and return 200', async () => {
      const validToken = 'valid_test_token_1234567890abcdef';
      const userId = 'user_reset_test_123';

      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((text) => {
        if (typeof text === 'string' && text.includes('FROM password_reset_tokens')) {
          return Promise.resolve({
            rows: [{
              id: 'token_id_1',
              user_id: userId,
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              consumed_at: null,
              status: 'active',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: validToken,
          newPassword: 'BrandNewSecurePassword123',
          confirmPassword: 'BrandNewSecurePassword123',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('successfully reset');
      querySpy.mockRestore();
    });

    it('Password Reset Verification: new password hashes securely and old password no longer matches', async () => {
      const oldPassword = 'OldInitialPassword123';
      const newPassword = 'BrandNewSecurePassword123';
      const oldHash = await bcrypt.hash(oldPassword, 10);

      expect(await bcrypt.compare(oldPassword, oldHash)).toBe(true);
      expect(await bcrypt.compare(newPassword, oldHash)).toBe(false);

      let savedNewHash = null;
      const querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((text, params) => {
        if (typeof text === 'string' && text.includes('FROM password_reset_tokens')) {
          return Promise.resolve({
            rows: [{
              id: 'token_id_hash_test',
              user_id: 'user_hash_test_123',
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              consumed_at: null,
              status: 'active',
            }],
          });
        }
        if (typeof text === 'string' && text.includes('UPDATE users SET password_hash = $1')) {
          savedNewHash = params[0];
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'valid_hash_token_1234567890abcdef',
          newPassword: newPassword,
          confirmPassword: newPassword,
        });

      expect(res.statusCode).toEqual(200);
      expect(savedNewHash).toBeDefined();
      expect(await bcrypt.compare(newPassword, savedNewHash)).toBe(true);
      expect(await bcrypt.compare(oldPassword, savedNewHash)).toBe(false);

      querySpy.mockRestore();
    });
  });

  describe('Student Resume Management Suite', () => {
    const student1Id = 'std-user-' + Date.now();
    const student2Id = 'std-user-other-' + Date.now();
    const studentToken = jwt.sign(
      { sub: student1Id, id: student1Id, email: 'student1@met.edu', role: 'student', firstName: 'Priya', lastName: 'Sharma' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    const otherStudentToken = jwt.sign(
      { sub: student2Id, id: student2Id, email: 'other@met.edu', role: 'student', firstName: 'Other', lastName: 'Student' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    let querySpy;
    beforeAll(() => {
      querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        if (typeof sql === 'string' && sql.includes('FROM users WHERE id = $1')) {
          const id = params && params[0];
          return Promise.resolve({
            rows: [{
              id: id,
              email: id === student1Id ? 'student1@met.edu' : 'other@met.edu',
              role: 'student',
              status: 'active',
              firstName: id === student1Id ? 'Priya' : 'Other',
              lastName: id === student1Id ? 'Sharma' : 'Student',
              phone: '9876543210',
              avatarUrl: null,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    afterAll(() => {
      if (querySpy) querySpy.mockRestore();
    });

    it('GET /api/v1/students/resume without token should return 401', async () => {
      const res = await request(app).get('/api/v1/students/resume');
      expect(res.statusCode).toEqual(401);
    });

    it('GET /api/v1/students/resume with valid student token and no uploaded file should return resume: null', async () => {
      const res = await request(app)
        .get('/api/v1/students/resume')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.resume).toBeNull();
    });

    it('POST /api/v1/students/resume without file should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/students/resume')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('NO_FILE_PROVIDED');
    });

    it('POST /api/v1/students/resume with invalid file format should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/students/resume')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('cvFile', Buffer.from('console.log("hello");'), 'resume.js');
      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('INVALID_FILE_TYPE');
    });

    it('POST /api/v1/students/resume with valid PDF should upload and persist document', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 sample resume content for testing purposes');
      const res = await request(app)
        .post('/api/v1/students/resume')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('cvFile', pdfBuffer, 'Priya_Candidate_CV.pdf');

      expect([200, 201]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
      expect(res.body.resume).toBeDefined();
      expect(res.body.resume.name).toEqual('Priya_Candidate_CV.pdf');
    });

    it('GET /api/v1/students/resume should retrieve the uploaded resume', async () => {
      const res = await request(app)
        .get('/api/v1/students/resume')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.resume).toBeDefined();
      expect(res.body.resume.name).toEqual('Priya_Candidate_CV.pdf');
    });

    it('GET /api/v1/students/resume/download as owner should download file', async () => {
      const res = await request(app)
        .get('/api/v1/students/resume/download')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('Priya_Candidate_CV.pdf');
    });

    it('GET /api/v1/students/resume/download as unauthorized student should return 403', async () => {
      const res = await request(app)
        .get(`/api/v1/students/resume/download?studentId=${student1Id}`)
        .set('Authorization', `Bearer ${otherStudentToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('FORBIDDEN');
    });

    it('DELETE /api/v1/students/resume should remove uploaded resume', async () => {
      const res = await request(app)
        .delete('/api/v1/students/resume')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      // Verify subsequent GET returns null
      const checkRes = await request(app)
        .get('/api/v1/students/resume')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(checkRes.statusCode).toEqual(200);
      expect(checkRes.body.resume).toBeNull();
    });
  });

  describe('Faculty & Role-Based Authentication Suite', () => {
    let querySpy;
    let faculty1PassHash;
    let faculty2PassHash;
    let studentPassHash;

    const faculty1 = {
      id: 'fac-uuid-101',
      email: 'dr.rajesh@met.edu',
      first_name: 'Dr. Rajesh',
      last_name: 'Deshmukh',
      role: 'faculty',
      status: 'active',
      avatar_url: null,
      employee_id: 'EMP101',
      employeeId: 'EMP101',
      department: 'Computer Engineering & IT',
      designation: 'Associate Professor & Mentorship Lead',
      college: 'MET Institute of Engineering, Nashik',
      role_label: 'Associate Professor & Mentorship Lead',
      cabin_number: 'Room 304, IT Block',
      office_hours: 'Mon-Fri 10:00-12:00',
    };

    const faculty2 = {
      id: 'fac-uuid-102',
      email: 'prof.anita@met.edu',
      first_name: 'Prof. Anita',
      last_name: 'Patil',
      role: 'faculty',
      status: 'active',
      avatar_url: null,
      employee_id: 'EMP202',
      employeeId: 'EMP202',
      department: 'Information Technology',
      designation: 'Assistant Professor',
      college: 'MET Institute of Engineering, Nashik',
      role_label: 'Assistant Professor',
      cabin_number: 'Room 205, Main Block',
      office_hours: 'Tue-Thu 14:00-16:00',
    };

    const facultyPending = {
      id: 'fac-uuid-103',
      email: 'new.faculty@met.edu',
      first_name: 'Prof. Sanjay',
      last_name: 'Kulkarni',
      role: 'faculty',
      status: 'pending',
      avatar_url: null,
      employee_id: 'EMP303',
      employeeId: 'EMP303',
      department: 'Electronics Engineering',
      designation: 'Assistant Professor',
      college: 'MET Institute of Engineering, Nashik',
      role_label: 'Assistant Professor',
      cabin_number: null,
      office_hours: null,
    };

    const mockStudent = {
      id: 'std-uuid-202',
      email: 'priya.sharma@met.edu',
      first_name: 'Priya',
      last_name: 'Sharma',
      role: 'student',
      status: 'active',
      avatar_url: null,
      roll_number: 'MET2022CS001',
      employee_id: null,
    };

    const adminUser = {
      id: 'admin-uuid-001',
      email: 'director@met.edu',
      role: 'admin',
      status: 'active',
      first_name: 'V. P.',
      last_name: 'Wani',
    };

    const adminToken = jwt.sign(
      { sub: adminUser.id, id: adminUser.id, email: adminUser.email, role: 'admin' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const faculty1Token = jwt.sign(
      { sub: faculty1.id, id: faculty1.id, email: faculty1.email, role: 'faculty' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const faculty2Token = jwt.sign(
      { sub: faculty2.id, id: faculty2.id, email: faculty2.email, role: 'faculty' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    beforeAll(async () => {
      faculty1PassHash = await bcrypt.hash('Rajesh@123', 10);
      faculty2PassHash = await bcrypt.hash('Anita@456', 10);
      studentPassHash = await bcrypt.hash('student123', 10);

      querySpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        const p0 = (params && params[0] !== undefined ? String(params[0]).trim().toLowerCase() : '');

        // 0. User lookup by ID for authentication middleware
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          const uid = params && params[0];
          if (uid === adminUser.id) {
            return Promise.resolve({
              rows: [{
                id: adminUser.id,
                email: adminUser.email,
                role: 'admin',
                status: 'active',
                firstName: adminUser.first_name,
                lastName: adminUser.last_name,
                phone: null,
                avatarUrl: null,
              }],
            });
          }
          if (uid === faculty1.id) {
            return Promise.resolve({
              rows: [{
                id: faculty1.id,
                email: faculty1.email,
                role: 'faculty',
                status: 'active',
                firstName: faculty1.first_name,
                lastName: faculty1.last_name,
                phone: null,
                avatarUrl: null,
              }],
            });
          }
          if (uid === faculty2.id) {
            return Promise.resolve({
              rows: [{
                id: faculty2.id,
                email: faculty2.email,
                role: 'faculty',
                status: 'active',
                firstName: faculty2.first_name,
                lastName: faculty2.last_name,
                phone: null,
                avatarUrl: null,
              }],
            });
          }
          return Promise.resolve({ rows: [] });
        }

        // 1. Query users by email
        if (sqlStr.includes('FROM users u') && sqlStr.includes('WHERE LOWER(u.email) = $1')) {
          if (p0 === 'dr.rajesh@met.edu') {
            return Promise.resolve({ rows: [{ ...faculty1, password_hash: faculty1PassHash }] });
          }
          if (p0 === 'prof.anita@met.edu') {
            return Promise.resolve({ rows: [{ ...faculty2, password_hash: faculty2PassHash }] });
          }
          if (p0 === 'new.faculty@met.edu') {
            return Promise.resolve({ rows: [{ ...facultyPending, password_hash: faculty1PassHash }] });
          }
          if (p0 === 'priya.sharma@met.edu') {
            return Promise.resolve({ rows: [{ ...mockStudent, password_hash: studentPassHash }] });
          }
          return Promise.resolve({ rows: [] });
        }

        // Email check without alias: SELECT id FROM users WHERE LOWER(email) = $1
        if (sqlStr.includes('FROM users WHERE LOWER(email) = $1')) {
          if (['dr.rajesh@met.edu', 'prof.anita@met.edu', 'new.faculty@met.edu', 'priya.sharma@met.edu', 'existing@met.edu'].includes(p0)) {
            return Promise.resolve({ rows: [{ id: 'existing-id' }] });
          }
          return Promise.resolve({ rows: [] });
        }

        // 2. Query by student roll_number
        if (sqlStr.includes('JOIN student_profiles sp') && sqlStr.includes('LOWER(sp.roll_number) = $1')) {
          if (p0 === 'met2022cs001') {
            return Promise.resolve({ rows: [{ ...mockStudent, password_hash: studentPassHash }] });
          }
          return Promise.resolve({ rows: [] });
        }

        // 3. Query by faculty employee_id
        if (sqlStr.includes('JOIN faculty_profiles fp') && sqlStr.includes('LOWER(fp.employee_id) = $1')) {
          if (p0 === 'emp101') {
            return Promise.resolve({ rows: [{ ...faculty1, password_hash: faculty1PassHash }] });
          }
          if (p0 === 'emp202') {
            return Promise.resolve({ rows: [{ ...faculty2, password_hash: faculty2PassHash }] });
          }
          if (p0 === 'emp303') {
            return Promise.resolve({ rows: [{ ...facultyPending, password_hash: faculty1PassHash }] });
          }
          return Promise.resolve({ rows: [] });
        }

        // EmployeeId uniqueness check in faculty_profiles
        if (sqlStr.includes('FROM faculty_profiles WHERE LOWER(employee_id) = LOWER($1)')) {
          if (['emp101', 'emp202', 'emp303', 'dupemp'].includes(p0)) {
            return Promise.resolve({ rows: [{ id: 'fp-dup' }] });
          }
          return Promise.resolve({ rows: [] });
        }

        // 4. Role profile lookups by user_id
        if (sqlStr.includes('FROM faculty_profiles WHERE user_id = $1')) {
          if (p0 === faculty1.id) return Promise.resolve({ rows: [faculty1] });
          if (p0 === faculty2.id) return Promise.resolve({ rows: [faculty2] });
          if (p0 === facultyPending.id) return Promise.resolve({ rows: [facultyPending] });
          return Promise.resolve({ rows: [] });
        }

        if (sqlStr.includes('FROM student_profiles WHERE user_id = $1')) {
          return Promise.resolve({
            rows: [{
              user_id: mockStudent.id,
              roll_number: 'MET2022CS001',
              college: 'MET Bhujbal Knowledge City',
              department: 'Computer Engineering',
              program: 'B.Tech',
              academic_year: '2022-2026',
              semester: 6,
              role_label: 'Student',
              cgpa: '9.2',
              backlogs: 0,
            }],
          });
        }

        // Faculty profile retrieval (GET /api/v1/faculty/profile)
        if (sqlStr.includes('JOIN faculty_profiles fp ON fp.user_id = u.id') && sqlStr.includes('WHERE u.id = $1')) {
          if (p0 === faculty1.id) return Promise.resolve({ rows: [faculty1] });
          if (p0 === faculty2.id) return Promise.resolve({ rows: [faculty2] });
          return Promise.resolve({ rows: [] });
        }

        // Faculty profile update (PUT /api/v1/faculty/profile)
        if (sqlStr.includes('UPDATE faculty_profiles') && sqlStr.includes('WHERE user_id = $3')) {
          return Promise.resolve({
            rows: [{
              cabinNumber: params[0] || 'Room 304, IT Block',
              officeHours: params[1] || 'Mon-Fri 10:00-12:00',
            }],
          });
        }

        // Admin faculty list (GET /api/v1/admin/faculty)
        if (sqlStr.includes('FROM users u') && sqlStr.includes("WHERE u.role = 'faculty'")) {
          return Promise.resolve({ rows: [faculty1, faculty2] });
        }

        // Admin faculty insert
        if (sqlStr.includes('INSERT INTO users') && sqlStr.includes("'faculty'")) {
          return Promise.resolve({
            rows: [{
              id: 'fac-new-created',
              email: params[0],
              role: 'faculty',
              status: params[2],
              first_name: params[3],
              last_name: params[4],
              phone: params[5],
            }],
          });
        }

        if (sqlStr.includes('INSERT INTO faculty_profiles')) {
          return Promise.resolve({
            rows: [{
              user_id: params[0],
              employee_id: params[1] || params[5],
              department: params[3] || 'Computer Engineering & IT',
              designation: params[4] || 'Assistant Professor',
              college: params[2] || 'MET Institute of Engineering, Nashik',
            }],
          });
        }

        // Admin faculty status update
        if (sqlStr.includes('UPDATE users') && sqlStr.includes("role = 'faculty'")) {
          return Promise.resolve({
            rows: [{
              id: params[1],
              email: 'new.faculty@met.edu',
              role: 'faculty',
              status: params[0],
              first_name: 'Prof. Sanjay',
              last_name: 'Kulkarni',
            }],
          });
        }

        // Update last_login
        if (sqlStr.includes('UPDATE users SET last_login')) {
          return Promise.resolve({ rowCount: 1 });
        }

        // Forgot password token check
        if (sqlStr.includes('SELECT id, email, status FROM users WHERE LOWER(email) = $1')) {
          if (p0 === 'dr.rajesh@met.edu') return Promise.resolve({ rows: [{ id: faculty1.id, email: faculty1.email, status: 'active' }] });
          if (p0 === 'prof.anita@met.edu') return Promise.resolve({ rows: [{ id: faculty2.id, email: faculty2.email, status: 'active' }] });
          return Promise.resolve({ rows: [] });
        }

        if (sqlStr.includes('INSERT INTO password_reset_tokens')) {
          return Promise.resolve({ rowCount: 1 });
        }

        return Promise.resolve({ rows: [] });
      });
    });

    afterAll(() => {
      if (querySpy) querySpy.mockRestore();
    });

    it('1. Faculty member A authenticates with their own institutional email and password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'dr.rajesh@met.edu',
          password: 'Rajesh@123',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toEqual('dr.rajesh@met.edu');
      expect(res.body.user.role).toEqual('faculty');
      expect(res.body.user.department).toEqual('Computer Engineering & IT');
      expect(res.body.token).toBeDefined();
    });

    it('2. Faculty member B authenticates independently with their distinct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'prof.anita@met.edu',
          password: 'Anita@456',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toEqual('prof.anita@met.edu');
      expect(res.body.user.role).toEqual('faculty');
      expect(res.body.user.department).toEqual('Information Technology');
    });

    it('3. Faculty member A authenticates via unique employee ID', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'EMP101',
          password: 'Rajesh@123',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toEqual('dr.rajesh@met.edu');
    });

    it('4. Faculty member B authenticates via unique employee ID', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'EMP202',
          password: 'Anita@456',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toEqual('prof.anita@met.edu');
    });

    it('5. Using wrong password for faculty account is strictly rejected', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'dr.rajesh@met.edu',
          password: 'WrongPassword999',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toEqual('INVALID_PASSWORD');
    });

    it('6. Unknown faculty identifier is rejected with generic safe message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'nonexistent.faculty@met.edu',
          password: 'AnyPassword123',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toEqual('INVALID_CREDENTIALS');
      expect(res.body.message).toContain('verify your faculty email or ID');
    });

    it('7. Unapproved/pending faculty account cannot access the Faculty Portal', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'new.faculty@met.edu',
          password: 'Rajesh@123',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toEqual('ACCOUNT_PENDING');
      expect(res.body.message).toContain('pending institutional verification or administrator approval');
    });

    it('8. Student account cannot authenticate as faculty', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'priya.sharma@met.edu',
          password: 'student123',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toEqual('UNAUTHORIZED_ROLE');
    });

    it('9. Faculty account cannot authenticate as administrator (privilege escalation blocked)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'dr.rajesh@met.edu',
          password: 'Rajesh@123',
          role: 'admin',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toEqual('UNAUTHORIZED_ROLE');
    });

    it('10. Administrator can provision a legitimate faculty member with individual credentials', async () => {
      const res = await request(app)
        .post('/api/v1/admin/faculty')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'dr.manish@met.edu',
          password: 'SecurePassword123',
          firstName: 'Dr. Manish',
          lastName: 'Joshi',
          employeeId: 'EMP404',
          department: 'Mechanical Engineering',
          designation: 'Professor & HOD',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.faculty.email).toEqual('dr.manish@met.edu');
      expect(res.body.faculty.role).toEqual('faculty');
      expect(res.body.faculty.status).toEqual('active');
    });

    it('11. Provisioning rejects duplicate institutional email addresses', async () => {
      const res = await request(app)
        .post('/api/v1/admin/faculty')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'dr.rajesh@met.edu',
          password: 'SecurePassword123',
          firstName: 'Another',
          lastName: 'Faculty',
          employeeId: 'EMP999',
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('EMAIL_ALREADY_EXISTS');
    });

    it('12. Provisioning rejects duplicate employee IDs', async () => {
      const res = await request(app)
        .post('/api/v1/admin/faculty')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'unique.email@met.edu',
          password: 'SecurePassword123',
          firstName: 'Another',
          lastName: 'Faculty',
          employeeId: 'EMP101',
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('EMPLOYEE_ID_ALREADY_EXISTS');
    });

    it('13. Administrator can approve a pending faculty account status', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/faculty/${facultyPending.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.faculty.status).toEqual('active');
    });

    it('14. Faculty self-registration creates a pending account requiring approval', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/faculty')
        .send({
          fullName: 'Prof. Sunil Patil',
          email: 'prof.sunil@met.edu',
          password: 'SunilPassword123',
          employeeId: 'EMP505',
          department: 'Civil Engineering',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toEqual('pending');
      expect(res.body.requiresApproval).toBe(true);
    });

    it('15. Faculty self-registration rejects non-institutional email addresses', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/faculty')
        .send({
          fullName: 'Fake User',
          email: 'fake.user@gmail.com',
          password: 'Password123',
          employeeId: 'EMP999',
          department: 'IT',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('INVALID_INSTITUTIONAL_EMAIL');
    });

    it('16. Faculty data isolation: authenticated faculty member can view their own profile only', async () => {
      const res = await request(app)
        .get('/api/v1/faculty/profile')
        .set('Authorization', `Bearer ${faculty1Token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.email).toEqual('dr.rajesh@met.edu');
      expect(res.body.profile.employeeId).toEqual('EMP101');
    });

    it('17. Faculty data isolation: authenticated faculty member can update their own office details', async () => {
      const res = await request(app)
        .put('/api/v1/faculty/profile')
        .set('Authorization', `Bearer ${faculty1Token}`)
        .send({
          cabinNumber: 'Room 305, Tech Hub',
          officeHours: 'Mon-Wed 11:00-13:00',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('18. Password recovery initiates successfully for distinct faculty email', async () => {
      emailService.isConfigured = jest.fn().mockReturnValue(true);
      emailService.sendPasswordResetEmail = jest.fn().mockResolvedValue({ messageId: 'msg-fac-1' });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'dr.rajesh@met.edu' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('19. Existing student login remains fully operational', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'MET2022CS001',
          password: 'student123',
          role: 'student',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toEqual('student');
    });
  });

  describe('Multi-Role Registration & Onboarding Suite', () => {
    let multiRoleSpy;
    let registeredCoordinator = false;
    let registeredRecruiter = false;
    let coordPassHash;
    let recPassHash;

    beforeAll(async () => {
      coordPassHash = await bcrypt.hash('Coordinator@123', 10);
      recPassHash = await bcrypt.hash('Recruiter@123', 10);

      multiRoleSpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        const p0 = (params && params[0] !== undefined ? String(params[0]).trim().toLowerCase() : '');

        // 1. Check existing emails
        if (sqlStr.includes('FROM users WHERE LOWER(email) = $1')) {
          if (registeredCoordinator && p0 === 'vikram.coordinator@met.edu') {
            return Promise.resolve({ rows: [{ id: 'coord-dup-id' }] });
          }
          if (registeredRecruiter && p0 === 'ananya@techcorp-solutions.io') {
            return Promise.resolve({ rows: [{ id: 'rec-dup-id' }] });
          }
          return Promise.resolve({ rows: [] });
        }

        // 2. Insert into users
        if (sqlStr.includes('INSERT INTO users')) {
          const role = sqlStr.includes("'coordinator'") ? 'coordinator' : (sqlStr.includes("'recruiter'") ? 'recruiter' : 'user');
          const newUser = {
            id: role === 'coordinator' ? 'usr-coord-1' : 'usr-rec-1',
            email: params[0],
            password_hash: role === 'coordinator' ? coordPassHash : recPassHash,
            role,
            status: 'pending',
            first_name: params[2],
            last_name: params[3],
            phone: params[4],
            created_at: new Date().toISOString(),
          };
          if (role === 'coordinator') registeredCoordinator = true;
          if (role === 'recruiter') registeredRecruiter = true;
          return Promise.resolve({ rows: [newUser] });
        }

        // 3. Coordinator profiles insert
        if (sqlStr.includes('INSERT INTO coordinator_profiles')) {
          return Promise.resolve({
            rows: [{
              user_id: params[0],
              department: params[1],
              club_name: params[2],
            }],
          });
        }

        // 4. Company lookup and insert
        if (sqlStr.includes('FROM companies WHERE LOWER(name) = LOWER($1)')) {
          return Promise.resolve({ rows: [] });
        }
        if (sqlStr.includes('INSERT INTO companies')) {
          return Promise.resolve({ rows: [{ id: 'comp-101' }] });
        }

        // 5. Recruiter profile insert
        if (sqlStr.includes('INSERT INTO recruiter_profiles')) {
          return Promise.resolve({
            rows: [{
              user_id: params[0],
              company_id: params[1],
              company_name: params[2],
              designation: params[3],
            }],
          });
        }

        // 6. Company users insert
        if (sqlStr.includes('INSERT INTO company_users')) {
          return Promise.resolve({ rowCount: 1 });
        }

        // 7. User settings insert
        if (sqlStr.includes('INSERT INTO user_settings')) {
          return Promise.resolve({ rowCount: 1 });
        }

        // 8. User query for login
        if (sqlStr.includes('FROM users u') && sqlStr.includes('WHERE LOWER(u.email) = $1')) {
          if (p0 === 'vikram.coordinator@met.edu') {
            return Promise.resolve({
              rows: [{
                id: 'usr-coord-1',
                email: 'vikram.coordinator@met.edu',
                password_hash: coordPassHash,
                role: 'coordinator',
                status: 'pending',
                first_name: 'Vikram',
                last_name: 'Sarabhai',
              }],
            });
          }
          if (p0 === 'ananya@techcorp-solutions.io') {
            return Promise.resolve({
              rows: [{
                id: 'usr-rec-1',
                email: 'ananya@techcorp-solutions.io',
                password_hash: recPassHash,
                role: 'recruiter',
                status: 'pending',
                first_name: 'Ananya',
                last_name: 'Birla',
              }],
            });
          }
          return Promise.resolve({ rows: [] });
        }

        // Profile lookups
        if (sqlStr.includes('FROM coordinator_profiles WHERE user_id = $1')) {
          return Promise.resolve({ rows: [{ department: 'Robotics', club_name: 'AeroClub' }] });
        }
        if (sqlStr.includes('FROM recruiter_profiles WHERE user_id = $1')) {
          return Promise.resolve({ rows: [{ company_name: 'TechCorp Solutions Inc.', designation: 'Recruiter' }] });
        }

        return Promise.resolve({ rows: [] });
      });
    });

    afterAll(() => {
      if (multiRoleSpy) multiRoleSpy.mockRestore();
    });

    it('1. Coordinator self-registration creates pending account awaiting administrator approval', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/coordinator')
        .send({
          fullName: 'Vikram Sarabhai',
          email: 'vikram.coordinator@met.edu',
          password: 'Coordinator@123',
          department: 'Robotics & Automation',
          clubName: 'AeroClub & Robotics Guild',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toEqual('pending');
      expect(res.body.requiresApproval).toBe(true);
      expect(res.body.user.role).toEqual('coordinator');
      expect(res.body.user.email).toEqual('vikram.coordinator@met.edu');
    });

    it('2. Coordinator self-registration rejects non-institutional email addresses', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/coordinator')
        .send({
          fullName: 'External Person',
          email: 'vikram@gmail.com',
          password: 'Password123',
          department: 'Cultural',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('INVALID_INSTITUTIONAL_EMAIL');
    });

    it('3. Coordinator self-registration rejects duplicate institutional email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/coordinator')
        .send({
          fullName: 'Duplicate Person',
          email: 'vikram.coordinator@met.edu',
          password: 'Password123',
          department: 'Robotics',
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('EMAIL_ALREADY_EXISTS');
    });

    it('4. Unapproved pending coordinator cannot log into the coordinator portal', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'vikram.coordinator@met.edu',
          password: 'Coordinator@123',
          role: 'coordinator',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('ACCOUNT_PENDING');
      expect(res.body.message).toContain('pending institutional verification or administrator approval');
    });

    it('5. Recruiter self-registration creates pending account and associates company', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/recruiter')
        .send({
          fullName: 'Ananya Birla',
          email: 'ananya@techcorp-solutions.io',
          password: 'Recruiter@123',
          companyName: 'TechCorp Solutions Inc.',
          designation: 'Lead University Talent Partner',
          website: 'https://techcorp-solutions.io',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toEqual('pending');
      expect(res.body.requiresApproval).toBe(true);
      expect(res.body.user.role).toEqual('recruiter');
      expect(res.body.user.companyName).toEqual('TechCorp Solutions Inc.');
    });

    it('6. Recruiter registration validates required company name and job title', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/recruiter')
        .send({
          fullName: 'Ananya Birla',
          email: 'invalid.recruiter@company.com',
          password: 'Password123',
          // missing companyName and designation
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('VALIDATION_FAILED');
    });

    it('7. Recruiter self-registration rejects duplicate email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/recruiter')
        .send({
          fullName: 'Ananya Duplicate',
          email: 'ananya@techcorp-solutions.io',
          password: 'Password123',
          companyName: 'TechCorp Solutions Inc.',
          designation: 'Recruiter',
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('EMAIL_ALREADY_EXISTS');
    });

    it('8. Unapproved pending recruiter cannot log in', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'ananya@techcorp-solutions.io',
          password: 'Recruiter@123',
          role: 'recruiter',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('ACCOUNT_PENDING');
    });

    it('9. College Admin cannot be self-registered by arbitrary visitors (403)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/admin')
        .send({
          email: 'attacker@evil.com',
          password: 'Password123',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('PRIVILEGED_ROLE_NOT_SELF_REGISTRABLE');
    });

    it('10. Placement Officer (TPO) cannot be self-registered by arbitrary visitors (403)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/tpo')
        .send({
          email: 'fake.tpo@domain.com',
          password: 'Password123',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('PRIVILEGED_ROLE_NOT_SELF_REGISTRABLE');
    });
  });

  describe('Events, Freshers & Attendance Management Suite', () => {
    let eventsSpy;

    const studentCS = {
      id: 'std-cs-101',
      email: 'aarav.cs@met.edu',
      role: 'student',
      status: 'active',
      first_name: 'Aarav',
      last_name: 'Mehta',
      roll_number: 'MET2022CS055',
      department: 'Computer Engineering',
    };

    const studentMgmt = {
      id: 'std-mgmt-202',
      email: 'rohan.mgmt@met.edu',
      role: 'student',
      status: 'active',
      first_name: 'Rohan',
      last_name: 'Verma',
      roll_number: 'MET2022MG012',
      department: 'Management',
    };

    const coordinatorUser = {
      id: 'coord-user-303',
      email: 'priya.coord@met.edu',
      role: 'coordinator',
      status: 'active',
      first_name: 'Priya',
      last_name: 'Deshmukh',
      department: 'Computer Engineering',
    };

    const studentCSToken = jwt.sign(
      { sub: studentCS.id, id: studentCS.id, email: studentCS.email, role: 'student' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const studentMgmtToken = jwt.sign(
      { sub: studentMgmt.id, id: studentMgmt.id, email: studentMgmt.email, role: 'student' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const coordinatorToken = jwt.sign(
      { sub: coordinatorUser.id, id: coordinatorUser.id, email: coordinatorUser.email, role: 'coordinator' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    const sampleEvents = [
      {
        id: 'evt-techfest-2026',
        title: 'MET TechFest 2026',
        category: 'technical',
        venue: 'BKC Central Auditorium',
        capacity: 850,
        registered_count: 10,
        is_freshers: false,
        department_name: null,
        registration_close: null,
      },
      {
        id: 'evt-freshers-comp-2025',
        title: 'Init 2025: Engineering Induction',
        category: 'cultural',
        venue: 'IOE Main Auditorium',
        capacity: 400,
        registered_count: 5,
        is_freshers: true,
        department_name: 'Computer Engineering',
        registration_close: null,
      },
      {
        id: 'evt-freshers-mgmt-2025',
        title: 'Prarambh 2025: Management Social',
        category: 'cultural',
        venue: 'MET Banquet Hall',
        capacity: 250,
        registered_count: 2,
        is_freshers: true,
        department_name: 'Management',
        registration_close: null,
      },
      {
        id: 'evt-closed-2026',
        title: 'Closed Hack Workshop',
        category: 'technical',
        venue: 'Lab 4',
        capacity: 100,
        registered_count: 10,
        is_freshers: false,
        department_name: null,
        registration_close: '2020-01-01T00:00:00Z',
      },
      {
        id: 'evt-full-2026',
        title: 'Full Capacity Conclave',
        category: 'technical',
        venue: 'Seminar Hall',
        capacity: 1,
        registered_count: 1,
        is_freshers: false,
        department_name: null,
        registration_close: null,
      },
    ];

    const registeredMap = new Map();
    const attendanceMap = new Map();

    beforeAll(() => {
      eventsSpy = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');

        // 1. Auth middleware user lookup
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          const uid = params && params[0];
          if (uid === studentCS.id) {
            return Promise.resolve({
              rows: [{
                id: studentCS.id,
                email: studentCS.email,
                role: 'student',
                status: 'active',
                firstName: studentCS.first_name,
                lastName: studentCS.last_name,
              }],
            });
          }
          if (uid === studentMgmt.id) {
            return Promise.resolve({
              rows: [{
                id: studentMgmt.id,
                email: studentMgmt.email,
                role: 'student',
                status: 'active',
                firstName: studentMgmt.first_name,
                lastName: studentMgmt.last_name,
              }],
            });
          }
          if (uid === coordinatorUser.id) {
            return Promise.resolve({
              rows: [{
                id: coordinatorUser.id,
                email: coordinatorUser.email,
                role: 'coordinator',
                status: 'active',
                firstName: coordinatorUser.first_name,
                lastName: coordinatorUser.last_name,
              }],
            });
          }
          return Promise.resolve({ rows: [] });
        }

        // 2. Student profile lookup
        if (sqlStr.includes('student_profiles')) {
          const uid = params && params[0];
          if (uid === studentCS.id) {
            return Promise.resolve({
              rows: [{
                roll_number: studentCS.roll_number,
                department: studentCS.department,
                college: 'MET Institute of Engineering',
                first_name: studentCS.first_name,
                last_name: studentCS.last_name,
                email: studentCS.email,
                phone: '+91 9988776655',
              }],
            });
          }
          if (uid === studentMgmt.id) {
            return Promise.resolve({
              rows: [{
                roll_number: studentMgmt.roll_number,
                department: studentMgmt.department,
                college: 'MET Institute of Management',
                first_name: studentMgmt.first_name,
                last_name: studentMgmt.last_name,
                email: studentMgmt.email,
                phone: '+91 9888877777',
              }],
            });
          }
          return Promise.resolve({ rows: [] });
        }

        // 3. Coordinator profile lookup
        if (sqlStr.includes('FROM coordinator_profiles WHERE user_id = $1')) {
          return Promise.resolve({
            rows: [{
              department: coordinatorUser.department,
              club_name: 'Tech Committee',
            }],
          });
        }

        // 4. Events listing & detail queries
        if (sqlStr.includes('SELECT * FROM events WHERE id::text = $1')) {
          const evId = params && params[0];
          const found = sampleEvents.find(e => e.id === evId);
          return Promise.resolve({ rows: found ? [found] : [] });
        }

        if (sqlStr.includes('SELECT * FROM events') || sqlStr.includes('FROM events e')) {
          return Promise.resolve({ rows: sampleEvents });
        }

        // 5. Capacity check
        if (sqlStr.includes('SELECT COUNT(*) AS total FROM event_registrations')) {
          const evId = params && params[0];
          if (evId === 'evt-full-2026') {
            return Promise.resolve({ rows: [{ total: '1' }] });
          }
          const regCount = registeredMap.has(evId) ? '1' : '0';
          return Promise.resolve({ rows: [{ total: regCount }] });
        }

        // 6. Duplicate registration check
        if (sqlStr.includes('FROM event_registrations WHERE event_id = $1 AND user_id = $2')) {
          const evId = params && params[0];
          const uId = params && params[1];
          const key = `${evId}:${uId}`;
          if (registeredMap.has(key)) {
            return Promise.resolve({ rows: [registeredMap.get(key)] });
          }
          return Promise.resolve({ rows: [] });
        }

        // 7. Insert event registration
        if (sqlStr.includes('INSERT INTO event_registrations')) {
          const evId = params && params[0];
          const uId = params && params[1];
          const key = `${evId}:${uId}`;
          const regRecord = {
            id: `reg-test-${Date.now()}`,
            event_id: evId,
            user_id: uId,
            status: 'registered',
            pass_code: params && params[5],
            registered_at: new Date().toISOString(),
          };
          registeredMap.set(key, regRecord);
          return Promise.resolve({ rows: [regRecord] });
        }

        // 8. Event attendance check
        if (sqlStr.includes('event_attendance') && sqlStr.includes('user_id = $2')) {
          const evId = params && params[0];
          const uId = params && params[1];
          const key = `${evId}:${uId}`;
          if (attendanceMap.has(key)) {
            const att = attendanceMap.get(key);
            return Promise.resolve({
              rows: [{
                ...att,
                eventTitle: 'MET TechFest 2026',
                venue: 'BKC Central Auditorium',
                first_name: 'Aarav',
                last_name: 'Mehta',
              }],
            });
          }
          return Promise.resolve({ rows: [] });
        }

        // 9. Insert event attendance
        if (sqlStr.includes('INSERT INTO event_attendance')) {
          const evId = params && params[0];
          const uId = params && params[1];
          const key = `${evId}:${uId}`;
          const attRecord = {
            id: `att-test-${Date.now()}`,
            event_id: evId,
            user_id: uId,
            roll_number: params && params[2],
            department: params && params[3],
            status: 'verified',
            pass_code: params && params[5],
            verified_at: new Date().toISOString(),
          };
          attendanceMap.set(key, attRecord);
          return Promise.resolve({ rows: [attRecord] });
        }

        // 10. Event photos queries
        if (sqlStr.includes('FROM event_photos')) {
          return Promise.resolve({
            rows: [{
              id: 'photo-1',
              file_url: '/uploads/event_photos/sample.jpg',
              caption: 'Opening Keynote 2026',
              created_at: new Date().toISOString(),
            }],
          });
        }

        // 11. Coordinator event insert
        if (sqlStr.includes('INSERT INTO events')) {
          return Promise.resolve({
            rows: [{
              id: 'evt-newly-created',
              title: params[0],
              description: params[1],
              category: params[2],
              venue: params[5],
              capacity: params[6],
              is_published: true,
            }],
          });
        }

        // 12. Student unified event dashboard
        if (sqlStr.includes('FROM event_registrations er JOIN events e')) {
          return Promise.resolve({ rows: [] });
        }

        return Promise.resolve({ rows: [] });
      });
    });

    afterAll(() => {
      if (eventsSpy) eventsSpy.mockRestore();
    });

    // -------------------------------------------------------------
    // PART 1 — EVENT REGISTRATION
    // -------------------------------------------------------------
    it('1. POST /api/v1/events/:id/register without authentication should return 401', async () => {
      const res = await request(app).post('/api/v1/events/evt-techfest-2026/register');
      expect(res.statusCode).toEqual(401);
      expect(res.body.code).toEqual('AUTH_REQUIRED');
    });

    it('2. POST /api/v1/events/:id/register by authenticated student should register and issue verified pass token', async () => {
      const res = await request(app)
        .post('/api/v1/events/evt-techfest-2026/register')
        .set('Authorization', `Bearer ${studentCSToken}`)
        .send({ rulesAgreed: true });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.registration).toBeDefined();
      expect(res.body.registration.passCode).toMatch(/^MET-PASS-/);
      expect(res.body.registration.passToken).toMatch(/^MET-PASS-/);
    });

    it('3. POST /api/v1/events/:id/register duplicate attempt should be rejected with 409', async () => {
      const res = await request(app)
        .post('/api/v1/events/evt-techfest-2026/register')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('DUPLICATE_REGISTRATION');
    });

    it('4. POST /api/v1/events/:id/register after registration closed should return 400 REGISTRATION_CLOSED', async () => {
      const res = await request(app)
        .post('/api/v1/events/evt-closed-2026/register')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('REGISTRATION_CLOSED');
    });

    it('5. POST /api/v1/events/:id/register when event capacity reached should return 409 EVENT_FULL', async () => {
      const res = await request(app)
        .post('/api/v1/events/evt-full-2026/register')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('EVENT_FULL');
    });

    // -------------------------------------------------------------
    // PART 2 — DEPARTMENT-SPECIFIC FRESHERS
    // -------------------------------------------------------------
    it('6. GET /api/v1/events/freshers without auth should return unverified department state', async () => {
      const res = await request(app).get('/api/v1/events/freshers');
      expect([200, 401]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.hasVerifiedDepartment).toBe(false);
      }
    });

    it('7. Cross-department Freshers registration must be strictly rejected with 403 DEPARTMENT_MISMATCH', async () => {
      // Management student attempts to register for Computer Engineering Freshers
      const res = await request(app)
        .post('/api/v1/events/evt-freshers-comp-2025/register')
        .set('Authorization', `Bearer ${studentMgmtToken}`)
        .send({ rulesAgreed: true });

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('DEPARTMENT_MISMATCH');
    });

    it('8. Department Freshers registration succeeds for verified matching student', async () => {
      // Computer Engineering student registers for Computer Engineering Freshers
      const res = await request(app)
        .post('/api/v1/events/evt-freshers-comp-2025/register')
        .set('Authorization', `Bearer ${studentCSToken}`)
        .send({ rulesAgreed: true });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.registration.passCode).toMatch(/^MET-PASS-/);
    });

    // -------------------------------------------------------------
    // PART 3 & 4 — FRESHERS ATTENDANCE VERIFICATION & REMOVING DEMO DATA
    // -------------------------------------------------------------
    it('9. POST /api/v1/events/verify-attendance without auth should return 401', async () => {
      const res = await request(app)
        .post('/api/v1/events/verify-attendance')
        .send({ eventId: 'evt-freshers-comp-2025', rollNumber: 'MET2022CS055' });

      expect(res.statusCode).toEqual(401);
    });

    it('10. POST /api/v1/events/verify-attendance with mismatched roll number should be rejected with 400 ROLL_MISMATCH', async () => {
      const res = await request(app)
        .post('/api/v1/events/verify-attendance')
        .set('Authorization', `Bearer ${studentCSToken}`)
        .send({
          eventId: 'evt-freshers-comp-2025',
          rollNumber: 'MET2022CS999', // Mismatched roll number attempt
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.code).toEqual('ROLL_MISMATCH');
    });

    it('11. POST /api/v1/events/verify-attendance with matching roll number marks real attendance', async () => {
      const res = await request(app)
        .post('/api/v1/events/verify-attendance')
        .set('Authorization', `Bearer ${studentCSToken}`)
        .send({
          eventId: 'evt-freshers-comp-2025',
          rollNumber: 'MET2022CS055', // Correct authenticated roll number
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isVerified).toBe(true);
      expect(res.body.passCode).toMatch(/^MET-ATT-/);
    });

    it('12. Subsequent attendance verification for same event returns 409 ALREADY_VERIFIED', async () => {
      const res = await request(app)
        .post('/api/v1/events/verify-attendance')
        .set('Authorization', `Bearer ${studentCSToken}`)
        .send({
          eventId: 'evt-freshers-comp-2025',
          rollNumber: 'MET2022CS055',
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('ALREADY_VERIFIED');
    });

    // -------------------------------------------------------------
    // PART 5 & 6 — ATTENDANCE PASS GENERATION
    // -------------------------------------------------------------
    it('13. GET /api/v1/events/:id/pass returns verified attendance pass data', async () => {
      const res = await request(app)
        .get('/api/v1/events/evt-freshers-comp-2025/pass')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pass).toBeDefined();
      expect(res.body.pass.rollNumber).toEqual('MET2022CS055');
      expect(res.body.pass.isVerified).toBe(true);
    });

    it('14. GET /api/v1/events/:id/pass for unverified event returns 404 ATTENDANCE_NOT_FOUND', async () => {
      const res = await request(app)
        .get('/api/v1/events/evt-techfest-2026/pass')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.code).toEqual('ATTENDANCE_NOT_FOUND');
    });

    // -------------------------------------------------------------
    // PART 7 — COORDINATOR ROLE-BASED ACCESS & EVENT MANAGEMENT
    // -------------------------------------------------------------
    it('15. Student cannot create events via coordinator route (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post('/api/v1/coordinator/events')
        .set('Authorization', `Bearer ${studentCSToken}`)
        .send({ title: 'Unauthorized Student Event', category: 'cultural' });

      expect(res.statusCode).toEqual(403);
    });

    it('16. Authorized coordinator can create event with valid payload', async () => {
      const res = await request(app)
        .post('/api/v1/coordinator/events')
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          title: 'MET HackFest 2026',
          category: 'technical',
          venue: 'Computing Hub',
          capacity: 250,
          dateStart: '2026-11-01T09:00:00+05:30',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event).toBeDefined();
    });

    it('17. Student cannot access coordinator attendance audit records (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/v1/events/evt-techfest-2026/attendance')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it('18. Coordinator can retrieve real attendance records (never returns demo fabricated data)', async () => {
      const res = await request(app)
        .get('/api/v1/events/evt-techfest-2026/attendance')
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.attendance)).toBe(true);
    });

    // -------------------------------------------------------------
    // PART 8 — PHOTO GALLERY & PERMISSIONS
    // -------------------------------------------------------------
    it('19. GET /api/v1/events/:id/photos returns published gallery photos', async () => {
      const res = await request(app).get('/api/v1/events/evt-techfest-2026/photos');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.photos)).toBe(true);
    });

    it('20. Student cannot upload event photos (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post('/api/v1/events/evt-techfest-2026/photos')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it('21. Student cannot delete event photos (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .delete('/api/v1/events/photos/photo-1')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(403);
    });

    // -------------------------------------------------------------
    // PART 9 — STUDENT DASHBOARD INTEGRATION
    // -------------------------------------------------------------
    it('22. GET /api/v1/students/events returns student registered events, freshers status, and recorded attendance', async () => {
      const res = await request(app)
        .get('/api/v1/students/events')
        .set('Authorization', `Bearer ${studentCSToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.studentDepartment).toEqual('Computer Engineering');
      expect(Array.isArray(res.body.registeredEvents)).toBe(true);
      expect(Array.isArray(res.body.recordedAttendance)).toBe(true);
    });
  });
});



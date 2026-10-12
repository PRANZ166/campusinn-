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
});

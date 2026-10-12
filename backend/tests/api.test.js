/**
 * Campus Inn+ — Automated Unit & Integration Tests
 */
const request = require('supertest');
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
  });
});

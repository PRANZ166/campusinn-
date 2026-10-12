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

  it('GET /api/v1/auth/google/callback with user cancellation should redirect with error', async () => {
    const res = await request(app).get('/api/v1/auth/google/callback?error=access_denied');
    expect(res.statusCode).toEqual(302);
    expect(res.headers.location).toContain('/login.html?error=');
    expect(res.headers.location).toContain('cancelled');
  });

  it('GET /api/v1/auth/google/callback with missing or mismatched state should reject with error', async () => {
    const res = await request(app).get('/api/v1/auth/google/callback?code=fake_code&state=bad_state');
    expect(res.statusCode).toEqual(302);
    expect(res.headers.location).toContain('/login.html?error=');
    expect(res.headers.location).toContain('state');
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
});

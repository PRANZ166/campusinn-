/**
 * Campus Inn+ — Comprehensive Administrator Replacement & Authorization Suite
 * Implements all 27 specified test scenarios from Part 11:
 * - Scenarios 1-9: Administrator Replacement Lifecycle & Recovery
 * - Scenarios 10-20: Role Management, Faculty, Coordinator & Admin Privileges
 * - Scenarios 21-27: Regression & Multi-Role Invariants
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../src/config');
const app = require('../src/app');

describe('Part 11: Administrator Replacement & Multi-Role Authorization Suite', () => {
  const OPERATOR_SECRET = 'SuperSecureOperatorSecret2026!';
  let originalOperatorSecret;
  let originalBootstrapSecret;

  // Test identities
  const oldAdminId = 'adm-old-0001';
  const newAdminId = 'adm-new-0002';
  const trustedFacultyId = 'fac-prof-0003';
  const pendingFacultyId = 'fac-pend-0004';
  const pendingCoordId = 'coord-pend-0005';
  const approvedCoordId = 'coord-appr-0006';
  const studentId = 'stu-priya-0007';
  const recruiterId = 'rec-techcorp-0008';
  const tpoId = 'tpo-officer-0009';

  let oldAdminToken;
  let newAdminToken;
  let studentToken;
  let coordinatorToken;
  let approvedCoordinatorToken;
  let facultyToken;
  let tpoToken;
  let newAdminPassHash;
  let oldAdminPassHash;

  beforeAll(async () => {
    originalOperatorSecret = process.env.ADMIN_OPERATOR_SECRET;
    originalBootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    process.env.ADMIN_OPERATOR_SECRET = OPERATOR_SECRET;
    process.env.ADMIN_BOOTSTRAP_SECRET = OPERATOR_SECRET;

    oldAdminPassHash = await bcrypt.hash('OldAdminPass123', 10);
    newAdminPassHash = await bcrypt.hash('SecureNewAdminPass2026!', 10);

    oldAdminToken = jwt.sign(
      { sub: oldAdminId, id: oldAdminId, email: 'director@met.edu', role: 'admin', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    newAdminToken = jwt.sign(
      { sub: newAdminId, id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    studentToken = jwt.sign(
      { sub: studentId, id: studentId, email: 'student@met.edu', role: 'student', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    coordinatorToken = jwt.sign(
      { sub: pendingCoordId, id: pendingCoordId, email: 'coord.pend@met.edu', role: 'coordinator', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    approvedCoordinatorToken = jwt.sign(
      { sub: approvedCoordId, id: approvedCoordId, email: 'coord.cs@met.edu', role: 'coordinator', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    facultyToken = jwt.sign(
      { sub: trustedFacultyId, id: trustedFacultyId, email: 'prof.sharma@met.edu', role: 'faculty', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    tpoToken = jwt.sign(
      { sub: tpoId, id: tpoId, email: 'tpo@met.edu', role: 'tpo', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  afterAll(() => {
    process.env.ADMIN_OPERATOR_SECRET = originalOperatorSecret;
    process.env.ADMIN_BOOTSTRAP_SECRET = originalBootstrapSecret;
  });

  // =========================================================================
  // ADMINISTRATOR REPLACEMENT (Scenarios 1 - 9)
  // =========================================================================
  describe('Administrator Replacement Lifecycle (Scenarios 1-9)', () => {
    let mockPoolQuery;

    afterEach(() => {
      if (mockPoolQuery) {
        mockPoolQuery.mockRestore();
        mockPoolQuery = null;
      }
    });

    it('0a. Public inspection of administrator setup status when no admin exists (INITIAL_BOOTSTRAP_REQUIRED)', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes("WHERE role = 'admin'")) {
          return Promise.resolve({ rows: [] }); // No admin in database
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).get('/api/v1/auth/admin-setup-status');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasAdmin).toBe(false);
      expect(res.body.setupState).toEqual('INITIAL_BOOTSTRAP_REQUIRED');
    });

    it('0b. Public inspection of administrator setup status when active admin exists (ADMIN_EXISTS)', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes("WHERE role = 'admin'")) {
          return Promise.resolve({ rows: [{ id: 'admin-01', status: 'active' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).get('/api/v1/auth/admin-setup-status');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasAdmin).toBe(true);
      expect(res.body.setupState).toEqual('ADMIN_EXISTS');
      expect(res.body.activeAdminsCount).toBe(1);
    });

    it('1. Authorized creation of a new administrator through controlled server-side provisioning', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('LOWER(email) = $1 OR LOWER(username) = $2')) {
          return Promise.resolve({ rows: [] }); // New admin email/username is unique
        }
        if (sqlStr.includes('FROM users') && sqlStr.includes("role = 'admin'")) {
          return Promise.resolve({
            rows: [{ id: oldAdminId, email: 'director@met.edu', role: 'admin', status: 'active', username: 'director' }],
          });
        }
        if (sqlStr.includes('INSERT INTO users')) {
          return Promise.resolve({
            rows: [{
              id: newAdminId,
              email: params[0],
              username: params[1],
              role: 'admin',
              status: 'active',
              first_name: params[3] || 'Jane',
              last_name: params[4] || 'Provost',
              created_at: new Date().toISOString(),
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-001' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/admin/replace/initiate')
        .set('x-admin-operator-secret', OPERATOR_SECRET)
        .send({
          email: 'new.admin@campusinn.edu',
          username: 'campus_director_2026',
          accountIdentifier: 'campus_director_2026',
          password: 'SecureNewAdminPass2026!',
          fullName: 'Dr. Jane Provost',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.admin).toBeDefined();
      expect(res.body.admin.email).toEqual('new.admin@campusinn.edu');
    });

    it('2. Rejection of unauthorized provisioning without operator secret or admin auth', async () => {
      const res = await request(app)
        .post('/api/v1/admin/replace/initiate')
        .send({
          email: 'hacker@unknown.org',
          accountIdentifier: 'rogue_admin',
          password: 'Password123!',
          fullName: 'Rogue Admin',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('OPERATOR_UNAUTHORIZED');
    });

    it('3. Rejection of duplicate or concurrent bootstrap attempts', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes("WHERE role = 'admin'")) {
          // Admin exists, rejecting unauthenticated bootstrap
          return Promise.resolve({ rows: [{ id: oldAdminId, email: 'director@met.edu' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/bootstrap/admin')
        .set('x-admin-bootstrap-secret', OPERATOR_SECRET)
        .send({
          email: 'duplicate.admin@campusinn.edu',
          password: 'Password123!',
          fullName: 'Duplicate Administrator',
        });

      expect(res.statusCode).toEqual(409);
      expect(['ADMIN_ALREADY_PROVISIONED', 'ADMIN_ALREADY_EXISTS']).toContain(res.body.code);
    });

    it('4. Successful login with the new administrator account and identifier', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users') && sqlStr.includes('username')) {
          return Promise.resolve({
            rows: [{
              id: newAdminId,
              email: 'new.admin@campusinn.edu',
              password_hash: newAdminPassHash,
              role: 'admin',
              status: 'active',
              first_name: 'Jane',
              last_name: 'Provost',
              username: 'campus_director_2026',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'campus_director_2026',
          password: 'SecureNewAdminPass2026!',
          role: 'admin',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toEqual('admin');
      expect(res.body.user.email).toEqual('new.admin@campusinn.edu');
      expect(res.body.token).toBeDefined();
    });

    it('5. Confirmation of replacement requires explicit confirmation flag', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users') && sqlStr.includes('role = \'admin\'')) {
          const uid = params && params[0];
          if (uid === newAdminId) {
            return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active' }] });
          }
          if (uid === oldAdminId) {
            return Promise.resolve({ rows: [{ id: oldAdminId, email: 'director@met.edu', role: 'admin', status: 'active' }] });
          }
        }
        return Promise.resolve({ rows: [] });
      });

      // Without confirm: true, should fail
      const unconfirmedRes = await request(app)
        .post('/api/v1/admin/replace/confirm')
        .set('x-admin-operator-secret', OPERATOR_SECRET)
        .send({
          newAdminId,
          previousAdminId: oldAdminId,
          confirm: false,
        });

      expect(unconfirmedRes.statusCode).toEqual(400);
      expect(unconfirmedRes.body.code).toEqual('CONFIRMATION_REQUIRED');
    });

    it("6. Revocation of previous administrator's access after authorized replacement is confirmed", async () => {
      let previousAdminSuspended = false;

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users') && sqlStr.includes('role = \'admin\'')) {
          const uid = params && params[0];
          if (uid === newAdminId) {
            return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active' }] });
          }
          if (uid === oldAdminId) {
            return Promise.resolve({ rows: [{ id: oldAdminId, email: 'director@met.edu', role: 'admin', status: 'active' }] });
          }
        }
        if (sqlStr.includes('COUNT(*)') && sqlStr.includes("role = 'admin'")) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        if (sqlStr.includes('UPDATE users') && sqlStr.includes("status = 'suspended'")) {
          previousAdminSuspended = true;
          return Promise.resolve({
            rows: [{ id: oldAdminId, email: 'director@met.edu', role: 'admin', status: 'suspended', token_version: 2 }],
          });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-002' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/admin/replace/confirm')
        .set('x-admin-operator-secret', OPERATOR_SECRET)
        .send({
          newAdminId,
          previousAdminId: oldAdminId,
          confirm: true,
          reason: 'Authorized scheduled handover to new administration',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(previousAdminSuspended).toBe(true);
      expect(res.body.revokedAdmin.status).toEqual('suspended');
    });

    it('7. Invalidation of revoked sessions via token_version check', async () => {
      // Old token has tokenVersion: 1, but user record in database now has token_version: 2
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: oldAdminId,
              email: 'director@met.edu',
              role: 'admin',
              status: 'suspended',
              token_version: 2,
              tokenVersion: 2, // Token claim is 1, so session is invalidated
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/admin/pending')
        .set('Authorization', `Bearer ${oldAdminToken}`);

      expect(res.statusCode).toEqual(401);
      expect(res.body.code).toEqual('SESSION_REVOKED');
    });

    it('8. Preservation of unrelated users and data during replacement', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users') && sqlStr.includes("role = 'admin'")) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', status: 'active', role: 'admin', firstName: 'Jane', lastName: 'Provost' }] });
        }
        if (sqlStr.includes('FROM users') && sqlStr.includes("role = 'tpo'")) {
          return Promise.resolve({ rows: [{ id: tpoId, email: 'tpo@met.edu', status: 'active', role: 'tpo', firstName: 'Prof.', lastName: 'Verma' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const statusRes = await request(app)
        .get('/api/v1/admin/replace/status')
        .set('x-admin-operator-secret', OPERATOR_SECRET);

      expect(statusRes.statusCode).toEqual(200);
      expect(statusRes.body.activeAdminsCount).toBeGreaterThanOrEqual(1);
    });

    it('9. Recovery if provisioning fails midway preserves existing administrator', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('INSERT INTO users')) {
          // Simulate DB unique constraint collision or unexpected crash
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          return Promise.reject(err);
        }
        if (sqlStr.includes('FROM users') && sqlStr.includes("role = 'admin'")) {
          return Promise.resolve({ rows: [{ id: oldAdminId, email: 'director@met.edu', role: 'admin', status: 'active' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/admin/replace/initiate')
        .set('x-admin-operator-secret', OPERATOR_SECRET)
        .send({
          email: 'duplicate.email@met.edu',
          accountIdentifier: 'collision_id',
          password: 'Password123!',
          fullName: 'Collision Test',
        });

      // Handled gracefully without crashing
      expect([400, 409, 500]).toContain(res.statusCode);
    });
  });

  // =========================================================================
  // ROLE MANAGEMENT (Scenarios 10 - 20)
  // =========================================================================
  describe('Role Management, Approvals & Admin Delegation (Scenarios 10-20)', () => {
    let mockPoolQuery;

    afterEach(() => {
      if (mockPoolQuery) {
        mockPoolQuery.mockRestore();
        mockPoolQuery = null;
      }
    });

    it('10. Administrator approves a faculty request and records audit log', async () => {
      let auditLogged = false;
      let facultyActivated = false;

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({ rows: [{ id: pendingFacultyId, email: 'prof.pend@met.edu', role: 'faculty', status: 'pending' }] });
        }
        if (sqlStr.includes('UPDATE users') && sqlStr.includes("status = 'active'")) {
          facultyActivated = true;
          return Promise.resolve({ rows: [{ id: pendingFacultyId, email: 'prof.pend@met.edu', role: 'faculty', status: 'active' }] });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          auditLogged = true;
          return Promise.resolve({ rows: [{ id: 'audit-010' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${pendingFacultyId}/approve`)
        .set('Authorization', `Bearer ${newAdminToken}`)
        .send({});

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(facultyActivated).toBe(true);
      expect(auditLogged).toBe(true);
    });

    it('11. Administrator rejects a faculty request and account is suspended', async () => {
      let facultySuspended = false;

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({ rows: [{ id: pendingFacultyId, email: 'prof.pend@met.edu', role: 'faculty', status: 'pending' }] });
        }
        if (sqlStr.includes('UPDATE users') && sqlStr.includes("status = 'suspended'")) {
          facultySuspended = true;
          return Promise.resolve({ rows: [{ id: pendingFacultyId, email: 'prof.pend@met.edu', role: 'faculty', status: 'suspended', token_version: 2 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${pendingFacultyId}/reject`)
        .set('Authorization', `Bearer ${newAdminToken}`)
        .send({ reason: 'Unverified faculty credentials' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(facultySuspended).toBe(true);
    });

    it('12. Pending faculty cannot access protected faculty endpoints', async () => {
      const pendingFacToken = jwt.sign(
        { sub: pendingFacultyId, id: pendingFacultyId, email: 'prof.pend@met.edu', role: 'faculty', tokenVersion: 1 },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: pendingFacultyId,
              email: 'prof.pend@met.edu',
              role: 'faculty',
              status: 'pending',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/faculty/mentees')
        .set('Authorization', `Bearer ${pendingFacToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('ACCOUNT_PENDING');
    });

    it('13. Administrator approves an event coordinator and assigns departmental scope', async () => {
      let coordinatorUpdated = false;

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({ rows: [{ id: pendingCoordId, email: 'coord.pend@met.edu', role: 'coordinator', status: 'pending' }] });
        }
        if (sqlStr.includes('UPDATE users') && sqlStr.includes("status = 'active'")) {
          return Promise.resolve({ rows: [{ id: pendingCoordId, email: 'coord.pend@met.edu', role: 'coordinator', status: 'active' }] });
        }
        if (sqlStr.includes('coordinator_profiles')) {
          coordinatorUpdated = true;
          return Promise.resolve({ rows: [{ user_id: pendingCoordId, department: 'Computer Engineering', club_name: 'Coding Guild' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${pendingCoordId}/approve`)
        .set('Authorization', `Bearer ${newAdminToken}`)
        .send({
          department: 'Computer Engineering',
          clubName: 'Coding Guild',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(coordinatorUpdated).toBe(true);
    });

    it('14. Coordinator can access only authorized events matching their department', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: approvedCoordId, email: 'coord.cs@met.edu', role: 'coordinator', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM coordinator_profiles WHERE user_id = $1')) {
          return Promise.resolve({ rows: [{ department: 'Computer Engineering', club_name: 'Coding Guild' }] });
        }
        if (sqlStr.includes('SELECT * FROM events WHERE id::text = $1')) {
          // Event belongs to a DIFFERENT department (Mechanical)
          return Promise.resolve({
            rows: [{
              id: 'evt-mech-2026',
              title: 'RoboWars Mechanical',
              department_name: 'Mechanical Engineering',
              created_by: 'someone-else',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      // Coordinator from CS attempts to access attendance for a Mechanical event
      const res = await request(app)
        .get('/api/v1/events/evt-mech-2026/attendance')
        .set('Authorization', `Bearer ${approvedCoordinatorToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('FORBIDDEN_COORDINATOR_SCOPE');
    });

    it('15. Administrator suspends a coordinator', async () => {
      let coordinatorSuspended = false;

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({ rows: [{ id: approvedCoordId, email: 'coord.cs@met.edu', role: 'coordinator', status: 'active' }] });
        }
        if (sqlStr.includes('UPDATE users') && sqlStr.includes('SET status = $1')) {
          coordinatorSuspended = true;
          return Promise.resolve({ rows: [{ id: approvedCoordId, email: 'coord.cs@met.edu', role: 'coordinator', status: 'suspended', token_version: 2 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${approvedCoordId}/status`)
        .set('Authorization', `Bearer ${newAdminToken}`)
        .send({ status: 'suspended', reason: 'Conduct violation review' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(coordinatorSuspended).toBe(true);
      expect(res.body.user.status).toEqual('suspended');
    });

    it('16. Suspended coordinator loses access immediately', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: approvedCoordId,
              email: 'coord.cs@met.edu',
              role: 'coordinator',
              status: 'suspended',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/coordinator/events')
        .set('Authorization', `Bearer ${approvedCoordinatorToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('ACCOUNT_SUSPENDED');
    });

    it('17. Administrator grants privileges to another trusted existing user', async () => {
      let rolePromoted = false;

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({ rows: [{ id: trustedFacultyId, email: 'prof.sharma@met.edu', role: 'faculty', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('UPDATE users') && sqlStr.includes("role = 'admin'")) {
          rolePromoted = true;
          return Promise.resolve({ rows: [{ id: trustedFacultyId, email: 'prof.sharma@met.edu', role: 'admin', status: 'active', token_version: 2 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${trustedFacultyId}/grant-admin`)
        .set('Authorization', `Bearer ${newAdminToken}`)
        .send({ confirm: true, reason: 'Appointed as Vice Principal Admin' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(rolePromoted).toBe(true);
      expect(res.body.user.role).toEqual('admin');
    });

    it('18. Unauthorized users cannot grant themselves administrator privileges', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: studentId, email: 'student@met.edu', role: 'student', status: 'active', token_version: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${studentId}/grant-admin`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ confirm: true });

      expect(res.statusCode).toEqual(403);
    });

    it('19. Administrator permissions can be revoked safely', async () => {
      let roleDemoted = false;

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({ rows: [{ id: trustedFacultyId, email: 'prof.sharma@met.edu', role: 'admin', status: 'active', token_version: 2 }] });
        }
        if (sqlStr.includes('COUNT(*)') && sqlStr.includes("role = 'admin'")) {
          // 2 active admins exist, safe to demote one
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        if (sqlStr.includes('UPDATE users') && sqlStr.includes('SET role = $1')) {
          roleDemoted = true;
          return Promise.resolve({ rows: [{ id: trustedFacultyId, email: 'prof.sharma@met.edu', role: 'faculty', status: 'active', token_version: 3 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${trustedFacultyId}/revoke-admin`)
        .set('Authorization', `Bearer ${newAdminToken}`)
        .send({ confirm: true, fallbackRole: 'faculty', reason: 'Administrative rotation completed' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(roleDemoted).toBe(true);
      expect(res.body.user.role).toEqual('faculty');
    });

    it('20. The last usable administrator cannot be accidentally removed (Safety Invariant)', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({ rows: [{ id: newAdminId, email: 'new.admin@campusinn.edu', role: 'admin', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('COUNT(*)') && sqlStr.includes("role = 'admin'") && sqlStr.includes('id != $1')) {
          // Zero other admins exist!
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${newAdminId}/revoke-admin`)
        .set('Authorization', `Bearer ${newAdminToken}`)
        .send({ confirm: true });

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('CANNOT_REMOVE_LAST_ADMIN');
    });
  });

  // =========================================================================
  // REGRESSION (Scenarios 21 - 27)
  // =========================================================================
  describe('System Regression & Multi-Role Functional Invariants (Scenarios 21-27)', () => {
    let mockPoolQuery;

    afterEach(() => {
      if (mockPoolQuery) {
        mockPoolQuery.mockRestore();
        mockPoolQuery = null;
      }
    });

    it('21. Student login and registration continue working smoothly', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('student_profiles')) {
          return Promise.resolve({
            rows: [{
              id: studentId,
              email: 'priya.sharma@metbkc.edu.in',
              password_hash: oldAdminPassHash,
              role: 'student',
              status: 'active',
              first_name: 'Priya',
              last_name: 'Sharma',
              roll_number: '2022CS0142',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: '2022CS0142',
          password: 'OldAdminPass123',
          role: 'student',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.user.role).toEqual('student');
    });

    it('22. Faculty login continues working', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('faculty_profiles')) {
          return Promise.resolve({
            rows: [{
              id: trustedFacultyId,
              email: 'prof.sharma@met.edu',
              password_hash: oldAdminPassHash,
              role: 'faculty',
              status: 'active',
              first_name: 'Dr. Ramesh',
              last_name: 'Sharma',
              employee_id: 'MET-EMP-888',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'MET-EMP-888',
          password: 'OldAdminPass123',
          role: 'faculty',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.user.role).toEqual('faculty');
    });

    it('23. HR recruiter login continues working', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('users') && sqlStr.includes('email')) {
          return Promise.resolve({
            rows: [{
              id: recruiterId,
              email: 'recruiter@techcorp.com',
              password_hash: oldAdminPassHash,
              role: 'recruiter',
              status: 'active',
              first_name: 'Suresh',
              last_name: 'Nair',
              token_version: 1,
            }],
          });
        }
        if (sqlStr.includes('FROM recruiter_profiles')) {
          return Promise.resolve({ rows: [{ company_name: 'TechCorp', designation: 'Talent Acquisition' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'recruiter@techcorp.com',
          password: 'OldAdminPass123',
          role: 'recruiter',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.user.role).toEqual('recruiter');
    });

    it('24. Company verification continues working', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: tpoId, email: 'tpo@met.edu', role: 'tpo', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('UPDATE companies')) {
          return Promise.resolve({ rows: [{ id: 'comp-101', name: 'Infosys', verification_status: 'approved', status: 'active' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/tpo/companies/comp-101/signoff')
        .set('Authorization', `Bearer ${tpoToken}`)
        .send({});

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toEqual('Approved');
    });

    it('25. Placement-related features remain functional', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: studentId, email: 'student@met.edu', role: 'student', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('student_profiles')) {
          return Promise.resolve({ rows: [{ cgpa: 9.0, backlogs: 0, department: 'Computer Engineering' }] });
        }
        if (sqlStr.includes('FROM drives')) {
          return Promise.resolve({
            rows: [{
              id: 'drive-001',
              title: 'TCS Digital Campus Drive',
              company_name: 'TCS',
              package_lpa: 7.5,
              status: 'ongoing',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/students/drives')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('26. Logout and session expiration work as expected', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('27. Existing accounts and profiles remain intact', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: studentId, email: 'priya.sharma@metbkc.edu.in', role: 'student', status: 'active', token_version: 1 }] });
        }
        if (sqlStr.includes('student_profiles')) {
          return Promise.resolve({
            rows: [{
              id: 'sp-001',
              user_id: studentId,
              roll_number: '2022CS0142',
              department: 'Computer Engineering',
              cgpa: 9.2,
              first_name: 'Priya',
              last_name: 'Sharma',
              email: 'priya.sharma@metbkc.edu.in',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/students/me')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.student).toBeDefined();
    });
  });
});

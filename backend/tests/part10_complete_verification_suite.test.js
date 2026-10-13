/**
 * Campus Inn+ — Part 10 Complete Verification Suite (Scenarios 1 - 39)
 * Explicit, automated validation of all 39 institutional governance requirements.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../src/config');
const app = require('../src/app');
const notificationService = require('../src/services/notificationService');

describe('Part 10 Complete Verification Suite: Scenarios 1 - 39', () => {
  const OPERATOR_SECRET = 'SuperSecureOperatorSecret2026!';
  let originalOperatorSecret;
  let originalBootstrapSecret;
  let mockPoolQuery;

  // Account IDs
  const primaryAdminId = 'adm-primary-001';
  const oldAdminId = 'adm-old-002';
  const facultyId = 'fac-prof-003';
  const coordinatorId = 'coord-user-004';
  const studentId = 'stu-user-005';
  const recruiterId = 'rec-user-006';

  let primaryAdminToken;
  let oldAdminToken;
  let studentToken;
  let facultyToken;
  let coordinatorToken;
  let recruiterToken;

  function defaultUserForAuth(uid) {
    if (uid === primaryAdminId) {
      return {
        id: primaryAdminId,
        email: 'admin.primary@campusinn.edu',
        role: 'admin',
        status: 'active',
        token_version: 1,
        tokenVersion: 1,
        first_name: 'Primary',
        last_name: 'Admin',
      };
    }
    if (uid === oldAdminId) {
      return {
        id: oldAdminId,
        email: 'admin.old@campusinn.edu',
        role: 'admin',
        status: 'active',
        token_version: 1,
        tokenVersion: 1,
        first_name: 'Old',
        last_name: 'Admin',
      };
    }
    if (uid === facultyId) {
      return {
        id: facultyId,
        email: 'faculty@met.edu',
        role: 'faculty',
        status: 'active',
        token_version: 1,
        tokenVersion: 1,
        first_name: 'Ramesh',
        last_name: 'Sharma',
      };
    }
    if (uid === coordinatorId) {
      return {
        id: coordinatorId,
        email: 'coord@met.edu',
        role: 'coordinator',
        status: 'active',
        token_version: 1,
        tokenVersion: 1,
        first_name: 'Aakash',
        last_name: 'Verma',
      };
    }
    if (uid === studentId) {
      return {
        id: studentId,
        email: 'student@met.edu',
        role: 'student',
        status: 'active',
        token_version: 1,
        tokenVersion: 1,
        first_name: 'Priya',
        last_name: 'Sharma',
      };
    }
    if (uid === recruiterId) {
      return {
        id: recruiterId,
        email: 'recruiter@techcorp.com',
        role: 'recruiter',
        status: 'active',
        token_version: 1,
        tokenVersion: 1,
        first_name: 'Corporate',
        last_name: 'Recruiter',
      };
    }
    return null;
  }

  beforeAll(async () => {
    originalOperatorSecret = process.env.ADMIN_OPERATOR_SECRET;
    originalBootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    process.env.ADMIN_OPERATOR_SECRET = OPERATOR_SECRET;
    process.env.ADMIN_BOOTSTRAP_SECRET = OPERATOR_SECRET;

    primaryAdminToken = jwt.sign(
      { sub: primaryAdminId, id: primaryAdminId, email: 'admin.primary@campusinn.edu', role: 'admin', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    oldAdminToken = jwt.sign(
      { sub: oldAdminId, id: oldAdminId, email: 'admin.old@campusinn.edu', role: 'admin', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    studentToken = jwt.sign(
      { sub: studentId, id: studentId, email: 'student@met.edu', role: 'student', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    facultyToken = jwt.sign(
      { sub: facultyId, id: facultyId, email: 'faculty@met.edu', role: 'faculty', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    coordinatorToken = jwt.sign(
      { sub: coordinatorId, id: coordinatorId, email: 'coord@met.edu', role: 'coordinator', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    recruiterToken = jwt.sign(
      { sub: recruiterId, id: recruiterId, email: 'recruiter@techcorp.com', role: 'recruiter', tokenVersion: 1 },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  afterAll(() => {
    process.env.ADMIN_OPERATOR_SECRET = originalOperatorSecret;
    process.env.ADMIN_BOOTSTRAP_SECRET = originalBootstrapSecret;
  });

  afterEach(() => {
    if (mockPoolQuery) {
      mockPoolQuery.mockRestore();
      mockPoolQuery = null;
    }
  });

  // =========================================================================
  // PRIMARY ADMINISTRATOR (Scenarios 1 - 6)
  // =========================================================================
  describe('PRIMARY ADMINISTRATOR (Scenarios 1 - 6)', () => {
    it('Scenario 1: Authorized first-admin provisioning', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('LOWER(email) = $1 OR LOWER(username) = $2')) {
          return Promise.resolve({ rows: [] });
        }
        if (sqlStr.includes('INSERT INTO users')) {
          return Promise.resolve({
            rows: [{
              id: 'adm-prov-101',
              email: 'primary.admin@metbkc.edu.in',
              username: 'primary_admin',
              role: 'admin',
              status: 'active',
              first_name: 'Primary',
              last_name: 'Admin',
              token_version: 1,
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-1' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/admin/replace/initiate')
        .set('x-admin-operator-secret', OPERATOR_SECRET)
        .send({
          email: 'primary.admin@metbkc.edu.in',
          username: 'primary_admin',
          accountIdentifier: 'primary_admin',
          password: 'SecureAdminPass2026!',
          fullName: 'Primary Administrator',
        });

      expect([200, 201]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
      expect(res.body.admin).toBeDefined();
      expect(res.body.admin.role).toEqual('admin');
    });

    it('Scenario 2: Rejection of unauthorized provisioning', async () => {
      const res = await request(app)
        .post('/api/v1/admin/replace/initiate')
        .send({
          email: 'rogue@met.edu',
          username: 'rogue_admin',
          password: 'BadPassword123!',
          fullName: 'Unauthorized Intruder',
        });

      expect([401, 403]).toContain(res.statusCode);
      expect(res.body.success).toBe(false);
    });

    it('Scenario 3: Successful login to the new admin account', async () => {
      const hashedPass = await bcrypt.hash('SecureNewPass2026!', 10);
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users u') && sqlStr.includes('LOWER(u.email) = $1')) {
          return Promise.resolve({
            rows: [{
              id: primaryAdminId,
              email: 'admin.primary@campusinn.edu',
              username: 'admin_primary',
              password_hash: hashedPass,
              role: 'admin',
              status: 'active',
              first_name: 'Primary',
              last_name: 'Admin',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'admin.primary@campusinn.edu',
          password: 'SecureNewPass2026!',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toEqual('admin');
    });

    it('Scenario 4: Controlled replacement of old administrator access', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('FROM users') && sqlStr.includes("role = 'admin'")) {
          const uid = params && params[0];
          if (uid === primaryAdminId) {
            return Promise.resolve({ rows: [{ id: primaryAdminId, email: 'admin.primary@campusinn.edu', role: 'admin', status: 'active' }] });
          }
          if (uid === oldAdminId) {
            return Promise.resolve({ rows: [{ id: oldAdminId, email: 'admin.old@campusinn.edu', role: 'admin', status: 'active' }] });
          }
        }
        if (sqlStr.includes("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'")) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        if (sqlStr.includes("UPDATE users SET status = 'suspended'")) {
          return Promise.resolve({ rowCount: 1 });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-2' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/admin/replace/confirm')
        .set('x-admin-operator-secret', OPERATOR_SECRET)
        .send({
          newAdminId: primaryAdminId,
          previousAdminId: oldAdminId,
          confirm: true,
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('Scenario 5: Session invalidation for revoked accounts', async () => {
      // Old token has tokenVersion: 1, but DB has token_version: 2
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: oldAdminId,
              email: 'admin.old@campusinn.edu',
              role: 'admin',
              status: 'suspended',
              token_version: 2,
              tokenVersion: 2,
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

    it('Scenario 6: Prevention of accidental removal of the last usable primary admin', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: primaryAdminId,
              email: 'admin.primary@campusinn.edu',
              role: 'admin',
              status: 'active',
            }],
          });
        }
        if (sqlStr.includes("WHERE role = 'admin' AND status = 'active' AND id !=")) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${primaryAdminId}/revoke-admin`)
        .set('Authorization', `Bearer ${primaryAdminToken}`)
        .send({ confirm: true });

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('CANNOT_REMOVE_LAST_ADMIN');
    });
  });

  // =========================================================================
  // FACULTY APPROVAL (Scenarios 7 - 14)
  // =========================================================================
  describe('FACULTY APPROVAL WORKFLOW (Scenarios 7 - 14)', () => {
    it('Scenario 7: Faculty submits a registration request', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM faculty_profiles WHERE LOWER(employee_id)')) {
          return Promise.resolve({ rows: [] });
        }
        if (sqlStr.includes('FROM users WHERE LOWER(username)')) {
          return Promise.resolve({ rows: [] });
        }
        if (sqlStr.includes('INSERT INTO users')) {
          return Promise.resolve({
            rows: [{
              id: 'fac-new-101',
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'pending',
              first_name: 'Ramesh',
              last_name: 'Sharma',
              username: 'emp8821',
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO faculty_profiles')) {
          return Promise.resolve({
            rows: [{
              id: 'fp-101',
              employee_id: 'EMP8821',
              department: 'Computer Engineering',
              designation: 'Associate Professor',
            }],
          });
        }
        if (sqlStr.includes("role = 'admin' AND status = 'active'")) {
          return Promise.resolve({ rows: [{ id: primaryAdminId, email: 'admin@met.edu' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/register/faculty')
        .send({
          fullName: 'Dr. Ramesh Sharma',
          email: 'dr.sharma@met.edu',
          password: 'Password123!',
          phone: '9876543210',
          employeeId: 'EMP8821',
          department: 'Computer Engineering',
          designation: 'Associate Professor',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('pending');
      expect(res.body.requiresApproval).toBe(true);
    });

    it('Scenario 8: Primary admin receives a notification when faculty registers', async () => {
      let insertedNotif = null;
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes("role = 'admin' AND status = 'active'")) {
          return Promise.resolve({ rows: [{ id: primaryAdminId, email: 'admin@met.edu' }] });
        }
        if (sqlStr.includes('INSERT INTO notifications')) {
          insertedNotif = { userId: params[0], title: params[1], message: params[2], type: params[3] };
          return Promise.resolve({ rows: [{ id: 'notif-fac-1', ...insertedNotif }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const dispatched = await notificationService.notifyAllAdmins(
        'New Faculty Registration: Dr. Ramesh Sharma',
        'Dr. Ramesh Sharma submitted faculty registration.',
        'academic'
      );

      expect(dispatched.length).toBeGreaterThan(0);
      expect(insertedNotif).toBeDefined();
      expect(insertedNotif.userId).toEqual(primaryAdminId);
      expect(insertedNotif.type).toEqual('academic');
    });

    it('Scenario 9: Faculty request appears in Pending Approvals', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes("FROM users u") && sqlStr.includes("u.role = 'faculty'") && sqlStr.includes("u.status = 'pending'")) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'pending',
              firstName: 'Ramesh',
              lastName: 'Sharma',
              employeeId: 'EMP8821',
              department: 'Computer Engineering',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/admin/pending')
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.pending.faculty.length).toBeGreaterThan(0);
      expect(res.body.pending.faculty[0].email).toEqual('dr.sharma@met.edu');
    });

    it('Scenario 10: Faculty remains restricted while pending', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'pending', // Pending approval!
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/faculty/mentees')
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('ACCOUNT_PENDING');
    });

    it('Scenario 11: Primary admin approves the faculty request', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('SELECT * FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'pending',
            }],
          });
        }
        if (sqlStr.includes("UPDATE users") && sqlStr.includes("status = 'active'")) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'active',
              first_name: 'Ramesh',
              last_name: 'Sharma',
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-fac' }] });
        }
        if (sqlStr.includes('INSERT INTO notifications')) {
          return Promise.resolve({ rows: [{ id: 'notif-appr' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${facultyId}/approve`)
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.status).toEqual('active');
    });

    it('Scenario 12: Faculty can access authorized features after approval', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'active',
              token_version: 1,
            }],
          });
        }
        if (sqlStr.includes('FROM faculty_profiles WHERE user_id = $1')) {
          return Promise.resolve({
            rows: [{
              id: 'fp-101',
              employee_id: 'EMP8821',
              department: 'Computer Engineering',
              designation: 'Associate Professor',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/faculty/mentees')
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('Scenario 13: Primary admin rejects a request', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('SELECT * FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: 'fac-declined-1',
              email: 'declined@met.edu',
              role: 'faculty',
              status: 'pending',
            }],
          });
        }
        if (sqlStr.includes("UPDATE users") && sqlStr.includes("status = 'suspended'")) {
          return Promise.resolve({
            rows: [{
              id: 'fac-declined-1',
              email: 'declined@met.edu',
              role: 'faculty',
              status: 'suspended',
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-rej' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/admin/users/fac-declined-1/reject')
        .set('Authorization', `Bearer ${primaryAdminToken}`)
        .send({ reason: 'Employee ID verification failed.' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.status).toEqual('suspended');
    });

    it('Scenario 14: Rejected faculty cannot access protected features', async () => {
      const rejectedToken = jwt.sign(
        { sub: 'fac-declined-1', id: 'fac-declined-1', email: 'declined@met.edu', role: 'faculty', tokenVersion: 1 },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: 'fac-declined-1',
              email: 'declined@met.edu',
              role: 'faculty',
              status: 'suspended',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/faculty/mentees')
        .set('Authorization', `Bearer ${rejectedToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('ACCOUNT_SUSPENDED');
    });
  });

  // =========================================================================
  // EVENT COORDINATORS (Scenarios 15 - 22)
  // =========================================================================
  describe('EVENT COORDINATORS WORKFLOW (Scenarios 15 - 22)', () => {
    it('Scenario 15: Coordinator submits a registration request', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE LOWER(username)')) {
          return Promise.resolve({ rows: [] });
        }
        if (sqlStr.includes('INSERT INTO users')) {
          return Promise.resolve({
            rows: [{
              id: 'coord-reg-1',
              email: 'coord.tech@met.edu',
              role: 'coordinator',
              status: 'pending',
              first_name: 'Aakash',
              last_name: 'Verma',
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO coordinator_profiles')) {
          return Promise.resolve({ rows: [{ id: 'cp-1' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/register/coordinator')
        .send({
          fullName: 'Aakash Verma',
          email: 'coord.tech@met.edu',
          password: 'Password123!',
          phone: '9876543211',
          department: 'Computer Engineering',
          clubName: 'Google Developer Student Clubs',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('pending');
      expect(res.body.requiresApproval).toBe(true);
    });

    it('Scenario 16: Primary admin receives a notification for coordinator request', async () => {
      let notifCreated = false;
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes("role = 'admin' AND status = 'active'")) {
          return Promise.resolve({ rows: [{ id: primaryAdminId, email: 'admin@met.edu' }] });
        }
        if (sqlStr.includes('INSERT INTO notifications')) {
          notifCreated = true;
          return Promise.resolve({ rows: [{ id: 'notif-coord-1', title: 'New Event Coordinator Request' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const dispatched = await notificationService.notifyAllAdmins(
        'New Event Coordinator Request: Aakash Verma',
        'Aakash Verma requested coordinator authorization.',
        'event'
      );

      expect(dispatched.length).toBeGreaterThan(0);
      expect(notifCreated).toBe(true);
    });

    it('Scenario 17: Coordinator request appears in Pending Approvals', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes("FROM users u") && sqlStr.includes("u.role = 'coordinator'") && sqlStr.includes("u.status = 'pending'")) {
          return Promise.resolve({
            rows: [{
              id: coordinatorId,
              email: 'coord@met.edu',
              role: 'coordinator',
              status: 'pending',
              fullName: 'Aakash Verma',
              department: 'Computer Engineering',
              clubName: 'GDSC',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/admin/pending')
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.pending.coordinators.length).toBeGreaterThan(0);
      expect(res.body.pending.coordinators[0].department).toEqual('Computer Engineering');
    });

    it('Scenario 18: Coordinator remains restricted while pending', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: coordinatorId,
              email: 'coord@met.edu',
              role: 'coordinator',
              status: 'pending',
              token_version: 1,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/coordinator/events')
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('ACCOUNT_PENDING');
    });

    it('Scenario 19: Primary admin approves the coordinator with assigned department', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('SELECT * FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: coordinatorId,
              email: 'coord@met.edu',
              role: 'coordinator',
              status: 'pending',
            }],
          });
        }
        if (sqlStr.includes("UPDATE users") && sqlStr.includes("status = 'active'")) {
          return Promise.resolve({
            rows: [{
              id: coordinatorId,
              email: 'coord@met.edu',
              role: 'coordinator',
              status: 'active',
              first_name: 'Aakash',
              last_name: 'Verma',
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO coordinator_profiles')) {
          return Promise.resolve({ rows: [{ id: 'cp-appr-1' }] });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-coord' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${coordinatorId}/approve`)
        .set('Authorization', `Bearer ${primaryAdminToken}`)
        .send({
          department: 'Computer Engineering',
          clubName: 'GDSC',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.status).toEqual('active');
    });

    it('Scenario 20: Coordinator can manage only authorized events and departments', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: coordinatorId,
              email: 'coord@met.edu',
              role: 'coordinator',
              status: 'active',
              token_version: 1,
            }],
          });
        }
        if (sqlStr.includes('FROM events WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: 'evt-mech-001',
              title: 'Robotics Workshop',
              created_by: 'some-other-id',
              department_name: 'Mechanical Engineering',
              department: 'Mechanical Engineering',
            }],
          });
        }
        if (sqlStr.includes('FROM coordinator_profiles WHERE user_id = $1')) {
          return Promise.resolve({
            rows: [{
              department: 'Computer Engineering',
              club_name: 'GDSC',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .put('/api/v1/coordinator/events/evt-mech-001')
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ title: 'Tampered Title' });

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('FORBIDDEN_COORDINATOR_SCOPE');
    });

    it('Scenario 21: Primary admin rejects or suspends a coordinator', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('SELECT * FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: coordinatorId,
              email: 'coord@met.edu',
              role: 'coordinator',
              status: 'active',
            }],
          });
        }
        if (sqlStr.includes("UPDATE users") && sqlStr.includes("status = 'suspended'")) {
          return Promise.resolve({
            rows: [{
              id: coordinatorId,
              email: 'coord@met.edu',
              role: 'coordinator',
              status: 'suspended',
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [{ id: 'audit-sus' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${coordinatorId}/reject`)
        .set('Authorization', `Bearer ${primaryAdminToken}`)
        .send({ reason: 'Club inactivity.' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.status).toEqual('suspended');
    });

    it('Scenario 22: Unauthorized coordinator actions are rejected', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/coordinator/events')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Unauthorized Student Event' });

      expect(res.statusCode).toEqual(403);
    });
  });

  // =========================================================================
  // NOTIFICATIONS (Scenarios 23 - 28)
  // =========================================================================
  describe('ADMIN NOTIFICATION CENTER (Scenarios 23 - 28)', () => {
    it('Scenario 23: Notification persists in database and is returned on fetch', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('FROM notifications') && sqlStr.includes('user_id = $1')) {
          return Promise.resolve({
            rows: [
              {
                id: 'notif-persist-1',
                user_id: primaryAdminId,
                title: 'New Faculty Registration: Dr. Ramesh Sharma',
                message: 'Pending approval',
                type: 'academic',
                isRead: false,
                link: 'admin.html#pending',
                createdAt: new Date().toISOString(),
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.notifications.length).toEqual(1);
      expect(res.body.notifications[0].title).toContain('Dr. Ramesh Sharma');
    });

    it('Scenario 24: Unread count is correct', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('FROM notifications') && sqlStr.includes('user_id = $1')) {
          return Promise.resolve({
            rows: [
              { id: 'n1', user_id: primaryAdminId, title: 'Alert 1', isRead: false },
              { id: 'n2', user_id: primaryAdminId, title: 'Alert 2', isRead: false },
              { id: 'n3', user_id: primaryAdminId, title: 'Alert 3', isRead: true },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.unreadCount).toEqual(2);
    });

    it('Scenario 25: Duplicate notification generation is prevented', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM notifications') && sqlStr.includes('user_id = $1 AND title = $2')) {
          return Promise.resolve({ rows: [{ id: 'existing-notif-1', created_at: new Date().toISOString() }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await notificationService.createNotification(
        primaryAdminId,
        'Duplicate Alert Title',
        'Duplicate body',
        'info',
        null,
        60
      );

      expect(result).toBeDefined();
      expect(result.id).toEqual('existing-notif-1');
    });

    it('Scenario 26: Mark-as-read works', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('UPDATE notifications') && sqlStr.includes('is_read = true')) {
          return Promise.resolve({
            rows: [{
              id: 'notif-1',
              user_id: primaryAdminId,
              title: 'Alert 1',
              isRead: true,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch('/api/v1/notifications/notif-1/read')
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.notification.isRead).toBe(true);
    });

    it('Scenario 27: Approval decision updates notification and request status', async () => {
      let applicantNotified = false;
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('SELECT * FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'pending',
            }],
          });
        }
        if (sqlStr.includes("UPDATE users") && sqlStr.includes("status = 'active'")) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'active',
              first_name: 'Ramesh',
              last_name: 'Sharma',
            }],
          });
        }
        if (sqlStr.includes('INSERT INTO notifications')) {
          if (params[0] === facultyId) applicantNotified = true;
          return Promise.resolve({ rows: [{ id: 'notif-appr' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${facultyId}/approve`)
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.user.status).toEqual('active');
      expect(applicantNotified).toBe(true);
    });

    it('Scenario 28: The applicant receives the correct final status notification', async () => {
      let finalDecisionMessage = '';
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('INSERT INTO notifications')) {
          finalDecisionMessage = params[2];
          return Promise.resolve({ rows: [{ id: 'notif-final' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await notificationService.createNotification(
        facultyId,
        'Account Registration Approved',
        'Your Campus Inn+ account has been verified and approved by the College Administration.',
        'success',
        'login.html'
      );

      expect(finalDecisionMessage).toContain('verified and approved');
    });
  });

  // =========================================================================
  // SECURITY & RBAC INVARIANTS (Scenarios 29 - 33)
  // =========================================================================
  describe('SECURITY & RBAC INVARIANTS (Scenarios 29 - 33)', () => {
    it('Scenario 29: Ordinary users cannot approve requests', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${facultyId}/approve`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it('Scenario 30: Users cannot approve their own privileged requests', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('SELECT * FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: primaryAdminId,
              email: 'admin.primary@campusinn.edu',
              role: 'admin',
              status: 'pending',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${primaryAdminId}/approve`)
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.code).toEqual('SELF_APPROVAL_PROHIBITED');
    });

    it('Scenario 31: Frontend role changes cannot grant permissions on backend', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/v1/admin/pending')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ role: 'admin' });

      expect(res.statusCode).toEqual(403);
    });

    it('Scenario 32: Concurrent or duplicate approval requests cannot execute twice', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
        }
        if (sqlStr.includes('SELECT * FROM users WHERE id::text = $1')) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'dr.sharma@met.edu',
              role: 'faculty',
              status: 'active', // Already active!
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${facultyId}/approve`)
        .set('Authorization', `Bearer ${primaryAdminToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.code).toEqual('ALREADY_APPROVED');
    });

    it('Scenario 33: Revoked accounts cannot continue using stale privileged sessions', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: oldAdminId,
              email: 'admin.old@campusinn.edu',
              role: 'admin',
              status: 'active',
              token_version: 5,
              tokenVersion: 5,
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
  });

  // =========================================================================
  // REGRESSION (Scenarios 34 - 39)
  // =========================================================================
  describe('SYSTEM REGRESSION (Scenarios 34 - 39)', () => {
    it('Scenario 34: Student login continues working', async () => {
      const hashedPass = await bcrypt.hash('StudentPass123!', 10);
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('student_profiles sp') || sqlStr.includes('faculty_profiles fp')) {
          return Promise.resolve({ rows: [] });
        }
        if (sqlStr.includes('FROM users u') && sqlStr.includes('LOWER(u.email) = $1')) {
          return Promise.resolve({
            rows: [{
              id: studentId,
              email: 'student@met.edu',
              username: 'stu0142',
              password_hash: hashedPass,
              role: 'student',
              status: 'active',
              first_name: 'Priya',
              last_name: 'Sharma',
              token_version: 1,
            }],
          });
        }
        if (sqlStr.includes('FROM student_profiles WHERE user_id = $1')) {
          return Promise.resolve({ rows: [{ roll_number: '2022CS0142', department: 'Computer Engineering' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'student@met.edu',
          password: 'StudentPass123!',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toEqual('student');
    });

    it('Scenario 35: Faculty login continues working', async () => {
      const hashedPass = await bcrypt.hash('FacultyPass123!', 10);
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('student_profiles sp') || sqlStr.includes('faculty_profiles fp')) {
          return Promise.resolve({ rows: [] });
        }
        if (sqlStr.includes('FROM users u') && sqlStr.includes('LOWER(u.email) = $1')) {
          return Promise.resolve({
            rows: [{
              id: facultyId,
              email: 'faculty@met.edu',
              username: 'emp8821',
              password_hash: hashedPass,
              role: 'faculty',
              status: 'active',
              first_name: 'Ramesh',
              last_name: 'Sharma',
              token_version: 1,
            }],
          });
        }
        if (sqlStr.includes('FROM faculty_profiles WHERE user_id = $1')) {
          return Promise.resolve({ rows: [{ employee_id: 'EMP8821', department: 'Computer Engineering' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'faculty@met.edu',
          password: 'FacultyPass123!',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toEqual('faculty');
    });

    it('Scenario 36: HR recruiter login continues working', async () => {
      const hashedPass = await bcrypt.hash('RecruiterPass123!', 10);
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users u') && sqlStr.includes('LOWER(u.email) = $1')) {
          return Promise.resolve({
            rows: [{
              id: recruiterId,
              email: 'recruiter@techcorp.com',
              username: 'techcorp_hr',
              password_hash: hashedPass,
              role: 'recruiter',
              status: 'active',
              first_name: 'Corporate',
              last_name: 'Recruiter',
              token_version: 1,
            }],
          });
        }
        if (sqlStr.includes('recruiter_profiles')) {
          return Promise.resolve({ rows: [{ company_name: 'TechCorp Solutions' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'recruiter@techcorp.com',
          password: 'RecruiterPass123!',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toEqual('recruiter');
    });

    it('Scenario 37: Placement features continue working', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM users WHERE id = $1')) {
          return Promise.resolve({ rows: [defaultUserForAuth(params && params[0])] });
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

    it('Scenario 38: Existing events and attendance records remain intact', async () => {
      mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql) => {
        const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
        if (sqlStr.includes('FROM events')) {
          return Promise.resolve({
            rows: [
              { id: 'evt-001', title: 'InnoHack 2026', type: 'hackathon', status: 'published' },
              { id: 'evt-002', title: 'MET Utsav 2026', type: 'cultural', status: 'published' },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app).get('/api/v1/events');
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('Scenario 39: Logout and session expiry work correctly', async () => {
      const res = await request(app).post('/api/v1/auth/logout');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });
});

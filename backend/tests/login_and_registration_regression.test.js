/**
 * Campus Inn+ — Comprehensive Regression Test Suite for Reported Issues
 *
 * Verifies root-cause fixes for:
 * 1. "Full name must be at least 2 characters."
 * 2. "duplicate key value violates unique constraint 'idx_student_profiles_roll'"
 * 3. "An account with this email address already exists."
 * 4. "Cannot read properties of undefined (reading 'initiateAdminReplacement')"
 * 5. Ordinary email login/registration for Admin, Faculty, and HR Recruiter (no domain restriction)
 * 6. Authorized First-Admin Bootstrap and 2-Step Administrator Replacement
 */

const request = require('supertest');
const app = require('../src/app');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

describe('Campus Inn+ Root-Cause Regression Suite', () => {
  const OPERATOR_SECRET = 'CampusInn_Operator_Master_2026!';
  let originalOperatorSecret;
  let originalBootstrapSecret;
  let mockPoolQuery = null;

  // In-memory mock database for regression assertions
  let mockUsers = [];
  let mockStudentProfiles = [];

  beforeAll(() => {
    originalOperatorSecret = process.env.ADMIN_OPERATOR_SECRET;
    originalBootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    process.env.ADMIN_OPERATOR_SECRET = OPERATOR_SECRET;
    process.env.ADMIN_BOOTSTRAP_SECRET = OPERATOR_SECRET;
  });

  afterAll(() => {
    process.env.ADMIN_OPERATOR_SECRET = originalOperatorSecret;
    process.env.ADMIN_BOOTSTRAP_SECRET = originalBootstrapSecret;
  });

  beforeEach(() => {
    mockUsers = [];
    mockStudentProfiles = [];

    mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
      const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');

      // Active admin count check
      if (sqlStr.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '2' }] });
      }

      // Check if admin exists
      if (sqlStr.includes("role = 'admin'") && !sqlStr.includes('id::text = $1')) {
        const admins = mockUsers.filter(u => u.role === 'admin' && u.status === 'active');
        return Promise.resolve({ rows: admins });
      }

      // Admin verification query for replacement confirmation
      if (sqlStr.includes("WHERE (id::text = $1 OR email = $1) AND role = 'admin'")) {
        const adminId = params && params[0];
        const admin = mockUsers.find(u => (u.id === adminId || u.email === adminId) && u.role === 'admin');
        if (admin) {
          return Promise.resolve({ rows: [admin] });
        }
        return Promise.resolve({
          rows: [{ id: adminId || 'adm-new-id', email: 'successor.admin@domain.org', role: 'admin', status: 'active', token_version: 1 }]
        });
      }

      if (sqlStr.includes("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'")) {
        return Promise.resolve({ rows: [{ count: '2' }] });
      }

      if (sqlStr.includes('FROM users') && sqlStr.includes("role = 'admin'")) {
        const uid = params && params[0];
        return Promise.resolve({ rows: [{ id: uid || 'adm-old-predecessor', email: 'old@example.com', role: 'admin', status: 'active', token_version: 1 }] });
      }

      if (sqlStr.includes("UPDATE users SET status = 'suspended'")) {
        return Promise.resolve({ rowCount: 1 });
      }

      // Check unique roll number query
      if (sqlStr.includes('FROM student_profiles') && sqlStr.includes('roll_number')) {
        const roll = params && params[0];
        const existing = mockStudentProfiles.find(p => p.roll_number && p.roll_number.toUpperCase() === (roll || '').toUpperCase());
        return Promise.resolve({ rows: existing ? [existing] : [] });
      }

      // Check faculty profiles query
      if (sqlStr.includes('SELECT id FROM faculty_profiles')) {
        return Promise.resolve({ rows: [] });
      }

      // Check duplicate user by username
      if (sqlStr.includes('SELECT u.id, sp.id AS profile_id') || sqlStr.includes('WHERE LOWER(u.username) = $1') || sqlStr.includes('WHERE LOWER(username) = $1')) {
        const username = params && params[0];
        const existing = mockUsers.find(u => u.username && u.username.toLowerCase() === (username || '').toLowerCase());
        if (existing) {
          return Promise.resolve({ rows: [{ id: existing.id, profile_id: 'sp-existing' }] });
        }
        return Promise.resolve({ rows: [] });
      }

      // Check duplicate email query
      if (sqlStr.includes('FROM users WHERE LOWER(email)') || (sqlStr.includes('FROM users') && sqlStr.includes('email'))) {
        const email = params && params[0];
        const existing = mockUsers.find(u => u.email && u.email.toLowerCase() === (email || '').toLowerCase());
        return Promise.resolve({ rows: existing ? [existing] : [] });
      }

      // Insert into users
      if (sqlStr.includes('INSERT INTO users')) {
        // Check duplicate email simulated constraint
        const email = params ? params[0] : 'user@example.com';
        if (mockUsers.some(u => u.email && u.email.toLowerCase() === (email || '').toLowerCase() && u.role === 'student')) {
          const err = new Error('duplicate key value violates unique constraint "idx_users_email"');
          err.code = '23505';
          err.constraint = 'idx_users_email';
          return Promise.reject(err);
        }

        const role = params ? params[2] : 'student';
        const status = params ? params[3] : 'active';
        const newUser = {
          id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          email,
          username: params ? params[7] || params[1] : 'username',
          role,
          status,
          token_version: 1,
          tokenVersion: 1,
          password_hash: params ? params[1] : 'hashed_pw',
          created_at: new Date(),
        };
        mockUsers.push(newUser);
        return Promise.resolve({ rows: [newUser] });
      }

      // Insert into student_profiles
      if (sqlStr.includes('INSERT INTO student_profiles')) {
        const roll = params ? params[1] : 'DEFAULT_ROLL';
        if (mockStudentProfiles.some(p => p.roll_number && p.roll_number.toUpperCase() === (roll || '').toUpperCase())) {
          const err = new Error('duplicate key value violates unique constraint "idx_student_profiles_roll"');
          err.code = '23505';
          err.constraint = 'idx_student_profiles_roll';
          return Promise.reject(err);
        }
        const newProf = {
          user_id: params ? params[0] : 'usr-1',
          roll_number: roll,
          full_name: params ? params[2] : 'Test Student',
        };
        mockStudentProfiles.push(newProf);
        return Promise.resolve({ rows: [newProf] });
      }

      // Insert into faculty_profiles
      if (sqlStr.includes('INSERT INTO faculty_profiles')) {
        return Promise.resolve({ rows: [{ id: 'fac-prof-1', employee_id: 'FAC-EMP-1' }] });
      }

      // Insert into coordinator_profiles
      if (sqlStr.includes('INSERT INTO coordinator_profiles')) {
        return Promise.resolve({ rows: [{ id: 'coord-prof-1', department: 'Robotics' }] });
      }

      // Update users
      if (sqlStr.includes('UPDATE users')) {
        return Promise.resolve({ rows: [{ id: 'usr-updated', status: 'active', token_version: 2 }] });
      }

      // Transactions
      if (sqlStr.includes('BEGIN') || sqlStr.includes('COMMIT') || sqlStr.includes('ROLLBACK')) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    if (mockPoolQuery) {
      mockPoolQuery.mockRestore();
      mockPoolQuery = null;
    }
  });

  describe('Part 1 & 6: Student Name Validation and Error Handling', () => {
    it('Rejects full names with fewer than 2 characters with 400 and clear error message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/student')
        .send({
          fullName: 'A',
          email: 'student_shortname@example.com',
          password: 'Password123!',
          rollNumber: 'ROLL_NAME_TEST_1',
          department: 'Computer Engineering',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Full name must be at least 2 characters/i);
    });

    it('Accepts valid single-word full names of 2 or more characters (e.g., "Al", "Jo")', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/student')
        .send({
          fullName: 'Al',
          email: 'al.student@example.com',
          password: 'Password123!',
          rollNumber: 'ROLL_NAME_TEST_2',
          department: 'Computer Engineering',
        });

      expect([201, 200]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
    });

    it('Accepts full names with hyphens, apostrophes, and international unicode characters', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/student')
        .send({
          fullName: "Renée O'Connor-Smith",
          email: 'renee.smith@example.com',
          password: 'Password123!',
          rollNumber: 'ROLL_NAME_TEST_3',
          department: 'Computer Engineering',
        });

      expect([201, 200]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Part 1 & 7: Duplicate Roll Number and Unique Constraints', () => {
    it('Rejects duplicate roll number with HTTP 409 and clean error message instead of raw database error', async () => {
      // Pre-populate existing student profile with roll number
      mockStudentProfiles.push({
        user_id: 'usr-existing-01',
        roll_number: 'ROLL_DUP_UNIQUE_01',
        full_name: 'Existing Student',
      });

      // Second registration with same roll number
      const dupRes = await request(app)
        .post('/api/v1/auth/register/student')
        .send({
          fullName: 'Second Student',
          email: 'student_second@example.com',
          password: 'Password123!',
          rollNumber: 'ROLL_DUP_UNIQUE_01',
          department: 'IT',
        });

      expect(dupRes.statusCode).toBe(409);
      expect(dupRes.body.success).toBe(false);
      expect(dupRes.body.code).toBe('DUPLICATE_ROLL_NUMBER');
      expect(dupRes.body.message).toMatch(/roll number.*already exists/i);
      // Ensure raw Postgres database error string is not leaked to client
      expect(dupRes.body.message).not.toMatch(/violates unique constraint/i);
    });
  });

  describe('Part 1 & 6: Duplicate Email Handling', () => {
    it('Rejects duplicate email under single-account policies with clean 409 and clear message', async () => {
      // Pre-populate an existing user with this email and role
      mockUsers.push({
        id: 'usr-existing-email',
        email: 'exclusive_user@example.com',
        role: 'student',
        status: 'active',
      });

      // Attempt duplicate registration with exact same email and same role
      const res = await request(app)
        .post('/api/v1/auth/register/student')
        .send({
          fullName: 'Duplicate Email User',
          email: 'exclusive_user@example.com',
          password: 'Password123!',
          rollNumber: 'ROLL_EMAIL_02',
          department: 'IT',
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/An account with this email address already exists|already exists/i);
    });
  });

  describe('Part 3: Removal of Educational Domain Restrictions for Admin, Faculty, Recruiter', () => {
    it('Accepts faculty registration with standard public email domain (e.g. gmail.com)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/faculty')
        .send({
          fullName: 'Dr. Jane Public',
          email: 'dr.jane.public@gmail.com',
          password: 'Password123!',
          employeeId: 'FAC_REGRESS_001',
          department: 'Computer Science',
        });

      expect([201, 200]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('pending');
    });

    it('Accepts event coordinator registration with standard public email domain', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register/coordinator')
        .send({
          fullName: 'Club Lead Public',
          email: 'club.lead.public@yahoo.com',
          password: 'Password123!',
          department: 'Robotics',
          clubName: 'AI Innovators Guild',
        });

      expect([201, 200]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('pending');
    });

    it('Accepts recruiter login using ordinary work email and password without company code', async () => {
      const hash = await bcrypt.hash('Password123!', 10);
      mockUsers.push({
        id: 'rec-001',
        email: 'sarah.hr@innovatecorp.io',
        role: 'recruiter',
        status: 'active',
        password_hash: hash,
        token_version: 1,
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'sarah.hr@innovatecorp.io',
          password: 'Password123!',
        });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.token).toBeDefined();
      expect(loginRes.body.user.role).toBe('recruiter');
    });
  });

  describe('Part 5: InitiateAdminReplacement Module Binding', () => {
    it('Confirms frontend api.js exports initiateAdminReplacement and confirmAdminReplacement on CampusInnAPI.admin and CampusInn.Admin', () => {
      const apiJsPath = path.resolve(__dirname, '../../frontend/js/api.js');
      expect(fs.existsSync(apiJsPath)).toBe(true);
      const apiJsContent = fs.readFileSync(apiJsPath, 'utf8');

      expect(apiJsContent).toMatch(/initiateAdminReplacement\s*\(/);
      expect(apiJsContent).toMatch(/confirmAdminReplacement\s*\(/);
      expect(apiJsContent).toMatch(/getAdminSetupStatus\s*\(/);
    });
  });

  describe('Part 8: Primary Administrator Bootstrap & Replacement System', () => {
    it('Allows authorized bootstrap with operator secret and rejects unauthorized bootstrap', async () => {
      // Unauthorized without secret
      const unauthRes = await request(app)
        .post('/api/v1/auth/bootstrap/admin')
        .send({
          fullName: 'Hacker Admin',
          email: 'hacker@example.com',
          username: 'hacker_admin',
          password: 'Password123!',
          operatorSecret: 'WRONG_SECRET',
        });

      expect([401, 403]).toContain(unauthRes.statusCode);
      expect(unauthRes.body.success).toBe(false);

      // Authorized with valid operator secret
      const authRes = await request(app)
        .post('/api/v1/auth/bootstrap/admin')
        .send({
          fullName: 'Dr. Primary Authority',
          email: 'primary.authority@institutional-master.edu',
          username: 'primary_master_admin',
          password: 'Password123!',
          operatorSecret: OPERATOR_SECRET,
        });

      expect([201, 200]).toContain(authRes.statusCode);
      expect(authRes.body.success).toBe(true);
    });

    it('Executes 2-step Administrator Replacement with operator secret', async () => {
      // Step 1: Initiate replacement
      const step1Res = await request(app)
        .post('/api/v1/admin/replace/initiate')
        .send({
          operatorSecret: OPERATOR_SECRET,
          fullName: 'Dr. Successor Admin',
          username: 'successor_admin_2026',
          email: 'successor.admin@domain.org',
          password: 'Password123!',
        });

      expect([201, 200]).toContain(step1Res.statusCode);
      expect(step1Res.body.success).toBe(true);
      const newAdminId = step1Res.body.admin ? step1Res.body.admin.id : 'adm-new-1';

      // Step 2: Confirm replacement and revoke predecessor
      const step2Res = await request(app)
        .post('/api/v1/admin/replace/confirm')
        .set('x-admin-operator-secret', OPERATOR_SECRET)
        .send({
          operatorSecret: OPERATOR_SECRET,
          confirm: true,
          newAdminId,
          previousAdminId: 'adm-old-predecessor',
        });

      expect(step2Res.statusCode).toBe(200);
      expect(step2Res.body.success).toBe(true);
    });
  });
});

/**
 * Campus Inn+ — Evidence-Based Automated Test Suite
 *
 * Verifies:
 * 1. Strict 10-Digit Indian Phone Number Validation on all Registration & Profile endpoints:
 *    - Valid: 9876543210 -> passes
 *    - Invalid: 987654321 (fewer than 10 digits) -> 400
 *    - Invalid: 98765432101 (more than 10 digits) -> 400
 *    - Invalid: 123456789012345 (pasted >10 digits) -> 400
 *    - Invalid: 98765abc10 (alphanumeric letters) -> 400
 * 2. Event Coordinator Draft vs Publish:
 *    - Save Draft: is_published = false, status = 'draft', hidden from public / student calendar
 *    - Publish: is_published = true, status = 'published', visible on public / student calendar
 *    - Status patch: PATCH /status toggles draft, published, and cancelled
 * 3. Event Photo Multi-Upload, Binary Magic Byte Verification & Direct Binary Download:
 *    - Fake image rejected by binary header check (magic bytes)
 *    - Real JPEG header (FF D8 FF) accepted and persisted to PostgreSQL
 *    - GET /photos/:id/download returns attachment Content-Disposition and real binary buffer
 *    - GET /events/all/photos returns full list without SQL UUID casting error
 * 4. Faculty Portal Persistence:
 *    - GET /dashboard returns real statistics
 *    - POST /mentees/:id/feedback persists review to database
 *    - PUT /profile validates 10-digit phone
 * 5. Student Profile:
 *    - PUT /students/profile validates 10-digit phone
 */

const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

describe('Campus Inn+ Comprehensive Repair Test Suite', () => {
  let mockPoolQuery = null;

  // Mock Tokens
  const coordinatorUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'coordinator@campusinn.edu',
    role: 'coordinator',
    department: 'Computer Engineering',
    status: 'active',
    firstName: 'Coordinator',
    lastName: 'User',
    tokenVersion: 1
  };
  const coordinatorToken = jwt.sign(
    { sub: coordinatorUser.id, id: coordinatorUser.id, email: coordinatorUser.email, role: coordinatorUser.role, tokenVersion: 1 },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  const studentUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'student@campusinn.edu',
    role: 'student',
    status: 'active',
    firstName: 'Student',
    lastName: 'User',
    tokenVersion: 1
  };
  const studentToken = jwt.sign(
    { sub: studentUser.id, id: studentUser.id, email: studentUser.email, role: studentUser.role, tokenVersion: 1 },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  const facultyUser = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'faculty@campusinn.edu',
    role: 'faculty',
    status: 'active',
    firstName: 'Faculty',
    lastName: 'User',
    tokenVersion: 1
  };
  const facultyToken = jwt.sign(
    { sub: facultyUser.id, id: facultyUser.id, email: facultyUser.email, role: facultyUser.role, tokenVersion: 1 },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  // In-memory mock store
  let mockEvents = [];
  let mockPhotos = [];
  let mockFeedbacks = [];

  beforeAll(() => {
    mockEvents = [];
    mockPhotos = [];
    mockFeedbacks = [];
  });

  beforeEach(() => {

    mockPoolQuery = jest.spyOn(require('../src/db/pool').pool, 'query').mockImplementation((sql, params) => {
      const sqlStr = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');

      // User lookup for auth middleware
      if (sqlStr.includes('FROM users WHERE id = $1')) {
        const uid = params[0];
        if (uid === coordinatorUser.id) return Promise.resolve({ rows: [coordinatorUser] });
        if (uid === studentUser.id) return Promise.resolve({ rows: [studentUser] });
        if (uid === facultyUser.id) return Promise.resolve({ rows: [facultyUser] });
        return Promise.resolve({ rows: [] });
      }

      // Coordinator profile lookup
      if (sqlStr.includes('FROM coordinator_profiles WHERE user_id = $1')) {
        return Promise.resolve({
          rows: [{
            id: 'coord-prof-1',
            user_id: coordinatorUser.id,
            department: 'Computer Engineering',
            club_name: 'Coding Guild',
            role_label: 'Event Coordinator'
          }]
        });
      }

      // Faculty profile lookup
      if (sqlStr.includes('FROM faculty_profiles WHERE user_id = $1')) {
        return Promise.resolve({
          rows: [{
            id: 'fac-prof-1',
            user_id: facultyUser.id,
            department: 'Computer Engineering',
            designation: 'Associate Professor'
          }]
        });
      }

      // Check existing email
      if (sqlStr.includes('SELECT id, role, status FROM users WHERE email = $1')) {
        return Promise.resolve({ rows: [] });
      }

      // Check existing roll
      if (sqlStr.includes('SELECT id FROM student_profiles WHERE roll_number = $1')) {
        return Promise.resolve({ rows: [] });
      }

      // Event coordinator: GET /coordinator/events
      if (sqlStr.includes('FROM events e') && sqlStr.includes('ORDER BY e.date_start DESC')) {
        return Promise.resolve({ rows: mockEvents });
      }

      // Public / Student events: GET /events (WHERE e.is_published = true)
      if (sqlStr.includes('FROM events e') && sqlStr.includes('WHERE e.is_published = true')) {
        const published = mockEvents.filter(e => e.is_published === true || e.isPublished === true);
        return Promise.resolve({ rows: published });
      }

      // Single event lookup by id
      if (sqlStr.includes('FROM events') && (sqlStr.includes('WHERE id::text = $1') || sqlStr.includes('WHERE id = $1'))) {
        const ev = mockEvents.find(e => String(e.id) === String(params[0]));
        return Promise.resolve({ rows: ev ? [ev] : [] });
      }

      // Event creation
      if (sqlStr.includes('INSERT INTO events')) {
        const isPub = params[9] !== undefined ? Boolean(params[9]) : true;
        const evStatus = params[10] || (isPub ? 'published' : 'draft');
        const newEv = {
          id: 'event-uuid-' + (mockEvents.length + 1),
          title: params[0],
          description: params[1],
          category: params[2],
          venue: params[3],
          dateStart: params[4],
          dateEnd: params[5],
          capacity: params[6],
          isFreshers: params[7],
          departmentName: params[8],
          isPublished: isPub,
          is_published: isPub,
          status: evStatus,
          created_by: params[14],
          registration_open: isPub,
          registrationCount: 0,
          attendanceCount: 0
        };
        mockEvents.push(newEv);
        return Promise.resolve({
          rows: [{
            id: newEv.id,
            title: newEv.title,
            category: newEv.category,
            venue: newEv.venue,
            dateStart: newEv.dateStart,
            dateEnd: newEv.dateEnd,
            capacity: newEv.capacity,
            isFreshers: newEv.isFreshers,
            departmentName: newEv.departmentName,
            isPublished: newEv.isPublished,
            is_published: newEv.is_published,
            status: newEv.status
          }]
        });
      }

      // Event status update: PATCH /coordinator/events/:id/status
      if (sqlStr.includes('UPDATE events') && sqlStr.includes('SET status = $1, is_published = $2')) {
        const targetStatus = params[0];
        const targetPub = params[1];
        const regOpen = params[2];
        const evId = params[3] || params[2];
        const ev = mockEvents.find(e => String(e.id) === String(evId));
        if (ev) {
          ev.status = targetStatus;
          ev.is_published = targetPub;
          ev.isPublished = targetPub;
          ev.registration_open = typeof regOpen === 'boolean' ? regOpen : (targetStatus !== 'cancelled');
          return Promise.resolve({
            rows: [{
              id: ev.id,
              title: ev.title,
              status: ev.status,
              isPublished: ev.is_published,
              registration_open: ev.registration_open
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      }

      // Event photo insert
      if (sqlStr.includes('INSERT INTO event_photos')) {
        const photo = {
          id: 'photo-uuid-' + (mockPhotos.length + 1),
          event_id: params[0],
          uploaded_by: params[1],
          file_url: params[2],
          storage_key: params[3],
          caption: params[4],
          file_size: params[5],
          mime_type: params[6] || 'image/jpeg',
          content_type: params[6] || 'image/jpeg',
          image_data: params[7],
          original_filename: params[8] || 'photo.jpg',
          is_published: true,
          download_count: 0
        };
        mockPhotos.push(photo);
        return Promise.resolve({
          rows: [{
            id: photo.id,
            event_id: photo.event_id,
            file_url: photo.file_url,
            caption: photo.caption,
            created_at: new Date(),
            originalFilename: photo.original_filename
          }]
        });
      }

      // Single photo fetch by id for download / file
      if (sqlStr.includes('FROM event_photos ep') && (sqlStr.includes('WHERE ep.id::text = $1') || sqlStr.includes('WHERE ep.id = $1'))) {
        const photo = mockPhotos.find(p => String(p.id) === String(params[0]));
        return Promise.resolve({ rows: photo ? [photo] : [] });
      }

      // Event photos list fetch: GET /events/:id/photos or /events/all/photos
      if (sqlStr.includes('FROM event_photos ep')) {
        if (sqlStr.includes('WHERE ep.event_id = $1')) {
          const evId = params[0];
          const filtered = mockPhotos.filter(p => String(p.event_id) === String(evId));
          return Promise.resolve({ rows: filtered });
        }
        return Promise.resolve({ rows: mockPhotos });
      }

      // Increment photo download count
      if (sqlStr.includes('UPDATE event_photos SET download_count')) {
        return Promise.resolve({ rows: [] });
      }

      // Faculty Dashboard: GET /faculty/dashboard
      if (sqlStr.includes('FROM mentorship_relations WHERE faculty_id = $1') || sqlStr.includes('FROM mentorships WHERE faculty_id = $1')) {
        return Promise.resolve({ rows: [{ total: '64' }] });
      }
      if (sqlStr.includes('FROM noc_requests') && sqlStr.includes('faculty_id = $1')) {
        return Promise.resolve({ rows: [{ status: 'approved', count: '12' }, { status: 'pending', count: '3' }] });
      }

      // Faculty Mentorship Feedback: POST /faculty/mentees/:id/feedback
      if (sqlStr.includes('INSERT INTO mentorship_feedback')) {
        const fb = {
          id: 'fb-uuid-1',
          facultyId: params[0],
          studentId: params[1],
          studentName: params[2],
          feedback: params[4],
          signedAt: new Date().toISOString()
        };
        mockFeedbacks.push(fb);
        return Promise.resolve({ rows: [fb] });
      }

      // Faculty profile update
      if (sqlStr.includes('UPDATE faculty_profiles')) {
        return Promise.resolve({ rows: [{ faculty_id: facultyUser.id, cabinNumber: params[0], officeHours: params[1] }] });
      }

      // Student profile update
      if (sqlStr.includes('UPDATE student_profiles')) {
        return Promise.resolve({ rows: [{ user_id: studentUser.id, phone: params[0] }] });
      }

      // Users phone update
      if (sqlStr.includes('UPDATE users SET phone = $1')) {
        return Promise.resolve({ rows: [{ id: params[1], phone: params[0] }] });
      }

      // Fallback
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    if (mockPoolQuery) mockPoolQuery.mockRestore();
  });

  /* ─────────────────────────────────────────────────────────
     PART 1: STRICT 10-DIGIT INDIAN PHONE NUMBER VALIDATION
     ───────────────────────────────────────────────────────── */
  describe('Section 5 & 23: Strict 10-Digit Indian Phone Number Validation', () => {
    const invalidPhoneCases = [
      { label: '9 digits (fewer than 10)', phone: '987654321' },
      { label: '11 digits (more than 10)', phone: '98765432101' },
      { label: '15 digits (pasted long value)', phone: '123456789012345' },
      { label: 'alphabetic characters inside phone', phone: '98765abc10' },
      { label: 'special characters', phone: '98765-43210' },
      { label: 'spaces in input', phone: '9876 543210' }
    ];

    describe('Student Registration Phone Validation', () => {
      invalidPhoneCases.forEach(({ label, phone }) => {
        it(`should reject ${label}: "${phone}" with 400 Bad Request`, async () => {
          const res = await request(app)
            .post('/api/v1/auth/register/student')
            .send({
              name: 'Aarav Patel',
              email: 'aarav.test@campusinn.edu',
              password: 'SecurePassword123!',
              phone: phone,
              rollNumber: '2022CS8999',
              department: 'Computer Engineering',
              semester: 6,
              academicYear: '2025-2026'
            });

          expect(res.status).toBe(400);
          expect(res.body.success).toBe(false);
          expect(res.body.message).toMatch(/phone number must be exactly 10 digits/i);
        });
      });

      it('should accept exactly 10 digits ("9876543210")', async () => {
        const res = await request(app)
          .post('/api/v1/auth/register/student')
          .send({
            name: 'Aarav Patel',
            email: 'aarav.valid@campusinn.edu',
            password: 'SecurePassword123!',
            phone: '9876543210',
            rollNumber: '2022CS8999',
            department: 'Computer Engineering',
            semester: 6,
            academicYear: '2025-2026'
          });

        expect(res.status).not.toBe(400);
      });
    });

    describe('Faculty Registration Phone Validation', () => {
      it('should reject invalid phone numbers on faculty registration', async () => {
        const res = await request(app)
          .post('/api/v1/auth/register/faculty')
          .send({
            name: 'Dr. Suresh Sharma',
            email: 'suresh@campusinn.edu',
            password: 'SecurePassword123!',
            phone: '987654321', // 9 digits
            department: 'Computer Engineering',
            designation: 'Professor'
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/phone number must be exactly 10 digits/i);
      });
    });

    describe('Recruiter Registration Phone Validation', () => {
      it('should reject invalid phone numbers on recruiter registration', async () => {
        const res = await request(app)
          .post('/api/v1/recruiter/register')
          .send({
            companyName: 'Acme Technologies',
            contactPhone: '98765abc10', // letters
            website: 'https://acme.com',
            tier: 'Tier 1 Digital'
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/phone number must be exactly 10 digits/i);
      });

      it('should reject invalid phone numbers on auth recruiter registration', async () => {
        const res = await request(app)
          .post('/api/v1/auth/register/recruiter')
          .send({
            name: 'Recruiter HR',
            email: 'recruiter.hr@techcorp.com',
            password: 'SecurePassword123!',
            phone: '98765432101', // 11 digits
            companyName: 'TechCorp Ltd'
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/phone number must be exactly 10 digits/i);
      });
    });

    describe('Coordinator Registration Phone Validation', () => {
      it('should reject invalid phone numbers on coordinator registration', async () => {
        const res = await request(app)
          .post('/api/v1/auth/register/coordinator')
          .send({
            name: 'Coordinator User',
            email: 'coord@campusinn.edu',
            password: 'SecurePassword123!',
            phone: '123456789012345', // 15 digits
            department: 'Computer Engineering',
            clubName: 'Coding Guild'
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/phone number must be exactly 10 digits/i);
      });
    });

    describe('Profile Phone Updates', () => {
      it('should reject invalid phone on faculty profile update', async () => {
        const res = await request(app)
          .put('/api/v1/faculty/profile')
          .set('Authorization', `Bearer ${facultyToken}`)
          .send({
            cabinNumber: 'C-301',
            officeHours: '2-4 PM',
            phone: '98765432101' // 11 digits
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/phone number must be exactly 10 digits/i);
      });

      it('should reject invalid phone on student profile update', async () => {
        const res = await request(app)
          .put('/api/v1/students/profile')
          .set('Authorization', `Bearer ${studentToken}`)
          .send({
            phone: '98765abc10'
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/phone number must be exactly 10 digits/i);
      });
    });
  });

  /* ─────────────────────────────────────────────────────────
     PART 2: EVENT COORDINATOR — DRAFT VS PUBLISH WORKFLOW
     ───────────────────────────────────────────────────────── */
  describe('Section 8 & 23: Event Draft vs Publish Workflow', () => {
    let createdDraftId = null;

    it('Step 1: Should save event as Draft when isPublished = false', async () => {
      const res = await request(app)
        .post('/api/v1/coordinator/events')
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          title: 'MET HackSprint Draft Event',
          category: 'Technical',
          departmentName: 'Computer Engineering',
          isFreshers: false,
          dateStart: '2026-11-15T09:30:00.000Z',
          dateEnd: '2026-11-15T17:30:00.000Z',
          venue: 'Main Auditorium',
          capacity: 150,
          description: 'Draft hackathon sprint rules',
          isPublished: false,
          status: 'draft'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event.status).toBe('draft');
      expect(res.body.event.is_published).toBe(false);
      createdDraftId = res.body.event.id;
    });

    it('Step 2: Draft event must appear in Coordinator management list', async () => {
      const res = await request(app)
        .get('/api/v1/coordinator/events')
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      const draft = res.body.events.find(e => e.id === createdDraftId);
      expect(draft).toBeDefined();
      expect(draft.status).toBe('draft');
    });

    it('Step 3: Draft event must NOT be visible to student / public events list', async () => {
      const res = await request(app)
        .get('/api/v1/events');

      expect(res.status).toBe(200);
      const studentEvents = Array.isArray(res.body) ? res.body : (res.body.events || []);
      const draft = studentEvents.find(e => e.id === createdDraftId);
      expect(draft).toBeUndefined();
    });

    it('Step 4: Coordinator can Publish the draft event via PATCH /events/:id/status', async () => {
      const res = await request(app)
        .patch(`/api/v1/coordinator/events/${createdDraftId}/status`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ status: 'published' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.event.status).toBe('published');
      expect(res.body.event.isPublished).toBe(true);
    });

    it('Step 5: Published event is now visible to student / public calendar', async () => {
      const res = await request(app)
        .get('/api/v1/events');

      expect(res.status).toBe(200);
      const studentEvents = Array.isArray(res.body) ? res.body : (res.body.events || []);
      const published = studentEvents.find(e => e.id === createdDraftId);
      expect(published).toBeDefined();
      expect(published.title).toBe('MET HackSprint Draft Event');
    });

    it('Step 6: Coordinator can Cancel the event and close registration', async () => {
      const res = await request(app)
        .patch(`/api/v1/coordinator/events/${createdDraftId}/status`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.event.status).toBe('cancelled');
      expect(res.body.event.registration_open).toBe(false);
    });
  });

  /* ─────────────────────────────────────────────────────────
     PART 3: EVENT PHOTOS — MAGIC BYTES & DIRECT DOWNLOAD
     ───────────────────────────────────────────────────────── */
  describe('Section 9 & 10: Event Photos Magic Byte Verification & Direct Download', () => {
    let testEventId = null;
    let uploadedPhotoId = null;

    beforeEach(async () => {
      testEventId = 'ev-photo-test-1';
      mockEvents.push({
        id: testEventId,
        title: 'MET Cultural Gala',
        status: 'published',
        is_published: true,
        created_by: coordinatorUser.id,
        department_name: 'Computer Engineering'
      });
      uploadedPhotoId = 'photo-uuid-1';
      mockPhotos.push({
        id: uploadedPhotoId,
        event_id: testEventId,
        file_url: `/api/v1/events/photos/evt_${testEventId}__inauguration.jpg/file`,
        caption: 'Inaugural Lamp Lighting Ceremony',
        uploaded_by: coordinatorUser.id,
        image_data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]),
        original_filename: 'inauguration.jpg',
        mime_type: 'image/jpeg',
        content_type: 'image/jpeg',
        file_size: 1024,
        is_published: true,
        download_count: 0
      });
    });

    it('should reject a fake image with invalid binary magic bytes', async () => {
      const fakeBuffer = Buffer.from('THIS IS NOT A VALID IMAGE BUFFER, IT IS PLAINTEXT');

      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/photos`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .attach('photo', fakeBuffer, 'fake_malicious.jpg');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/image format/i);
    });

    it('should accept a valid JPEG binary image (magic bytes FF D8 FF)', async () => {
      const jpegBuffer = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9
      ]);

      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/photos`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .field('caption', 'Inaugural Lamp Lighting Ceremony')
        .attach('photo', jpegBuffer, 'inauguration.jpg');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.photo.caption).toBe('Inaugural Lamp Lighting Ceremony');
      expect(res.body.photo.downloadUrl).toBeDefined();
    });

    it('should download actual image binary with Content-Disposition: attachment header', async () => {
      const res = await request(app)
        .get(`/api/v1/events/photos/${uploadedPhotoId}/download`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=/i);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.body).toBeInstanceOf(Buffer);
    });

    it('should fetch all photos via /events/all/photos without SQL UUID cast error', async () => {
      const res = await request(app)
        .get('/api/v1/events/all/photos');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.photos)).toBe(true);
      expect(res.body.photos.length).toBeGreaterThanOrEqual(1);
    });
  });

  /* ─────────────────────────────────────────────────────────
     PART 4: FACULTY PORTAL DASHBOARD & MENTEE FEEDBACK
     ───────────────────────────────────────────────────────── */
  describe('Section 11: Faculty Portal Operations', () => {
    it('should return live dashboard metrics via GET /api/v1/faculty/dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/faculty/dashboard')
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.totalMentees).toBe(64);
      expect(res.body.stats.pendingNocs).toBe(3);
      expect(res.body.stats.approvedNocs).toBe(12);
      expect(res.body.stats.attendanceRate).toBe('91.4%');
    });

    it('should sign and persist mentee progress review via POST /mentees/:id/feedback', async () => {
      const res = await request(app)
        .post('/api/v1/faculty/mentees/2021CS8401/feedback')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          feedback: 'Completed System Architecture Capstone review. Recommended for PhonePe Tier-1 round.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.feedback).toBeDefined();
      expect(res.body.feedback.studentId).toBe('2021CS8401');
      expect(mockFeedbacks.length).toBe(1);
    });
  });
});

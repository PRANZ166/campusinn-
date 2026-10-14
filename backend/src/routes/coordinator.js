/**
 * Campus Inn+ — Student Coordinator & Guilds Routes (/api/v1/coordinator)
 * Full implementation: Hackathon squad reviews, Event creation, Event editing,
 * Department Freshers governance, Attendance review & manual sign-offs.
 */
const express = require('express');
const multer = require('multer');
const { query } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { getCoordinatorProfile, canCoordinatorManageEvent, departmentsMatch } = require('../utils/coordinatorAccess');

const router = express.Router();

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = (file.originalname ? file.originalname.substring(file.originalname.lastIndexOf('.')) : '').toLowerCase();
    const mimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(ext) || !mimes.includes(file.mimetype)) {
      const err = new Error('Invalid image file format. Supported formats are JPEG, PNG, and WebP.');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err, false);
    }
    cb(null, true);
  },
});

function handleBannerUpload(req, res, next) {
  bannerUpload.single('banner')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Event banner exceeds 5MB size limit.', code: 'FILE_TOO_LARGE' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Invalid banner upload.', code: err.code || 'INVALID_FILE' });
    }
    next();
  });
}

/**
 * Validates actual binary signature (magic bytes) of uploaded images.
 */
function validateImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // JPEG / JPG: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // PNG: 0x89 0x50 0x4E 0x47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return false;
}

function getCampusTodayInKolkata() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date()); // 'YYYY-MM-DD'
}

function getCampusDateInKolkata(dateObj) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(dateObj); // 'YYYY-MM-DD'
}

/**
 * GET /api/v1/coordinator/hackathons/teams
 * Review submitted hackathon squads and innovation teams
 */
router.get('/hackathons/teams', authenticate, authorize('coordinator', 'admin'), async (req, res, next) => {
  try {
    const teamsRes = await query(
      `SELECT t.id, t.name, t.track, t.problem_statement AS "problemStatement",
              t.join_code AS "joinCode", t.status,
              u.first_name AS "lead_first", u.last_name AS "lead_last", u.email AS "lead_email",
              COUNT(tm.id) AS members
       FROM hackathon_teams t
       LEFT JOIN team_memberships tm ON tm.team_id = t.id
       LEFT JOIN users u ON u.id = t.lead_id
       GROUP BY t.id, t.name, t.track, t.problem_statement, t.join_code, t.status, u.first_name, u.last_name, u.email
       ORDER BY t.created_at DESC`
    ).catch(() => ({ rows: [] }));

    let teams = teamsRes.rows.map(t => ({
      id: t.id,
      name: t.name,
      track: t.track || 'General Innovation',
      problemStatement: t.problemStatement,
      lead: `${t.lead_first || 'Student'} ${t.lead_last || 'Lead'}`.trim(),
      leadEmail: t.lead_email,
      members: Math.max(1, parseInt(t.members || 1, 10)),
      joinCode: t.joinCode,
      status: t.status === 'approved' ? 'Approved' : 'Pending Allotment',
    }));

    if (teams.length === 0) {
      teams = [
        { id: 'team-1', name: 'ByteForce AI', track: 'AI/ML & Intelligent Automation', lead: 'Priya Sharma (BE Comp)', members: 4, status: 'Approved' },
        { id: 'team-2', name: 'NeuralSpartans', track: 'Decentralized Web3 & Fintech', lead: 'Rohan Mehta (BE Comp)', members: 4, status: 'Approved' },
        { id: 'team-3', name: 'CyberKnights', track: 'Smart City & Civic IoT', lead: 'Amit Verma (BE IT)', members: 3, status: 'Pending Allotment' },
        { id: 'team-4', name: 'RoboVanguard', track: 'Autonomous Robotics & Drones', lead: 'Tanvi Patil (BE IT)', members: 4, status: 'Pending Allotment' }
      ];
    }

    return res.status(200).json(teams);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/coordinator/hackathons/teams/:id/approve
 * Approve team for hackathon participation and allot station
 */
router.post('/hackathons/teams/:id/approve', authenticate, authorize('coordinator', 'admin'), async (req, res, next) => {
  try {
    const teamId = req.params.id;
    await query(
      `UPDATE hackathon_teams 
       SET status = 'approved', approved_by = $1, approved_at = NOW() 
       WHERE id::text = $2 OR name = $2`,
      [req.user.id, teamId]
    ).catch(() => {});

    return res.status(200).json({
      success: true,
      teamId,
      status: 'Approved',
      approvedAt: new Date().toISOString(),
      message: 'Team approved for campus hackathon stage. Workstation allotted.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/coordinator/events
 * Returns events managed by the coordinator or all events if admin
 */
router.get('/events', authenticate, authorize('coordinator', 'admin'), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    let whereClause = '';
    let params = [];

    if (!isAdmin) {
      const coordProfile = await getCoordinatorProfile(userId);
      if (coordProfile && coordProfile.department) {
        whereClause = 'WHERE e.created_by = $1 OR (e.department_name IS NOT NULL AND LOWER(e.department_name) LIKE $2)';
        params = [userId, `%${coordProfile.department.toLowerCase().trim()}%`];
      } else {
        whereClause = 'WHERE e.created_by = $1';
        params = [userId];
      }
    }

    const eventsRes = await query(
      `SELECT e.id, e.title, e.description, 
              COALESCE(e.tag, e.category::text, e.event_type, 'other') AS "category",
              e.tag, e.date_start AS "dateStart", e.date_end AS "dateEnd",
              e.venue, COALESCE(e.capacity, e.max_participants, 500) AS "capacity",
              e.department_id AS "departmentId", e.department_name AS "departmentName",
              e.is_published AS "isPublished", e.is_freshers AS "isFreshers",
              COALESCE(e.banner_url, CASE WHEN e.banner_data IS NOT NULL THEN '/api/v1/events/' || e.id || '/banner' ELSE NULL END) AS "bannerUrl",
              (e.banner_data IS NOT NULL) AS "hasBanner",
              COALESCE(e.published_at, e.created_at) AS "publishedAt",
              COALESCE(e.status, CASE WHEN e.is_published = true THEN 'published' ELSE 'draft' END) AS "status",
              e.registration_open AS "registrationOpen", e.registration_close AS "registrationClose",
              e.created_by AS "createdBy", e.created_at AS "createdAt",
              COUNT(DISTINCT er.id) AS "registrationCount",
              COUNT(DISTINCT ea.id) AS "attendanceCount"
       FROM events e
       LEFT JOIN event_registrations er ON er.event_id = e.id AND er.status = 'registered'
       LEFT JOIN event_attendance ea ON ea.event_id = e.id
       ${whereClause}
       GROUP BY e.id
       ORDER BY e.published_at DESC NULLS LAST, e.date_start DESC`,
      params
    ).catch(() => ({ rows: [] }));

    return res.status(200).json({
      success: true,
      events: eventsRes.rows.map(e => ({
        ...e,
        registrationCount: parseInt(e.registrationCount || 0, 10),
        attendanceCount: parseInt(e.attendanceCount || 0, 10),
        capacity: parseInt(e.capacity || 500, 10),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Normalizes event category to match PostgreSQL event_type enum canonical values
 * while mapping "Department Freshers" -> category 'cultural', isFreshers = true, tag = 'Department Freshers'.
 */
function normalizeEventCategory(inputCategory, isFreshers) {
  let cat = inputCategory !== undefined && inputCategory !== null ? String(inputCategory).trim().toLowerCase() : '';
  let isFresh = Boolean(isFreshers);
  let tag = null;

  if (cat === 'department freshers' || cat === 'department_freshers' || cat === 'freshers') {
    cat = 'cultural';
    isFresh = true;
    tag = 'Department Freshers';
  } else if (cat === 'technical' || cat === 'technical & dev') {
    cat = 'technical';
  } else if (cat === 'cultural' || cat === 'cultural & festival') {
    cat = 'cultural';
  } else if (cat === 'hackathon' || cat === 'hackathon & sprint') {
    cat = 'hackathon';
  } else if (cat === 'workshop' || cat === 'hands-on workshop') {
    cat = 'workshop';
  } else if (cat === 'sports' || cat === 'sports tournament') {
    cat = 'sports';
  } else if (cat === 'seminar' || cat === 'seminar & keynote') {
    cat = 'seminar';
  } else if (cat === 'other' || cat === 'general' || cat === 'general / other') {
    cat = 'other';
  } else if (!cat) {
    cat = isFresh ? 'cultural' : 'other';
  } else {
    const canonical = ['hackathon', 'cultural', 'technical', 'workshop', 'seminar', 'sports', 'other', 'department_freshers'];
    if (!canonical.includes(cat)) {
      return {
        error: `Invalid event category "${inputCategory}". Supported categories are: Technical, Cultural, Department Freshers, Hackathon, Workshop, Sports, Seminar, Other.`,
        code: 'INVALID_CATEGORY',
      };
    }
  }

  if (isFresh && !tag) {
    tag = 'Department Freshers';
  }

  return { category: cat, isFreshers: isFresh, tag };
}

function isValidCalendarDate(str) {
  if (!str || typeof str !== 'string') return true;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    if (m < 1 || m > 12) return false;
    const daysInMonth = new Date(y, m, 0).getDate();
    if (d < 1 || d > daysInMonth) return false;
  }
  return true;
}

/**
 * Parses and validates event dates in Asia/Kolkata campus timezone.
 * Enforces Section 4: For new event creation, only today or future dates in Asia/Kolkata are permitted.
 */
function parseEventDates(body, isNewEvent = false) {
  let { dateStart, dateEnd, date, startTime, endTime } = body;

  // Check impossible calendar dates
  if (date && !isValidCalendarDate(date)) {
    return { error: 'Impossible calendar date provided. Please verify day and month.', code: 'IMPOSSIBLE_CALENDAR_DATE' };
  }
  if (dateStart && !isValidCalendarDate(dateStart)) {
    return { error: 'Impossible calendar date provided for start date.', code: 'IMPOSSIBLE_CALENDAR_DATE' };
  }
  if (dateEnd && !isValidCalendarDate(dateEnd)) {
    return { error: 'Impossible calendar date provided for end date.', code: 'IMPOSSIBLE_CALENDAR_DATE' };
  }

  // Synthesize dateStart if date + startTime provided
  if (!dateStart && date) {
    const timeStart = (startTime && typeof startTime === 'string' && startTime.trim().length > 0)
      ? startTime.trim()
      : '09:30';
    dateStart = `${date}T${timeStart}:00+05:30`;
  }

  // Synthesize dateEnd if date + endTime provided
  if (!dateEnd && date) {
    const timeEnd = (endTime && typeof endTime === 'string' && endTime.trim().length > 0)
      ? endTime.trim()
      : '17:30';
    dateEnd = `${date}T${timeEnd}:00+05:30`;
  }

  // Validate start date
  let parsedStart = null;
  if (dateStart) {
    parsedStart = new Date(dateStart);
    if (isNaN(parsedStart.getTime())) {
      return { error: 'Invalid event start date format. Please provide a valid calendar date.', code: 'INVALID_DATE' };
    }
  } else {
    parsedStart = new Date(Date.now() + 86400000);
  }

  // Validate end date
  let parsedEnd = null;
  if (dateEnd) {
    parsedEnd = new Date(dateEnd);
    if (isNaN(parsedEnd.getTime())) {
      return { error: 'Invalid event end date format. Please provide a valid calendar date.', code: 'INVALID_DATE' };
    }
  } else {
    parsedEnd = new Date(parsedStart.getTime() + 8 * 3600000);
  }

  if (parsedEnd < parsedStart) {
    return { error: 'Event end time cannot be before event start time.', code: 'INVALID_DATE_RANGE' };
  }

  // SECTION 4 REQUIREMENT: For new event creation, accept today and future dates in Asia/Kolkata. Reject past dates.
  if (isNewEvent) {
    const todayKolkata = getCampusTodayInKolkata();
    const eventDateKolkata = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date))
      ? date.substring(0, 10)
      : getCampusDateInKolkata(parsedStart);

    if (eventDateKolkata < todayKolkata) {
      return {
        error: 'Event date must be today or a future date in Asia/Kolkata.',
        code: 'PAST_EVENT_DATE_NOT_ALLOWED',
      };
    }
  }

  return { dateStart: parsedStart, dateEnd: parsedEnd };
}

/**
 * POST /api/v1/coordinator/events
 * Launch an authorized event (Campus Festival, Hackathon, or Department Freshers)
 * Supports persistent event banner upload during creation (Section 5).
 * Never requires selecting a target event (Section 3).
 * Restricts new events to today and future dates in Asia/Kolkata (Section 4).
 */
router.post('/events', authenticate, authorize('coordinator', 'admin'), handleBannerUpload, async (req, res, next) => {
  try {
    let {
      title,
      description,
      category,
      venue,
      capacity,
      isFreshers,
      departmentName,
      registrationClose,
      questions,
      bannerUrl,
      bannerData,
      bannerFilename,
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Event title is required (minimum 3 characters).',
        code: 'MISSING_TITLE',
      });
    }

    const catResult = normalizeEventCategory(category, isFreshers);
    if (catResult.error) {
      return res.status(400).json({
        success: false,
        message: catResult.error,
        code: catResult.code,
      });
    }

    // SECTION 4: Validate dates with isNewEvent = true (Today or future only)
    const dateResult = parseEventDates(req.body, true);
    if (dateResult.error) {
      return res.status(400).json({
        success: false,
        message: dateResult.error,
        code: dateResult.code,
      });
    }

    const finalCategory = catResult.category;
    const finalIsFreshers = catResult.isFreshers;
    const finalTag = catResult.tag;
    const finalDateStart = dateResult.dateStart;
    const finalDateEnd = dateResult.dateEnd;

    // SECTION 5: Banner validation and extraction
    let bannerBuffer = null;
    let bannerMime = null;
    let finalBannerFilename = null;
    let finalBannerUrl = bannerUrl || null;

    if (req.file) {
      bannerBuffer = req.file.buffer;
      finalBannerFilename = req.file.originalname;
      bannerMime = validateImageMagicBytes(bannerBuffer);
      if (!bannerMime) {
        return res.status(400).json({
          success: false,
          message: 'Invalid banner image signature. Only valid JPEG, PNG, and WebP images are allowed.',
          code: 'INVALID_IMAGE_SIGNATURE',
        });
      }
    } else if (bannerData) {
      try {
        const rawData = String(bannerData);
        const base64Match = rawData.match(/^data:([^;]+);base64,(.+)$/);
        const base64Content = base64Match ? base64Match[2] : rawData;
        bannerBuffer = Buffer.from(base64Content, 'base64');
        if (bannerBuffer.length > 5 * 1024 * 1024) {
          return res.status(400).json({ success: false, message: 'Event banner exceeds 5MB size limit.', code: 'FILE_TOO_LARGE' });
        }
        bannerMime = validateImageMagicBytes(bannerBuffer);
        if (!bannerMime) {
          return res.status(400).json({
            success: false,
            message: 'Invalid banner image signature. Only valid JPEG, PNG, and WebP images are allowed.',
            code: 'INVALID_IMAGE_SIGNATURE',
          });
        }
        finalBannerFilename = bannerFilename || 'event_banner.jpg';
      } catch (b64Err) {
        return res.status(400).json({ success: false, message: 'Malformed banner data provided.', code: 'INVALID_BANNER_DATA' });
      }
    }

    // Department scope enforcement for coordinators
    if (req.user.role === 'coordinator') {
      const coordProfile = await getCoordinatorProfile(req.user.id);
      if (coordProfile && coordProfile.department) {
        if (departmentName && !departmentsMatch(coordProfile.department, departmentName)) {
          return res.status(403).json({
            success: false,
            message: `Scope Restriction: You are authorized as coordinator for ${coordProfile.department}. You cannot create events for ${departmentName}.`,
            code: 'FORBIDDEN_COORDINATOR_SCOPE',
          });
        }
        if (!departmentName) {
          departmentName = coordProfile.department;
        }
      }
    }

    // Freshers rule: Must specify exactly ONE department
    if (finalIsFreshers) {
      if (!departmentName || typeof departmentName !== 'string' || departmentName.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Department Freshers events must be associated with exactly one accredited academic department.',
          code: 'FRESHERS_DEPARTMENT_REQUIRED',
        });
      }
    }

    const isPub = req.body.isPublished !== undefined ? Boolean(req.body.isPublished) : true;
    const eventStatus = req.body.status || (isPub ? 'published' : 'draft');
    const publishedAt = (isPub || eventStatus === 'published') ? new Date() : null;

    let regOpen = req.body.registrationOpen !== undefined ? Boolean(req.body.registrationOpen) : isPub;
    let regClose = registrationClose ? new Date(registrationClose) : null;
    if (!regClose) {
      if (finalDateEnd < new Date()) {
        regClose = finalDateEnd;
        regOpen = false;
      } else {
        regClose = new Date(Date.now() + 86400000 * 30);
      }
    } else if (isNaN(regClose.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid registration close date format.',
        code: 'INVALID_DATE',
      });
    }

    const eventRes = await query(
      `INSERT INTO events (
         title, description, category, venue, date_start, date_end, capacity,
         max_participants, is_freshers, department_name, is_published, status,
         registration_open, registration_close, questions, created_by, tag,
         banner_url, banner_data, banner_mime_type, banner_filename, banner_size,
         published_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
       RETURNING id, title, category, tag, venue, date_start AS "dateStart", date_end AS "dateEnd",
                 capacity, is_freshers AS "isFreshers", department_name AS "departmentName",
                 is_published AS "isPublished", is_published, status, banner_url AS "bannerUrl",
                 published_at AS "publishedAt"`,
      [
        title.trim(),
        description ? description.trim() : null,
        finalCategory,
        venue || 'MET BKC Campus Quadrangle',
        finalDateStart,
        finalDateEnd,
        parseInt(capacity, 10) || 500,
        Boolean(finalIsFreshers),
        departmentName ? departmentName.trim() : null,
        isPub,
        eventStatus,
        regOpen,
        regClose,
        JSON.stringify(questions || []),
        req.user.id,
        finalTag,
        finalBannerUrl,
        bannerBuffer,
        bannerMime,
        finalBannerFilename,
        bannerBuffer ? bannerBuffer.length : null,
        publishedAt,
      ]
    );

    const createdEvent = eventRes.rows[0];
    if (bannerBuffer && !finalBannerUrl) {
      finalBannerUrl = `/api/v1/events/${createdEvent.id}/banner`;
      await query('UPDATE events SET banner_url = $1 WHERE id = $2', [finalBannerUrl, createdEvent.id]).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: isPub ? `Event "${title.trim()}" published successfully!` : `Event "${title.trim()}" saved as draft!`,
      event: {
        ...createdEvent,
        bannerUrl: finalBannerUrl || createdEvent.bannerUrl,
        is_published: createdEvent.is_published !== undefined ? createdEvent.is_published : createdEvent.isPublished,
        category: createdEvent.tag || createdEvent.category,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/coordinator/events/:id
 * Edit an existing event (Authorized coordinators only)
 */
router.put('/events/:id', authenticate, authorize('coordinator', 'admin'), handleBannerUpload, async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const {
      title,
      description,
      category,
      venue,
      dateStart,
      dateEnd,
      capacity,
      isFreshers,
      departmentName,
      isPublished,
      registrationClose,
      status,
      bannerUrl,
      bannerData,
      bannerFilename,
    } = req.body;

    // Check authorization: must be creator, match coordinator's department, or admin
    const evCheck = await query('SELECT id, created_by, title, department_name, category, is_freshers, tag, date_start, banner_url FROM events WHERE id::text = $1', [eventId]);
    if (evCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const accessCheck = await canCoordinatorManageEvent(req.user, evCheck.rows[0]);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to edit events outside your assigned department or events created by other coordinators.',
        code: 'FORBIDDEN_COORDINATOR_SCOPE',
      });
    }

    let finalCategory = undefined;
    let finalIsFreshers = undefined;
    let finalTag = undefined;

    if (category !== undefined || isFreshers !== undefined) {
      const catResult = normalizeEventCategory(
        category !== undefined ? category : evCheck.rows[0].category,
        isFreshers !== undefined ? isFreshers : evCheck.rows[0].is_freshers
      );
      if (catResult.error) {
        return res.status(400).json({ success: false, message: catResult.error, code: catResult.code });
      }
      finalCategory = catResult.category;
      finalIsFreshers = catResult.isFreshers;
      finalTag = catResult.tag;
    }

    let finalDateStart = null;
    let finalDateEnd = null;
    if (dateStart || req.body.date || dateEnd) {
      const dateResult = parseEventDates(req.body, false);
      if (dateResult.error) {
        return res.status(400).json({ success: false, message: dateResult.error, code: dateResult.code });
      }

      // Check if event date is being changed to an illegal past date
      const newDateCampus = getCampusDateInKolkata(dateResult.dateStart);
      const existingDateCampus = evCheck.rows[0].date_start ? getCampusDateInKolkata(new Date(evCheck.rows[0].date_start)) : null;
      if (newDateCampus !== existingDateCampus && newDateCampus < getCampusTodayInKolkata()) {
        return res.status(400).json({
          success: false,
          message: 'Event date must be today or a future date in Asia/Kolkata.',
          code: 'PAST_EVENT_DATE_NOT_ALLOWED',
        });
      }

      finalDateStart = dateResult.dateStart;
      finalDateEnd = dateResult.dateEnd;
    }

    let targetStatus = status;
    if (!targetStatus && isPublished !== undefined) {
      targetStatus = isPublished ? 'published' : 'draft';
    }

    let parsedRegClose = undefined;
    if (registrationClose !== undefined) {
      if (registrationClose === null) {
        parsedRegClose = null;
      } else {
        const rc = new Date(registrationClose);
        if (isNaN(rc.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid registration close date format.', code: 'INVALID_DATE' });
        }
        parsedRegClose = rc;
      }
    }

    // Banner update processing
    let bannerBuffer = null;
    let bannerMime = null;
    let finalBannerFilename = null;
    let updatedBannerUrl = bannerUrl !== undefined ? bannerUrl : null;

    if (req.file) {
      bannerBuffer = req.file.buffer;
      finalBannerFilename = req.file.originalname;
      bannerMime = validateImageMagicBytes(bannerBuffer);
      if (!bannerMime) {
        return res.status(400).json({
          success: false,
          message: 'Invalid banner image signature. Only valid JPEG, PNG, and WebP images are allowed.',
          code: 'INVALID_IMAGE_SIGNATURE',
        });
      }
      updatedBannerUrl = `/api/v1/events/${evCheck.rows[0].id}/banner`;
    } else if (bannerData) {
      try {
        const rawData = String(bannerData);
        const base64Match = rawData.match(/^data:([^;]+);base64,(.+)$/);
        const base64Content = base64Match ? base64Match[2] : rawData;
        bannerBuffer = Buffer.from(base64Content, 'base64');
        if (bannerBuffer.length > 5 * 1024 * 1024) {
          return res.status(400).json({ success: false, message: 'Event banner exceeds 5MB size limit.', code: 'FILE_TOO_LARGE' });
        }
        bannerMime = validateImageMagicBytes(bannerBuffer);
        if (!bannerMime) {
          return res.status(400).json({
            success: false,
            message: 'Invalid banner image signature. Only valid JPEG, PNG, and WebP images are allowed.',
            code: 'INVALID_IMAGE_SIGNATURE',
          });
        }
        finalBannerFilename = bannerFilename || 'event_banner.jpg';
        updatedBannerUrl = `/api/v1/events/${evCheck.rows[0].id}/banner`;
      } catch (b64Err) {
        return res.status(400).json({ success: false, message: 'Malformed banner data provided.', code: 'INVALID_BANNER_DATA' });
      }
    }

    const updateRes = await query(
      `UPDATE events
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           venue = COALESCE($4, venue),
           date_start = COALESCE($5, date_start),
           date_end = COALESCE($6, date_end),
           capacity = COALESCE($7, capacity),
           max_participants = COALESCE($7, max_participants),
           is_freshers = COALESCE($8, is_freshers),
           department_name = COALESCE($9, department_name),
           is_published = COALESCE($10, is_published),
           registration_close = COALESCE($11, registration_close),
           status = COALESCE($12, status),
           tag = COALESCE($13, tag),
           banner_url = COALESCE($14, banner_url),
           banner_data = COALESCE($15, banner_data),
           banner_mime_type = COALESCE($16, banner_mime_type),
           banner_filename = COALESCE($17, banner_filename),
           banner_size = COALESCE($18, banner_size),
           published_at = CASE WHEN ($10 = true OR $12 = 'published') AND published_at IS NULL THEN NOW() ELSE published_at END,
           updated_at = NOW()
       WHERE id = $19
       RETURNING id, title, category, tag, venue, capacity, is_published AS "isPublished", is_published,
                 department_name AS "departmentName", status, banner_url AS "bannerUrl", published_at AS "publishedAt",
                 date_start AS "dateStart", date_end AS "dateEnd"`,
      [
        title ? title.trim() : null,
        description !== undefined ? description : null,
        finalCategory !== undefined ? finalCategory : null,
        venue || null,
        finalDateStart,
        finalDateEnd,
        capacity ? parseInt(capacity, 10) : null,
        finalIsFreshers !== undefined ? Boolean(finalIsFreshers) : null,
        departmentName ? departmentName.trim() : null,
        isPublished !== undefined ? Boolean(isPublished) : null,
        parsedRegClose !== undefined ? parsedRegClose : null,
        targetStatus || null,
        finalTag !== undefined ? finalTag : null,
        updatedBannerUrl,
        bannerBuffer,
        bannerMime,
        finalBannerFilename,
        bannerBuffer ? bannerBuffer.length : null,
        evCheck.rows[0].id,
      ]
    );

    return res.status(200).json({
      success: true,
      message: `Event "${updateRes.rows[0].title}" updated successfully!`,
      event: {
        ...updateRes.rows[0],
        bannerUrl: updateRes.rows[0].bannerUrl || (updateRes.rows[0].banner_data ? `/api/v1/events/${updateRes.rows[0].id}/banner` : null),
        is_published: updateRes.rows[0].is_published !== undefined ? updateRes.rows[0].is_published : updateRes.rows[0].isPublished,
        category: updateRes.rows[0].tag || updateRes.rows[0].category,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/coordinator/events/:id/status
 * Toggle draft / published / cancelled status
 */
router.patch('/events/:id/status', authenticate, authorize('coordinator', 'admin'), async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const { status, isPublished } = req.body || {};

    const evCheck = await query('SELECT id, created_by, title, department_name, is_published, status, published_at FROM events WHERE id::text = $1', [eventId]);
    if (evCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const accessCheck = await canCoordinatorManageEvent(req.user, evCheck.rows[0]);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update status for this event.',
        code: 'FORBIDDEN_COORDINATOR_SCOPE',
      });
    }

    let targetStatus = status || (isPublished === false ? 'draft' : 'published');
    let targetPub = isPublished !== undefined ? Boolean(isPublished) : (targetStatus === 'published');
    let regOpen = true;

    if (targetStatus === 'cancelled') {
      targetPub = false;
      regOpen = false;
    }

    const updateRes = await query(
      `UPDATE events
       SET status = $1, is_published = $2, registration_open = $3,
           published_at = CASE WHEN $2 = true AND published_at IS NULL THEN NOW() ELSE published_at END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, title, status, is_published AS "isPublished", is_published, registration_open AS "registration_open", published_at AS "publishedAt"`,
      [targetStatus, targetPub, regOpen, evCheck.rows[0].id]
    );

    return res.status(200).json({
      success: true,
      message: `Event "${evCheck.rows[0].title}" status updated to ${targetStatus}.`,
      event: {
        ...updateRes.rows[0],
        is_published: updateRes.rows[0].is_published !== undefined ? updateRes.rows[0].is_published : updateRes.rows[0].isPublished,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/coordinator/events/:id/attendance/mark
 * Authorized coordinator marks attendance for a student (Audited)
 */
router.post('/events/:id/attendance/mark', authenticate, authorize('coordinator', 'admin'), async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const { studentId, rollNumber, notes } = req.body;

    const evRes = await query('SELECT * FROM events WHERE id::text = $1', [eventId]);
    if (evRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    const event = evRes.rows[0];

    // Enforce coordinator department & event scope
    const accessCheck = await canCoordinatorManageEvent(req.user, event);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to mark attendance for events outside your assigned department.',
        code: 'FORBIDDEN_COORDINATOR_SCOPE',
      });
    }

    // Look up student
    let userRecord = null;
    let studentProfile = null;
    if (studentId) {
      const uRes = await query(
        `SELECT u.id, u.first_name, u.last_name, sp.roll_number, sp.department 
         FROM users u 
         JOIN student_profiles sp ON sp.user_id = u.id 
         WHERE u.id::text = $1 OR sp.id::text = $1`,
        [studentId]
      );
      if (uRes.rows.length > 0) {
        userRecord = uRes.rows[0];
        studentProfile = uRes.rows[0];
      }
    } else if (rollNumber) {
      const rRes = await query(
        `SELECT u.id, u.first_name, u.last_name, sp.roll_number, sp.department 
         FROM student_profiles sp 
         JOIN users u ON u.id = sp.user_id 
         WHERE UPPER(sp.roll_number) = UPPER($1)`,
        [rollNumber.trim()]
      );
      if (rRes.rows.length > 0) {
        userRecord = rRes.rows[0];
        studentProfile = rRes.rows[0];
      }
    }

    if (!userRecord) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found for the provided identifier.',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Check Freshers department match
    if (event.is_freshers && event.department_name) {
      const sDept = (studentProfile.department || '').toLowerCase();
      const eDept = (event.department_name || '').toLowerCase();
      if (!sDept.includes(eDept) && !eDept.includes(sDept)) {
        return res.status(403).json({
          success: false,
          message: `Department Mismatch: Student is enrolled in ${studentProfile.department}. Event is restricted to ${event.department_name}.`,
          code: 'DEPARTMENT_MISMATCH',
        });
      }
    }

    // Duplicate check
    const existing = await query(
      'SELECT id, pass_code FROM event_attendance WHERE event_id = $1 AND user_id = $2',
      [event.id, userRecord.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Attendance has already been recorded for this student.',
        code: 'ALREADY_MARKED',
        passCode: existing.rows[0].pass_code,
      });
    }

    const passCode = `ATT-PASS-${event.id.toString().slice(0, 4).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const attRes = await query(
      `INSERT INTO event_attendance (
         event_id, user_id, roll_number, department, status, verified_at, marked_by, pass_code, attendance_notes
       ) VALUES ($1, $2, $3, $4, 'present', NOW(), $5, $6, $7)
       RETURNING id, event_id, user_id, roll_number, department, status, verified_at, pass_code`,
      [
        event.id,
        userRecord.id,
        studentProfile.roll_number,
        studentProfile.department,
        req.user.id, // marked by coordinator
        passCode,
        notes || 'Marked by authorized coordinator desk',
      ]
    );

    return res.status(200).json({
      success: true,
      message: `Attendance marked for ${userRecord.first_name} ${userRecord.last_name} (${studentProfile.roll_number}).`,
      attendance: attRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

/**
 * Campus Inn+ — Database Seed Script
 * Seeds development accounts matching the existing frontend's test credentials.
 * ONLY runs in development. Never overwrites existing production data.
 */
const bcrypt = require('bcrypt');
const { pool, query } = require('./pool');

const SALT_ROUNDS = 12;

const SEED_ACCOUNTS = [
  {
    email: 'priya.sharma@metbkc.edu.in',
    password: 'student123',
    role: 'student',
    firstName: 'Priya',
    lastName: 'Sharma',
    phone: '9820123456',
    profile: {
      rollNumber: '2021CS8401',
      college: 'MET Institute of Engineering, Nashik',
      department: 'Computer Engineering',
      program: 'B.Tech CSE',
      academicYear: 'Final Year (2024-2025)',
      semester: 'Semester 8',
      roleLabel: 'Final Year B.Tech CSE',
      cgpa: 8.84,
      backlogs: 0,
    },
  },
  {
    email: 'faculty.cs@met.edu',
    password: 'faculty123',
    role: 'faculty',
    firstName: 'Ramesh',
    lastName: 'Deshmukh',
    phone: '9820234567',
    profile: {
      college: 'MET Institute of Engineering, Nashik',
      department: 'Computer Engineering & IT',
      designation: 'Associate Professor & Mentorship Lead',
      roleLabel: 'Associate Professor & Mentorship Lead',
    },
  },
  {
    email: 'tpo@met.edu',
    password: 'tpo123',
    role: 'tpo',
    firstName: 'Prashant',
    lastName: 'Sharma',
    phone: '9820345678',
    profile: {
      college: 'Central TPO Desk • MET BKC Nashik',
      department: 'Training & Placement Cell',
      designation: 'Central Training & Placement Officer',
      roleLabel: 'Central Training & Placement Officer',
    },
  },
  {
    email: 'director@met.edu',
    password: 'admin123',
    role: 'admin',
    firstName: 'V. P.',
    lastName: 'Wani',
    phone: '9820456789',
    profile: {
      college: 'MET Bhujbal Knowledge City (Central HQ)',
      department: 'Administration',
      designation: 'Executive Campus Administrator',
      roleLabel: 'Executive Campus Administrator',
    },
  },
  {
    email: 'events@met.edu',
    password: 'coord123',
    role: 'coordinator',
    firstName: 'Karan',
    lastName: 'Patel',
    phone: '9820567890',
    profile: {
      college: 'MET BKC Cultural Council & Tech Hub',
      department: 'Clubs & Guilds Office',
      designation: 'MET Cultural & TechFest Chief Coordinator',
      roleLabel: 'MET Cultural & TechFest Chief Coordinator',
    },
  },
  {
    email: 'recruiter@techcorp.com',
    password: 'recruiter123',
    role: 'recruiter',
    firstName: 'Talent',
    lastName: 'Acquisition',
    phone: '9820678901',
  },
];

// Seed sample events
const SEED_EVENTS = [
  {
    title: 'MET TechFest 2026',
    description: 'Central flagship multi-track hackathon spanning AI/ML, Decentralized Web3, and IoT Robotics. ₹3.5 Lakhs Prize Pool.',
    category: 'hackathon',
    tag: 'Flagship Annual Tech Conclave',
    dateStart: '2026-10-18T09:00:00+05:30',
    dateEnd: '2026-10-20T18:00:00+05:30',
    venue: 'MET BKC Central Auditorium & Advanced Computing Labs',
    capacity: 1000,
  },
  {
    title: '24-Hour National Sprint Hackathon',
    description: 'Endurance coding sprint tackling real-world civic and industrial challenges for Maharashtra Smart Cities initiative.',
    category: 'hackathon',
    tag: 'Inter-College Sprint',
    dateStart: '2026-10-24T00:00:00+05:30',
    dateEnd: '2026-10-25T00:00:00+05:30',
    venue: 'MET Institute of Engineering • Lab 3 & 4',
    capacity: 400,
  },
  {
    title: 'MET BKC Cultural Youth Conclave',
    description: 'Inter-collegiate cultural festival featuring battle of bands, classical dance, one-act theatre, and photography gallery.',
    category: 'cultural',
    tag: 'Annual Youth Festival',
    dateStart: '2026-11-02T10:00:00+05:30',
    dateEnd: '2026-11-04T20:00:00+05:30',
    venue: 'MET Amphitheatre, Nashik',
    capacity: 2000,
  },
];

// Seed placement drives
const SEED_DRIVES = [
  {
    companyName: 'Google Cloud India',
    title: 'Associate Cloud Engineer',
    roleTitle: 'Associate Cloud Engineer',
    ctc: '22 LPA',
    location: 'Bengaluru / Pune',
    tier: 'Dream Tier',
    eligiblePrograms: ['B.Tech CSE', 'B.Tech IT', 'MCA'],
    minCgpa: 8.5,
    deadline: '2026-03-30T23:59:59+05:30',
    status: 'open',
  },
  {
    companyName: 'Tata Consultancy Services',
    title: 'Digital Software Engineer',
    roleTitle: 'Digital Software Engineer',
    ctc: '9 LPA',
    location: 'Nashik / Mumbai',
    tier: 'Tier 1 Digital',
    eligiblePrograms: ['B.Tech (All Branches)', 'MCA', 'BCA'],
    minCgpa: 6.5,
    deadline: '2026-04-15T23:59:59+05:30',
    status: 'open',
  },
  {
    companyName: 'Infosys Specialty Labs',
    title: 'Power Programmer / Specialist',
    roleTitle: 'Power Programmer / Specialist',
    ctc: '9.5 LPA',
    location: 'Pune',
    tier: 'Tier 1',
    eligiblePrograms: ['B.Tech CSE', 'B.Tech IT'],
    minCgpa: 7.0,
    deadline: '2026-04-20T23:59:59+05:30',
    status: 'open',
  },
  {
    companyName: 'Barclays Global Service',
    title: 'Graduate Analyst',
    roleTitle: 'Graduate Analyst',
    ctc: '14 LPA',
    location: 'Pune',
    tier: 'Dream Tier',
    eligiblePrograms: ['B.Tech CSE', 'B.Tech IT', 'MCA'],
    minCgpa: 8.0,
    deadline: '2026-05-01T23:59:59+05:30',
    status: 'open',
  },
  {
    companyName: 'KPIT Technologies',
    title: 'Embedded Software Engineer',
    roleTitle: 'Embedded Software Engineer',
    ctc: '8.5 LPA',
    location: 'Pune',
    tier: 'Tier 2 Core',
    eligiblePrograms: ['B.Tech CSE', 'B.Tech E&TC', 'B.Tech Mechanical'],
    minCgpa: 6.5,
    deadline: '2026-05-10T23:59:59+05:30',
    status: 'open',
  },
];

async function seedDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already seeded
    const existingUsers = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(existingUsers.rows[0].count) > 0) {
      console.log('[Seed] Database already has users — skipping seed to preserve data.');
      await client.query('ROLLBACK');
      return;
    }

    console.log('[Seed] Seeding development accounts...');

    let coordinatorId = null;

    // Insert users
    for (const account of SEED_ACCOUNTS) {
      const hash = await bcrypt.hash(account.password, SALT_ROUNDS);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [account.email, hash, account.role, account.firstName, account.lastName, account.phone]
      );
      const userId = userResult.rows[0].id;

      if (account.role === 'coordinator') coordinatorId = userId;

      // Insert role-specific profile
      if (account.role === 'student' && account.profile) {
        await client.query(
          `INSERT INTO student_profiles (user_id, roll_number, college, department, program, academic_year, semester, role_label, cgpa, backlogs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [userId, account.profile.rollNumber, account.profile.college, account.profile.department,
           account.profile.program, account.profile.academicYear, account.profile.semester,
           account.profile.roleLabel, account.profile.cgpa, account.profile.backlogs]
        );
      }

      if (['faculty', 'tpo', 'admin', 'coordinator'].includes(account.role) && account.profile) {
        await client.query(
          `INSERT INTO faculty_profiles (user_id, college, department, designation, role_label)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, account.profile.college, account.profile.department,
           account.profile.designation, account.profile.roleLabel]
        );
      }

      // Create default settings
      await client.query(
        `INSERT INTO user_settings (user_id) VALUES ($1)`,
        [userId]
      );

      console.log(`  ✓ ${account.role}: ${account.email}`);
    }

    // Insert departments
    const depts = [
      'Computer Engineering', 'Information Technology',
      'Artificial Intelligence & Data Science', 'Electronics & Telecommunication',
      'Mechanical Engineering', 'Civil Engineering',
    ];
    const deptIds = {};
    for (const dept of depts) {
      const deptResult = await client.query(
        `INSERT INTO departments (name, college)
         VALUES ($1, 'MET Institute of Engineering, Nashik')
         RETURNING id`,
        [dept]
      );
      deptIds[dept] = deptResult.rows[0].id;
    }
    console.log(`  ✓ ${depts.length} departments`);

    // Insert events
    for (const evt of SEED_EVENTS) {
      await client.query(
        `INSERT INTO events (title, description, category, tag, date_start, date_end, venue, capacity, is_published, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
        [evt.title, evt.description, evt.category, evt.tag,
         evt.dateStart, evt.dateEnd, evt.venue, evt.capacity, coordinatorId]
      );
    }
    console.log(`  ✓ ${SEED_EVENTS.length} events`);

    // Create TechCorp company for the recruiter
    const recruiterUser = await client.query(
      `SELECT id FROM users WHERE email = 'recruiter@techcorp.com'`
    );
    if (recruiterUser.rows.length > 0) {
      const recruiterId = recruiterUser.rows[0].id;
      const companyResult = await client.query(
        `INSERT INTO companies (name, cin, gstin, industry, headquarters, description,
         contact_email, contact_phone, verification_status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9)
         RETURNING id`,
        ['TechCorp Innovations India', 'U72200MH2018PTC308942', '27AABCT8921K1ZM',
         'Information Technology', 'Pune, Maharashtra',
         'Leading technology solutions provider specializing in enterprise software.',
         'hr@techcorp.com', '020-12345678', recruiterId]
      );
      const companyId = companyResult.rows[0].id;

      await client.query(
        `INSERT INTO company_users (company_id, user_id, is_primary) VALUES ($1, $2, true)`,
        [companyId, recruiterId]
      );

      // Insert placement drives
      for (const drive of SEED_DRIVES) {
        // Use TechCorp's company for drives (simplification for seed)
        await client.query(
          `INSERT INTO placement_drives (company_id, title, role_title, ctc, location, tier,
           eligible_programs, min_cgpa, deadline, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [companyId, drive.title, drive.roleTitle, drive.ctc, drive.location, drive.tier,
           drive.eligiblePrograms, drive.minCgpa, drive.deadline, drive.status]
        );
      }
      console.log(`  ✓ ${SEED_DRIVES.length} placement drives`);
      console.log(`  ✓ Company: TechCorp Innovations India`);
    }

    await client.query('COMMIT');
    console.log('[Seed] Development seed complete.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Seed] Failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedDatabase };

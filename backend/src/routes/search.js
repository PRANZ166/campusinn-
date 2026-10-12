/**
 * Campus Inn+ — Global Campus Search REST API (/api/v1/search)
 * Search events, placement drives, companies, hackathons, and announcements.
 * Role-aware and privacy-safe.
 */
const express = require('express');
const { query } = require('../db/pool');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Fallback search corpus for when DB is offline
const STATIC_SEARCH_CORPUS = [
  // Events & Hackathons
  {
    id: 'evt-1',
    category: 'Events',
    badge: 'Hackathon',
    title: 'HackBKC 2026: 36-Hour National Collegiate Hackathon',
    description: 'Flagship inter-college hackathon across AI/ML, Decentralized Web3, and IoT Robotics. ₹3.5 Lakhs Prize Pool.',
    url: 'events.html#hackathons',
    keywords: 'hackathon hackbkc coding innohack dev competition 36-hour sprint prize',
  },
  {
    id: 'evt-2',
    category: 'Events',
    badge: 'Cultural',
    title: 'MET Utsav 2026: The Cultural & Innovation Renaissance',
    description: 'Annual cultural festival spanning rock bands, theater, classical arts, dance, and fashion showcases.',
    url: 'events.html#utsav',
    keywords: 'utsav festival cultural drama dance music band singing comedy',
  },
  {
    id: 'evt-3',
    category: 'Events',
    badge: 'Technical',
    title: 'NextGen AI & Cloud Symposium (Google Cloud & Gemini)',
    description: 'Hands-on symposium exploring generative AI agent orchestration, cloud architectures, and API tool calling.',
    url: 'events.html#workshops',
    keywords: 'ai artificial intelligence cloud symposium google workshop gemini machine learning',
  },
  {
    id: 'evt-4',
    category: 'Events',
    badge: 'Contest',
    title: 'CodeSprint: 12-Hour Speed Debugging & DSA Marathon',
    description: 'High-intensity algorithmic challenges, code golf, and real-time bug eradication with PPI interview slots.',
    url: 'events.html#competitions',
    keywords: 'codesprint dsa algorithms data structures debugging marathon contest problem',
  },
  {
    id: 'evt-5',
    category: 'Events',
    badge: 'Competition',
    title: 'RoboSoccer & Drone Obstacle Derby (Robotics Club)',
    description: 'Custom-built autonomous & manual RC bots navigating caged obstacle turfs in timed knockout rounds.',
    url: 'events.html#competitions',
    keywords: 'robotics robosoccer drone bots hardware arduino raspi derby',
  },
  {
    id: 'evt-6',
    category: 'Events',
    badge: 'Finance',
    title: 'MET FinBeat: Algo Trading & Equity Pitch',
    description: 'Quantitative modeling challenge on historical Indian equity market ticks with live jury pitch.',
    url: 'events.html#competitions',
    keywords: 'finance finbeat algo trading equity stocks shares investment market',
  },
  {
    id: 'evt-7',
    category: 'Events',
    badge: 'Design',
    title: 'PixelCraft: UI/UX & Web Redesign Sprint',
    description: '6-hour design sprint solving public civic transit interfaces for Nashik Municipal Smart City initiatives.',
    url: 'events.html#competitions',
    keywords: 'pixelcraft design ui ux figma prototype web frontend mobile',
  },

  // Placements & Drives
  {
    id: 'plc-1',
    category: 'Placements',
    badge: 'Tier 1 IT',
    title: 'Tata Consultancy Services (TCS) — Digital & Ninja Roles',
    description: 'Annual flagship placement drive for B.Tech CSE, IT, AI&DS, and MCA. CTC: ₹3.6 - ₹7.2 LPA.',
    url: 'index.html#placements',
    keywords: 'tcs tata consultancy digital ninja drive jobs hiring placement ctc',
  },
  {
    id: 'plc-2',
    category: 'Placements',
    badge: 'FinTech Core',
    title: 'Barclays Global Service Centre — Graduate Analyst',
    description: 'Core banking backend and risk engineering roles. Eligibility: 7.00+ CGPA, No Active Backlogs. CTC: ₹12.5 LPA.',
    url: 'index.html#placements',
    keywords: 'barclays fintech bank analyst placement drive jobs hiring salary ctc',
  },
  {
    id: 'plc-3',
    category: 'Placements',
    badge: 'Enterprise Cloud',
    title: 'LTI Mindtree — Software Engineer (Campus Cohort 2026)',
    description: 'Cloud solutions, DevOps, and Enterprise Java/Python fullstack engineering roles. CTC: ₹5.5 LPA.',
    url: 'index.html#placements',
    keywords: 'lti mindtree software engineer cloud devops placement drive',
  },
  {
    id: 'plc-4',
    category: 'Placements',
    badge: 'Product Tech',
    title: 'Persistent Systems — Associate Software Engineer',
    description: 'High-growth product development roles across Data Engineering, Healthcare Tech, and IoT. CTC: ₹6.5 LPA.',
    url: 'index.html#placements',
    keywords: 'persistent systems data engineering product associate software placement',
  },

  // Corporate Partners & Companies
  {
    id: 'cmp-1',
    category: 'Companies',
    badge: 'Accredited Partner',
    title: 'NVIDIA Corporation — AI Research & Acceleration',
    description: 'GPU computing, AI workstation labs, and student research mentorship partner at MET Bhujbal Knowledge City.',
    url: 'companies.html',
    keywords: 'nvidia partner ai gpu graphics hardware acceleration company',
  },
  {
    id: 'cmp-2',
    category: 'Companies',
    badge: 'Corporate Partner',
    title: 'Infosys Ltd — Systems Engineer & Specialist Programmer',
    description: 'Global leader in next-generation digital services and consulting with dedicated campus recruitment pipeline.',
    url: 'companies.html',
    keywords: 'infosys partner recruiter company tech services consulting',
  },
  {
    id: 'cmp-3',
    category: 'Companies',
    badge: 'Corporate Partner',
    title: 'Cognizant Technology Solutions — GenC & GenC Next',
    description: 'Accredited Tier-1 campus hiring corporate partner with ongoing student upskilling certifications.',
    url: 'companies.html',
    keywords: 'cognizant genc next partner recruiter tech company',
  },

  // Portals & Institutional Desks
  {
    id: 'prt-1',
    category: 'Portals',
    badge: 'Academic Desk',
    title: 'Faculty Mentorship & Academic NOC Desk',
    description: 'Mentee allocations, corporate training NOC approvals, and student performance tracking.',
    url: 'faculty.html',
    keywords: 'faculty portal mentorship noc professor teacher academic mentor',
  },
  {
    id: 'prt-2',
    category: 'Portals',
    badge: 'Placement Suite',
    title: 'Training & Placement Officer (TPO) Suite',
    description: 'Corporate MOU signoffs, placement drive management, and student candidate roster governance.',
    url: 'placement.html',
    keywords: 'tpo placement officer drive student roster mou ats recruiting',
  },
  {
    id: 'prt-3',
    category: 'Portals',
    badge: 'Student Portal',
    title: 'Student Career & Placement Dashboard',
    description: 'Personalized job applications, verified resume profile, and hackathon registration tracker.',
    url: 'student.html',
    keywords: 'student portal profile resume applications jobs attendance my portal',
  },
];

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const rawQuery = (req.query.q || req.query.query || '').trim();
    if (!rawQuery) {
      return res.status(200).json({
        success: true,
        query: '',
        total: 0,
        results: [],
      });
    }

    const qLower = rawQuery.toLowerCase();
    const queryTerms = qLower.split(/\s+/).filter(Boolean);

    let dbResults = [];

    // 1. Try DB search across events, placement_drives, and companies if reachable
    try {
      const searchPattern = `%${rawQuery}%`;

      // Search events
      const eventsRes = await query(
        `SELECT id, title, description, event_type AS badge, 'Events' AS category, 'events.html' AS url
         FROM events
         WHERE LOWER(title) LIKE LOWER($1) OR LOWER(description) LIKE LOWER($1)
         LIMIT 8`,
        [searchPattern]
      );

      // Search placement drives
      const drivesRes = await query(
        `SELECT pd.id, pd.title, pd.description, COALESCE(pd.tier, 'Placement Drive') AS badge, 'Placements' AS category, 'index.html#placements' AS url
         FROM placement_drives pd
         WHERE LOWER(pd.title) LIKE LOWER($1) OR LOWER(COALESCE(pd.description, '')) LIKE LOWER($1)
         LIMIT 8`,
        [searchPattern]
      );

      // Search companies
      const companiesRes = await query(
        `SELECT c.id, c.name AS title, c.description, COALESCE(c.industry, 'Corporate Partner') AS badge, 'Companies' AS category, 'companies.html' AS url
         FROM companies c
         WHERE LOWER(c.name) LIKE LOWER($1) OR LOWER(COALESCE(c.description, '')) LIKE LOWER($1)
         LIMIT 8`,
        [searchPattern]
      );

      dbResults = [
        ...eventsRes.rows,
        ...drivesRes.rows,
        ...companiesRes.rows,
      ];
    } catch (dbErr) {
      // Gracefully fall through to static corpus
    }

    // 2. Combine and score against static corpus for rich matches
    const staticMatches = STATIC_SEARCH_CORPUS.filter(item => {
      const targetText = `${item.title} ${item.description} ${item.keywords} ${item.badge} ${item.category}`.toLowerCase();
      return queryTerms.every(term => targetText.includes(term));
    });

    // Merge and deduplicate by title
    const seenTitles = new Set();
    const finalResults = [];

    // Prioritize DB results first
    for (const r of dbResults) {
      if (!seenTitles.has(r.title.toLowerCase())) {
        seenTitles.add(r.title.toLowerCase());
        finalResults.push({
          id: r.id,
          category: r.category,
          badge: r.badge,
          title: r.title,
          description: r.description || '',
          url: r.url,
        });
      }
    }

    // Append static matches
    for (const r of staticMatches) {
      if (!seenTitles.has(r.title.toLowerCase())) {
        seenTitles.add(r.title.toLowerCase());
        finalResults.push({
          id: r.id,
          category: r.category,
          badge: r.badge,
          title: r.title,
          description: r.description,
          url: r.url,
        });
      }
    }

    // Group results by category for clean UI rendering
    const categories = {};
    for (const item of finalResults) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
    }

    return res.status(200).json({
      success: true,
      query: rawQuery,
      total: finalResults.length,
      results: finalResults,
      categories,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

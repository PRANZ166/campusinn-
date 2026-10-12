/**
 * Campus Inn+ — Development Mock Data Layer
 * STRICT SPECIFICATION:
 * 1. This data is ONLY used in development when real backend API endpoints are unreachable.
 * 2. Every single record is explicitly stamped with _source: 'DEV_MOCK' and _devNotice.
 * 3. Never presented as verified live information without a visible [Dev Mock Data] badge.
 * 4. Institution: MET Bhujbal Knowledge City, Adgaon, Nashik (SPPU Affiliated).
 */

const DevMockData = (() => {
  const NOTICE = 'Simulated Development Record • Not Live Verification Data';

  // 1. Current User Profiles by Role
  const users = {
    student: {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'usr_stu_2021cs8401',
      identifier: 'priya.sharma@metbkc.edu.in',
      role: 'student',
      roleLabel: 'Final Year B.Tech CSE',
      name: 'Priya Sharma',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCmXVRaNKZ7IsmYIvoEhd5rtY52D6qyxHxG9UQO-HWnD4WIbJoZRR1_XtEzONcik6lc_YaPUL8PvKVwp2XZB8btqu76w0MBAUdgCGJE76rhgX67R128gkxkh1yPXHypIHy2iyEMEo2wQny9hJg2KdfkASXPKcy7BuRFg_BqaQ6-AKYleJ6dMfjf7Itd0A9fCi4llgfC2tvBx3FzMyCFO388rWN08ZLoWeXP2o5JVLFEdDRr4AWQJ3k',
      institute: 'MET Institute of Engineering, Nashik',
      department: 'Computer Engineering',
      batch: '2021-2025',
      cgpa: 8.84,
      backlogs: 0,
      atsScore: 92,
      appliedCount: 4,
      shortlistedCount: 2,
      eligibleDrivesCount: 12
    },
    faculty: {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'usr_fac_eng_042',
      identifier: 'r.deshmukh@metbkc.edu.in',
      role: 'faculty',
      roleLabel: 'Associate Professor & Mentorship Lead',
      name: 'Prof. R. Deshmukh',
      avatar: null,
      institute: 'MET Institute of Engineering, Nashik',
      department: 'Computer Engineering & IT',
      assignedMenteesCount: 64,
      pendingNocCount: 3,
      avgAttendance: '88.5%'
    },
    admin: {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'usr_adm_bkc_001',
      identifier: 'admin@metbkc.edu.in',
      role: 'admin',
      roleLabel: 'Executive Campus Administrator',
      name: 'Dr. V. P. Wani',
      avatar: null,
      institute: 'MET Bhujbal Knowledge City (Central HQ)',
      totalStudentsEnrolled: 4820,
      verifiedRecruitersCount: 142,
      activeDrivesCount: 28,
      societiesCount: 32
    },
    tpo: {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'usr_tpo_central_01',
      identifier: 'tpo@metbkc.edu.in',
      role: 'tpo',
      roleLabel: 'Central Training & Placement Officer',
      name: 'Dr. P. Sharma',
      avatar: null,
      institute: 'Central TPO Desk • MET BKC Nashik',
      pendingVettingCount: 6,
      clearedDrivesCount: 14,
      verifiedTalentPool: 4820,
      confirmedSlotsCount: 8
    },
    coordinator: {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'usr_coord_tech_09',
      identifier: 'karan.patel@metbkc.edu.in',
      role: 'coordinator',
      roleLabel: 'MET Cultural & TechFest Chief Coordinator',
      name: 'Karan Patel',
      avatar: null,
      institute: 'MET BKC Cultural Council & Tech Hub',
      flagshipEventsCount: 4,
      totalGuildMembersCount: 1015,
      hackathonTeamsCount: 86
    },
    recruiter: {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'usr_rec_tc_88',
      identifier: 'talent@techcorp.in',
      role: 'recruiter',
      roleLabel: 'Campus Talent Acquisition Partner',
      name: 'TechCorp HR Team',
      avatar: null,
      companyName: 'TechCorp Innovations India',
      cin: 'U72200MH2018PTC308942',
      gstin: '27AABCT8921K1ZM',
      verificationStatus: 'Verified Partner',
      totalApplicantsReceived: 428,
      shortlistedCount: 84,
      offersExtendedCount: 14
    }
  };

  // 2. Active Campus Recruitment Drives
  const placementDrives = [
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'drv_phpe_2025',
      company: 'PhonePe',
      tier: 'Tier 1 Dream Offer',
      title: 'Associate Software Engineer (Platform)',
      ctc: '₹14.00 LPA',
      location: 'Bengaluru / Pune',
      eligiblePrograms: ['B.Tech CSE', 'B.Tech IT', 'MCA'],
      minCgpa: 8.0,
      status: 'Interview Slotted',
      interviewSlot: 'Tomorrow, 10:30 AM (Tech Round 1)',
      isApplied: true,
      currentStep: 4,
      totalSteps: 4
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'drv_goog_2025',
      company: 'Google Cloud',
      tier: 'Tier 1 Dream Offer',
      title: 'Cloud Support Associate',
      ctc: '₹14.50 LPA + ₹2.0L Bonus',
      location: 'Hyderabad / Bengaluru',
      eligiblePrograms: ['B.Tech CSE', 'B.Tech IT', 'MCA'],
      minCgpa: 8.5,
      status: 'Open for Applications',
      deadline: '24 Oct 2025',
      isApplied: false,
      currentStep: 1,
      totalSteps: 4
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'drv_zomt_2025',
      company: 'Zomato Ltd',
      tier: 'Tier 1',
      title: 'Software Development Engineer - 1',
      ctc: '₹12.00 LPA',
      location: 'Gurgaon / Remote',
      eligiblePrograms: ['B.Tech CSE', 'B.Tech IT', 'BCA', 'MCA'],
      minCgpa: 7.5,
      status: 'Closes Tomorrow',
      deadline: 'Tomorrow 5 PM',
      isApplied: false,
      currentStep: 1,
      totalSteps: 4
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'drv_tcs_2025',
      company: 'TCS Digital',
      tier: 'Mass Tech',
      title: 'Systems Engineer (Full Stack)',
      ctc: '₹7.50 LPA',
      location: 'Pan India Centers',
      eligiblePrograms: ['B.Tech (All Branches)', 'MCA', 'BCA', 'BBA'],
      minCgpa: 6.5,
      status: 'Online Assessment Slotted',
      deadline: '28 Oct 2025',
      isApplied: true,
      currentStep: 3,
      totalSteps: 4
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'drv_del_2025',
      company: 'Deloitte India',
      tier: 'Consulting & Tech',
      title: 'Associate Technology Consultant',
      ctc: '₹7.50 LPA – ₹9.20 LPA',
      location: 'Pune / Mumbai / Bengaluru',
      eligiblePrograms: ['BBA', 'BCA', 'MCA', 'B.Tech Comp/IT'],
      minCgpa: 6.5,
      status: 'Audit Clearance Stage',
      deadline: '30 Oct 2025',
      isApplied: false,
      currentStep: 1,
      totalSteps: 4
    }
  ];

  // 3. Corporate Vetting Queue (TPO Portal)
  const vettingQueue = [
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'vet_tcs_01',
      company: 'Tata Consultancy Services (TCS)',
      cin: 'L22210MH1995PLC084781',
      status: 'CIN/PAN Verified',
      requestedPools: 'B.Tech (Comp/IT), MCA, BCA',
      actionRequired: 'Signoff MOU Standard 3-Year Tenure',
      priority: 'Urgent'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'vet_infy_02',
      company: 'Infosys Limited',
      cin: 'GSTIN 27AAACI4045L1ZO',
      status: 'Under Officer Review',
      requestedPools: 'BE Computer, BE IT, MCA',
      actionRequired: 'Approve Placement Drive Dates',
      priority: 'Standard'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'vet_hdfc_03',
      company: 'HDFC Bank Corporate',
      cin: 'BFSI Sector Reg: MH092384',
      status: 'Pending Policy Acceptance',
      requestedPools: 'MBA & BBA 2026 Batch',
      actionRequired: 'Dispatch One-Student-One-Offer policy re-sign',
      priority: 'Attention'
    }
  ];

  // 4. Campus Events & Hackathons
  const events = [
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'evt_techfest_2026',
      title: 'MET TechFest 2026',
      tag: 'Flagship Annual Tech Conclave',
      category: 'Hackathons',
      date: '18–20 Oct 2026',
      venue: 'MET BKC Central Auditorium & Advanced Computing Labs',
      description: 'Central flagship multi-track hackathon spanning AI/ML, Decentralized Web3, and IoT Robotics. ₹3.5 Lakhs Prize Pool.',
      isRsvp: false,
      registeredCount: 840
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'evt_hack_24hr',
      title: '24-Hour National Sprint Hackathon',
      tag: 'Inter-College Sprint',
      category: 'Hackathons',
      date: '24 Oct 2026',
      venue: 'MET Institute of Engineering • Lab 3 & 4',
      description: 'Endurance coding sprint tackling real-world civic and industrial challenges for Maharashtra Smart Cities initiative.',
      isRsvp: true,
      registeredCount: 320
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'evt_youth_fest',
      title: 'MET BKC Cultural Youth Conclave',
      tag: 'Annual Youth Festival',
      category: 'Cultural',
      date: '02–04 Nov 2026',
      venue: 'MET Amphitheatre, Nashik',
      description: 'Inter-collegiate cultural festival featuring battle of bands, classical dance, one-act theatre, and photography gallery.',
      isRsvp: false,
      registeredCount: 1200
    }
  ];

  // 5. Faculty Mentees Roster
  const facultyMentees = [
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'men_01',
      name: 'Priya Sharma',
      roll: '2021CS8401',
      program: 'BE Computer Engineering',
      attendance: '92%',
      cgpa: 8.84,
      driveName: 'PhonePe Tech Round 1',
      scheduledDate: 'Tomorrow, 10:30 AM',
      nocStatus: 'Pending Review',
      capstoneProject: 'Distributed Fault-Tolerant Cache Engine'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'men_02',
      name: 'Amit Verma',
      roll: '2021IT8422',
      program: 'BE Information Technology',
      attendance: '86%',
      cgpa: 8.12,
      driveName: 'Zomato Ltd Hackathon Drive',
      scheduledDate: 'Friday, 2:00 PM',
      nocStatus: 'Pending Review',
      capstoneProject: 'Microservices Mesh for Campus Logistics'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'men_03',
      name: 'Neha Kulkarni',
      roll: '2021CS8419',
      program: 'BE Computer Engineering',
      attendance: '89%',
      cgpa: 8.45,
      driveName: 'Google Cloud Support Assessment',
      scheduledDate: '24 Oct 2025, 11:00 AM',
      nocStatus: 'Approved',
      capstoneProject: 'AI Automated Code Review Assistant'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'men_04',
      name: 'Rohan Mehta',
      roll: '2021CS8435',
      program: 'BE Computer Engineering',
      attendance: '94%',
      cgpa: 9.15,
      driveName: 'Microsoft IDC Trainee Drive',
      scheduledDate: '26 Oct 2025, 10:00 AM',
      nocStatus: 'Approved',
      capstoneProject: 'Edge AI Drone Vision Processing'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'men_05',
      name: 'Tanvi Patil',
      roll: '2021IT8408',
      program: 'BE Information Technology',
      attendance: '88%',
      cgpa: 7.95,
      driveName: 'Deloitte India Assessment',
      scheduledDate: '30 Oct 2025, 1:30 PM',
      nocStatus: 'Approved',
      capstoneProject: 'SPPU Blockchain Academic Credential Ledger'
    }
  ];

  // 6. Recruiter Candidate Applications Roster (ATS)
  const recruiterCandidates = [
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'cand_01',
      name: 'Priya Sharma',
      roll: '2021CS8401',
      program: 'BE Computer Engineering',
      cgpa: 8.84,
      backlogs: 0,
      skills: ['Python', 'PostgreSQL', 'Docker', 'Kubernetes'],
      appliedRole: 'Backend Systems Developer',
      atsMatch: '96%',
      testScore: '94 / 100',
      status: 'Interview Slotted',
      interviewSlot: 'Tomorrow 10:30 AM (Lab 2)',
      resumeUrl: '#'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'cand_02',
      name: 'Rohan Mehta',
      roll: '2021CS8435',
      program: 'BE Computer Engineering',
      cgpa: 9.15,
      backlogs: 0,
      skills: ['C++', 'System Design', 'Linux Kernel', 'gRPC'],
      appliedRole: 'Backend Systems Developer',
      atsMatch: '98%',
      testScore: '98 / 100',
      status: 'Interview Slotted',
      interviewSlot: 'Tomorrow 2:00 PM (Lab 2)',
      resumeUrl: '#'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'cand_03',
      name: 'Neha Kulkarni',
      roll: '2021CS8419',
      program: 'BE Computer Engineering',
      cgpa: 8.45,
      backlogs: 0,
      skills: ['Python', 'AWS', 'FastAPI', 'Redis'],
      appliedRole: 'Cloud Support Trainee',
      atsMatch: '92%',
      testScore: '89 / 100',
      status: 'Shortlisted',
      interviewSlot: 'Slot Pending',
      resumeUrl: '#'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'cand_04',
      name: 'Amit Verma',
      roll: '2021IT8422',
      program: 'BE Information Technology',
      cgpa: 8.12,
      backlogs: 0,
      skills: ['Node.js', 'React', 'MongoDB', 'GraphQL'],
      appliedRole: 'Full Stack Engineer',
      atsMatch: '88%',
      testScore: '85 / 100',
      status: 'Shortlisted',
      interviewSlot: 'Slot Pending',
      resumeUrl: '#'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'cand_05',
      name: 'Aditya Joshi',
      roll: '2021CS8440',
      program: 'BE Computer Engineering',
      cgpa: 8.65,
      backlogs: 0,
      skills: ['Go', 'Kubernetes', 'Microservices', 'Kafka'],
      appliedRole: 'Backend Systems Developer',
      atsMatch: '94%',
      testScore: '92 / 100',
      status: 'Offer Extended',
      interviewSlot: 'Completed',
      resumeUrl: '#'
    }
  ];

  // 7. Coordinator Hackathon Teams Queue
  const hackathonTeams = [
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'team_01',
      teamName: 'ByteForce AI',
      leadStudent: 'Priya Sharma (BE Comp)',
      membersCount: 4,
      track: 'AI/ML & Intelligent Automation',
      problemStatement: 'Automated Crop Disease Diagnosis for Maharashtra Agro Ecosystem',
      assignedLab: 'Lab 3 (Terminal A1-A4)',
      checkinStatus: 'Confirmed',
      approvalStatus: 'Approved'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'team_02',
      teamName: 'NeuralSpartans',
      leadStudent: 'Rohan Mehta (BE Comp)',
      membersCount: 4,
      track: 'Decentralized Web3 & Fintech',
      problemStatement: 'Zero-Knowledge Credential Verifier for SPPU Degree Registry',
      assignedLab: 'Lab 3 (Terminal B1-B4)',
      checkinStatus: 'Confirmed',
      approvalStatus: 'Approved'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'team_03',
      teamName: 'CyberKnights',
      leadStudent: 'Amit Verma (BE IT)',
      membersCount: 3,
      track: 'Smart City & Civic IoT',
      problemStatement: 'Dynamic Public Bus Fleet Optimization for Nashik Municipal Corp',
      assignedLab: 'Lab 4 (Terminal C1-C3)',
      checkinStatus: 'Awaiting Check-in',
      approvalStatus: 'Pending Verification'
    },
    {
      _source: 'DEV_MOCK',
      _devNotice: NOTICE,
      id: 'team_04',
      teamName: 'RoboVanguard',
      leadStudent: 'Tanvi Patil (BE IT)',
      membersCount: 4,
      track: 'Autonomous Robotics & Drones',
      problemStatement: 'Warehouse Payload Delivery Robotics with LiDAR SLAM',
      assignedLab: 'Lab 4 (Terminal D1-D4)',
      checkinStatus: 'Awaiting Check-in',
      approvalStatus: 'Pending Verification'
    }
  ];

  return {
    NOTICE,
    users,
    placementDrives,
    vettingQueue,
    events,
    facultyMentees,
    recruiterCandidates,
    hackathonTeams
  };
})();

if (typeof window !== 'undefined') {
  window.CampusInnDevMock = DevMockData;
}

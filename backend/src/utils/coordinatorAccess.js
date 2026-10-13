/**
 * Campus Inn+ — Coordinator Scope & Department Authorization Utility
 * Enforces coordinator department scoping and event ownership across
 * events, registrations, attendance records, and photos.
 */
const { query } = require('../db/pool');

function normalizeDept(dept) {
  if (!dept) return '';
  return dept.trim().toLowerCase();
}

function departmentsMatch(deptA, deptB) {
  const a = normalizeDept(deptA);
  const b = normalizeDept(deptB);
  if (!a || !b) return false;
  if (a === b) return true;

  // Computer / IT overlap matching
  const isCompA = a.includes('comp') || a.includes('information technology') || a.includes('it');
  const isCompB = b.includes('comp') || b.includes('information technology') || b.includes('it');
  if (isCompA && isCompB) return true;

  // Management (MBA / BBA)
  const isMgmtA = a.includes('management') || a.includes('mba') || a.includes('bba');
  const isMgmtB = b.includes('management') || b.includes('mba') || b.includes('bba');
  if (isMgmtA && isMgmtB) return true;

  // Computer Applications (MCA / BCA)
  const isCaA = a.includes('application') || a.includes('mca') || a.includes('bca');
  const isCaB = b.includes('application') || b.includes('mca') || b.includes('bca');
  if (isCaA && isCaB) return true;

  // Pharmacy
  const isPharmA = a.includes('pharm');
  const isPharmB = b.includes('pharm');
  if (isPharmA && isPharmB) return true;

  return false;
}

/**
 * Fetch coordinator profile for given user
 */
async function getCoordinatorProfile(userId) {
  try {
    const res = await query(
      'SELECT id, user_id, department, club_name, role_label FROM coordinator_profiles WHERE user_id = $1',
      [userId]
    );
    return res.rows[0] || null;
  } catch (err) {
    return null;
  }
}

/**
 * Check whether a coordinator or admin can manage an event
 * Returns { allowed: boolean, reason: string, profile: object|null }
 */
async function canCoordinatorManageEvent(user, event) {
  if (!user) return { allowed: false, reason: 'UNAUTHENTICATED' };
  if (user.role === 'admin') return { allowed: true, reason: 'ADMIN' };

  if (user.role !== 'coordinator') {
    return { allowed: false, reason: 'NOT_COORDINATOR' };
  }

  // 1. Creator check
  if (event && event.created_by && String(event.created_by) === String(user.id)) {
    return { allowed: true, reason: 'EVENT_CREATOR' };
  }

  // 2. General / Institution-wide event (no department restriction)
  if (!event || !event.department_name || event.department_name === 'General' || event.department_name === 'All') {
    return { allowed: true, reason: 'GENERAL_EVENT' };
  }

  // 3. Department check against coordinator profile
  const profile = await getCoordinatorProfile(user.id);
  if (profile && profile.department && event && event.department_name) {
    if (departmentsMatch(profile.department, event.department_name)) {
      return { allowed: true, reason: 'DEPARTMENT_MATCH', profile };
    }
  }

  return {
    allowed: false,
    reason: 'FORBIDDEN_COORDINATOR_SCOPE',
    profile,
  };
}

module.exports = {
  normalizeDept,
  departmentsMatch,
  getCoordinatorProfile,
  canCoordinatorManageEvent,
};

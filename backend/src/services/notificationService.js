/**
 * Campus Inn+ — Centralized Notification Service
 * Handles persistent notifications, multi-recipient dispatch, duplicate suppression,
 * and administrative alerting across institutional workflows.
 */
const { query } = require('../db/pool');

/**
 * Create a persistent notification for a specific user with deduplication window
 * @param {string} userId - Target user UUID
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {string} type - 'info' | 'success' | 'warning' | 'error' | 'event' | 'placement' | 'academic'
 * @param {string|null} link - Relative target URL (e.g., 'admin.html#pending')
 * @param {number} dedupeWindowMinutes - Skip if matching title already sent within this time (default: 60 mins)
 */
async function createNotification(userId, title, message, type = 'info', link = null, dedupeWindowMinutes = 60) {
  try {
    if (!userId || !title) return null;

    // Deduplication check: prevent duplicate notifications within dedupeWindowMinutes
    if (dedupeWindowMinutes > 0) {
      try {
        const dupCheck = await query(
          `SELECT id, created_at
           FROM notifications
           WHERE user_id = $1 AND title = $2
             AND created_at > (NOW() - ($3 || ' minutes')::INTERVAL)
           LIMIT 1`,
          [userId, title, String(dedupeWindowMinutes)]
        );
        if (dupCheck.rows.length > 0) {
          return dupCheck.rows[0];
        }
      } catch (checkErr) {
        // Fall through to insert if interval check encounters dialect difference
      }
    }

    const res = await query(
      `INSERT INTO notifications (user_id, title, message, type, link, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())
       RETURNING id, user_id, title, message, type, is_read AS "isRead", link, created_at AS "createdAt"`,
      [userId, title, message, type, link]
    );

    return res.rows[0] || null;
  } catch (err) {
    console.warn('[NotificationService] Warning: Could not create notification:', err.message);
    return null;
  }
}

/**
 * Dispatch an administrative notification to all active College Administrators
 * @param {string} title - Notification title
 * @param {string} message - Notification details
 * @param {string} type - Notification category
 * @param {string|null} link - Action link
 * @param {number} dedupeWindowMinutes - Deduplication threshold
 */
async function notifyAllAdmins(title, message, type = 'info', link = 'admin.html#pending', dedupeWindowMinutes = 60) {
  try {
    const adminRes = await query(
      `SELECT id, email, first_name, last_name
       FROM users
       WHERE role = 'admin' AND status = 'active'`
    );

    if (adminRes.rows.length === 0) {
      console.warn('[NotificationService] No active admins found to notify.');
      return [];
    }

    const dispatched = [];
    for (const admin of adminRes.rows) {
      const notif = await createNotification(
        admin.id,
        title,
        message,
        type,
        link,
        dedupeWindowMinutes
      );
      if (notif) dispatched.push(notif);
    }

    return dispatched;
  } catch (err) {
    console.warn('[NotificationService] Failed to notify admins:', err.message);
    return [];
  }
}

/**
 * Dispatch a notification to all active users belonging to a specific institutional role
 */
async function notifyRole(role, title, message, type = 'info', link = null, dedupeWindowMinutes = 60) {
  try {
    const usersRes = await query(
      `SELECT id FROM users WHERE role = $1 AND status = 'active'`,
      [role]
    );

    const dispatched = [];
    for (const u of usersRes.rows) {
      const notif = await createNotification(u.id, title, message, type, link, dedupeWindowMinutes);
      if (notif) dispatched.push(notif);
    }
    return dispatched;
  } catch (err) {
    console.warn(`[NotificationService] Failed to notify role ${role}:`, err.message);
    return [];
  }
}

module.exports = {
  createNotification,
  notifyAllAdmins,
  notifyRole,
};

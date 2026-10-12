/**
 * Campus Inn+ — Notifications Center REST API (/api/v1/notifications)
 * Role-aware, persisted in PostgreSQL database, strictly isolated per authenticated user.
 */
const express = require('express');
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Role-aware seed notifications generator for newly provisioned or empty accounts
 */
function getDefaultNotificationsForRole(role, firstName) {
  const name = firstName || 'Campus Member';
  switch (role) {
    case 'student':
      return [
        {
          title: 'Campus InnoHack 2026 Registration Open',
          message: 'Flagship 36-hour hackathon registrations are now live. Form your team roster before seats fill up.',
          type: 'event',
          link: 'events.html#hackathons',
        },
        {
          title: 'TCS NQT National Placement Drive',
          message: 'TCS has opened registrations for 2026 batch candidates. Minimum CGPA: 6.50. Apply via Placement portal.',
          type: 'placement',
          link: 'index.html#placements',
        },
        {
          title: `Welcome to Campus Inn+, ${name}!`,
          message: 'Your institutional account has been successfully initialized. Access your course calendar and mentors.',
          type: 'info',
          link: 'student.html',
        },
      ];
    case 'faculty':
      return [
        {
          title: 'Pending Placement NOC Requests',
          message: 'Final year engineering mentees have submitted NOC requests for semester 8 corporate internships.',
          type: 'academic',
          link: 'faculty.html#mentorship',
        },
        {
          title: 'SPPU Exam Cell Internal Review',
          message: 'Continuous assessment marks submission deadline is approaching for upcoming university exams.',
          type: 'info',
          link: 'faculty.html',
        },
      ];
    case 'tpo':
      return [
        {
          title: 'Corporate Partner MOUs Awaiting Signoff',
          message: '3 enterprise recruiter registrations pending placement cell audit and verification.',
          type: 'placement',
          link: 'placement.html',
        },
        {
          title: 'Tier-1 Hiring Grid Finalized',
          message: 'Technical interview schedules slots updated for upcoming campus placement rounds.',
          type: 'info',
          link: 'placement.html#interviews',
        },
      ];
    case 'coordinator':
      return [
        {
          title: 'Hackathon Team Vetting Queue',
          message: 'New hackathon team registrations submitted for InnoHack 2026. Review and issue lab allocations.',
          type: 'event',
          link: 'coordinator.html#hackathons',
        },
        {
          title: 'MET Utsav 2026 Cultural Registrations',
          message: 'Inter-department stage and event coordinator roster initialized.',
          type: 'info',
          link: 'events.html',
        },
      ];
    case 'recruiter':
      return [
        {
          title: 'Candidate Applications Received',
          message: 'Verified student applicants have applied to your active hiring requirements.',
          type: 'placement',
          link: 'company.html#candidates',
        },
        {
          title: 'Interview Slot Schedule Confirmed',
          message: 'Campus placement technical rounds slotted for candidate batch interviews.',
          type: 'info',
          link: 'company.html#interviews',
        },
      ];
    default:
      return [
        {
          title: `Welcome to Campus Inn+, ${name}!`,
          message: 'All institutional modules and campus ecosystem nodes are operational.',
          type: 'info',
          link: 'index.html',
        },
      ];
  }
}

/**
 * GET /api/v1/notifications
 * Returns list of notifications and unread count for current user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    let notifications = [];

    try {
      const result = await query(
        `SELECT id, user_id, title, message, type, is_read AS "isRead", link, created_at AS "createdAt"
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 40`,
        [userId]
      );
      notifications = result.rows;

      // If user has zero notifications in DB, seed their role defaults
      if (notifications.length === 0) {
        const defaults = getDefaultNotificationsForRole(req.user.role, req.user.firstName);
        for (const item of defaults) {
          const insertRes = await query(
            `INSERT INTO notifications (user_id, title, message, type, link, is_read)
             VALUES ($1, $2, $3, $4, $5, false)
             RETURNING id, user_id, title, message, type, is_read AS "isRead", link, created_at AS "createdAt"`,
            [userId, item.title, item.message, item.type, item.link]
          );
          if (insertRes.rows.length > 0) {
            notifications.push(insertRes.rows[0]);
          }
        }
      }
    } catch (dbErr) {
      // In offline / fallback mode, provide in-memory role defaults
      notifications = getDefaultNotificationsForRole(req.user.role, req.user.firstName).map((n, i) => ({
        id: `temp-notif-${i}`,
        userId,
        ...n,
        isRead: false,
        createdAt: new Date().toISOString(),
      }));
    }

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read (strictly owned by authenticated user)
 */
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.id;

    try {
      const result = await query(
        `UPDATE notifications
         SET is_read = true
         WHERE id::text = $1 AND user_id = $2
         RETURNING id, user_id, title, message, type, is_read AS "isRead", link, created_at AS "createdAt"`,
        [notificationId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found or access denied.',
        });
      }

      return res.status(200).json({
        success: true,
        notification: result.rows[0],
      });
    } catch (dbErr) {
      return res.status(200).json({
        success: true,
        notification: { id: notificationId, isRead: true },
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications as read for authenticated user
 */
const markAllReadHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    let count = 0;

    try {
      const result = await query(
        `UPDATE notifications
         SET is_read = true
         WHERE user_id = $1 AND is_read = false
         RETURNING id`,
        [userId]
      );
      count = result.rowCount || result.rows.length;
    } catch (dbErr) {
      count = 0;
    }

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      count,
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/read-all', authenticate, markAllReadHandler);
router.post('/read-all', authenticate, markAllReadHandler);

module.exports = router;

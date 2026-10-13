/**
 * Campus Inn+ — Secure First-Admin Bootstrap CLI Script
 * 
 * Safely provisions the initial College Admin account for Campus Inn+.
 * This is strictly a one-time bootstrap operation restricted to an authorized operator.
 * Once any administrator account exists in the database, subsequent executions are permanently rejected.
 * 
 * Usage:
 *   node scripts/bootstrap_admin.js --email admin@example.com --password StrongPassword123 --name "Campus Administrator"
 * Or via environment variables:
 *   ADMIN_BOOTSTRAP_EMAIL=admin@example.com ADMIN_BOOTSTRAP_PASSWORD=StrongPassword123 ADMIN_BOOTSTRAP_NAME="Admin" node scripts/bootstrap_admin.js
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const validator = require('validator');
const { pool, transaction } = require('../src/db/pool');

const SALT_ROUNDS = 12;

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const nextVal = args[i + 1];
      if (nextVal && !nextVal.startsWith('--')) {
        parsed[key] = nextVal;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

async function bootstrapAdmin() {
  const args = parseArgs();
  const email = (args.email || process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = args.password || process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
  const fullName = (args.name || process.env.ADMIN_BOOTSTRAP_NAME || 'College Administrator').trim();

  console.log('[Bootstrap] Initiating secure initial College Admin provisioning check...');

  if (!email || !validator.isEmail(email)) {
    console.error('[Bootstrap] ERROR: A valid email address is required. Use --email <email> or ADMIN_BOOTSTRAP_EMAIL.');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('[Bootstrap] ERROR: Password must be at least 8 characters long. Use --password <password> or ADMIN_BOOTSTRAP_PASSWORD.');
    process.exit(1);
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    console.error('[Bootstrap] ERROR: Password must contain at least one letter and one number.');
    process.exit(1);
  }

  try {
    const result = await transaction(async (client) => {
      // 1. One-Time Guarantee: Verify whether any administrator already exists
      const existingAdmin = await client.query(
        "SELECT id, email, created_at FROM users WHERE role = 'admin' LIMIT 1"
      );

      if (existingAdmin.rows.length > 0) {
        return {
          aborted: true,
          reason: 'ADMIN_ALREADY_EXISTS',
          existingEmail: existingAdmin.rows[0].email,
        };
      }

      // 2. Parse name
      const parts = fullName.split(/\s+/);
      const firstName = parts[0] || 'College';
      const lastName = parts.slice(1).join(' ') || 'Administrator';

      const username = (args.username || process.env.ADMIN_BOOTSTRAP_USERNAME || email.split('@')[0]).trim().toLowerCase();

      // 3. Hash password securely
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // 4. Insert College Admin account
      const userRes = await client.query(
        `INSERT INTO users (
           email, username, password_hash, role, status, first_name, last_name, token_version, created_at, updated_at
         ) VALUES ($1, $2, $3, 'admin', 'active', $4, $5, 1, NOW(), NOW())
         RETURNING id, email, username, role, status, first_name, last_name, created_at`,
        [email, username, passwordHash, firstName, lastName]
      );

      const newAdmin = userRes.rows[0];

      // 5. Initialize user settings
      await client.query(
        'INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [newAdmin.id]
      ).catch(() => {});

      // 6. Record audit log
      await client.query(
        `INSERT INTO audit_log (action, entity_type, entity_id, details, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          'ADMIN_BOOTSTRAP_COMPLETED',
          'users',
          newAdmin.id,
          JSON.stringify({
            adminId: newAdmin.id,
            email: newAdmin.email,
            username: newAdmin.username,
            note: 'Initial primary administrator established via bootstrap CLI.'
          })
        ]
      ).catch(() => {});

      return {
        aborted: false,
        admin: newAdmin,
      };
    });

    if (result.aborted) {
      console.warn(`[Bootstrap] ABORTED: An administrator account already exists (${result.existingEmail}).`);
      console.warn('[Bootstrap] Initial bootstrap is permanently disabled once an administrator exists.');
      console.warn('[Bootstrap] Subsequent administrator accounts must be provisioned through the authorized administrator console.');
      process.exit(1);
    }

    console.log('[Bootstrap] SUCCESS: Initial College Admin provisioned successfully!');
    console.log('[Bootstrap] Account ID:', result.admin.id);
    console.log('[Bootstrap] Email:     ', result.admin.email);
    console.log('[Bootstrap] Role:      ', result.admin.role);
    console.log('[Bootstrap] Status:    ', result.admin.status);
    console.log('[Bootstrap] Name:      ', `${result.admin.first_name} ${result.admin.last_name}`);
    console.log('[Bootstrap] The application owner can now authenticate securely at /login.html.');

    process.exit(0);
  } catch (err) {
    console.error('[Bootstrap] Unexpected failure during administrator provisioning:', err.message);
    process.exit(1);
  } finally {
    if (pool && typeof pool.end === 'function') {
      await pool.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  bootstrapAdmin();
}

module.exports = { bootstrapAdmin };

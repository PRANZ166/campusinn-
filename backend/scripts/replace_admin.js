/**
 * Campus Inn+ — Secure Administrator Replacement & Emergency Recovery CLI
 * 
 * Implements the complete two-phase administrator replacement procedure:
 * 1. Inspect existing College Admin and Placement Officer accounts (without exposing secrets).
 * 2. Provision new administrator with email, username identifier, and strong password.
 * 3. Verify that the new administrator credentials work.
 * 4. Explicitly confirm replacement: revokes previous administrator access,
 *    invalidates their active sessions, ensures at least one usable admin remains.
 * 
 * Usage:
 *   # 1. Inspect current administrators:
 *   node scripts/replace_admin.js --inspect
 * 
 *   # 2. Provision new administrator (Phase 1):
 *   node scripts/replace_admin.js --step initiate --email newadmin@campusinn.edu --username admin_central --password StrongPassword123 --name "Executive Administrator"
 * 
 *   # 3. Verify new administrator credentials (Phase 2):
 *   node scripts/replace_admin.js --step verify --identifier newadmin@campusinn.edu --password StrongPassword123
 * 
 *   # 4. Confirm replacement & revoke previous admin (Phase 3):
 *   node scripts/replace_admin.js --step confirm --new-admin newadmin@campusinn.edu --prev-admin oldadmin@example.com
 * 
 *   # 5. Full safe replacement in one guided execution:
 *   node scripts/replace_admin.js --replace --email newadmin@campusinn.edu --username admin_central --password StrongPassword123 --name "New Admin"
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const validator = require('validator');
const { pool, transaction, query } = require('../src/db/pool');

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

async function inspectAdmins() {
  console.log('\n[Inspection] Querying active administrative accounts in database...');
  try {
    const adminRes = await query(
      `SELECT id, email, username, role, status, first_name, last_name, token_version, created_at, last_login
       FROM users
       WHERE role = 'admin'
       ORDER BY created_at ASC`
    );

    const tpoRes = await query(
      `SELECT id, email, username, role, status, first_name, last_name, created_at
       FROM users
       WHERE role = 'tpo'
       ORDER BY created_at ASC`
    );

    console.log(`\nFound ${adminRes.rows.length} College Admin account(s):`);
    adminRes.rows.forEach((a, idx) => {
      console.log(`  ${idx + 1}. [${a.status.toUpperCase()}] ${a.first_name} ${a.last_name}`);
      console.log(`     ID:            ${a.id}`);
      console.log(`     Email:         ${a.email}`);
      console.log(`     Username:      ${a.username || '(none)'}`);
      console.log(`     Token Version: ${a.token_version || 1}`);
      console.log(`     Created:       ${a.created_at}`);
    });

    console.log(`\nFound ${tpoRes.rows.length} Placement Officer (TPO) account(s):`);
    tpoRes.rows.forEach((t, idx) => {
      console.log(`  ${idx + 1}. [${t.status.toUpperCase()}] ${t.first_name} ${t.last_name} (${t.email}) [ID: ${t.id}]`);
    });

    return { admins: adminRes.rows, placementOfficers: tpoRes.rows };
  } catch (err) {
    console.error('[Inspection] Database query failed:', err.message);
    throw err;
  }
}

async function initiateReplacement(args) {
  const email = (args.email || process.env.ADMIN_NEW_EMAIL || '').trim().toLowerCase();
  const username = (args.username || process.env.ADMIN_NEW_USERNAME || '').trim().toLowerCase();
  const password = args.password || process.env.ADMIN_NEW_PASSWORD || '';
  const fullName = (args.name || process.env.ADMIN_NEW_NAME || 'Executive Administrator').trim();

  console.log('\n[Phase 1] Initiating controlled server-side provisioning of replacement administrator...');

  if (!email || !validator.isEmail(email)) {
    console.error('[Error] A valid email address is required (--email <email>).');
    process.exit(1);
  }

  if (!username || username.length < 3) {
    console.error('[Error] A unique account identifier/username (min 3 chars) is required (--username <identifier>).');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('[Error] Password must be at least 8 characters long (--password <password>).');
    process.exit(1);
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    console.error('[Error] Password must contain at least one letter and one number.');
    process.exit(1);
  }

  const result = await transaction(async (client) => {
    // Check if conflicting active admin exists
    const dupCheck = await client.query(
      "SELECT id, email FROM users WHERE role = 'admin' AND (LOWER(email) = $1 OR LOWER(username) = $2)",
      [email, username]
    );

    if (dupCheck.rows.length > 0) {
      return { aborted: true, conflicting: dupCheck.rows[0].email };
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || 'Executive';
    const lastName = parts.slice(1).join(' ') || 'Administrator';

    const userRes = await client.query(
      `INSERT INTO users (
         email, username, password_hash, role, status, first_name, last_name, token_version, created_at, updated_at
       ) VALUES ($1, $2, $3, 'admin', 'active', $4, $5, 1, NOW(), NOW())
       RETURNING id, email, username, role, status, first_name, last_name, created_at`,
      [email, username, passwordHash, firstName, lastName]
    );

    const newAdmin = userRes.rows[0];

    await client.query(
      'INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [newAdmin.id]
    ).catch(() => {});

    // Record in audit log
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES ($1, 'ADMIN_REPLACEMENT_INITIATED', 'users', $2, $3, '127.0.0.1', NOW())`,
      [newAdmin.id, newAdmin.id, JSON.stringify({ email, username, action: 'Provisioned via CLI operator' })]
    ).catch(() => {});

    return { aborted: false, admin: newAdmin };
  });

  if (result.aborted) {
    console.warn(`[Warning] An administrator with email/username "${result.conflicting}" already exists.`);
    return null;
  }

  console.log('[SUCCESS] New administrator account provisioned successfully!');
  console.log('  Account ID: ', result.admin.id);
  console.log('  Email:      ', result.admin.email);
  console.log('  Username:   ', result.admin.username);
  console.log('  Role:       ', result.admin.role);
  console.log('  Status:     ', result.admin.status);
  console.log('  Name:       ', `${result.admin.first_name} ${result.admin.last_name}`);
  console.log('\n[NOTICE] Existing administrator access remains active until replacement is explicitly confirmed.');
  return result.admin;
}

async function verifyCredentials(identifier, password) {
  console.log(`\n[Phase 2] Verifying authentication credentials for identifier: "${identifier}"...`);
  const cleanId = (identifier || '').trim().toLowerCase();

  const userRes = await query(
    `SELECT id, email, username, password_hash, role, status, first_name, last_name
     FROM users
     WHERE (LOWER(email) = $1 OR LOWER(username) = $1) AND role = 'admin'`,
    [cleanId]
  );

  if (userRes.rows.length === 0) {
    console.error('[FAIL] No administrator account found matching identifier.');
    return false;
  }

  const user = userRes.rows[0];
  if (user.status !== 'active') {
    console.error(`[FAIL] Account status is ${user.status}. Account is not active.`);
    return false;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    console.error('[FAIL] Password verification failed. Incorrect password.');
    return false;
  }

  console.log('[PASS] Administrator credentials verified successfully!');
  console.log(`  Authenticated Account: ${user.first_name} ${user.last_name} (${user.email})`);
  return true;
}

async function confirmReplacement(newAdminIdentifier, prevAdminIdentifier) {
  console.log('\n[Phase 3] Confirming replacement and revoking previous administrator access...');

  // 1. Resolve new admin
  const newRes = await query(
    `SELECT id, email, username, role, status FROM users
     WHERE (id::text = $1 OR LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)) AND role = 'admin'`,
    [newAdminIdentifier]
  );

  if (newRes.rows.length === 0 || newRes.rows[0].status !== 'active') {
    console.error('[Error] New replacement administrator account does not exist or is not active.');
    return false;
  }

  const newAdmin = newRes.rows[0];

  // 2. Resolve previous admin to revoke
  let prevRes;
  if (prevAdminIdentifier) {
    prevRes = await query(
      `SELECT id, email, username, role, status FROM users
       WHERE (id::text = $1 OR LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)) AND role = 'admin'`,
      [prevAdminIdentifier]
    );
  } else {
    prevRes = await query(
      `SELECT id, email, username, role, status FROM users
       WHERE role = 'admin' AND id != $1 AND status = 'active'
       ORDER BY created_at ASC LIMIT 1`,
      [newAdmin.id]
    );
  }

  if (prevRes.rows.length === 0) {
    console.warn('[Notice] No previous active administrator account found to revoke.');
    return true;
  }

  const prevAdmin = prevRes.rows[0];

  if (prevAdmin.id === newAdmin.id) {
    console.error('[Error] Cannot revoke the new replacement administrator account itself.');
    return false;
  }

  // 3. Safety Invariant: Check remaining active admins
  const remainingRes = await query(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active' AND id != $1",
    [prevAdmin.id]
  );
  const remainingCount = parseInt(remainingRes.rows[0].count, 10);
  if (remainingCount < 1) {
    console.error('[ABORTED] Cannot revoke privileges: Application must retain at least one usable administrator.');
    return false;
  }

  // 4. Revoke access and invalidate sessions
  await query(
    `UPDATE users
     SET status = 'suspended', token_version = token_version + 1, updated_at = NOW()
     WHERE id = $1`,
    [prevAdmin.id]
  );

  await query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, ip_address, created_at)
     VALUES ($1, 'ADMIN_REPLACEMENT_CONFIRMED', 'users', $2, $3, '127.0.0.1', NOW())`,
    [
      newAdmin.id,
      newAdmin.id,
      JSON.stringify({
        revokedAdminId: prevAdmin.id,
        revokedAdminEmail: prevAdmin.email,
        newAdminId: newAdmin.id,
        newAdminEmail: newAdmin.email,
        action: 'Previous administrator revoked and sessions invalidated via CLI operator',
      }),
    ]
  ).catch(() => {});

  console.log('[SUCCESS] Administrator replacement confirmed successfully!');
  console.log(`  Active Administrator:   ${newAdmin.email} [ID: ${newAdmin.id}]`);
  console.log(`  Revoked Administrator:  ${prevAdmin.email} [ID: ${prevAdmin.id}] (Status: SUSPENDED)`);
  console.log('  Session Invalidation:   Previous administrator active tokens invalidated (token_version incremented).');
  console.log(`  Remaining Usable Admins: ${remainingCount}`);
  return true;
}

async function main() {
  const args = parseArgs();

  console.log('===============================================================');
  console.log('CAMPUS INN+ — SECURE ADMINISTRATOR REPLACEMENT UTILITY');
  console.log('===============================================================');

  try {
    if (args.inspect) {
      await inspectAdmins();
      process.exit(0);
    }

    if (args.step === 'initiate') {
      const admin = await initiateReplacement(args);
      process.exit(admin ? 0 : 1);
    }

    if (args.step === 'verify') {
      const ok = await verifyCredentials(args.identifier || args.email || args.username, args.password);
      process.exit(ok ? 0 : 1);
    }

    if (args.step === 'confirm') {
      const ok = await confirmReplacement(args['new-admin'], args['prev-admin']);
      process.exit(ok ? 0 : 1);
    }

    if (args.replace || args.email) {
      // Full guided sequence
      await inspectAdmins();
      const newAdmin = await initiateReplacement(args);
      if (!newAdmin) {
        process.exit(1);
      }
      const verified = await verifyCredentials(newAdmin.email, args.password);
      if (!verified) {
        console.error('[Error] Verification failed. Aborting replacement confirmation.');
        process.exit(1);
      }
      const confirmed = await confirmReplacement(newAdmin.id, args['prev-admin']);
      process.exit(confirmed ? 0 : 1);
    }

    // Default: Inspect
    await inspectAdmins();
    console.log('\nUsage hints:');
    console.log('  node scripts/replace_admin.js --replace --email <new_email> --username <username> --password <strong_password>');
    console.log('  node scripts/replace_admin.js --inspect');
    process.exit(0);
  } catch (err) {
    console.error('\n[Fatal Error]:', err.message);
    process.exit(1);
  } finally {
    if (pool && typeof pool.end === 'function') {
      await pool.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  inspectAdmins,
  initiateReplacement,
  verifyCredentials,
  confirmReplacement,
};

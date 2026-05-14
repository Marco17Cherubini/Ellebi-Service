const { getRawDatabase, saveDatabase } = require('./database');

const RETENTION_PERIODS = Object.freeze({
  registeredMonths: 24,
  guestMonths: 12,
  depositsMonths: 24,
  fiscalMonths: 120,
  logsMonths: 6,
  resetTokenHours: 1,
  schedulerHours: 24
});

function readRows(query, params) {
  const db = getRawDatabase();
  const statement = db.prepare(query, params || []);
  const rows = [];

  while (statement.step()) {
    rows.push(statement.getAsObject());
  }

  statement.free();
  return rows;
}

function readScalar(query, params) {
  const row = readRows(query, params)[0];
  if (!row) return 0;
  const firstKey = Object.keys(row)[0];
  return Number(row[firstKey]) || 0;
}

function runCleanupStatement(query, params) {
  const db = getRawDatabase();
  db.run(query, params || []);
  return readScalar('SELECT changes() AS changes');
}

function buildThresholds(referenceDate) {
  const isoNow = (referenceDate || new Date()).toISOString();
  return {
    registered: `-${RETENTION_PERIODS.registeredMonths} months`,
    guest: `-${RETENTION_PERIODS.guestMonths} months`,
    deposits: `-${RETENTION_PERIODS.depositsMonths} months`,
    fiscal: `-${RETENTION_PERIODS.fiscalMonths} months`,
    logs: `-${RETENTION_PERIODS.logsMonths} months`,
    nowIso: isoNow
  };
}

function collectPreview(referenceDate) {
  const thresholds = buildThresholds(referenceDate);

  return {
    staleGuestBookings: readScalar(
      `SELECT COUNT(*) AS count
       FROM bookings b
       LEFT JOIN deposits d ON d.booking_id = b.id OR d.id = b.deposit_id
       WHERE date(COALESCE(NULLIF(b.giorno, ''), substr(COALESCE(b.created_at, '1970-01-01 00:00:00'), 1, 10))) < date('now', ?)
         AND COALESCE(NULLIF(b.email, ''), '') <> ''
         AND d.id IS NULL
         AND EXISTS (
           SELECT 1
           FROM users u
           WHERE lower(u.email) = lower(b.email)
             AND CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 1
         )`,
      [thresholds.guest]
    ),
    staleRegisteredBookings: readScalar(
      `SELECT COUNT(*) AS count
       FROM bookings b
       LEFT JOIN deposits d ON d.booking_id = b.id OR d.id = b.deposit_id
       WHERE date(COALESCE(NULLIF(b.giorno, ''), substr(COALESCE(b.created_at, '1970-01-01 00:00:00'), 1, 10))) < date('now', ?)
         AND COALESCE(NULLIF(b.email, ''), '') <> ''
         AND d.id IS NULL
         AND EXISTS (
           SELECT 1
           FROM users u
           WHERE lower(u.email) = lower(b.email)
             AND CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 0
         )`,
      [thresholds.registered]
    ),
    staleDeposits: readScalar(
      `SELECT COUNT(*) AS count
       FROM deposits d
       WHERE datetime(COALESCE(NULLIF(d.completed_at, ''), d.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)` ,
      [thresholds.deposits]
    ),
    staleGuestUsers: readScalar(
      `SELECT COUNT(*) AS count
       FROM users u
       WHERE CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 1
         AND datetime(COALESCE(NULLIF(u.last_active_at, ''), u.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE lower(b.email) = lower(u.email))
         AND NOT EXISTS (SELECT 1 FROM deposits d WHERE lower(d.email) = lower(u.email))`,
      [thresholds.guest]
    ),
    staleRegisteredUsers: readScalar(
      `SELECT COUNT(*) AS count
       FROM users u
       WHERE CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 0
         AND datetime(COALESCE(NULLIF(u.last_active_at, ''), u.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
         AND NOT EXISTS (
           SELECT 1
           FROM bookings b
           WHERE lower(b.email) = lower(u.email)
             AND date(COALESCE(NULLIF(b.giorno, ''), substr(COALESCE(b.created_at, '1970-01-01 00:00:00'), 1, 10))) >= date('now', ?)
         )
         AND NOT EXISTS (
           SELECT 1
           FROM deposits d
           WHERE lower(d.email) = lower(u.email)
             AND datetime(COALESCE(NULLIF(d.completed_at, ''), d.created_at, '1970-01-01 00:00:00')) >= datetime('now', ?)
         )
         AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE CAST(v.user_id AS TEXT) = CAST(u.id AS TEXT))`,
      [thresholds.registered, thresholds.registered, thresholds.deposits]
    ),
    staleVehicles: readScalar(
      `SELECT COUNT(*) AS count
       FROM vehicles v
       LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(v.user_id AS TEXT)
       WHERE datetime(COALESCE(v.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
         AND (
           u.id IS NULL
           OR datetime(COALESCE(NULLIF(u.last_active_at, ''), u.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
         )`,
      [thresholds.registered, thresholds.registered]
    ),
    notes: {
      fiscalMonths: RETENTION_PERIODS.fiscalMonths,
      logsMonths: RETENTION_PERIODS.logsMonths,
      resetTokenHours: RETENTION_PERIODS.resetTokenHours,
      fiscalStorageManagedInApp: false,
      applicationLogsManagedInApp: false
    }
  };
}

function executeRetentionCleanup(options) {
  const dryRun = !options || options.dryRun !== false;
  const preview = collectPreview(options && options.referenceDate);

  if (dryRun) {
    return {
      dryRun: true,
      preview,
      retention: RETENTION_PERIODS
    };
  }

  const db = getRawDatabase();
  const thresholds = buildThresholds(options && options.referenceDate);
  const result = {
    dryRun: false,
    preview,
    deleted: {
      bookingsGuest: 0,
      bookingsRegistered: 0,
      deposits: 0,
      bookingsLinkedToDeposits: 0,
      guestUsers: 0,
      registeredUsers: 0,
      vehicles: 0
    },
    retention: RETENTION_PERIODS
  };

  db.run('BEGIN TRANSACTION');

  try {
    result.deleted.bookingsGuest = runCleanupStatement(
      `DELETE FROM bookings
       WHERE id IN (
         SELECT b.id
         FROM bookings b
         LEFT JOIN deposits d ON d.booking_id = b.id OR d.id = b.deposit_id
         WHERE date(COALESCE(NULLIF(b.giorno, ''), substr(COALESCE(b.created_at, '1970-01-01 00:00:00'), 1, 10))) < date('now', ?)
           AND d.id IS NULL
           AND EXISTS (
             SELECT 1
             FROM users u
             WHERE lower(u.email) = lower(b.email)
               AND CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 1
           )
       )`,
      [thresholds.guest]
    );

    result.deleted.bookingsRegistered = runCleanupStatement(
      `DELETE FROM bookings
       WHERE id IN (
         SELECT b.id
         FROM bookings b
         LEFT JOIN deposits d ON d.booking_id = b.id OR d.id = b.deposit_id
         WHERE date(COALESCE(NULLIF(b.giorno, ''), substr(COALESCE(b.created_at, '1970-01-01 00:00:00'), 1, 10))) < date('now', ?)
           AND d.id IS NULL
           AND EXISTS (
             SELECT 1
             FROM users u
             WHERE lower(u.email) = lower(b.email)
               AND CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 0
           )
       )`,
      [thresholds.registered]
    );

    result.deleted.bookingsLinkedToDeposits = runCleanupStatement(
      `DELETE FROM bookings
       WHERE id IN (
         SELECT b.id
         FROM bookings b
         WHERE EXISTS (
           SELECT 1
           FROM deposits d
           WHERE datetime(COALESCE(NULLIF(d.completed_at, ''), d.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
             AND (CAST(d.booking_id AS TEXT) = CAST(b.id AS TEXT) OR CAST(d.id AS TEXT) = CAST(b.deposit_id AS TEXT))
         )
       )`,
      [thresholds.deposits]
    );

    result.deleted.deposits = runCleanupStatement(
      `DELETE FROM deposits
       WHERE datetime(COALESCE(NULLIF(completed_at, ''), created_at, '1970-01-01 00:00:00')) < datetime('now', ?)`,
      [thresholds.deposits]
    );

    result.deleted.vehicles = runCleanupStatement(
      `DELETE FROM vehicles
       WHERE id IN (
         SELECT v.id
         FROM vehicles v
         LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(v.user_id AS TEXT)
         WHERE datetime(COALESCE(v.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
           AND (
             u.id IS NULL
             OR (
               CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 0
               AND datetime(COALESCE(NULLIF(u.last_active_at, ''), u.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
               AND NOT EXISTS (
                 SELECT 1 FROM bookings b
                 WHERE lower(b.email) = lower(u.email)
                   AND date(COALESCE(NULLIF(b.giorno, ''), substr(COALESCE(b.created_at, '1970-01-01 00:00:00'), 1, 10))) >= date('now', ?)
               )
               AND NOT EXISTS (
                 SELECT 1 FROM deposits d
                 WHERE lower(d.email) = lower(u.email)
                   AND datetime(COALESCE(NULLIF(d.completed_at, ''), d.created_at, '1970-01-01 00:00:00')) >= datetime('now', ?)
               )
             )
           )
       )`,
      [thresholds.registered, thresholds.registered, thresholds.registered, thresholds.deposits]
    );

    result.deleted.guestUsers = runCleanupStatement(
      `DELETE FROM users
       WHERE id IN (
         SELECT u.id
         FROM users u
         WHERE CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 1
           AND datetime(COALESCE(NULLIF(u.last_active_at, ''), u.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
           AND NOT EXISTS (SELECT 1 FROM bookings b WHERE lower(b.email) = lower(u.email))
           AND NOT EXISTS (SELECT 1 FROM deposits d WHERE lower(d.email) = lower(u.email))
       )`,
      [thresholds.guest]
    );

    result.deleted.registeredUsers = runCleanupStatement(
      `DELETE FROM users
       WHERE id IN (
         SELECT u.id
         FROM users u
         WHERE CAST(COALESCE(u.isGuest, 0) AS INTEGER) = 0
           AND datetime(COALESCE(NULLIF(u.last_active_at, ''), u.created_at, '1970-01-01 00:00:00')) < datetime('now', ?)
           AND NOT EXISTS (
             SELECT 1
             FROM bookings b
             WHERE lower(b.email) = lower(u.email)
               AND date(COALESCE(NULLIF(b.giorno, ''), substr(COALESCE(b.created_at, '1970-01-01 00:00:00'), 1, 10))) >= date('now', ?)
           )
           AND NOT EXISTS (
             SELECT 1
             FROM deposits d
             WHERE lower(d.email) = lower(u.email)
               AND datetime(COALESCE(NULLIF(d.completed_at, ''), d.created_at, '1970-01-01 00:00:00')) >= datetime('now', ?)
           )
           AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE CAST(v.user_id AS TEXT) = CAST(u.id AS TEXT))
       )`,
      [thresholds.registered, thresholds.registered, thresholds.deposits]
    );

    db.run('COMMIT');
    saveDatabase();

    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function startRetentionScheduler(options) {
  const intervalMs = ((options && options.intervalMs) || (RETENTION_PERIODS.schedulerHours * 60 * 60 * 1000));

  try {
    const initial = executeRetentionCleanup({ dryRun: false });
    console.log('[Retention] Cleanup iniziale completato:', JSON.stringify(initial.deleted));
  } catch (error) {
    console.error('[Retention] Errore cleanup iniziale:', error.message);
  }

  const timer = setInterval(function () {
    try {
      const run = executeRetentionCleanup({ dryRun: false });
      console.log('[Retention] Cleanup schedulato completato:', JSON.stringify(run.deleted));
    } catch (error) {
      console.error('[Retention] Errore cleanup schedulato:', error.message);
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

if (require.main === module) {
  const { initDatabase } = require('./database');
  const apply = process.argv.includes('--apply');

  initDatabase()
    .then(function () {
      const report = executeRetentionCleanup({ dryRun: !apply });
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch(function (error) {
      console.error('[Retention] Errore esecuzione CLI:', error);
      process.exit(1);
    });
}

module.exports = {
  RETENTION_PERIODS,
  executeRetentionCleanup,
  startRetentionScheduler
};
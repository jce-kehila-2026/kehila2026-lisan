'use strict';

/**
 * Fire-and-forget persistence of ops events.
 *
 * Contract: nothing exported here ever throws or rejects. A failed ops write
 * must never fail or slow a student request — callers do not await it.
 */

const {
  EVENT_TTL_DAYS,
  buildDailyUpdate,
  buildEvent,
  buildUserUpdate,
  dayKey,
  getTimezone,
  userAlias,
} = require('./opsModel');
const { logger } = require('../../lib/logger');

let firebaseOverride = null;

/** Test hook: inject { db, admin } instead of requiring config/firebase. */
function setFirebaseForTests(value) {
  firebaseOverride = value;
  activityMarks.clear();
}

function getFirebase() {
  if (firebaseOverride) return firebaseOverride;
  // Lazy: avoids initialising Firebase when the module is only imported.
  return require('../../config/firebase');
}

function isDisabled(env = process.env) {
  return String(env.OPS_TRACKING_DISABLED || '').trim().toLowerCase() === 'true';
}

/** Start one write; sync throws and async rejections both become a warning. */
function safeWrite(what, fn) {
  try {
    return Promise.resolve(fn()).catch((err) => warn(err, what));
  } catch (err) {
    warn(err, what);
    return Promise.resolve();
  }
}

function warn(err, what) {
  try {
    logger.warn({ event: 'ops_write_failed', what, error: err?.message || String(err) }, 'ops_write_failed');
  } catch (_) {
    /* never throw */
  }
}

/**
 * Persist one event (opsEvents doc + opsDaily counters + opsUsers marker).
 * Returns a promise that always resolves (to the built event, or null).
 */
function recordOpsEvent(raw, { now = new Date() } = {}) {
  if (isDisabled()) return Promise.resolve(null);
  try {
    const { db, admin } = getFirebase();
    const FieldValue = admin.firestore.FieldValue;
    const event = buildEvent(raw, { now });
    const inc = (n) => FieldValue.increment(n);
    const ts = now;
    const expireAt = new Date(now.getTime() + EVENT_TTL_DAYS * 24 * 3600 * 1000);

    const dailyUpdate = buildDailyUpdate(event, { inc, ts });
    const userUpdate = buildUserUpdate(event, { inc, ts });
    const writes = [
      safeWrite('opsEvents', () => db.collection('opsEvents').add({ ...event, ts, expireAt })),
      safeWrite('opsDaily', () =>
        db.collection('opsDaily').doc(event.day).set(dailyUpdate, { merge: true })),
    ];
    if (userUpdate) {
      writes.push(safeWrite('opsUsers', () =>
        db.collection('opsUsers').doc(event.userAlias).set(userUpdate, { merge: true })));
      rememberActivity(event.userAlias, now);
    }

    return Promise.all(writes)
      .then(() => event)
      .catch((err) => {
        warn(err, 'all');
        return null;
      });
  } catch (err) {
    warn(err, 'build');
    return Promise.resolve(null);
  }
}

// ── Lightweight activity marker for non-AI requests ────────────────────────
// Writes at most once per user per 15 min per instance, so browsing the app
// costs ~2 writes per active user per quarter hour instead of one per request.
const ACTIVITY_THROTTLE_MS = 15 * 60 * 1000;
const activityMarks = new Map(); // alias -> { at, day }

function rememberActivity(alias, now) {
  activityMarks.set(alias, { at: now.getTime(), day: dayKey(now, getTimezone()) });
  if (activityMarks.size > 5000) {
    const oldest = activityMarks.keys().next().value;
    activityMarks.delete(oldest);
  }
}

function markActivity({ uid, role }, { now = new Date() } = {}) {
  if (isDisabled() || !uid) return Promise.resolve(false);
  try {
    const alias = userAlias(uid);
    const day = dayKey(now, getTimezone());
    const prev = activityMarks.get(alias);
    if (prev && prev.day === day && now.getTime() - prev.at < ACTIVITY_THROTTLE_MS) {
      return Promise.resolve(false);
    }
    rememberActivity(alias, now);

    const { db } = getFirebase();
    const writes = [
      safeWrite('activity_daily', () => db.collection('opsDaily').doc(day).set(
        { day, updatedAt: now, activeUsers: { [alias]: role || 'unknown' } },
        { merge: true }
      )),
      safeWrite('activity_user', () => db.collection('opsUsers').doc(alias).set(
        { alias, role: role || null, lastActiveAt: now, lastSeenAt: now },
        { merge: true }
      )),
    ];
    return Promise.all(writes)
      .then(() => true)
      .catch(() => false);
  } catch (err) {
    warn(err, 'activity_build');
    return Promise.resolve(false);
  }
}

module.exports = {
  ACTIVITY_THROTTLE_MS,
  markActivity,
  recordOpsEvent,
  setFirebaseForTests,
};

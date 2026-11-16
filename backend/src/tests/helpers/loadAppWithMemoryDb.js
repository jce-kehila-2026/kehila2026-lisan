'use strict';

/**
 * Loads the Express app with an in-memory Firestore/Firebase Auth mock and an
 * optional axios mock. No network or real Firebase access.
 */
const path = require('node:path');

const srcRoot = path.resolve(__dirname, '..', '..');

function clearSrcCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(srcRoot) && !key.includes(`${path.sep}tests${path.sep}`)) {
      delete require.cache[key];
    }
  }
}

function createMemoryDb() {
  const collections = new Map();
  let autoId = 1;

  const getCol = (name) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };

  const snapshotOf = (entries) => {
    const docs = entries.map(([id, data]) => ({ id, exists: true, data: () => ({ ...data }) }));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  };

  const query = (name, filters = [], limitN = null) => ({
    where(field, op, value) {
      return query(name, [...filters, [field, op, value]], limitN);
    },
    orderBy() {
      return query(name, filters, limitN);
    },
    limit(n) {
      return query(name, filters, n);
    },
    async get() {
      let entries = Array.from(getCol(name).entries()).filter(([, data]) =>
        filters.every(([field, op, value]) => (op === '==' ? data[field] === value : true))
      );
      if (limitN !== null) entries = entries.slice(0, limitN);
      return snapshotOf(entries);
    },
  });

  const docRef = (name, id) => ({
    id,
    async get() {
      const data = getCol(name).get(id);
      return { id, exists: Boolean(data), data: () => (data ? { ...data } : undefined) };
    },
    async set(data, opts = {}) {
      const prev = opts.merge ? getCol(name).get(id) || {} : {};
      getCol(name).set(id, { ...prev, ...data });
    },
    async update(data) {
      getCol(name).set(id, { ...(getCol(name).get(id) || {}), ...data });
    },
    async delete() {
      getCol(name).delete(id);
    },
  });

  const db = {
    collection(name) {
      return {
        ...query(name),
        doc(id) {
          return docRef(name, id || `auto-${autoId++}`);
        },
        async add(data) {
          const id = `auto-${autoId++}`;
          getCol(name).set(id, { ...data });
          return { id };
        },
      };
    },
    batch() {
      const ops = [];
      return {
        set(ref, data, opts) { ops.push(() => ref.set(data, opts)); },
        update(ref, data) { ops.push(() => ref.update(data)); },
        async commit() { for (const op of ops) await op(); },
      };
    },
    _collections: collections,
    seed(name, id, data) {
      getCol(name).set(id, { ...data });
    },
  };

  return db;
}

function loadAppWithMemoryDb({ axiosMock, env = {} } = {}) {
  clearSrcCache();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  const db = createMemoryDb();
  const authCalls = [];
  let uidCounter = 1;

  const FieldValue = {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    arrayUnion: (...items) => items,
    increment: (n) => n,
  };
  const firestoreFn = Object.assign(() => db, { FieldValue });

  const admin = {
    apps: [true],
    firestore: firestoreFn,
    auth: () => ({
      async createUser(payload) {
        authCalls.push(['createUser', payload]);
        return { uid: `uid-${uidCounter++}` };
      },
      async updateUser(uid, payload) {
        authCalls.push(['updateUser', uid, payload]);
        return { uid };
      },
      async deleteUser(uid) {
        authCalls.push(['deleteUser', uid]);
      },
    }),
  };

  require.cache[require.resolve('firebase-admin')] = { exports: admin };
  const firebaseConfigPath = path.join(srcRoot, 'config', 'firebase.js');
  require.cache[firebaseConfigPath] = {
    id: firebaseConfigPath,
    filename: firebaseConfigPath,
    loaded: true,
    exports: { admin, db, bucket: {} },
  };

  const axiosPath = require.resolve('axios');
  const realAxios = require.cache[axiosPath];
  require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: axiosMock || {
      get: async () => ({ status: 200, data: {} }),
      post: async () => ({ status: 200, data: {} }),
    },
  };

  const { app } = require('../../server');

  // Restore axios so other suites are unaffected.
  if (realAxios) require.cache[axiosPath] = realAxios;
  else delete require.cache[axiosPath];

  return { app, db, authCalls };
}

function signToken(payload) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-jwt-secret');
}

module.exports = { loadAppWithMemoryDb, signToken };

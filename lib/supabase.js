'use strict';

const LEGACY_DB_DISABLED = Object.freeze({
  message: 'Legacy Supabase database is disconnected. Use a migrated question shard.',
  code: 'LEGACY_DB_DISABLED',
});

function resultFor(state) {
  if (state.mode === 'write') {
    return {
      data: null,
      error: { ...LEGACY_DB_DISABLED },
      count: null,
    };
  }

  return {
    data: state.single || state.head ? null : [],
    error: null,
    count: 0,
  };
}

function createQuery(state = { mode: 'read', single: false, head: false }) {
  let proxy;

  proxy = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) =>
          Promise.resolve(resultFor(state)).then(resolve, reject);
      }

      if (property === 'catch') {
        return reject =>
          Promise.resolve(resultFor(state)).catch(reject);
      }

      if (property === 'finally') {
        return handler =>
          Promise.resolve(resultFor(state)).finally(handler);
      }

      if (property === 'insert'
          || property === 'update'
          || property === 'upsert'
          || property === 'delete') {
        return () => createQuery({
          mode: 'write',
          single: false,
          head: false,
        });
      }

      if (property === 'select') {
        return (_columns, options = {}) => createQuery({
          mode: state.mode,
          single: state.single,
          head: Boolean(options && options.head),
        });
      }

      if (property === 'maybeSingle' || property === 'single') {
        return () => createQuery({
          mode: state.mode,
          single: true,
          head: state.head,
        });
      }

      // eq/in/order/range/limit/ilike/etc. remain chainable without network I/O.
      return () => proxy;
    },
  });

  return proxy;
}

module.exports = Object.freeze({
  from() {
    return createQuery();
  },
});

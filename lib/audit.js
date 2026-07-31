'use strict';
const supabase = require('./supabase');

/**
 * Write one entry to the audit_log table.
 *
 * @param {object} opts
 * @param {string}  opts.userId       — UUID of the acting user
 * @param {string}  opts.userName     — Display name snapshot (in case user is later deleted)
 * @param {string}  opts.action       — e.g. 'LOGIN', 'CREATE_QUESTION', 'DELETE_USER'
 * @param {string}  [opts.resourceType] — e.g. 'question', 'user', 'auth', 'settings'
 * @param {string}  [opts.resourceId]   — UUID / id of the affected record
 * @param {object}  [opts.details]      — Any additional context (stored as JSONB)
 */
async function writeAuditLog({ userId, userName, action, resourceType, resourceId, details } = {}) {
  try {
    await supabase.from('audit_log').insert({
      user_id:       userId       || null,
      user_name:     userName     || '',
      action:        action       || 'UNKNOWN',
      resource_type: resourceType || null,
      resource_id:   resourceId   ? String(resourceId) : null,
      details:       details      || {},
    });
  } catch (err) {
    // Never let audit failures crash the main request
    console.error('[audit] write failed:', err.message);
  }
}

module.exports = { writeAuditLog };

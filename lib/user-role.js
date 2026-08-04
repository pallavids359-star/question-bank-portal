'use strict';

// Compatibility encoding for databases whose role constraint only allows
// admin, adder and viewer. Editors are stored as viewer with a subject marker,
// then exposed to the application as a normal editor role.
const EDITOR_SUBJECT_PREFIX = '__EDITOR__:';

function encodeRoleSubject(role, subject) {
  const cleanRole = role || 'viewer';
  const cleanSubject = (subject || 'All').trim() || 'All';
  if (cleanRole === 'editor') {
    return { role: 'viewer', subject: EDITOR_SUBJECT_PREFIX + cleanSubject };
  }
  return { role: cleanRole, subject: cleanSubject };
}

function decodeRoleSubject(role, subject) {
  const cleanSubject = subject || 'All';
  if (role === 'viewer' && cleanSubject.startsWith(EDITOR_SUBJECT_PREFIX)) {
    return {
      role: 'editor',
      subject: cleanSubject.slice(EDITOR_SUBJECT_PREFIX.length) || 'All',
    };
  }
  return { role: role || 'viewer', subject: cleanSubject };
}

function toLogicalUser(user) {
  if (!user) return user;
  return { ...user, ...decodeRoleSubject(user.role, user.subject) };
}

module.exports = { encodeRoleSubject, decodeRoleSubject, toLogicalUser };


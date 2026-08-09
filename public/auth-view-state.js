(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QbpAuthViewState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function permittedSubject(user) {
    if (!user || user.role === 'admin') return '';
    const subject = String(user.subject || 'All').trim();
    return subject && subject.toLowerCase() !== 'all' ? subject : '';
  }
  function badgeText(count, limit = 99) {
    const safe = Math.max(0, Number.parseInt(count, 10) || 0);
    if (!safe) return '';
    return safe > limit ? `${limit}+` : String(safe);
  }
  function isCopyShortcut(event) {
    return Boolean((event?.ctrlKey || event?.metaKey) && ['c','x','p'].includes(String(event?.key || '').toLowerCase()));
  }
  function watermarkIdentity(user) {
    if (!user) return 'Authorized Viewer';
    const email = String(user.email || '');
    const parts = email.split('@');
    const maskedEmail = parts.length === 2 ? `${parts[0].slice(0, 2)}***@${parts[1]}` : '';
    const name = String(user.name || '').slice(0, 80);
    if (name && maskedEmail) return `${name} · ${maskedEmail}`;
    return name || maskedEmail || `Viewer ${String(user.id || '').slice(0, 8)}`.trim();
  }
  return { permittedSubject, badgeText, isCopyShortcut, watermarkIdentity };
});

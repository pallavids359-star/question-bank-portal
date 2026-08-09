(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QbpDashboardView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function recentState(value) {
    return Array.isArray(value) && value.length ? { kind: 'success', items: value } : { kind: 'empty', items: [] };
  }
  function failureState(status) {
    return { kind: 'error', message: status === 401 ? 'Authorization failed.' : 'Could not load live data.' };
  }
  return { recentState, failureState };
});

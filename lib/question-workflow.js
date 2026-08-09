'use strict';

const ACTION_ROLES = Object.freeze({
  difficulty: Object.freeze(['admin', 'editor']),
  review: Object.freeze(['admin', 'editor']),
  accept: Object.freeze(['admin', 'editor']),
});

function canUseWorkflow(role, action) {
  return (ACTION_ROLES[action] || []).includes(String(role || '').toLowerCase());
}

function validateWorkflowBody(action, body) {
  if (action === 'difficulty') {
    const value = String(body?.difficulty || '').trim();
    if (!/^(easy|medium|hard)$/i.test(value)) return { error: 'Difficulty must be Easy, Medium, or Hard.' };
    return { value: value[0].toUpperCase() + value.slice(1).toLowerCase() };
  }
  if (action === 'review') {
    const value = String(body?.message || '').trim();
    if (!value || value.length > 2000) return { error: 'Review message must contain between 1 and 2000 characters.' };
    return { value };
  }
  if (action === 'accept') {
    if (body?.accepted !== undefined && body.accepted !== true) return { error: 'Accept does not support reversing an accepted question.' };
    return { value: true };
  }
  return { error: 'Unsupported workflow action.' };
}

function mapWorkflowError(error) {
  const code = String(error?.code || '');
  if (code === 'P0002') return { status: 404, message: 'Question not found.' };
  if (code === '42501') return { status: 403, message: 'You do not have permission to perform this action.' };
  if (code === '22023' || code === '22P02') return { status: 400, message: 'Invalid workflow request.' };
  if (code === 'PGRST202' || code === '42883') {
    return { status: 503, message: 'Question workflow is not available. Apply and verify the workflow migration.' };
  }
  return { status: 503, message: 'Question workflow service is temporarily unavailable.' };
}

module.exports = { ACTION_ROLES, canUseWorkflow, validateWorkflowBody, mapWorkflowError };

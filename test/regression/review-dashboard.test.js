'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'routes', 'notifications.js'), 'utf8');
const questions = fs.readFileSync(path.join(root, 'routes', 'questions.js'), 'utf8');

test('review dashboard is available only to admin and editor roles', () => {
  assert.match(html, /text:'Review Dashboard'[\s\S]*?roles:\['admin','editor'\]/);
  assert.match(html, /id="pageReviewDashboard"/);
  assert.match(html, /else if \(id === 'pageReviewDashboard'\)[\s\S]*?loadReviewDashboard\(\)/);
  assert.match(notifications, /router\.get\('\/review-dashboard', \.\.\.REVIEW_DASHBOARD_ROLES/);
  assert.match(notifications, /requireRole\('editor', 'admin'\)/);
});

test('review dashboard reports pending, reviewed, updated and accepted states', () => {
  assert.match(notifications, /'question_updated'/);
  assert.match(notifications, /state\.status = 'updated'/);
  assert.match(notifications, /pending: 0, reviewed: 0, updated: 0, accepted: 0/);
  assert.match(html, /\['Updated',totals\.updated\|\|0\]/);
  assert.match(html, /item\.notification_read\?'Update seen':'New update'/);
});

test('editors receive update notifications and their unread badge is polled', () => {
  assert.match(notifications, /if \(normalizedRole === 'admin'\) return \['question_review', 'question_updated'\]/);
  assert.match(notifications, /if \(normalizedRole === 'editor'\) return \['question_updated'\]/);
  assert.match(html, /\['admin','adder','editor'\]\.includes\(role\)/);
  assert.match(questions, /\.in\('type', \['question_review', 'question_updated'\]\)/);
  assert.match(questions, /recipient_id: reviewerId/);
  assert.match(questions, /type: 'question_updated'/);
});

test('later edits keep notifying the same reviewer and verify insertion', () => {
  assert.match(questions, /reviewNotif\?\.type === 'question_updated'/);
  assert.match(questions, /reviewerId = reviewNotif\.recipient_id/);
  assert.match(questions, /if \(reviewerLookupError\) throw reviewerLookupError/);
  assert.match(questions, /if \(insertRes\.error\) throw insertRes\.error/);
});

test('admin and editor dashboards show only questions reviewed by that user', () => {
  assert.match(notifications, /\.eq\('sender_id', userId\)/);
  assert.match(notifications, /\.eq\('recipient_id', userId\)/);
  assert.match(notifications, /const reviewedQuestionIds = new Set\(/);
  assert.match(notifications, /row\.type === 'question_review'/);
  assert.match(notifications, /row\.type === 'question_updated'/);
  assert.match(notifications, /reviewedQuestionIds\.has\(String\(row\.question_id \|\| ''\)\)/);
  assert.match(notifications, /const unique = new Map\(\)/);
  assert.doesNotMatch(notifications, /if \(role === 'admin'\)/);
});

test('review, difficulty and accept locate questions in the migrated shards', () => {
  assert.match(notifications, /const QUESTION_CLIENTS = \[/);
  assert.match(notifications, /async function findQuestionAcrossShards\(questionId, subject, klass\)/);
  assert.match(notifications, /const \{ question, client, error \} = await findQuestionAcrossShards/);
  assert.match(notifications, /questionClient\.from\('questions'\)\.update/);
  assert.match(html, /subject:question\.subject,[\s\S]*?klass:question\.klass,[\s\S]*?accepted:nextAccepted/);
});

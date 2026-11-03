const test = require('node:test');
const assert = require('node:assert');
const { buildEmails } = require('./emails');

const NOW = Date.parse('2026-11-03T06:46:00Z');
const lastReading = Date.parse('2026-11-03T06:41:00Z');
const off = (name, ms = lastReading) => ({ type: 'offline', name, lastReading: ms });
const flood = (type, name) => ({ type, name, level: 62.5, precip: 14.2 });
const subjects = (events, total = 4) => buildEmails(events, NOW, total).map((e) => e.subject);

test('no events -> no emails', () => assert.deepStrictEqual(buildEmails([], NOW, 4), []));

test('offline: one station has its name in the subject and the time in the body', () => {
  const [email] = buildEmails([off('Sealion Street')], NOW, 4);
  assert.strictEqual(email.subject, 'URGENT: Sealion Street is offline');
  assert.strictEqual(email.text, [
    'BAHGO flood monitoring', '',
    'URGENT: Sealion Street is offline for 5 minutes.',
    '  Last reading: Nov 3, 2026, 2:41 PM', '',
    'Open the BAHGO dashboard for details: https://bahgo.web.app/'
  ].join('\n'));
});

test('subjects name the stations, or say All stations when every station is included', () => {
  const names = ['A', 'B', 'C', 'D'];
  assert.deepStrictEqual(subjects(names.slice(0, 2).map((n) => off(n))), ['URGENT: A and B are offline']);
  assert.deepStrictEqual(subjects(names.slice(0, 3).map((n) => off(n))), ['URGENT: A, B and C are offline']);
  assert.deepStrictEqual(subjects(names.map((n) => off(n))), ['URGENT: All stations are offline']);
  assert.deepStrictEqual(subjects(names.map((n) => flood('critical', n))), ['URGENT: All stations are critical']);
  assert.deepStrictEqual(subjects(names.map((n) => flood('warning', n))), ['WARNING: All stations water levels rising']);
  assert.deepStrictEqual(subjects([{ type: 'back', name: 'A', since: NOW }, { type: 'back', name: 'B', since: NOW }]), ['Back Online: A and B']);
});

test('critical and warning bodies include the readings', () => {
  const [c] = buildEmails([flood('critical', 'Sealion Street')], NOW, 4);
  assert.strictEqual(c.subject, 'URGENT: Sealion Street is critical');
  assert.ok(c.text.includes('URGENT: Sealion Street is CRITICAL.\n  Water level: 62.5 cm\n  Precipitation: 14.2 mm/hr'));
  const [w] = buildEmails([flood('warning', 'Sealion Street')], NOW, 4);
  assert.strictEqual(w.subject, 'WARNING: Sealion Street water levels rising');
  assert.ok(w.text.includes('WARNING: Sealion Street is at WARNING level.'));
});

test('back online shows the outage length only when it is known', () => {
  const since = Date.parse('2026-11-03T07:05:00Z');
  const [known] = buildEmails([{ type: 'back', name: 'A', since, offlineMs: 24 * 60000 }], NOW, 4);
  assert.ok(known.text.includes('A is back online.\n  Reporting again since: Nov 3, 2026, 3:05 PM\n  Was offline for: 24 minutes'));
  const [unknown] = buildEmails([{ type: 'back', name: 'A', since, offlineMs: null }], NOW, 4);
  assert.ok(!unknown.text.includes('Was offline for'));
});

test('durations read in minutes, hours, or days', () => {
  const ago = (ms) => buildEmails([off('A', NOW - ms)], NOW, 4)[0].text;
  assert.ok(ago(60000).includes('offline for 1 minute.'));
  assert.ok(ago(3 * 3600000).includes('offline for 3 hours.'));
  assert.ok(ago(3 * 86400000).includes('offline for 3 days.'));
});

test('different event types are sent as separate emails', () => {
  assert.deepStrictEqual(subjects([flood('critical', 'A'), off('B')]), ['URGENT: B is offline', 'URGENT: A is critical']);
});
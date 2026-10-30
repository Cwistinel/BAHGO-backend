const test = require('node:test');
const assert = require('node:assert');
const { parseTimestamp, decide, COOLDOWN_MS } = require('./decide');

const NOW = Date.parse('2026-05-13T04:00:00Z');
const fresh = { Last_Updated: NOW / 1000 - 10, Distance_cm: 88.9, Rain_Value: 4095 };
const stale = { ...fresh, Last_Updated: NOW / 1000 - 3600 };

test('parseTimestamp: seconds, ms, naive (+08:00), ISO, junk', () => {
  assert.strictEqual(parseTimestamp(1760000000), 1760000000000);
  assert.strictEqual(parseTimestamp(1760000000000), 1760000000000);
  assert.strictEqual(parseTimestamp('2026-05-13 12:00:00'), NOW);
  assert.strictEqual(parseTimestamp('2026-05-13T04:00:00Z'), NOW);
  assert.strictEqual(parseTimestamp('nope'), null);
  assert.strictEqual(parseTimestamp(null), null);
});

test('decide: [description, prevState, reading, expected email count, expected state]', () => {
  const rows = [
    ['first offline -> email', {}, stale, 1, { offline: true, lastOfflineEmail: NOW }],
    ['offline within cooldown -> silent', { offline: true, lastOfflineEmail: NOW - 1000 }, stale, 0, {}],
    ['offline after cooldown -> reminder', { offline: true, lastOfflineEmail: NOW - COOLDOWN_MS - 1 }, stale, 1, { offline: true, lastOfflineEmail: NOW }],
    ['recovered -> back online', { offline: true }, fresh, 1, { offline: false }],
    ['safe -> critical -> email', {}, { ...fresh, Distance_cm: 1 }, 1, { floodStatus: 'critical', lastFloodEmail: NOW }],
    ['same warning again -> silent', { floodStatus: 'warning' }, { ...fresh, Distance_cm: 40 }, 0, {}],
    ['unparseable timestamp -> ignored', {}, { Last_Updated: 'junk' }, 0, {}]
  ];
  for (const [name, prev, reading, n, next] of rows) {
    const r = decide(prev, reading, NOW, 'X');
    assert.strictEqual(r.events.length, n, name);
    assert.deepStrictEqual(r.next, next, name);
  }
});

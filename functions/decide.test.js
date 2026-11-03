const test = require('node:test');
const assert = require('node:assert');
const { parseTimestamp, decide, OFFLINE_COOLDOWN_MS, OFFLINE_WAIT_MS } = require('./decide');

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

const staleTs = NOW - 3600 * 1000;
const freshTs = NOW - 10 * 1000;

test('decide: [description, prevState, reading, expected event types, expected state, offline alert due]', () => {
  const rows = [
    ['first offline -> starts the wait, no email', {}, stale, [], { offlineDetectedAt: NOW, offlineSince: staleTs }, false],
    ['still waiting -> silent', { offlineDetectedAt: NOW - 1000 }, stale, [], {}, false],
    ['wait is over -> offline alert due', { offlineDetectedAt: NOW - OFFLINE_WAIT_MS }, stale, [], {}, true],
    ['already notified, inside cooldown -> silent', { offline: true, lastOfflineEmail: NOW - 1000 }, stale, [], {}, false],
    ['already notified, after cooldown -> reminder due', { offline: true, lastOfflineEmail: NOW - OFFLINE_COOLDOWN_MS - 1 }, stale, [], {}, true],
    ['recovered during the wait -> nothing sent', { offlineDetectedAt: NOW - 1000 }, fresh, [], { offlineDetectedAt: 0 }, false],
    ['recovered after notified -> back online', { offline: true, offlineSince: staleTs }, fresh, ['back'], { offline: false, offlineDetectedAt: 0 }, false],
    ['safe -> critical -> email', {}, { ...fresh, Distance_cm: 1 }, ['critical'], { floodStatus: 'critical', lastFloodEmail: NOW }, false],
    ['safe -> warning -> email', {}, { ...fresh, Distance_cm: 40 }, ['warning'], { floodStatus: 'warning', lastFloodEmail: NOW }, false],
    ['same warning again -> silent', { floodStatus: 'warning' }, { ...fresh, Distance_cm: 40 }, [], {}, false],
    ['unparseable timestamp -> ignored', {}, { Last_Updated: 'junk' }, [], {}, undefined]
  ];
  for (const [name, prev, reading, types, next, due] of rows) {
    const r = decide(prev, reading, NOW, 'X');
    assert.deepStrictEqual(r.events.map((e) => e.type), types, name);
    assert.deepStrictEqual(r.next, next, name);
    assert.strictEqual(r.offlineDue, due, name);
  }
});

test('decide: back-online event carries the reading time and outage length', () => {
  const [e] = decide({ offline: true, offlineSince: staleTs }, fresh, NOW, 'X').events;
  assert.deepStrictEqual(e, { type: 'back', name: 'X', since: freshTs, offlineMs: freshTs - staleTs });
});

test('decide: offline station is reported for the combined email; online station is not', () => {
  assert.deepStrictEqual(decide({}, stale, NOW, 'X').offline, { name: 'X', lastReading: staleTs });
  assert.strictEqual(decide({}, fresh, NOW, 'X').offline, null);
});
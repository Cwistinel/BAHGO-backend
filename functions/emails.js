const TIME_ZONE = 'Asia/Manila';

const when = (ms) => new Date(ms)
  .toLocaleString('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  .replace(/\u202f/g, ' ');

const span = (ms) => {
  const min = Math.round(ms / 60000);
  const [n, unit] = min < 120 ? [min, 'minute'] : min < 2880 ? [Math.round(min / 60), 'hour'] : [Math.round(min / 1440), 'day'];
  return n + ' ' + unit + (n === 1 ? '' : 's');
};

const list = (names) => (names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
const readings = (e) => '  Water level: ' + e.level + ' cm\n  Precipitation: ' + e.precip + ' mm/hr';

const KINDS = {
  offline: {
    subject: (who, verb) => 'URGENT: ' + who + ' ' + verb + ' offline',
    block: (e, now) => 'URGENT: ' + e.name + ' is offline for ' + span(now - e.lastReading) + '.\n  Last reading: ' + when(e.lastReading)
  },
  critical: {
    subject: (who, verb) => 'URGENT: ' + who + ' ' + verb + ' critical',
    block: (e) => 'URGENT: ' + e.name + ' is CRITICAL.\n' + readings(e)
  },
  warning: {
    subject: (who) => 'WARNING: ' + who + ' water levels rising',
    block: (e) => 'WARNING: ' + e.name + ' is at WARNING level.\n' + readings(e)
  },
  back: {
    subject: (who) => 'Back Online: ' + who,
    block: (e) => e.name + ' is back online.\n  Reporting again since: ' + when(e.since) + (e.offlineMs ? '\n  Was offline for: ' + span(e.offlineMs) : '')
  }
};

function buildEmails(events, now, total) {
  return Object.entries(KINDS).flatMap(([type, kind]) => {
    const group = events.filter((e) => e.type === type);
    if (group.length === 0) return [];
    const names = group.map((e) => e.name);
    const who = names.length > 1 && names.length === total ? 'All stations' : list(names);
    return [{
      subject: kind.subject(who, names.length === 1 ? 'is' : 'are'),
            text: ['BAHGO flood monitoring', '', group.map((e) => kind.block(e, now)).join('\n\n'), '', 'Open the BAHGO dashboard for details: https://bahgo.web.app/'].join('\n')
    }];
  });
}

module.exports = { buildEmails };
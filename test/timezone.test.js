// Fuso orario di default: quello dell'officina, salvo TZ esplicito
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('senza TZ il server usa Europe/Rome', () => {
  delete process.env.TZ;
  require('../config/config');
  assert.equal(process.env.TZ, 'Europe/Rome');
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/Rome');
});

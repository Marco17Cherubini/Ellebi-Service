// Date di calendario nel fuso dell'officina, anche a cavallo della mezzanotte UTC
process.env.TZ = 'Europe/Rome';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toDateString, dayOfWeek } = require('../server/dates');

test('toDateString usa il giorno locale anche quando in UTC è ancora il giorno prima', () => {
  // 00:30 del 3 marzo a Roma = 23:30 UTC del 2 marzo
  const d = new Date(2031, 2, 3, 0, 30);
  assert.equal(d.toISOString().slice(0, 10), '2031-03-02');
  assert.equal(toDateString(d), '2031-03-03');
});

test('dayOfWeek legge la data senza conversioni UTC', () => {
  assert.equal(dayOfWeek('2031-03-02'), 0); // domenica
  assert.equal(dayOfWeek('2031-03-08'), 6); // sabato
  assert.equal(dayOfWeek('2031-03-30'), 0); // giorno del cambio dell'ora legale
});

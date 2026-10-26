// Template email: i dati inseriti da clienti e ospiti non possono iniettare HTML
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv } = require('./helpers');

configureTestEnv();
const {
  bookingConfirmationHtml,
  depositCompletionHtml,
  passwordResetHtml,
  formatDate,
  sendBookingConfirmation
} = require('../server/emailService');

const PAYLOAD = '<img src=x onerror="alert(1)">';

test('conferma prenotazione: nome e orario vengono resi come testo', () => {
  const html = bookingConfirmationHtml({ nome: PAYLOAD, giorno: '2030-11-05', ora: '09:00' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('martedì 5 novembre 2030'));
  assert.ok(html.includes('09:00'));
});

test('ritiro veicolo: anagrafica, veicolo e note vengono resi come testo', () => {
  const html = depositCompletionHtml({
    nome: PAYLOAD,
    cognome: '<b>x</b>',
    modello: '<script>',
    targa: 'AB123CD',
    nota_lorenzo: '<a href="//evil">link</a>'
  });
  assert.ok(!/<img|<script|<b>|<a href/.test(html));
  assert.ok(html.includes('AB123CD'));
});

test('reset password: il link compare nel pulsante e come testo', () => {
  const link = 'https://officina.example/new-password?token=abc.def';
  const html = passwordResetHtml(link);
  assert.ok(html.includes(`href="${link}"`));
});

test('le date YYYY-MM-DD sono formattate nel giorno locale, senza slittare per il fuso', () => {
  assert.equal(formatDate('2030-01-01'), 'martedì 1 gennaio 2030');
});

test('senza RESEND_API_KEY le email vengono saltate senza errori', async () => {
  const result = await sendBookingConfirmation({
    email: 'a@test.local',
    nome: 'A',
    giorno: '2030-01-01',
    ora: '09:00'
  });
  assert.equal(result.success, false);
});

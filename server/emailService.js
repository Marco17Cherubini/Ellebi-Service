const { Resend } = require('resend');
const config = require('../config/config');

// Resend client: null se RESEND_API_KEY non è configurata (le email vengono saltate)
let resend = null;

function initializeEmailService() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('⚠️  RESEND_API_KEY non configurata. Email notifications disabled.');
    console.warn('   Ottieni una API key gratuita su https://resend.com');
    return;
  }

  resend = new Resend(apiKey);
  console.log('✅ Email service (Resend) initialized');
}

// I dati arrivano da clienti, ospiti e admin: vanno resi inerti prima di entrare nell'HTML
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Formatta 'YYYY-MM-DD' in italiano senza passare da UTC (es. "martedì 3 novembre 2026")
function formatDate(dateString) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const months = [
    'gennaio',
    'febbraio',
    'marzo',
    'aprile',
    'maggio',
    'giugno',
    'luglio',
    'agosto',
    'settembre',
    'ottobre',
    'novembre',
    'dicembre'
  ];

  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const BASE_STYLE = `
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }`;

function layout(extraStyle, content, footer) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${BASE_STYLE}${extraStyle}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${escapeHtml(config.studio.name)}</h1>
        </div>
        <div class="content">${content}
        </div>
        <div class="footer">${footer}
        </div>
      </div>
    </body>
    </html>
  `;
}

function bookingConfirmationHtml(booking) {
  // Supporta sia i nuovi campi (giorno, ora) che i vecchi (data, orario)
  const date = booking.giorno || booking.data;
  const time = booking.ora || booking.orario;
  return layout(
    `
        .content { margin: 20px 0; }
        .info-row { margin: 10px 0; }
        .label { font-weight: bold; }
        .footer { border-top: 2px solid #000; padding-top: 10px; margin-top: 30px; font-size: 0.9em; }`,
    `
          <p>Caro <strong>${escapeHtml(booking.nome)}</strong>,</p>
          <p>La tua prenotazione e stata confermata!</p>
          <div class="info-row">
            <span class="label">Data:</span> ${escapeHtml(formatDate(date))}
          </div>
          <div class="info-row">
            <span class="label">Orario:</span> ${escapeHtml(time)}
          </div>`,
    `
          <p>Per assistenza contattaci:</p>
          <p><strong>Tel: ${escapeHtml(config.studio.phone)}</strong></p>
          <p>A presto!<br>${escapeHtml(config.studio.name)}</p>`
  );
}

function passwordResetHtml(resetLink) {
  const link = escapeHtml(resetLink);
  return layout(
    `
        .content { margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff !important; text-decoration: none; font-weight: bold; margin: 20px 0; }
        .footer { border-top: 2px solid #000; padding-top: 10px; margin-top: 30px; font-size: 0.9em; color: #666; }`,
    `
          <p>Hai richiesto di reimpostare la tua password.</p>
          <p>Clicca il pulsante qui sotto per creare una nuova password:</p>
          <a href="${link}" class="button">Reimposta Password</a>
          <p>Oppure copia e incolla questo link nel browser:</p>
          <p style="word-break: break-all; color: #666;">${link}</p>
          <p><strong>Questo link scadrà tra 1 ora.</strong></p>
          <p>Se non hai richiesto il reset della password, ignora questa email.</p>`,
    `
          <p>Questa è un'email automatica, non rispondere.</p>
          <p>${escapeHtml(config.studio.name)}</p>`
  );
}

function depositCompletionHtml(deposit) {
  return layout(
    `
        .highlight { background: #f5f5f5; padding: 15px; border-left: 4px solid #000; margin: 20px 0; }
        .footer { border-top: 2px solid #000; padding-top: 10px; margin-top: 30px; font-size: 0.9em; }`,
    `
          <p>Gentile <strong>${escapeHtml(deposit.nome)} ${escapeHtml(deposit.cognome)}</strong>,</p>
          <p>siamo lieti di comunicarle che il suo veicolo è <strong>pronto per il ritiro</strong>.</p>
          <div class="highlight">
            <p><strong>Veicolo:</strong> ${escapeHtml(deposit.modello || 'N/D')}</p>
            <p><strong>Targa:</strong> ${escapeHtml(deposit.targa || 'N/D')}</p>
            ${deposit.nota_lorenzo ? `<p><strong>Note:</strong> ${escapeHtml(deposit.nota_lorenzo)}</p>` : ''}
          </div>
          <p>Può passare a ritirare il veicolo durante i nostri orari di apertura:</p>
          <p>Lun–Ven: 08:30–12:30 / 14:30–18:30<br>Sabato: 08:30–12:00</p>`,
    `
          <p>Per informazioni: <strong>${escapeHtml(config.studio.phone)}</strong></p>
          <p>${escapeHtml(config.studio.address)}</p>
          <p>A presto!<br>${escapeHtml(config.studio.name)}</p>`
  );
}

// Invio comune: senza Resend configurato l'email viene saltata, gli errori non vengono rilanciati
async function send(kind, to, subject, html) {
  if (!resend) {
    console.log(`📧 Email service not configured. Skipping ${kind}.`);
    return { success: false, message: 'Email service not configured' };
  }
  if (!to) {
    return { success: false, message: 'Destinatario mancante' };
  }

  // Email mittente - usa dominio verificato o onboarding@resend.dev per test
  const from = process.env.EMAIL_FROM || 'Ellebi Service SRL <onboarding@resend.dev>';

  try {
    const { data, error } = await resend.emails.send({ from, to: [to], subject, html });
    if (error) {
      console.error(`❌ Errore Resend (${kind}):`, error.message);
      return { success: false, message: error.message };
    }
    console.log(`✅ Email inviata (${kind}). ID: ${data.id}`);
    return { success: true, message: 'Email inviata con successo' };
  } catch (error) {
    console.error(`❌ Errore invio email (${kind}):`, error.message);
    return { success: false, message: error.message };
  }
}

function sendBookingConfirmation(booking) {
  return send(
    'conferma prenotazione',
    booking.email,
    `Prenotazione Confermata - ${config.studio.name}`,
    bookingConfirmationHtml(booking)
  );
}

function sendPasswordResetEmail(email, resetLink) {
  return send(
    'reset password',
    email,
    `Reimposta la tua password - ${config.studio.name}`,
    passwordResetHtml(resetLink)
  );
}

function sendDepositCompletionEmail(deposit) {
  return send(
    'ritiro veicolo',
    deposit.email,
    `Veicolo pronto per il ritiro - ${config.studio.name}`,
    depositCompletionHtml(deposit)
  );
}

// Le email di conferma non devono bloccare né far fallire la risposta HTTP
function sendInBackground(promise) {
  promise
    .then(result => {
      if (!result.success) console.log('Email non inviata:', result.message);
    })
    .catch(error => console.error('Errore invio email:', error.message));
}

module.exports = {
  initializeEmailService,
  sendBookingConfirmation,
  sendPasswordResetEmail,
  sendDepositCompletionEmail,
  sendInBackground,
  bookingConfirmationHtml,
  passwordResetHtml,
  depositCompletionHtml,
  formatDate
};

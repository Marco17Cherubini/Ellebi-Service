const { Resend } = require('resend');
const config = require('../config/config');

// Resend client
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

// Formatta data in italiano
function formatDate(dateString) {
  const date = new Date(dateString);
  const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName} ${day} ${month} ${year}`;
}

// Invia email di conferma prenotazione
async function sendBookingConfirmation(booking) {
  if (!resend) {
    console.log('📧 Email service not configured. Skipping notification.');
    return { success: false, message: 'Email service not configured' };
  }

  // Supporta sia i nuovi campi (giorno, ora) che i vecchi (data, orario)
  const dateField = booking.giorno || booking.data;
  const timeField = booking.ora || booking.orario;
  const formattedDate = formatDate(dateField);

  // Email mittente - usa dominio verificato o onboarding@resend.dev per test
  const fromEmail = process.env.EMAIL_FROM || 'Ellebi Service SRL <onboarding@resend.dev>';

  // URL base per il link di gestione (usa variabile d'ambiente o default localhost)
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .content { margin: 20px 0; }
        .info-row { margin: 10px 0; }
        .label { font-weight: bold; }
        .footer { border-top: 2px solid #000; padding-top: 10px; margin-top: 30px; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${config.studio.name}</h1>
        </div>
        <div class="content">
          <p>Caro <strong>${booking.nome}</strong>,</p>
          <p>La tua prenotazione e stata confermata!</p>
          <div class="info-row">
            <span class="label">Data:</span> ${formattedDate}
          </div>
          <div class="info-row">
            <span class="label">Orario:</span> ${timeField}
          </div>
        </div>
        <div class="footer">
          <p>Per assistenza contattaci:</p>
          <p><strong>Tel: ${config.studio.phone}</strong></p>
          <p>A presto!<br>${config.studio.name}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`📧 Invio email a: ${booking.email}`);

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [booking.email],
      subject: `Prenotazione Confermata - ${config.studio.name}`,
      html: htmlContent
    });

    if (error) {
      console.error('❌ Errore Resend:', error.message);
      return { success: false, message: error.message };
    }

    console.log(`✅ Email inviata con successo! ID: ${data.id}`);
    return { success: true, message: 'Email inviata con successo' };
  } catch (error) {
    console.error('❌ Errore invio email:', error.message);
    return { success: false, message: error.message };
  }
}

// Invia email per reset password
async function sendPasswordResetEmail(email, resetLink) {
  if (!resend) {
    console.log('📧 Email service not configured. Skipping password reset notification.');
    return { success: false, message: 'Email service not configured' };
  }

  const fromEmail = process.env.EMAIL_FROM || 'Ellebi Service SRL <onboarding@resend.dev>';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .content { margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff !important; text-decoration: none; font-weight: bold; margin: 20px 0; }
        .footer { border-top: 2px solid #000; padding-top: 10px; margin-top: 30px; font-size: 0.9em; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${config.studio.name}</h1>
        </div>
        <div class="content">
          <p>Hai richiesto di reimpostare la tua password.</p>
          <p>Clicca il pulsante qui sotto per creare una nuova password:</p>
          <a href="${resetLink}" class="button">Reimposta Password</a>
          <p>Oppure copia e incolla questo link nel browser:</p>
          <p style="word-break: break-all; color: #666;">${resetLink}</p>
          <p><strong>Questo link scadrà tra 1 ora.</strong></p>
          <p>Se non hai richiesto il reset della password, ignora questa email.</p>
        </div>
        <div class="footer">
          <p>Questa è un'email automatica, non rispondere.</p>
          <p>${config.studio.name}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`📧 Invio email reset password a: ${email}`);

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Reimposta la tua password - ${config.studio.name}`,
      html: htmlContent
    });

    if (error) {
      console.error('❌ Errore Resend:', error.message);
      return { success: false, message: error.message };
    }

    console.log(`✅ Email reset password inviata! ID: ${data.id}`);
    return { success: true, message: 'Email inviata con successo' };
  } catch (error) {
    console.error('❌ Errore invio email reset:', error.message);
    return { success: false, message: error.message };
  }
}

// Invia email di notifica ritiro veicolo (deposito completato)
async function sendDepositCompletionEmail(deposit) {
  if (!resend) {
    console.log('📧 Email service not configured. Skipping deposit completion notification.');
    return { success: false, message: 'Email service not configured' };
  }

  const fromEmail = process.env.EMAIL_FROM || 'Ellebi Service SRL <onboarding@resend.dev>';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .highlight { background: #f5f5f5; padding: 15px; border-left: 4px solid #000; margin: 20px 0; }
        .footer { border-top: 2px solid #000; padding-top: 10px; margin-top: 30px; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${config.studio.name}</h1>
        </div>
        <div class="content">
          <p>Gentile <strong>${deposit.nome} ${deposit.cognome}</strong>,</p>
          <p>siamo lieti di comunicarle che il suo veicolo è <strong>pronto per il ritiro</strong>.</p>
          <div class="highlight">
            <p><strong>Veicolo:</strong> ${deposit.modello || 'N/D'}</p>
            <p><strong>Targa:</strong> ${deposit.targa || 'N/D'}</p>
            ${deposit.nota_lorenzo ? `<p><strong>Note:</strong> ${deposit.nota_lorenzo}</p>` : ''}
          </div>
          <p>Può passare a ritirare il veicolo durante i nostri orari di apertura:</p>
          <p>Lun–Ven: 08:30–12:30 / 14:30–18:30<br>Sabato: 08:30–12:00</p>
        </div>
        <div class="footer">
          <p>Per informazioni: <strong>${config.studio.phone}</strong></p>
          <p>${config.studio.address}</p>
          <p>A presto!<br>${config.studio.name}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`📧 Invio email ritiro veicolo a: ${deposit.email}`);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [deposit.email],
      subject: `Veicolo pronto per il ritiro - ${config.studio.name}`,
      html: htmlContent
    });

    if (error) {
      console.error('❌ Errore Resend:', error.message);
      return { success: false, message: error.message };
    }

    console.log(`✅ Email ritiro veicolo inviata! ID: ${data.id}`);
    return { success: true, message: 'Email inviata con successo' };
  } catch (err) {
    console.error('❌ Errore invio email deposito:', err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  initializeEmailService,
  sendBookingConfirmation,
  sendPasswordResetEmail,
  sendDepositCompletionEmail
};

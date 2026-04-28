const dotenv = require('dotenv');

dotenv.config();

/**
 * Genera un array di orari (HH:MM) ogni intervalMins minuti
 * da startH:startM fino a (escluso) endH:endM.
 *
 * Esempi:
 *   generateSlots(8, 30, 12, 30, 15) → ['08:30','08:45','09:00',...,'12:15']  (16 slot)
 *   generateSlots(14, 30, 18, 30, 15) → ['14:30','14:45',...,'18:15']          (16 slot)
 *   generateSlots(8, 30, 12, 0, 15)  → ['08:30','08:45',...,'11:45']           (14 slot)
 */
function generateSlots(startH, startM, endH, endM, intervalMins) {
  intervalMins = intervalMins || 15;
  const slots = [];
  let h = startH;
  let m = startM;
  const endMinutes = endH * 60 + endM;
  while (h * 60 + m < endMinutes) {
    slots.push(
      String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
    );
    m += intervalMins;
    if (m >= 60) {
      h += Math.floor(m / 60);
      m = m % 60;
    }
  }
  return slots;
}

const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '7d'
  },

  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM
  },

  studio: {
    name: process.env.STUDIO_NAME || 'Ellebi Service SRL',
    phone: process.env.STUDIO_PHONE || '+39 366 304 3908',
    address:
      process.env.STUDIO_ADDRESS ||
      'Via Zerbi 21, San Giuliano Vecchio, Alessandria'
  },

  // ─── Orari di apertura ─────────────────────────────────────────────────────
  //  Granularità base: 15 minuti (usata internamente per calcoli overlap).
  //  Il calendario admin mostra righe da 1h; i blocchi si estendono di
  //  durata_minuti/15 righe. Il calendario clienti mostra solo gli orari
  //  di inizio validi per il servizio scelto.
  businessHours: {
    daysOpen: [1, 2, 3, 4, 5, 6], // lunedì (1) – sabato (6); 0 = domenica
    slotIntervalMinutes: 15, // unità base, non esposta in UI

    // Lunedì – Venerdì
    weekday: {
      morning: {
        start: '08:30',
        end: '12:30',
        slots: generateSlots(8, 30, 12, 30, 15) // 16 slot: 08:30 → 12:15
      },
      afternoon: {
        start: '14:30',
        end: '18:30',
        slots: generateSlots(14, 30, 18, 30, 15) // 16 slot: 14:30 → 18:15
      }
    },

    // Sabato
    saturday: {
      morning: {
        start: '08:30',
        end: '12:00',
        slots: generateSlots(8, 30, 12, 0, 15) // 14 slot: 08:30 → 11:45
      },
      afternoon: {
        start: null,
        end: null,
        slots: [] // sabato pomeriggio: chiuso
      }
    }
  },

  // Numero massimo di depositi attivi in contemporanea (provvisorio)
  maxDeposits: 5,

  // Helper esportato per uso in altri moduli (es. seed dati, test)
  generateSlots
};

module.exports = config;

const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

module.exports = {
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
    address: process.env.STUDIO_ADDRESS || 'Via Zerbi 21, San Giuliano Vecchio, Alessandria'
  },
  database: {
    usersFile: path.join(__dirname, '../database/users.csv'),
    bookingsFile: path.join(__dirname, '../database/bookings.csv'),
    adminFile: path.join(__dirname, '../database/admin.csv'),
    holidaysFile: path.join(__dirname, '../database/holidays.csv')
  },
  businessHours: {
    daysOpen: [1, 2, 3, 4, 5, 6], // lunedì-sabato (da configurare)
    // Orari lun-ven (da configurare per l'officina)
    weekday: {
      morning: {
        start: '08:00',
        end: '12:00',
        slots: [] // da configurare
      },
      afternoon: {
        start: '14:00',
        end: '18:00',
        slots: [] // da configurare
      }
    },
    // Orari sabato (da configurare per l'officina)
    saturday: {
      morning: {
        start: '08:00',
        end: '12:00',
        slots: [] // da configurare
      },
      afternoon: {
        start: '14:00',
        end: '16:00',
        slots: [] // da configurare
      }
    }
  },
  appointmentDuration: 60 // Durata standard appuntamento in minuti (da configurare)
};

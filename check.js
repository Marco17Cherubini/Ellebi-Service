const config = require('./config/config.js');
const db = require('./server/database.js');
db.initDatabase().then(() => {
  const { getAvailableSlotsForService } = require('./server/bookingService.js');
  console.log(getAvailableSlotsForService('2025-05-15', {durata_minuti: 30}, true));
});

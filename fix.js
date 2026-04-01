const fs = require('fs');
let c = fs.readFileSync('frontend/guest-booking.html', 'utf8');
c = c.replace('<div class="vc-icon">Auto</div>', '<div class="vc-icon">Automobile</div>');
c = c.replace(/\s*<div class="vc-label">Automobile<\/div>/, '');
c = c.replace(/\s*<div class="vc-label">Moto<\/div>/, '');
fs.writeFileSync('frontend/guest-booking.html', c);
console.log('done');

// Listino servizi: lettura pubblica (con filtro stagionale), CRUD admin e regole di durata
const { servicesDB } = require('./database');
const { HttpError, badRequest } = require('./errors');

// Durata fissa dell'accoglienza per i servizi di consegna veicolo (chiavi + descrizione del problema)
const CONSEGNA_DURATION = 30;

const EDITABLE_FIELDS = [
  'nome',
  'tipo_veicolo',
  'tipo_servizio',
  'durata_minuti',
  'prezzo_interno',
  'campi_extra',
  'attivo',
  'stagionale',
  'data_inizio_stagione',
  'data_fine_stagione'
];

function findService(id) {
  if (id === undefined || id === null || id === '') return undefined;
  return servicesDB.findOne(s => String(s.id) === String(id));
}

// Un servizio è "consegna" per tipo oppure, per compatibilità con listini storici, per nome
function isConsegnaService(service) {
  return (
    !!service &&
    (service.tipo_servizio === 'consegna' ||
      (service.nome || '').toLowerCase().includes('consegna'))
  );
}

// Minuti occupati in calendario dalla prenotazione di un servizio
function getServiceDuration(service) {
  if (isConsegnaService(service)) return CONSEGNA_DURATION;
  return parseInt(service.durata_minuti, 10) || 60;
}

function isActive(service) {
  return service.attivo === 1 || service.attivo === '1';
}

// Finestra stagionale in formato MM-DD, anche a cavallo d'anno (es. 11-15 → 04-15)
function isInSeason(service, today) {
  if (!service.stagionale || service.stagionale === '0') return true;
  if (!service.data_inizio_stagione || !service.data_fine_stagione) return true;

  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayMMDD = `${mm}-${dd}`;
  const start = service.data_inizio_stagione;
  const end = service.data_fine_stagione;

  return start <= end
    ? todayMMDD >= start && todayMMDD <= end
    : todayMMDD >= start || todayMMDD <= end;
}

// Servizi prenotabili oggi dai clienti, opzionalmente filtrati per tipo veicolo (auto | moto)
function listPublicServices(tipoVeicolo, today = new Date()) {
  return servicesDB.findMany(
    s => isActive(s) && (!tipoVeicolo || s.tipo_veicolo === tipoVeicolo) && isInSeason(s, today)
  );
}

function listAllServices() {
  return servicesDB.readAll();
}

function createService(data) {
  const { nome, tipo_veicolo, tipo_servizio } = data;
  if (!nome || !tipo_veicolo || !tipo_servizio) {
    throw badRequest('nome, tipo_veicolo e tipo_servizio sono obbligatori');
  }
  const id = servicesDB.insert({
    nome,
    tipo_veicolo,
    tipo_servizio,
    durata_minuti: data.durata_minuti || 60,
    prezzo_interno: data.prezzo_interno || null,
    campi_extra: data.campi_extra || '[]',
    attivo: data.attivo !== undefined ? data.attivo : 1,
    stagionale: data.stagionale || 0,
    data_inizio_stagione: data.data_inizio_stagione || null,
    data_fine_stagione: data.data_fine_stagione || null
  });
  return findService(id);
}

function requireService(id) {
  const service = findService(id);
  if (!service) throw new HttpError(404, 'Servizio non trovato');
  return service;
}

function updateService(id, data) {
  requireService(id);
  const changes = {};
  EDITABLE_FIELDS.forEach(key => {
    if (data[key] !== undefined) changes[key] = data[key];
  });
  servicesDB.update(s => String(s.id) === String(id), changes);
  return findService(id);
}

function deleteService(id) {
  requireService(id);
  servicesDB.delete(s => String(s.id) === String(id));
}

module.exports = {
  CONSEGNA_DURATION,
  findService,
  requireService,
  isConsegnaService,
  getServiceDuration,
  listPublicServices,
  listAllServices,
  createService,
  updateService,
  deleteService
};

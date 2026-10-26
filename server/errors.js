// Errori HTTP condivisi da servizi e route.
// I servizi lanciano HttpError con lo status corretto e un messaggio per l'utente;
// tutto il resto (bug, errori SQLite, ecc.) diventa un 500 generico senza dettagli interni.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// Scorciatoia per gli errori di validazione e di regole di business (400)
function badRequest(message) {
  return new HttpError(400, message);
}

// Express 4 non intercetta le promise rifiutate: inoltra l'errore al gestore centrale
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: 'Endpoint non trovato' });
}

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }

  // Errori del parser JSON di Express (corpo malformato, troppo grande, ...)
  // e file statici inesistenti (sendFile)
  if (err.status >= 400 && err.status < 500) {
    return res
      .status(err.status)
      .json({ success: false, error: err.status === 404 ? 'Non trovato' : 'Richiesta non valida' });
  }

  console.error(err);
  res.status(500).json({ success: false, error: 'Errore interno del server' });
}

module.exports = { HttpError, badRequest, asyncHandler, notFoundHandler, errorHandler };

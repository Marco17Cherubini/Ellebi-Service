document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  hideMessage('error-message');

  const formData = {
    nome: document.getElementById('nome').value.trim(),
    cognome: document.getElementById('cognome').value.trim(),
    email: document.getElementById('email').value.trim(),
    telefono: document.getElementById('telefono').value.trim(),
    password: document.getElementById('password').value
  };

  const confirmPassword = document.getElementById('confirm-password').value;

  // Validazione client-side
  if (formData.password !== confirmPassword) {
    showError('error-message', 'Le password non corrispondono');
    return;
  }

  if (formData.password.length < 8) {
    showError('error-message', 'La password deve essere di almeno 8 caratteri');
    return;
  }

  // Validazione campi vuoti
  if (!formData.nome || !formData.cognome || !formData.email || !formData.telefono) {
    showError('error-message', 'Tutti i campi sono obbligatori');
    return;
  }

  try {
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Registrazione...';

    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(formData)
    });

    if (response.success) {
      // Redirect a login con messaggio di successo
      window.location.href = '/login?registered=true';
    }
  } catch (error) {
    showError('error-message', error.message);
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = false;
    submitButton.textContent = 'Registrati';
  }
});

// Utility functions locali
function hideMessage(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add('hidden');
  }
}

function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Si è verificato un errore');
  }

  return data;
}

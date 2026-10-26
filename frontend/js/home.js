// Inizializzazione
async function init() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      redirectToLogin();
      return;
    }

    // Mostra messaggio di benvenuto con stellina VIP se applicabile
    const vipBadge = user.vip ? ' ⭐' : '';
    document.getElementById('welcome-message').textContent =
      `Bentornato, ${user.nome}${vipBadge}`;

  } catch (error) {
    console.error('Errore inizializzazione:', error);
    redirectToLogin();
  }
}

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (error) {
    console.error('Errore logout:', error);
    window.location.href = '/';
  }
});

// Avvia inizializzazione
init();

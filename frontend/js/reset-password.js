// Password Reset Request
document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    // Reset messages
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Invio in corso...';

    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        // Always show success message (anti-enumeration)
        successMessage.textContent = 'Se l\'email esiste nel nostro sistema, riceverai un link per reimpostare la password.';
        successMessage.classList.remove('hidden');

        // Hide the form
        document.getElementById('reset-form').style.display = 'none';

    } catch (error) {
        console.error('Errore:', error);
        errorMessage.textContent = 'Si è verificato un errore. Riprova più tardi.';
        errorMessage.classList.remove('hidden');

        submitBtn.disabled = false;
        submitBtn.textContent = 'Invia Link di Reset';
    }
});

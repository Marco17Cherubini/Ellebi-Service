// New Password Form Handler
(function () {
    // Extract token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        document.getElementById('error-message').textContent = 'Link non valido o scaduto.';
        document.getElementById('error-message').classList.remove('hidden');
        document.getElementById('new-password-form').style.display = 'none';
        return;
    }

    document.getElementById('new-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const errorMessage = document.getElementById('error-message');
        const successMessage = document.getElementById('success-message');

        // Reset messages
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');

        // Validate passwords match
        if (password !== confirmPassword) {
            errorMessage.textContent = 'Le password non coincidono.';
            errorMessage.classList.remove('hidden');
            return;
        }

        // Validate password length
        if (password.length < 8) {
            errorMessage.textContent = 'La password deve essere di almeno 8 caratteri.';
            errorMessage.classList.remove('hidden');
            return;
        }

        // Disable button
        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvataggio...';

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Errore nel reset della password');
            }

            // Success
            successMessage.textContent = 'Password aggiornata con successo! Verrai reindirizzato al login...';
            successMessage.classList.remove('hidden');
            document.getElementById('new-password-form').style.display = 'none';

            // Redirect to login after 2 seconds
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);

        } catch (error) {
            console.error('Errore:', error);
            errorMessage.textContent = error.message || 'Si è verificato un errore. Riprova più tardi.';
            errorMessage.classList.remove('hidden');

            submitBtn.disabled = false;
            submitBtn.textContent = 'Salva Password';
        }
    });
})();

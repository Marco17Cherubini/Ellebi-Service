module.exports = {
    apps: [{
        name: 'lb-service',
        script: 'server/server.js',

        // Auto-restart
        autorestart: true,
        watch: false, // Non riavviare su modifiche file (per produzione)
        max_memory_restart: '500M', // Riavvia se usa più di 500MB

        // Restart policy
        restart_delay: 1000, // Attendi 1s prima di riavviare
        max_restarts: 10, // Max 10 restart in caso di errori continui
        min_uptime: 5000, // Considera "avviato" dopo 5s

        // Environment
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },

        // Logging
        error_file: 'logs/error.log',
        out_file: 'logs/output.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        merge_logs: true,

        // Kill timeout
        kill_timeout: 5000
    }]
};

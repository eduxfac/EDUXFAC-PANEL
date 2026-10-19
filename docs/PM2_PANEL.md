# PM2 PANEL y WEB: staging

Configuración generada en /lab/fase9/ecosystem.config.js por bootstrap, fuera de package type=module. Entradas: PANEL server/start.mjs y WEB staging/phase9/web-entry.mjs. Usuarios no root; autorestart/backoff, kill_timeout 15s, logs separados. PM2_HOME=/lab/fase9/pm2. Entrypoint explícito evita la incompatibilidad del guard argv con PM2.

Validados en laboratorio: start, stop, restart, reload (modo fork: interrupción breve), crash SIGKILL con PID nuevo, save/kill/resurrect. Guardar dump sólo donde modo 600/700: el dump PM2 incluye entorno y nunca debe publicarse ni adjuntarse como log. No imprimir jlist sin seleccionar campos seguros.

Para reinicio Linux se simuló stop/start del contenedor con datos persistidos en su filesystem; no es validación de systemd en VPS. Futuro: pm2 startup bajo usuario de aplicación y pm2 save sólo después de revisar env/permisos; validar systemd en staging del futuro host con autorización.

Parada limpia: SIGTERM/SIGINT cierran server, workers y pools. Reinicio PG independiente reconecta. Defaults de desarrollo: workers false; flags true existen únicamente en ecosistema efímero del laboratorio. FASE9 deja contenedor detenido.

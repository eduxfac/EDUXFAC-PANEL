# Nginx local

Plantilla probada staging/phase9/nginx.conf: panel.local/web.local, HTTP8080 -> HTTPS8443, upstreams loopback4311/3001, TLS1.2/1.3 CA ficticia. Sin puertos host publicados ni certificados/dominios reales.

Host original $http_host conservado para Origin/CSRF. PANEL body32k; WEB30m para recursos existentes; login WEB se limita a16k. Connect timeout2s, read15s; 502 con app apagada y 504 probado contra stub que no responde (timeout1s sólo en ese ensayo). Health Panel y WEB devuelven JSON por proxy.

Nginx rate login10r/s burst20, interno60r/s burst100, 429 explícito. No hay WebSocket en el runtime auditado: no aplicable; si se agrega, incluir Upgrade/Connection con mapa y probar.

Logs usan método/URI sin querystring/estado/duración, sin cuerpos ni Authorization. Nginx error log warn revisado; access/error también requieren rotación. X-Forwarded-Proto no usado como autorización ciega; Panel Secure deriva de configuración HTTPS y WEB JWT no usa cookies.

Producción futura: reemplazar server_name sólo tras autorización DNS/TLS; Nginx443 y80, Node privado, certificados reales por custodia. Agregar HSTS sólo después de verificar el dominio y subdominios. No ejecutar esta plantilla directamente en VPS sin revisar rutas, permisos, límites y backup.

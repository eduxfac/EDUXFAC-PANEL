-- Configuración fiscal por sucursal. No activa ni transmite facturación electrónica.
CREATE TABLE web_sucursales_fiscales (
 id TEXT PRIMARY KEY,
 empresa_id TEXT NOT NULL REFERENCES web_empresas(id) ON DELETE CASCADE,
 es_principal INTEGER NOT NULL DEFAULT 0 CHECK(es_principal IN (0,1)),
 razon_social TEXT NOT NULL,
 nombre_comercial TEXT,
 nombre_interno TEXT,
 ruc TEXT NOT NULL CHECK(length(ruc)=11 AND ruc NOT GLOB '*[^0-9]*'),
 ubigeo TEXT NOT NULL CHECK(length(ubigeo)=6 AND ubigeo NOT GLOB '*[^0-9]*'),
 departamento TEXT NOT NULL,
 provincia TEXT NOT NULL,
 distrito TEXT NOT NULL,
 codigo_ccea TEXT NOT NULL CHECK(length(codigo_ccea)=4 AND codigo_ccea NOT GLOB '*[^0-9]*'),
 direccion_fiscal TEXT NOT NULL,
 regimen_tributario TEXT NOT NULL CHECK(regimen_tributario IN ('NRUS','RER','RMT','RG')),
 configuracion_completa INTEGER NOT NULL DEFAULT 0 CHECK(configuracion_completa IN (0,1)),
 puede_facturar INTEGER NOT NULL DEFAULT 0 CHECK(puede_facturar IN (0,1)),
 moneda_base TEXT NOT NULL DEFAULT 'PEN' CHECK(moneda_base IN ('PEN','USD')),
 igv_porcentaje REAL NOT NULL DEFAULT 18 CHECK(igv_porcentaje>=0 AND igv_porcentaje<=100),
 afecto_igv INTEGER NOT NULL DEFAULT 1 CHECK(afecto_igv IN (0,1)),
 telefono TEXT,
 celular TEXT,
 correo_cpe TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX web_sucursal_fiscal_principal ON web_sucursales_fiscales(empresa_id) WHERE es_principal=1;
CREATE INDEX web_sucursales_fiscales_empresa ON web_sucursales_fiscales(empresa_id);

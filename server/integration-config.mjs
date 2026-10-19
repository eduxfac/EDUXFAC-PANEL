export const BACKOFF_MS=Object.freeze([60000,300000,900000,1800000,3600000]);
export function workerConfiguration(env=process.env){
 const flag=k=>{const v=env[k]??'false';if(!['true','false'].includes(v))throw Error('Configuración de worker inválida: '+k);return v==='true';};
 const interval=(k,def)=>{const n=Number(env[k]??def);if(!Number.isSafeInteger(n)||n<60000||n>86400000)throw Error('Intervalo de worker inválido: '+k);return n;};
 const max=Number(env.MAX_INTEGRATION_RETRIES??5);if(!Number.isSafeInteger(max)||max<1||max>20)throw Error('Máximo de intentos inválido.');
 return {integrationEnabled:flag('INTEGRATION_WORKER_ENABLED'),integrationInterval:interval('INTEGRATION_WORKER_INTERVAL_MS',60000),
 reconciliationEnabled:flag('RECONCILIATION_WORKER_ENABLED'),reconciliationInterval:interval('RECONCILIATION_WORKER_INTERVAL_MS',300000),
 expirationEnabled:flag('EXPIRATION_WORKER_ENABLED'),expirationInterval:interval('EXPIRATION_WORKER_INTERVAL_MS',60000),maxAttempts:max};
}
export const nextBackoff=attempt=>{if(!Number.isSafeInteger(attempt)||attempt<1)throw Error('Intento inválido.');return BACKOFF_MS[Math.min(attempt-1,BACKOFF_MS.length-1)];};

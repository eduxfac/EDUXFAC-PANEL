import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {subscriptionDisplay} from '../server/web-subscriptions.mjs';
const end=Date.parse('2026-12-01T05:00:00Z'),DAY=86400000;
const s={estado:'ACTIVA',fecha_vencimiento:new Date(end).toISOString(),precio_asignado_centavos:5900};
test('Panel distingue vigencia, tres días de gracia y vencimiento definitivo',()=>{
 assert.equal(subscriptionDisplay(s,end-DAY).estado_efectivo,'ACTIVA');
 for(const day of [1,2,3]){const r=subscriptionDisplay(s,end+(day-1)*DAY);assert.equal(r.estado_efectivo,'EN_GRACIA');assert.equal(r.dias_vencidos,day);assert.equal(r.fecha_vencimiento,s.fecha_vencimiento);}
 assert.equal(subscriptionDisplay(s,end+3*DAY).estado_efectivo,'VENCIDA');
 assert.equal(subscriptionDisplay({...s,estado:'SUSPENDIDA'},end+DAY).estado_efectivo,'SUSPENDIDA');
});
test('Panel elimina rótulos de entorno sin cambiar validaciones del servidor',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.ok(!html.includes('ENTORNO PILOTO'));assert.ok(!html.includes('data-env-label'));
});

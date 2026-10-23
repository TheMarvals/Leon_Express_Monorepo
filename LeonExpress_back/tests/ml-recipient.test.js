const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const { recipientFromShipment, missingContactPatch } = require('../utils/mlRecipient');
const { applyContact } = require('../services/mlRecipientService');
function service(gateway) {
  const file=path.resolve(__dirname,'../services/mlRecipientService.js'), original=createRequire(file),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,console,require:id=>id==='./mlLiveShipments'?gateway:original(id)});
  return module.exports;
}
const original = { ml_shipment_external_id:'123',ml_account_id:'a',buyer_name:'XXXXXXX',buyer_phone:'XXXXXXX',buyer_address:'XXXXXXX' };
const good = { ...original,buyer_name:'Cliente',buyer_phone:'+56912345678',buyer_address:JSON.stringify({address_line:'Calle 1',city:{name:'Macul'},comment:'Depto 4'}) };
test('importación recupera datos y mantiene referencias de dirección',async()=>{
  const s=await service({refreshShipmentDetails:async()=>good}).prepareShipment(original);
  assert.equal(s.recipient_name,'Cliente');assert.equal(s.destination_address,'Calle 1, Macul, Depto 4');
});
test('rechaza datos ocultos y permite revisión de foto en lugar de crear paquete',async()=>{
  await assert.rejects(service({refreshShipmentDetails:async()=>original}).prepareShipment(original),e=>e.status===409&&e.allowPhoto);
});
test('no bloquea un envío completo si únicamente falta teléfono y ML no responde',async()=>{
  const s=await service({refreshShipmentDetails:async()=>{throw Error('offline')}}).prepareShipment({...good,buyer_phone:''});
  assert.equal(s.recipient_name,'Cliente');assert.equal(s.recipient_phone,'');
});
test('rechaza datos de otra cuenta incluso con nombre y dirección ya disponibles',async()=>{
  await assert.rejects(service({refreshShipmentDetails:async()=>({...good,ml_account_id:'other'})}).prepareShipment({...good,buyer_phone:''}),e=>e.status===403);
});
test('rellena exclusivamente campos incompletos y conserva datos operativos',()=>{
  const patch=missingContactPatch({recipient_name:'Nombre corregido',recipient_phone:'XXXXXXX',destination_address:'Dirección corregida',status:'ENTREGADO'},recipientFromShipment(good));
  assert.deepEqual(patch,{recipient_phone:'+56912345678'});
});
function fixture(failAudit=false){
  const pkg={package_id:'p',client_id:'c',external_tracking_code:'123',recipient_name:'XXXXXXX',recipient_phone:'',destination_address:'XXXXXXX',status:'ENTREGADO',pickup_id:'pickup',delivered_datetime:'yesterday',update:async function(patch){Object.assign(this,patch)}};
  const audits=[];
  const models={Package:{findByPk:async()=>pkg},AuditLog:{create:async a=>{if(failAudit)throw Error('audit failure');audits.push(a)}},sequelize:{transaction:async fn=>{const backup={...pkg};try{return await fn({LOCK:{UPDATE:'UPDATE'}})}catch(e){Object.assign(pkg,backup);throw e}}}};
  return {pkg,models,audits};
}
test('reparación auditada es idempotente y conserva estado, colecta y entrega',async()=>{
  const f=fixture(); const c=recipientFromShipment(good);
  assert.equal((await applyContact(f.models,'p','c','123',c)).length,3);
  assert.equal((await applyContact(f.models,'p','c','123',c)).length,0);
  assert.equal(f.audits.length,1);assert.equal(f.pkg.status,'ENTREGADO');assert.equal(f.pkg.pickup_id,'pickup');assert.equal(f.pkg.delivered_datetime,'yesterday');
});
test('reparación no toca otra cuenta o tracking',async()=>{
  const f=fixture();assert.deepEqual(await applyContact(f.models,'p','other','123',recipientFromShipment(good)),[]);assert.deepEqual(await applyContact(f.models,'p','c','999',recipientFromShipment(good)),[]);assert.equal(f.audits.length,0);
});
test('fallar la auditoría revierte toda la reparación',async()=>{
  const f=fixture(true);await assert.rejects(applyContact(f.models,'p','c','123',recipientFromShipment(good)),/audit failure/);assert.equal(f.pkg.recipient_name,'XXXXXXX');
});
test('simulación informa campos sin guardar cambios',async()=>{
  const f=fixture();assert.equal((await applyContact(f.models,'p','c','123',recipientFromShipment(good),{dryRun:true})).length,3);assert.equal(f.pkg.recipient_name,'XXXXXXX');assert.equal(f.audits.length,0);
});

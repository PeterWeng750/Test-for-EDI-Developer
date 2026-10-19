const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../app/static/data.js');
const row=(more={})=>({job:'Job 1',invoice:'INV1',container:'ABC1',cartons:100,cbm:12.5,eta:'2026-10-01T00:00:00',ata:'2026-10-02T00:00:00',carrier:'Demo',received_first:'2026-09-28T10:00:00',complete:'2026-10-01T10:00:00',customs:'2026-10-02T10:00:00',plan:'2026-10-04T00:00:00',delivered:'',...more});
const headers=D.FIELDS.map(([k,v])=>v);
const source=r=>D.FIELDS.map(([k])=>k==='received'?'2026-09-25 09:00:00 2026-09-27 14:30:00':r[k]??'');

test('date formats and impossible dates',()=>{
  assert.equal(D.dateValue(20261001),'2026-10-01T00:00:00');
  assert.equal(D.dateValue('1/10/2026'),'2026-10-01T00:00:00');
  assert.equal(D.dateValue(new Date('2026-10-01T13:00:00Z')),'2026-10-01T13:00:00');
  assert.throws(()=>D.dateValue('2026-02-31'));
  assert.throws(()=>D.dateValue('not a date'));
});
test('parse receipt dates, ignore declaration code, report invalid rows',()=>{
  const r=row({container_count:1,file_date:20261001});
  const parsed=D.parseSheets([{name:'Data',rows:[headers,source(r),['stray row']]}]);
  assert.equal(parsed.rows.length,1);assert.equal(parsed.errors.length,1);
  assert.equal(parsed.rows[0].record.received_first,'2026-09-25T09:00:00');
  assert.equal(parsed.rows[0].record.received_latest,'2026-09-27T14:30:00');
  assert.ok(!('declaration_status' in parsed.rows[0].record));
});
test('job totals and independent invoice/container counts',()=>{
  const rows=[row(),row({container:'ABC2'}),row({invoice:'INV2',container:'ABC1'})];
  const c=D.dashboard(rows,null,'2026-10-10').counts;
  assert.equal(c.jobs,1);assert.equal(c.invoices,2);assert.equal(c.containers,2);assert.equal(c.cartons,100);assert.equal(c.cbm,12.5);assert.equal(c.overdue,3);
});
test('delivery ratio excludes missing plans; date-level comparison',()=>{
  const c=D.dashboard([row({delivered:'2026-10-04T23:59:59'}),row({container:'2',delivered:'2026-10-05T00:00:00'}),row({container:'3',plan:'',delivered:'2026-10-04T00:00:00'})],null,'2026-10-10').counts;
  assert.equal(c.on_time,1);assert.equal(c.late,1);assert.equal(c.unknown_plan,1);assert.equal(c.on_time_rate,50);
});
test('filters are header-aware and use separate receipt dates',()=>{
  const rows=[row({received_latest:'2026-10-03T12:00:00'}),row({container:'2',received_latest:''})];
  assert.equal(D.filter(rows,new URLSearchParams('date_field=received_latest&from=2026-10-03&to=2026-10-03')).length,1);
  assert.equal(D.filter(rows,new URLSearchParams('f_cartons=99')).length,0);
  assert.equal(D.filter(rows,new URLSearchParams('q=inv1')).length,2);
  assert.throws(()=>D.filter(rows,new URLSearchParams('from=2026-10-04&to=2026-10-01')));
});
test('duplicate rows, changed-key conflicts, formulas and unknown headers',()=>{
  const r=source(row({container_count:1}));
  assert.equal(D.parseSheets([{name:'D',rows:[headers,r,r]}]).duplicates_in_file,1);
  const changed=[...r];changed[headers.indexOf('Carrier Name')]='Other';
  assert.throws(()=>D.parseSheets([{name:'D',rows:[headers,r,changed]}]),/ซ้ำ/);
  const formula=[...r];formula[0]={formula:'1+1'};
  assert.equal(D.parseSheets([{name:'D',rows:[headers,formula]}]).errors.length,1);
  const extras=D.parseSheets([{name:'D',rows:[[...headers,'Customer'],[...r,'Demo']]}]);
  assert.equal(extras.rows[0].record['extra:Customer'],'Demo');
});
test('preview distinguishes new/changed/unchanged and preserves version',()=>{
  const r=row();const parsed={rows:[{key:D.key(r),record:r},{key:D.key(row({container:'2'})),record:row({container:'2'})}],errors:[],duplicates_in_file:0};
  const prepared=D.prepare(parsed,{records:[{key:D.key(r),data:r,version:5}]});
  assert.deepEqual(prepared.counts,{new:1,updated:0,unchanged:1,invalid:0});assert.equal(prepared.rows[0].old_version,5);
});
test('inconsistent job totals cannot be saved',()=>{
  assert.throws(()=>D.validateTotals([row(),row({container:'2',cartons:200})]),/Cartons/);
});
test('lead times require all rows in a job to be complete',()=>{
  const lead=D.dashboard([row(),row({container:'2',delivered:'2026-10-05T00:00:00'})]).lead;
  assert.equal(lead.some(l=>l.label==='ศุลกากร → ส่งมอบ'),false);
});

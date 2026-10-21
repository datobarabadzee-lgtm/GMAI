import {MedicationStore} from './store.mjs';
const s=await new MedicationStore().init();
const result=await s.lookup('colchicine',{limit:100});
const c=result.candidates.find(x=>x.source==='label'&&['brand_name','generic_name'].includes(x.name_type));
const preview=await s.fetchCandidate('colchicine',c.record_id);
console.log(JSON.stringify({live_fetch:'passed',record_id:c.record_id,source_id:preview.source.id,set_id:preview.source.set_id,has_dosage_section:!!preview.source.dosage_and_administration,allow_instruction_generation:preview.allow_instruction_generation}));

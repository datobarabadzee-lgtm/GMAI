// Server-only Node.js runtime. Never import into a client component or Edge runtime.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const defaultRoot=path.dirname(fileURLToPath(import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const own=(o,k)=>Object.hasOwn(o,k)?o[k]:undefined;
export class MedicationStore {
  constructor({root=defaultRoot,fetchImpl=globalThis.fetch,resolveConfirmation=async()=>null}={}) {
    this.root=root;this.fetchImpl=fetchImpl;this.resolveConfirmation=resolveConfirmation;this.cache=new Map();
  }
  async init(){
    this.manifest=JSON.parse(await readFile(path.join(this.root,'manifest.json'),'utf8'));
    this.fold=JSON.parse(await readFile(path.join(this.root,'casefold.json'),'utf8'));return this;
  }
  normalize(s){
    if(typeof s!=='string'||s.length>500)throw Error('INVALID_QUERY');
    return [...s.normalize('NFC')].map(c=>own(this.fold,c)??c.toLowerCase()).join('').replace(/[\s\u001c-\u001f\u0085]+/gu,' ').trim();
  }
  async load(file){
    if(this.cache.has(file))return this.cache.get(file);
    const meta=own(this.manifest.files,file);if(!meta)throw Error('UNKNOWN_SHARD');
    const bytes=await readFile(path.join(this.root,file));
    if(hash(bytes)!==meta.sha256)throw Error('DATA_INTEGRITY_FAILURE');
    const data=JSON.parse(gunzipSync(bytes));
    if(this.cache.size>=8)this.cache.delete(this.cache.keys().next().value);
    this.cache.set(file,data);return data;
  }
  async matches(query){
    const q=this.normalize(query);if(!q)return {f:[],m:[]};
    const file=`data/names/${hash(q).slice(0,2)}.json.gz`;
    return own(await this.load(file),q)??{f:[],m:[]};
  }
  async record(id){
    if(!Number.isSafeInteger(id)||id<1)throw Error('INVALID_RECORD_ID');
    const data=await this.load(`data/records/${(id%256).toString(16).padStart(2,'0')}.json.gz`);
    const r=own(data,String(id));if(!r)throw Error('UNKNOWN_RECORD');
    return {record_id:id,source:r[0],external_id:r[1],group_id:r[2],snapshot_effective_time:r[3]};
  }
  async lookup(query,{offset=0,limit=20}={}){
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_PAGE');
    const m=await this.matches(query);const mis=m.m.length?await this.load('data/mis.json.gz'):{};
    const candidates=await Promise.all(m.f.slice(offset,offset+limit).map(async([id,kind,display])=>({...await this.record(id),name_type:kind,matched_name:display})));
    return {query,status:m.f.length?'product_selection_required':m.m.length?'catalog_name_only':'unknown_name',candidates,total:m.f.length,offset,limit,mis_catalog:m.m.map(id=>own(mis,id)),allow_instruction_generation:false,fuzzy_matching_used:false};
  }
  async fetchCandidate(query,id){
    const m=await this.matches(query);
    // Substance-only matches and unapproved MIS crosswalks cannot authorize a product.
    if(!m.f.some(([rid,kind])=>rid===id&&['brand_name','generic_name'].includes(kind)))throw Error('IDENTITY_MISMATCH');
    const meta=await this.record(id);const field=meta.source==='label'?'id':'product_id';
    if(!/^[A-Za-z0-9_-]+$/.test(meta.external_id))throw Error('INVALID_SOURCE_ID');
    const url=new URL(`https://api.fda.gov/drug/${meta.source}.json`);
    url.searchParams.set('search',`${field}:"${meta.external_id}"`);url.searchParams.set('limit','2');
    if(process.env.OPENFDA_API_KEY)url.searchParams.set('api_key',process.env.OPENFDA_API_KEY);
    let response;
    try{response=await this.fetchImpl(url,{signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw Error('SOURCE_UNAVAILABLE');}
    if(!response.ok)throw Error('SOURCE_UNAVAILABLE');
    const reader=response.body.getReader();let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8_000_000){await reader.cancel();throw Error('SOURCE_TOO_LARGE');}chunks.push(Buffer.from(value));}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('SOURCE_INVALID');}
    if(!Array.isArray(data.results)||data.results.length!==1||data.results[0][field]!==meta.external_id)throw Error('SOURCE_ID_MISMATCH');
    const source=data.results[0];
    if(meta.source==='label'&&source.set_id!==meta.group_id)throw Error('SOURCE_GROUP_MISMATCH');
    const currentNames=meta.source==='label'?source.openfda:source;
    const names=['brand_name','generic_name'].flatMap(k=>typeof currentNames?.[k]==='string'?[currentNames[k]]:Array.isArray(currentNames?.[k])?currentNames[k]:[]);
    if(!names.some(n=>typeof n==='string'&&this.normalize(n)===this.normalize(query)))throw Error('SOURCE_NAME_CHANGED');
    return {meta,source,content_sha256:hash(JSON.stringify(source)),retrieved_at:new Date().toISOString(),allow_instruction_generation:false};
  }
  async context(query,id,confirmationToken){
    // Token must resolve to server-owned, user/product-specific approval, never an LLM boolean.
    const receipt=await this.resolveConfirmation(confirmationToken);
    if(!receipt||receipt.record_id!==id||receipt.query_normalized!==this.normalize(query)||!(receipt.expires_at>Date.now()))throw Error('PRODUCT_CONFIRMATION_REQUIRED');
    const candidate=await this.fetchCandidate(query,id);
    if(receipt.content_sha256!==candidate.content_sha256)throw Error('SOURCE_CHANGED_RECONFIRM');
    return {...candidate,clinical_text_available:candidate.meta.source==='label',identity_confirmed:true,clinical_validation_performed:false,executable_prescription:false};
  }
}

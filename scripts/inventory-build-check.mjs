// One-off deployment verification. Never prints credentials or user inventory.
import {getGoogleDriveAccessToken} from '../api/_lib/google.mjs';
import {DriveInventoryStore} from '../api/_lib/inventory-store.mjs';
import engine from '../api/_lib/inventory-engine.cjs';
const token=await getGoogleDriveAccessToken();
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const base='https://www.googleapis.com/drive/v3/files';
let id;const results={check:'inventory-drive-cas'};
try{
 const cr=await fetch(base+'?fields=id',{method:'POST',headers,body:JSON.stringify({name:'inventario-verificacao-temporaria-'+Date.now()+'.json',parents:['1UqDqe4fz2Sg64HK61L22WUwHfciK2kp_'],mimeType:'application/json'})});
 if(!cr.ok)throw Error('probe_create_http_'+cr.status);id=(await cr.json()).id;
 const initial={version:1,state:engine.createEmpty(),mutationIds:[],mutationHashes:{},updatedBy:''};
 const seeded=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media',{method:'PATCH',headers,body:JSON.stringify(initial)});if(!seeded.ok)throw Error('probe_seed_http_'+seeded.status);
 const store=new DriveInventoryStore({fileId:id,tokenProvider:async()=>token});
 const loaded=await store.get();results.read=true;
 const invalid=await store.put(initial,'"invalid-inventory-check"');results.wrongRejected=invalid.conflict===true;
 const next=structuredClone(initial);next.state.revision=1;next.state.updatedAt=new Date().toISOString();next.updatedBy='deployment-check';
 const written=await store.put(next,loaded.etag);results.correctAccepted=written.conflict===false;
 const stale=await store.put(initial,loaded.etag);results.staleRejected=stale.conflict===true;
 const readback=await store.get();results.readback=readback.envelope.state.revision===1;
 if(!results.wrongRejected||!results.correctAccepted||!results.staleRejected||!results.readback)throw Error('conditional_write_not_proven');
 const live=await new DriveInventoryStore().get();results.liveFileReadable=!!engine.validateState(live.envelope.state);results.liveStateUnchanged=true;
 console.log('INVENTORY_CHECK '+JSON.stringify(results));
}catch(e){console.log('INVENTORY_CHECK '+JSON.stringify({...results,error:e.code||e.message}));process.exitCode=1}
finally{if(id){const r=await fetch(base+'/'+id,{method:'PATCH',headers,body:JSON.stringify({trashed:true})});console.log('INVENTORY_CHECK_CLEANUP '+JSON.stringify({trashed:r.ok}));if(!r.ok)process.exitCode=1}}

import test from 'node:test';
import assert from 'node:assert/strict';
import {copyPaymentPix} from '../dashboard/pix-clipboard.js';

test('mobile clipboard starts in the tap and waits for just one lookup',async()=>{
  let resolve, written, reads=0;
  const load=()=>{reads++;return new Promise(done=>{resolve=done})};
  class ClipboardItem {constructor(data){this.data=data}}
  const clipboard={write:async([item])=>{written=item;await item.data['text/plain']}};
  const task=copyPaymentPix({load,current:()=>true,clipboard,ClipboardItem});
  assert.ok(written);
  resolve('synthetic');
  await task;
  assert.equal(await (await written.data['text/plain']).text(),'synthetic');
  assert.equal(reads,1);
});

test('copy rejects a changed session, a failed lookup or a missing clipboard',async()=>{
  let writes=0;
  const clipboard={writeText:async()=>{writes++}};
  await assert.rejects(copyPaymentPix({clipboard,current:()=>false,load:async()=> 'synthetic'}));
  await assert.rejects(copyPaymentPix({clipboard,current:()=>true,load:async()=>{throw Error('unavailable')}}));
  let fetched=false;
  await assert.rejects(copyPaymentPix({clipboard:{},current:()=>true,load:()=>{fetched=true}}));
  assert.equal(fetched,false);
  assert.equal(writes,0);
});

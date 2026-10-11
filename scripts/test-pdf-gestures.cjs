// Run with Playwright available through NODE_PATH; CHROME_PATH is optional.
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    for (const width of [390,768,1000]) {
      const page=await browser.newPage({viewport:{width,height:850},hasTouch:true});
      await page.setContent('<style>body{margin:0}#v{width:100vw;height:650px;overflow:auto}</style><div id="v"><div id="s"></div></div>');
      await page.addScriptTag({path:path.join(__dirname,'../sistema/pdf-viewer.js')});
      const result=await page.evaluate(async()=>{
        let renders=0;
        const doc={numPages:3,getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:900*scale}),render:({canvasContext,viewport})=>{
          renders++;canvasContext.fillStyle='#173b54';canvasContext.fillRect(0,0,viewport.width,viewport.height);
          return {promise:Promise.resolve(),cancel(){}};
        }})};
        const v=document.querySelector('#v');const viewer=new AgoraPdfViewer(v,document.querySelector('#s'),()=>{});
        await viewer.open(doc);await viewer.paint();
        const pixels=[...viewer.tiles.values()].map(t=>t.canvas),before=renders;
        const cx=v.clientWidth/2,cy=300;
        const touch=(type,d)=>v.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:d===null?[]:[
          new Touch({identifier:1,target:v,clientX:cx-d/2,clientY:cy}),
          new Touch({identifier:2,target:v,clientX:cx+d/2,clientY:cy})]}));
        touch('touchstart',40);touch('touchmove',49.48);
        const fractional=viewer.z;
        for (const distance of [60,80,120,200,320]) touch('touchmove',distance);
        await new Promise(r=>setTimeout(r,180));
        const during={zoom:viewer.z,renderCount:renders,kept:pixels.every(c=>c.isConnected),
          anchorX:(v.scrollLeft+cx)/viewer.z,anchorY:(v.scrollTop+cy)/viewer.z};
        touch('touchend',null);await new Promise(r=>setTimeout(r,180));
        const after={refined:renders>before,oldGone:pixels.every(c=>!c.isConnected),
          maxCanvas:Math.max(...[...v.querySelectorAll('canvas')].map(c=>Math.max(c.width,c.height))),tiles:viewer.tiles.size};
        viewer.setZoom(4);await viewer.paint(); const buttonZoom=viewer.z;
        touch('touchstart',40);touch('touchmove',20);touch('touchcancel',null);
        await new Promise(r=>setTimeout(r,150));const cancelledGestureCleared=viewer.gesture===null;
        viewer.clear();await new Promise(r=>setTimeout(r,150));
        return {fractional,before,during,after,cx,cy,buttonZoom,cancelledGestureCleared,cleared:v.querySelectorAll('canvas').length===0};
      });
      assert(Math.abs(result.fractional-1.237)<.0001);
      assert.equal(result.during.zoom,8); assert.equal(result.during.renderCount,result.before);
      assert(result.during.kept,'Rendered content must remain visible throughout pinch');
      assert(Math.abs(result.during.anchorX-result.cx)<1); assert(Math.abs(result.during.anchorY-result.cy)<1);
      assert(result.after.refined);assert(result.after.oldGone);assert(result.after.maxCanvas<=1024);assert(result.after.tiles<20);
      assert.equal(result.buttonZoom,4);assert(result.cancelledGestureCleared);assert(result.cleared);
      console.log(`PASS ${width}px: continuous 100–800% pinch, retained pixels, focal point, refinement, cancellation, cleanup`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

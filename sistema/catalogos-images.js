(function(root){
  'use strict';
  let activeDialog=null;
  function validImage(image){
    return image && typeof image.dataUrl==='string' && image.dataUrl.length<=560100 &&
      /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image.dataUrl) &&
      Number.isInteger(image.page) && image.page>0 &&
      Number.isInteger(image.width) && image.width>0 && image.width<=2200 &&
      Number.isInteger(image.height) && image.height>0 && image.height<=2200 &&
      !!root.CatalogChat.sourceUrl(image.sourceUrl);
  }
  function element(tag,cls,text){
    const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;
  }
  function close(){
    if(activeDialog){const dialog=activeDialog;activeDialog=null;dialog.close();dialog.remove();}
  }
  function show(image,trigger){
    close();
    const dialog=element('dialog','catalog-image-dialog');
    dialog.setAttribute('aria-label','Imagem do catálogo ampliada');
    const header=element('div','catalog-image-dialog-header');
    header.append(element('strong','',image.caption||'Recorte do catálogo'));
    const button=element('button','catalog-image-close','Fechar ×');button.type='button';
    button.addEventListener('click',close);header.append(button);dialog.append(header);
    const viewport=element('div','catalog-image-viewport');
    const img=element('img','catalog-image-full');img.src=image.dataUrl;img.alt=image.caption||'Recorte original';
    viewport.append(img);dialog.append(viewport);
    dialog.append(element('p','catalog-image-origin',image.filename+' · Página física '+image.page));
    dialog.addEventListener('close',()=>{dialog.remove();if(activeDialog===dialog)activeDialog=null;if(trigger?.isConnected)trigger.focus();});
    document.body.append(dialog);activeDialog=dialog;dialog.showModal();
  }
  function mount(container,images){
    const accepted=Array.isArray(images)?images.filter(validImage).slice(0,6):[];
    if(!accepted.length)return;
    const gallery=element('section','catalog-image-gallery');
    gallery.setAttribute('aria-label','Recortes originais dos catálogos');
    for(const image of accepted){
      const figure=element('figure','catalog-image-card');
      const button=element('button','catalog-image-open');button.type='button';
      button.setAttribute('aria-label','Ampliar: '+(image.caption||'recorte do catálogo'));
      const img=element('img','');img.src=image.dataUrl;img.alt=image.caption||'Recorte original do catálogo';
      img.width=image.width;img.height=image.height;img.loading='lazy';img.decoding='async';
      button.append(img,element('span','catalog-image-zoom','Ampliar imagem'));
      button.addEventListener('click',()=>show(image,button));figure.append(button);
      const caption=element('figcaption','');
      caption.append(element('strong','',image.caption||'Recorte do catálogo'));
      const link=element('a','catalog-image-origin',image.filename+' · Página física '+image.page);
      link.href=root.CatalogChat.sourceUrl(image.sourceUrl);link.target='_blank';link.rel='noopener noreferrer';
      caption.append(link);figure.append(caption);gallery.append(figure);
    }
    container.append(gallery);
    container.append(element('p','catalog-image-note','Recortes do arquivo original. A página física pode diferir da numeração impressa; preços e validade devem ser conferidos na resposta.'));
  }
  root.CatalogImages={mount,close,validImage};
})(globalThis);

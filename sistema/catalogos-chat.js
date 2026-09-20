(function(root){
  'use strict';
  function escape(text){return String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function sourceUrl(value){
    try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['drive.google.com','docs.google.com'].includes(u.hostname)?u.href:'';}catch{return '';}
  }
  function styled(text){
    // Escape everything before introducing our own small set of HTML tags.
    return escape(text).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
  }
  function inline(text){
    const pattern=/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;let out='',cursor=0;
    for(const match of String(text).matchAll(pattern)){
      out+=styled(text.slice(cursor,match.index));const url=sourceUrl(match[2]);
      out+=url?'<a target="_blank" rel="noopener noreferrer" href="'+escape(url)+'">'+styled(match[1])+'</a>':styled(match[0]);
      cursor=match.index+match[0].length;
    }
    return out+styled(text.slice(cursor));
  }
  function render(text){
    const lines=String(text??'').split(/\r?\n/);let out='',list='';
    function close(){if(list){out+='</'+list+'>';list='';}}
    for(let i=0;i<lines.length;i++){
      const line=lines[i].trim();
      if(!line){close();continue;}
      if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){
        close();const cells=s=>s.replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim()));
        out+='<div class="chat-table-wrap"><table><thead><tr>'+cells(line).map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>';i++;
        while(i+1<lines.length&&lines[i+1].includes('|')){out+='<tr>'+cells(lines[++i].trim()).map(c=>'<td>'+c+'</td>').join('')+'</tr>';}
        out+='</tbody></table></div>';continue;
      }
      const heading=line.match(/^#{1,6}\s+(.+)$/),item=line.match(/^(?:([-*])|\d+[.)])\s+(.+)$/);
      if(heading){close();out+='<h4>'+inline(heading[1])+'</h4>';}
      else if(item){const kind=item[1]?'ul':'ol';if(list!==kind){close();out+='<'+kind+'>';list=kind;}out+='<li>'+inline(item[2])+'</li>';}
      else{close();out+='<p>'+inline(line)+'</p>';}
    }
    close();return out;
  }
  function sources(files){return files.map(f=>{const label=escape(f.filename||f),url=sourceUrl(f.url);return url?'<a class="chat-source" target="_blank" rel="noopener noreferrer" href="'+escape(url)+'" title="'+escape(f.path||f.filename)+'">'+label+'</a>':'<span class="chat-source">'+label+'</span>';}).join('');}
  root.CatalogChat={render,sources,sourceUrl};
  if(typeof module!=='undefined')module.exports=root.CatalogChat;
})(globalThis);

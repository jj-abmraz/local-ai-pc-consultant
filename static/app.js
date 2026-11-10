const $ = id => document.getElementById(id);
let sessionId = localStorage.getItem('kontur-session'), busy = false, kind = '', products = [];
const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
function el(tag, cls, text) { const e=document.createElement(tag); if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e; }
function renderAdvice(target, text) {
 // Build DOM nodes instead of interpreting model-supplied HTML.
 target.replaceChildren();
 text=text.replace(/([.!?])(?=\d+[.)]\s)/g,'$1\n').replace(/([.!?])(?=[А-ЯЁA-Z])/g,'$1 ');
 function inline(parent,value){
  for(const part of value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)){
   if(part.startsWith('**')&&part.endsWith('**'))parent.append(el('strong','',part.slice(2,-2)));
   else if(part.startsWith('`')&&part.endsWith('`'))parent.append(el('code','',part.slice(1,-1)));
   else parent.append(document.createTextNode(part));
  }
 }
 let paragraph=null,list=null;
 for(const line of text.split('\n')){
  if(!line.trim()){paragraph=null;list=null;continue;}
  const item=line.match(/^\s*(?:(\d+)[.)]|([-*]))\s+(.+)$/);
  if(item){const tag=item[1]?'ol':'ul';if(!list||list.tagName.toLowerCase()!==tag){list=el(tag);if(item[1])list.start=Number(item[1]);target.append(list);}const li=el('li');inline(li,item[3]);list.append(li);paragraph=null;}
  else{list=null;if(!paragraph){paragraph=el('p');target.append(paragraph);}else paragraph.append(document.createTextNode(' '));inline(paragraph,line.trim());}
 }
}
async function api(path, data) {const r=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error||'Ошибка запроса'),value);return value;}
function showTab(name){$('chat-view').hidden=name!=='chat';$('catalog-view').hidden=name!=='catalog';$('chat-tab').classList.toggle('active',name==='chat');$('catalog-tab').classList.toggle('active',name==='catalog');}
function card(p) {
 const e=el('article','product'), art=el('div','device-art');
 // Static vector silhouettes; no remote image or tracking requests.
 art.innerHTML=p.kind==='laptop'?'<svg viewBox="0 0 120 80" fill="none" aria-hidden="true"><rect x="23" y="10" width="74" height="48" rx="4" stroke="currentColor" stroke-width="2"/><path d="M29 16h62v35H29z" fill="#dce6d6"/><path d="M23 58 10 68h100L97 58H23Z" stroke="currentColor" stroke-width="2"/><path d="M48 63h24" stroke="currentColor" stroke-width="2"/></svg>':'<svg viewBox="0 0 120 80" fill="none" aria-hidden="true"><rect x="39" y="5" width="42" height="69" rx="4" stroke="currentColor" stroke-width="2"/><path d="M69 6v67M45 16h17M45 22h17" stroke="currentColor"/><circle cx="53" cy="48" r="11" stroke="currentColor"/><circle cx="75" cy="15" r="2" fill="currentColor"/></svg>';
 e.append(art,el('div','product-type',p.kind==='laptop'?'НОУТБУК':'ГОТОВЫЙ КОМПЬЮТЕР'),el('h3','',p.name),el('div','specs',p.specs),el('div','product-price',money(p.price_rub)));
 const link=el('a','source-link','Регард · открыть источник ↗');link.href=p.source_url;link.target='_blank';link.rel='noopener noreferrer';
 const date=new Date(p.captured_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'});
 e.append(link,el('div','capture',`Снимок: ${date} МСК · ID ${p.id}`));
 const ask=el('button','ask-product','Обсудить с консультантом');ask.type='button';ask.onclick=()=>{showTab('chat');$('prompt').value=`Подойдёт ли ${p.name} (ID ${p.id}) для моих задач?`;$('prompt').focus();};e.append(ask);return e;
}
function welcome(){const w=el('div','welcome');w.append(el('div','assistant-icon','✳'),el('div','tag','ВАШ КОНСУЛЬТАНТ ПО ТЕХНИКЕ'),el('h2','','Найдём компьютер, который подходит вам.'),el('p','','Для работы, учёбы или любимых игр. Расскажите о задачах — я помогу разобраться в характеристиках и выбрать из 100 реальных предложений.'));const s=el('div','suggestions');for(const [title,sub,prompt] of [['Для работы и учёбы','Ноутбук до 70 000 ₽','Нужен ноутбук для учёбы и программирования до 70 тысяч рублей'],['Для игр и творчества','Компьютер до 150 000 ₽','Подбери игровой компьютер до 150 тысяч рублей']]){const b=el('button','suggestion',title+' ↗');b.append(el('span','',sub));b.onclick=()=>{$('prompt').value=prompt;$('prompt').focus();};s.append(b);}w.append(s);$('messages').replaceChildren(w);}
function renderMessage(m){const e=el('article',`message ${m.role} ${m.status==='error'?'error':''}`);e.append(el('div','message-label',m.role==='user'?'ВЫ':'✳ КОНСУЛЬТАНТ · QWEN'));const b=el('div','bubble',m.content);if(m.role==='assistant')renderAdvice(b,m.content);if(m.status==='error'){b.append(el('div','','Не удалось получить ответ. Сообщение сохранено.'));const retry=el('button','retry','Повторить запрос');retry.onclick=()=>send(null,m.id);b.append(retry);}e.append(b);if(m.products?.length){const cards=el('div','recommendations');m.products.forEach(p=>cards.append(card(p)));e.append(cards);}return e;}
async function sessions(){const rows=await api('/api/sessions');$('sessions').replaceChildren();for(const r of rows){const b=el('button','session'+(r.id===sessionId?' active':''),r.title);b.title=r.title;b.disabled=busy;b.onclick=async()=>{sessionId=r.id;localStorage.setItem('kontur-session',sessionId);await loadMessages();await sessions();showTab('chat');};$('sessions').append(b);}}
async function loadMessages(){if(!sessionId){welcome();return;}const rows=await api(`/api/sessions/${sessionId}/messages`);if(!rows.length)welcome();else $('messages').replaceChildren(...rows.map(renderMessage));$('messages').scrollTop=$('messages').scrollHeight;}
async function streamChat(data) {
 const response=await fetch(`/api/sessions/${sessionId}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,stream:true})});
 if(!response.ok){const error=await response.json();throw new Error(error.error||'Ошибка запроса');}
 const preview=renderMessage({role:'assistant',content:''});
 preview.querySelector('.message-label').textContent='✳ КОНСУЛЬТАНТ · ГЕНЕРАЦИЯ';
 $('messages').append(preview);
 const reader=response.body.getReader(), decoder=new TextDecoder();let buffer='',done=false;
 function consume(line){
  if(!line.trim())return;
  const event=JSON.parse(line);
  if(event.type==='error')throw new Error(event.error);
  if(event.type==='text')renderAdvice(preview.querySelector('.bubble'),event.text);
  if(event.type==='done'){done=true;preview.replaceWith(renderMessage(event.message));}
  $('messages').scrollTop=$('messages').scrollHeight;
 }
 try{
  while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}if(chunk.done)break;}
  if(buffer.trim())consume(buffer);
  if(!done)throw new Error('Поток ответа прерван. Повторите сообщение.');
 }finally{try{await reader.cancel();}finally{reader.releaseLock();}}
}
async function send(text,retryId){if(busy)return;busy=true;$('send').disabled=true;$('new-chat').disabled=true;document.querySelectorAll('.session,.retry').forEach(b=>b.disabled=true);$('request-status').textContent='Qwen подбирает варианты… Первый ответ может занять несколько минут.';try{if(!sessionId){const r=await api('/api/sessions',{});sessionId=r.id;localStorage.setItem('kontur-session',sessionId);}if(!retryId){if($('messages').querySelector('.welcome'))$('messages').replaceChildren();$('messages').append(renderMessage({role:'user',content:text}));$('prompt').value='';}$('messages').scrollTop=$('messages').scrollHeight;await streamChat(retryId?{retry_id:retryId}:{message:text});$('request-status').textContent='';}catch(e){$('request-status').textContent=e.message;}finally{busy=false;$('send').disabled=false;$('new-chat').disabled=false;try{await loadMessages();await sessions();}catch(e){$('request-status').textContent=e.message;}}}
function renderCatalog(){const q=$('search').value.toLowerCase();const list=products.filter(p=>(!kind||p.kind===kind)&&(p.name+' '+p.specs).toLowerCase().includes(q));$('products').replaceChildren(...list.map(card));$('count').textContent=`Найдено: ${list.length}`;if(!list.length)$('products').append(el('p','','По вашему запросу ничего не найдено.'));}
$('chat-tab').onclick=()=>showTab('chat');$('catalog-tab').onclick=()=>showTab('catalog');$('search').oninput=renderCatalog;
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();});
$('new-chat').onclick=async()=>{sessionId=null;localStorage.removeItem('kontur-session');welcome();showTab('chat');await sessions();$('prompt').focus();};
$('chat-form').onsubmit=e=>{e.preventDefault();const text=$('prompt').value.trim();if(text)send(text);};$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat-form').requestSubmit();}};
async function health(){try{const h=await api('/api/health');$('model-status').textContent=h.online?'Qwen 3.5 4B подключена':'Ollama / модель недоступна';}catch{$('model-status').textContent='Бэкэнд недоступен';}}
(async()=>{try{await health();const catalog=await api('/api/catalog');products=catalog.products;$('price-note').textContent=catalog.price_note;renderCatalog();try{await loadMessages();}catch{sessionId=null;localStorage.removeItem('kontur-session');welcome();}await sessions();}catch(e){$('request-status').textContent=e.message;}})();setInterval(health,30000);

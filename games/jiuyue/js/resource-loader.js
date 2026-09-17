(function(root){
'use strict';
class ResourceLoadError extends Error{
 constructor(message,details={}){super(message);this.name='ResourceLoadError';this.key=details.key;this.url=details.url;this.cause=details.cause;}
}
function assertEntry(entry){
 if(!entry||typeof entry.key!=='string'||!entry.key)throw new TypeError('资源条目缺少 key');
 if(typeof entry.url!=='string'||!entry.url)throw new TypeError(`资源 ${entry.key} 缺少 url`);
 if(!Number.isSafeInteger(entry.bytes)||entry.bytes<=0)throw new TypeError(`资源 ${entry.key} 的 bytes 必须是正整数`);
 if(!/^image\/(png|webp)$/.test(entry.mime))throw new TypeError(`资源 ${entry.key} 的 mime 不受支持：${entry.mime}`);
 if(!/^[a-f0-9]{64}$/.test(entry.sha256))throw new TypeError(`资源 ${entry.key} 的 sha256 无效`);
 return entry;
}
function hex(buffer){return Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join('');}
function createResourceLoader(options={}){
 const fetchResource=options.fetch||root.fetch?.bind(root),cryptoApi=options.crypto||root.crypto,urlApi=options.URL||root.URL,BlobApi=options.Blob||root.Blob;
 if(typeof fetchResource!=='function')throw new TypeError('资源加载器需要可用的 fetch');
 if(typeof cryptoApi?.subtle?.digest!=='function')throw new TypeError('资源加载器需要 Web Crypto 校验 SHA-256');
 if(typeof urlApi?.createObjectURL!=='function'||typeof urlApi?.revokeObjectURL!=='function')throw new TypeError('资源加载器需要 Blob URL 支持');
 if(typeof BlobApi!=='function')throw new TypeError('资源加载器需要 Blob 支持');
 async function loadManifest(url){
  let response;
  try{response=await fetchResource(url);}catch(cause){throw new ResourceLoadError(`资源清单读取失败：${url}`,{url,cause});}
  if(!response.ok)throw new ResourceLoadError(`资源清单读取失败：${url}（HTTP ${response.status}）`,{url});
  let manifest;
  try{manifest=await response.json();}catch(cause){throw new ResourceLoadError(`资源清单不是有效 JSON：${url}`,{url,cause});}
  if(manifest?.schema!=='lion-resource-manifest/v1'||!Array.isArray(manifest.entries))throw new ResourceLoadError(`资源清单结构无效：${url}`,{url});
  manifest.entries.forEach(assertEntry);
  const total=manifest.entries.reduce((sum,entry)=>sum+entry.bytes,0);
  if(total!==manifest.totalBytes)throw new ResourceLoadError(`资源清单总字节不一致：声明 ${manifest.totalBytes}，实际 ${total}`,{url});
  return manifest;
 }
 async function load(entries,{onProgress=()=>{},signal}={}){
  if(!Array.isArray(entries)||entries.length===0)throw new TypeError('资源列表不能为空');
  entries.forEach(assertEntry);
  const keys=new Set();for(const entry of entries){if(keys.has(entry.key))throw new TypeError(`资源键重复：${entry.key}`);keys.add(entry.key);}
  const totalBytes=entries.reduce((sum,entry)=>sum+entry.bytes,0),assets={},objectUrls=[];
  let loadedBytes=0,completedCount=0;
  const report=currentKey=>onProgress({loadedBytes,totalBytes,percent:loadedBytes/totalBytes*100,completedCount,totalCount:entries.length,currentKey});
  report(null);
  try{
   for(const entry of entries){
    let response;
    try{response=await fetchResource(entry.url,{signal});}catch(cause){throw new ResourceLoadError(`资源读取失败：${entry.key}（${entry.url}）`,{key:entry.key,url:entry.url,cause});}
    if(!response.ok)throw new ResourceLoadError(`资源读取失败：${entry.key}（HTTP ${response.status}，${entry.url}）`,{key:entry.key,url:entry.url});
    if(!response.body?.getReader)throw new ResourceLoadError(`资源 ${entry.key} 无法提供真实下载进度（${entry.url}）`,{key:entry.key,url:entry.url});
    const reader=response.body.getReader(),chunks=[];let received=0;
    while(true){
     const {done,value}=await reader.read();if(done)break;
     if(!(value instanceof Uint8Array))throw new ResourceLoadError(`资源 ${entry.key} 返回了无效字节块`,{key:entry.key,url:entry.url});
     chunks.push(value);received+=value.byteLength;loadedBytes+=value.byteLength;report(entry.key);
    }
    if(received!==entry.bytes)throw new ResourceLoadError(`资源 ${entry.key} 字节数不一致：声明 ${entry.bytes}，收到 ${received}`,{key:entry.key,url:entry.url});
    const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const digest=hex(await cryptoApi.subtle.digest('SHA-256',bytes));
    if(digest!==entry.sha256)throw new ResourceLoadError(`资源 ${entry.key} 校验失败：${entry.url}`,{key:entry.key,url:entry.url});
    const objectUrl=urlApi.createObjectURL(new BlobApi([bytes],{type:entry.mime}));objectUrls.push(objectUrl);assets[entry.key]=objectUrl;
    completedCount+=1;report(entry.key);
   }
  }catch(error){for(const url of objectUrls)urlApi.revokeObjectURL(url);throw error;}
  return {assets,dispose(){for(const url of objectUrls.splice(0))urlApi.revokeObjectURL(url);}};
 }
 return {loadManifest,load};
}
function mountLoadingView(host){
 if(!(host instanceof root.Element))throw new TypeError('加载视图需要有效的挂载元素');
 const node=root.document.createElement('section');node.className='lion-loading';node.setAttribute('role','status');node.setAttribute('aria-live','polite');
 node.innerHTML='<div class="lion-loading__moon" aria-hidden="true"><i></i><i></i><i></i></div><p class="lion-loading__eyebrow">狮团团的中秋工坊</p><h2></h2><p class="lion-loading__story"></p><div class="lion-loading__track"><span></span></div><p class="lion-loading__count"></p>';
 node.querySelector('h2').textContent='灯笼点亮，月饼装篮';node.querySelector('.lion-loading__story').textContent='桂香已经飘进院子，再等等最后几篮月饼。';host.append(node);
 const fill=node.querySelector('.lion-loading__track span'),count=node.querySelector('.lion-loading__count');
 return {
  update(progress){const percent=Math.max(0,Math.min(100,progress.percent));fill.style.width=`${percent}%`;count.textContent=`${progress.completedCount} / ${progress.totalCount} 篮 · ${percent.toFixed(1)}%`;node.setAttribute('aria-label',`资源加载 ${percent.toFixed(1)}%`);},
  fail(error){console.error('《狮团团·月饼夺回战》资源加载失败',error);node.classList.add('is-error');node.querySelector('h2').textContent='有一篮月饼没送到';node.querySelector('.lion-loading__story').textContent='请检查网络后刷新页面。具体资源与原因已写入控制台。';count.textContent=error instanceof Error?error.message:String(error);},
  complete(){node.classList.add('is-complete');node.querySelector('h2').textContent='月饼齐啦，开门迎战！';},
  destroy(){node.remove();}
 };
}
root.LionResourceLoader={ResourceLoadError,createResourceLoader,mountLoadingView};
})(typeof globalThis!=='undefined'?globalThis:this);

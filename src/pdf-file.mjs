// The host proxies one bounded compressed file result. Validate the recovered
// bytes before presenting them as a PDF; no record or approval is changed.
export async function decodePdfFile(result, revision) {
  const manifest=result.structuredContent?.export;
  const resource=result.content?.find(item=>item.type==='resource' && item.resource.mimeType==='application/gzip')?.resource;
  if(!manifest || manifest.status!=='ready' || manifest.revision!==revision || !Number.isInteger(manifest.bytes) || manifest.bytes<5 || manifest.bytes>5_000_000 || typeof resource?.blob!=='string' || resource.blob.length>140_000) throw new Error('The file response could not be verified. Your record is unchanged.');
  const zipped=Uint8Array.from(atob(resource.blob),c=>c.charCodeAt(0));
  const reader=new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts=[];let length=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>5_000_000)throw new Error('The PDF exceeded the download limit.');parts.push(value);}
  } finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(length!==manifest.bytes || sha!==manifest.sha256 || new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('The PDF integrity check failed. Retry the download; your answers are unchanged.');
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return {name:manifest.name,blob:btoa(binary)};
}

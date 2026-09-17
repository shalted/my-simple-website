import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceFile=path.join(root,'games/jiuyue/js/assets.js');
const outputDirectory=path.join(root,'games/jiuyue/resources');
const manifestFile=path.join(outputDirectory,'manifest.json');
const source=fs.readFileSync(sourceFile,'utf8');
const match=source.match(/^const ASSETS=(\{[^\n]*\});\s*$/);
if(!match)throw new Error('assets.js 格式不符合已核验的单行 ASSETS 清单，停止外置构建');
const assets=JSON.parse(match[1]);
const mimeExtensions=new Map([['image/png','png'],['image/webp','webp']]);
const entries=[];

fs.mkdirSync(outputDirectory,{recursive:true});
for(const [key,value] of Object.entries(assets)){
 if(!/^[a-z0-9_]+$/.test(key))throw new Error(`资源键 ${key} 不能安全映射为文件名`);
 const data=/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
 if(!data)throw new Error(`资源 ${key} 不是完整 Base64 data URL`);
 const mime=data[1],extension=mimeExtensions.get(mime);
 if(!extension)throw new Error(`资源 ${key} 使用未批准的类型 ${mime}`);
 const bytes=Buffer.from(data[2],'base64');
 const signature=bytes.subarray(0,12).toString('hex');
 if(mime==='image/png'&&!signature.startsWith('89504e470d0a1a0a'))throw new Error(`资源 ${key} 的 PNG 签名无效`);
 if(mime==='image/webp'&&!(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'))throw new Error(`资源 ${key} 的 WebP 签名无效`);
 const fileName=`${key}.${extension}`,file=path.join(outputDirectory,fileName);
 if(!fs.existsSync(file)||!fs.readFileSync(file).equals(bytes))fs.writeFileSync(file,bytes);
 const written=fs.readFileSync(file);
 if(!written.equals(bytes))throw new Error(`资源 ${key} 写入后与 ASSETS 原始字节不一致`);
 entries.push({key,url:`./resources/${fileName}`,mime,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}

const manifest={schema:'lion-resource-manifest/v1',source:'js/assets.js',totalBytes:entries.reduce((sum,entry)=>sum+entry.bytes,0),entries};
fs.writeFileSync(manifestFile,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
console.log(`已从 ASSETS 原样外置 ${entries.length} 项资源，共 ${manifest.totalBytes} 字节；清单 ${path.relative(root,manifestFile)}`);

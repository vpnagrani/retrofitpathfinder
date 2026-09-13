import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function extractCertificate(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length>5*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')throw new Error('Upload a PDF certificate no larger than 5 MB.');
  return new Promise((resolve,reject)=>{
    const child=execFile(process.execPath,['--max-old-space-size=256',fileURLToPath(new URL('./ber-certificate-worker.js',import.meta.url))],{timeout:15000,maxBuffer:128*1024,windowsHide:true,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}},(error,stdout)=>{
      if(error)return reject(new Error('The PDF could not be safely read. Use manual entry for scanned, protected or complex certificates.'));
      try{resolve(JSON.parse(stdout));}catch{reject(new Error('The PDF could not be read. Enter the certificate fields manually.'));}
    });
    child.stdin.on('error',()=>{});child.stdin.end(buffer);
  });
}

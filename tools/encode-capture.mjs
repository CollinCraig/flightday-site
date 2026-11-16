// Capture frames -> retained lossless master -> web outputs, with exact command/hash receipt.
// Intermediates and receipts stay in the supplied .noindex directory; never deploys.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const [frames,output,clip,ffmpeg]=process.argv.slice(2);
if(!frames||!output||!clip||!ffmpeg||!/^[-a-z0-9]+$/.test(clip)||!path.resolve(output).includes('.noindex/'))throw Error('frames output.noindex/ clip ffmpeg required');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const dir=path.join(path.resolve(output),clip);fs.mkdirSync(dir,{recursive:true});
const commands=[];
function run(args){const actual=['-hide_banner','-loglevel','error','-y','-threads','2','-filter_threads','1','-filter_complex_threads','1',...args];const p=spawnSync('nice',['-n','19',ffmpeg,...actual],{encoding:'utf8',maxBuffer:1024*1024});if(p.status!==0)throw Error('Encode failed: '+p.stderr.slice(-600));commands.push(actual);}
const takes=fs.readdirSync(path.join(frames,clip)).filter(n=>/^take\d+$/.test(n)).sort();
if(!takes.length)throw Error('No takes');
let args=[],graph='',labels='';const inventory=[];
for(const [i,take] of takes.entries()){
 const td=path.resolve(frames,clip,take),files=fs.readdirSync(td).filter(n=>/^\d{5}\.jpg$/.test(n)).sort();
 if(!files.length)throw Error('Empty take');
 for(const f of files)inventory.push({file:take+'/'+f,sha256:digest(path.join(td,f))});
 args.push('-framerate','30','-i',path.join(td,'%05d.jpg'));
 let filter='scale=1280:720:flags=lanczos,format=yuv420p';
 if(i>0)filter+=',fade=t=in:st=0:d=0.27';
 if(i<takes.length-1)filter+=`,fade=t=out:st=${files.length/30-.27}:d=0.27`;
 graph+=`[${i}:v]${filter}[v${i}];`;labels+=`[v${i}]`;
}
graph+=`${labels}concat=n=${takes.length}:v=1:a=0[v]`;
const master=path.join(dir,'master.mkv');
run([...args,'-filter_complex',graph,'-map','[v]','-r','30','-c:v','ffv1','-level','3','-pix_fmt','yuv420p','-an','-map_metadata','-1','-threads','2',master]);
const original_sha256=digest(master),base=`${clip}-ember-${original_sha256.slice(0,12)}`;
run(['-i',master,'-c:v','libx264','-preset','slow','-crf','22','-maxrate','2000k','-bufsize','4000k','-profile:v','high','-pix_fmt','yuv420p','-movflags','+faststart','-an','-map_metadata','-1','-map_chapters','-1','-threads','2',path.join(dir,base+'.mp4')]);
run(['-i',master,'-c:v','libvpx-vp9','-b:v','0','-crf','38','-row-mt','1','-deadline','good','-cpu-used','4','-pix_fmt','yuv420p','-an','-map_metadata','-1','-map_chapters','-1','-threads','2',path.join(dir,base+'.webm')]);
run(['-ss','2','-i',master,'-frames:v','1','-c:v','libwebp','-quality','82','-map_metadata','-1',path.join(dir,base+'.webp')]);
const outputs=['mp4','webm','webp'].map(ext=>{const file=base+'.'+ext;return{file,sha256:digest(path.join(dir,file)),bytes:fs.statSync(path.join(dir,file)).size};});
fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({clip,at:new Date().toISOString(),recorded_from:'Flight Day web 1.10.3 + Ember; SHA-256 465f0756552dff34e13d36d875b3ea16d212b303f8aecdac1aabd3f54664d1f0',capture_tool:'tools/record-clips.cjs --demo-only',encode_tool:'tools/encode-capture.mjs',encode_tool_sha256:digest(new URL(import.meta.url)),ffmpeg_sha256:digest(ffmpeg),master:'master.mkv',original_sha256,frames:inventory,commands,outputs},null,2)+'\n');
console.log('PASS encoded',clip,outputs.map(o=>o.file+' '+o.bytes).join('; '));

/* Byte-preserving generated web copy; canonical data is shared with Apple. */
const fs=require('node:fs'),path=require('node:path');
const src=path.resolve(__dirname,'../fixtures/wallpaper'),dest=path.resolve(__dirname,'../web/fixtures/wallpaper');fs.mkdirSync(dest,{recursive:true});for(const name of ['stars-hyg-v4-mag5.json','LICENSE-DATA','NOTICE','PROVENANCE.md'])fs.copyFileSync(path.join(src,name),path.join(dest,name));
console.log('Wallpaper fixture copied without modification');

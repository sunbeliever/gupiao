'use strict';
const fs=require('node:fs'),path=require('node:path');
function createFileStore(directory,io=fs){
 const valid=key=>typeof key==='string'&&/^[A-Za-z0-9_.-]+$/.test(key);
 return {
  read(key){if(!valid(key))return '';const file=path.join(directory,key+'.json');return io.existsSync(file)?io.readFileSync(file,'utf8'):'';},
  write(key,value){if(!valid(key))return false;const file=path.join(directory,key+'.json'),pending=file+'.pending-'+process.pid;
   try{io.writeFileSync(pending,value);io.renameSync(pending,file);return true;}catch(e){return false;}
  }
 };
}
module.exports={createFileStore};

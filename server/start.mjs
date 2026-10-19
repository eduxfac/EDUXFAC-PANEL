import {createPanel} from './app.mjs';
const port=Number(process.env.PORT||4310);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Puerto PANEL inválido.');
const server=createPanel();
server.on('error',error=>{console.error('PANEL_START_ERROR',error.code||'CONTROLLED');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('PANEL_LISTO'));
let closing=false;const stop=()=>{if(closing)return;closing=true;server.close(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);

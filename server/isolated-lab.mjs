import {realpathSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
export function isolatedPanelDirectory(directory,{purpose='FASE8_ISOLATED_PANEL'}={}){
 const root=realpathSync(directory);
 const inside=['tests/.fase8','tests/.fase9'].some(p=>root.startsWith(path.resolve(project,p)+path.sep));
 if(!inside)throw Error('LAB_PATH_REJECTED');
 if(process.platform!=='win32'&&process.env.EDUXFAC_F9_ISOLATED!=='yes')throw Error('LAB_LINUX_NOT_AUTHORIZED');
 if(process.platform==='win32'&&!project.toLowerCase().startsWith('d:\\eduxfac\\panel eduxfac\\'))throw Error('LAB_PROJECT_REJECTED');
 if(JSON.parse(readFileSync(path.join(root,'SOLO_PRUEBAS.json'),'utf8')).purpose!==purpose)throw Error('LAB_MARKER_REQUIRED');
 return root;
}

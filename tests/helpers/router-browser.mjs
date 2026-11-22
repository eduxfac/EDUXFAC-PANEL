export function routerBrowser(initial='http://127.0.0.1:4310/'){
 let url=new URL(initial),index=0;const entries=[url.href],listeners={},documentListeners={};
 const location={};for(const key of ['href','origin','pathname','search','hash'])Object.defineProperty(location,key,{get:()=>url[key]});
 const dispatchEvent=event=>{for(const handler of listeners[event.type]||[])handler(event);};
 const window={location,addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),dispatchEvent,history:{
  pushState(_state,_title,target){url=new URL(target,url);entries.splice(++index);entries.push(url.href);},
  replaceState(_state,_title,target){url=new URL(target,url);entries[index]=url.href;},
  back(){if(index){url=new URL(entries[--index]);dispatchEvent({type:'popstate'});}},
  forward(){if(index<entries.length-1){url=new URL(entries[++index]);dispatchEvent({type:'popstate'});}}
 }};
 return {window,location,document:{addEventListener:(name,fn)=>documentListeners[name]=fn},URL,URLSearchParams,Event:class{constructor(type){this.type=type;}},click(href,extra={}){
  let prevented=false;const link={href:new URL(href,url).href,target:'',hasAttribute:()=>false};
  documentListeners.click({button:0,target:{closest:()=>link},preventDefault(){prevented=true;},...extra});return prevented;
 }};
}

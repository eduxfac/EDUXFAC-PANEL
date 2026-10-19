const numericJson=new Set(['sucursales_activas','usuarios_activos','limite_sucursales','limite_usuarios','intentos','meses']);
export function postgresSQL(source,args=[]){
 let sql=String(source).trim(),values=[];
 sql=sql.replace(/\bBEGIN IMMEDIATE\b/gi,'BEGIN').replace(/\bCOLLATE NOCASE\b/gi,'COLLATE "C"');
 sql=sql.replace(/\bCURRENT_TIMESTAMP\b/gi,"panel_now()");
 sql=sql.replace(/\b(julianday|strftime|date)\s*\(/gi,(_,n)=>'panel_'+n.toLowerCase()+'(');
 for(let at=0;;){const i=sql.toLowerCase().indexOf('json_extract(',at);if(i<0)break;let depth=1,j=i+13,quoted=false;for(;j<sql.length&&depth;j++){const ch=sql[j];if(ch==="'"){if(quoted&&sql[j+1]==="'"){j++;continue;}quoted=!quoted;}if(!quoted){if(ch==='(')depth++;if(ch===')')depth--;}}const original=sql.slice(i,j),match=original.match(/,\s*'(\$\.[a-z_]+)'\s*\)$/i);if(match&&numericJson.has(match[1].slice(2))){const wrapped='CAST('+original+' AS bigint)';sql=sql.slice(0,i)+wrapped+sql.slice(j);at=i+wrapped.length;}else at=j;}
 const ignore=/^INSERT OR IGNORE /i.test(sql);sql=sql.replace(/^INSERT OR IGNORE /i,'INSERT ');
 sql=sql.replace(/\browid\b/g,'compat_rowid');
 // Bind only tokens outside quoted strings; placeholders in descriptions remain literal.
 let out='',quote=false,position=0;
 const named=args.length===1&&args[0]&&typeof args[0]==='object'&&!Array.isArray(args[0])?args[0]:null;
 for(let i=0;i<sql.length;i++){const c=sql[i];if(c==="'"){out+=c;if(quote&&sql[i+1]==="'"){out+="'";i++;}else quote=!quote;continue;}
 if(!quote&&c==='?'){values.push(args[position++]);out+='$'+values.length;continue;}
 if(!quote&&c===':'&&sql[i+1]!==':'&&sql[i-1]!==':'){const m=sql.slice(i+1).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);if(m){if(!named||!Object.hasOwn(named,m[0]))throw Error('DB_PARAMETER_INVALID');values.push(named[m[0]]);out+='$'+values.length;i+=m[0].length;continue;}}
 out+=c;}
 if(ignore&&!/\bON CONFLICT\b/i.test(out))out+=' ON CONFLICT DO NOTHING';
 return {text:out,values};
}

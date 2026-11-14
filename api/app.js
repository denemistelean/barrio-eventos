const {Pool}=require('pg'),crypto=require('crypto');
const URL_=process.env.DATABASE_URL||process.env.POSTGRES_URL;
const pool=global.__pool||(global.__pool=new Pool({connectionString:URL_,ssl:{rejectUnauthorized:false},max:1}));
const SEC=process.env.AUTH_SECRET||crypto.createHash('sha256').update(String(URL_)+'barra-eventos').digest('hex');
const MET=['Efectivo','Yape','Plin','Transferencia','Tarjeta'];
const bad=(m,s=400)=>{throw{s,m}},uid=()=>crypto.randomBytes(5).toString('hex');
const hash=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const same=(p,h)=>{const[s,x]=h.split(':');return crypto.timingSafeEqual(Buffer.from(hash(p,s).split(':')[1],'hex'),Buffer.from(x,'hex'))};
const mac=b=>crypto.createHmac('sha256',SEC).update(b).digest('base64url');
const sign=o=>{const b=Buffer.from(JSON.stringify(o)).toString('base64url');return b+'.'+mac(b)};
const verify=t=>{try{const[b,s]=t.split('.');if(s!==mac(b))return;const o=JSON.parse(Buffer.from(b,'base64url'));if(o.x>Date.now())return o}catch(e){}};
let ready;
const init=()=>ready||(ready=(async()=>{
if(!URL_)bad('Falta la variable DATABASE_URL: conecta una base de datos en Vercel',500);
await pool.query('create table if not exists users(u text primary key,h text not null,r text not null);create table if not exists events(id text primary key,d jsonb not null)');
if(!(await pool.query('select 1 from users limit 1')).rowCount)await pool.query('insert into users values($1,$2,$3)',[(process.env.ADMIN_USER||'admin').toLowerCase(),hash(process.env.ADMIN_PASSWORD||'P@$$w0rd02'),'admin']);
if(!(await pool.query('select 1 from events limit 1')).rowCount){const P=(n,c,p,s)=>({id:uid(),name:n,cat:c,price:p,stock:s});
await pool.query('insert into events values($1,$2)',[uid(),{name:'Evento 25 de noviembre',date:'2026-11-25',sales:[],products:[P('Whisky Gold Label','Whisky',350,6),P('Whisky Black Label','Whisky',220,10),P('Cerveza Trujillo','Cerveza',10,48),P('Cerveza Callao','Cerveza',10,48),P('Heineken','Cerveza',12,36),P('Monster','Energizante',12,24),P('Volt','Energizante',8,24),P('Red Bull','Energizante',12,24)]}])}
})().catch(e=>{ready=null;throw e}));
async function load(u){const ev=(await pool.query("select id,d from events order by d->>'date'")).rows.map(r=>({id:r.id,...r.d}));
if(u.r!='admin')ev.forEach(e=>e.sales=[]);
const o={events:ev,me:{u:u.u,role:u.r}};
if(u.r=='admin')o.users=(await pool.query('select u,r from users order by u')).rows;
return o}
async function op(u,b){const c=await pool.connect(),adm=u.r=='admin';let nid;
try{await c.query('begin');
const ev=async id=>{const r=await c.query('select d from events where id=$1 for update',[String(id)]);if(!r.rowCount)bad('Evento no encontrado',404);return r.rows[0].d};
const put=(id,d)=>c.query('update events set d=$2 where id=$1',[String(id),d]);
if(b.t!='sale'&&!adm)bad('Sin permiso',403);
switch(b.t){
case'sale':{const d=await ev(b.eid);let t=0;
const its=(b.items||[]).map(i=>{const p=d.products.find(x=>x.id==i.pid),n=Math.floor(+i.qty);if(!p||!(n>0))bad('Producto inválido');if(p.stock<n)bad('Stock insuficiente: '+p.name);p.stock-=n;t+=p.price*n;return{pid:p.id,name:p.name,cat:p.cat,qty:n,price:p.price}});
if(!its.length)bad('El carrito está vacío');
const ps=(b.pays||[]).map(x=>{if(!MET.includes(x.m)||!(+x.amt>0))bad('Pago inválido');return{m:x.m,amt:+(+x.amt).toFixed(2),op:String(x.op||'').slice(0,60)}});
if(Math.abs(ps.reduce((a,x)=>a+x.amt,0)-t)>.01)bad('Los pagos no cuadran con el total');
d.sales.unshift({id:uid(),t:Date.now(),by:u.u,items:its,total:+t.toFixed(2),pays:ps,vuelto:Math.max(0,+b.vuelto||0)});await put(b.eid,d);break}
case'ev_new':{const d={name:String(b.name||'Evento').slice(0,60),date:/^\d{4}-\d\d-\d\d$/.test(b.date)?b.date:bad('Fecha inválida'),sales:[],products:[]};
if(b.copy)d.products=(await ev(b.copy)).products.map(p=>({...p,id:uid(),stock:0}));
nid=uid();await c.query('insert into events values($1,$2)',[nid,d]);break}
case'ev_del':{if((await c.query('select count(*) n from events')).rows[0].n<2)bad('Debe quedar al menos un evento');await c.query('delete from events where id=$1',[String(b.eid)]);break}
case'prod_save':{const d=await ev(b.eid),p=b.p||{},n=String(p.name||'').trim().slice(0,60),k=String(p.cat||'Otros').trim().slice(0,30),pr=+p.price,s=Math.floor(+p.stock);
if(!n||!(pr>=0)||!(s>=0))bad('Datos de producto inválidos');
const x=p.id&&d.products.find(y=>y.id==p.id);if(x)Object.assign(x,{name:n,cat:k,price:pr,stock:s});else d.products.push({id:uid(),name:n,cat:k,price:pr,stock:s});await put(b.eid,d);break}
case'prod_del':{const d=await ev(b.eid);d.products=d.products.filter(p=>p.id!=b.pid);await put(b.eid,d);break}
case'stock':{const d=await ev(b.eid),p=d.products.find(x=>x.id==b.pid);if(p){p.stock=Math.max(0,p.stock+(+b.d>0?1:-1));await put(b.eid,d)}break}
case'void':{const d=await ev(b.eid),s=d.sales.find(x=>x.id==b.sid);if(s){s.items.forEach(i=>{const p=d.products.find(x=>x.id==i.pid);if(p)p.stock+=i.qty});d.sales=d.sales.filter(x=>x!==s);await put(b.eid,d)}break}
case'user_save':{const n=String(b.u||'').toLowerCase().trim();
if(!/^[a-z0-9._-]{3,20}$/.test(n)||String(b.p||'').length<6||!['admin','ventas'].includes(b.r))bad('Usuario de 3 a 20 caracteres, clave de mínimo 6 y rol son obligatorios');
if(n==u.u&&b.r!='admin')bad('No puedes quitarte el rol admin');
await c.query('insert into users values($1,$2,$3) on conflict(u) do update set h=excluded.h,r=excluded.r',[n,hash(String(b.p)),b.r]);break}
case'user_del':{if(b.u==u.u)bad('No puedes eliminar tu propio usuario');await c.query('delete from users where u=$1',[String(b.u)]);break}
default:bad('Operación desconocida')}
await c.query('commit')}catch(e){await c.query('rollback').catch(()=>{});throw e}finally{c.release()}
return nid}
module.exports=async(req,res)=>{try{if(req.method!='POST')return res.status(405).end();await init();const b=req.body||{};
if(b.a=='login'){const x=(await pool.query('select * from users where u=$1',[String(b.u||'').toLowerCase().trim()])).rows[0];
if(!x||!same(String(b.p||''),x.h))bad('Usuario o clave incorrectos',401);return res.json({token:sign({u:x.u,x:Date.now()+432e5})})}
const t=verify((req.headers.authorization||'').slice(7)),u=t&&(await pool.query('select * from users where u=$1',[t.u])).rows[0];
if(!u)bad('Sesión vencida',401);
const nid=b.a=='op'?await op(u,b):undefined;res.json({...await load(u),nid})}
catch(e){if(e&&e.s)return res.status(e.s).json({error:e.m});console.error(e);res.status(500).json({error:'Error del servidor'})}};

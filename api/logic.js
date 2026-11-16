const bad=(m,s=400)=>{throw{s,m}};
const round2=n=>Math.round((+n)*100)/100;

function normProduct(p){
  const priceEvento=round2(p.priceEvento!=null&&p.priceEvento!==''?p.priceEvento:(p.price||0));
  const priceFactura=round2(p.priceFactura!=null&&p.priceFactura!==''?p.priceFactura:(p.price||0));
  const o={...p,priceEvento,priceFactura,price:priceEvento};
  if(String(o.cat).toLowerCase()==='combos'){
    o.cat='Combos';
    delete o.stock;
    o.items=(o.items||[]).map(it=>({pid:it.pid,qty:Math.floor(+it.qty)||0,name:it.name})).filter(it=>it.pid&&it.qty>0);
  }else{
    o.stock=Math.max(0,Math.floor(+o.stock||0));
    delete o.items;
  }
  return o;
}

function comboParts(p,products){
  const parts=(p.items||[]);
  if(parts.length<2)bad('El combo está incompleto');
  return parts.map(it=>{
    const c=products.find(x=>x.id===it.pid);
    const q=Math.floor(+it.qty);
    if(!c||c.cat==='Combos'||!(q>0))bad('El combo incluye un producto que ya no existe');
    return {pid:c.id,name:c.name,qty:q,product:c};
  });
}

function sale(products,items){
  if(!Array.isArray(items)||!items.length)bad('El carrito está vacío');
  let totalCents=0;
  const lines=items.map(i=>{
    const p=products.find(x=>x.id==i.pid);
    const n=Math.floor(+i.qty);
    if(!p||!(n>0))bad('Producto inválido');
    const priceCents=Math.round((+p.priceEvento)*100);
    if(!(priceCents>=0))bad('Precio de evento inválido');
    if(p.cat==='Combos'){
      const parts=comboParts(p,products);
      for(const it of parts)if(it.product.stock<it.qty*n)bad('Stock insuficiente: '+it.product.name);
      for(const it of parts)it.product.stock-=it.qty*n;
      totalCents+=priceCents*n;
      return {pid:p.id,name:p.name,cat:p.cat,qty:n,price:priceCents/100,items:parts.map(it=>({pid:it.pid,name:it.name,qty:it.qty}))};
    }
    if(p.stock<n)bad('Stock insuficiente: '+p.name);
    p.stock-=n;
    totalCents+=priceCents*n;
    return {pid:p.id,name:p.name,cat:p.cat,qty:n,price:priceCents/100};
  });
  return {lines,total:totalCents/100,totalCents};
}

function voidSale(products,sale){
  for(const i of sale.items||[]){
    if(i.cat==='Combos'&&i.items){
      for(const it of i.items){
        const p=products.find(x=>x.id===it.pid);
        if(p&&p.cat!=='Combos')p.stock+=Math.floor(+it.qty)*Math.floor(+i.qty);
      }
    }else{
      const p=products.find(x=>x.id===i.pid);
      if(p&&p.cat!=='Combos')p.stock+=Math.floor(+i.qty);
    }
  }
}

function saveProduct(list,raw,newId){
  const name=String(raw.name||'').trim().slice(0,60);
  let cat=String(raw.cat||'Otros').trim().slice(0,30);
  if(cat.toLowerCase()==='combos')cat='Combos';
  const priceEvento=round2(raw.priceEvento);
  const priceFactura=round2(raw.priceFactura);
  if(!name||!(priceEvento>=0)||!(priceFactura>=0)||Number.isNaN(priceEvento)||Number.isNaN(priceFactura))bad('Datos de producto inválidos');
  let obj;
  if(cat==='Combos'){
    const map=new Map();
    for(const it of raw.items||[]){
      const pid=String(it.pid||'');
      const qty=Math.floor(+it.qty);
      if(!pid||!(qty>0))continue;
      const p=list.find(x=>x.id===pid);
      if(!p)bad('El combo incluye un producto que no existe');
      if(p.cat==='Combos'||p.id===raw.id)bad('Un combo no puede incluir otros combos');
      map.set(pid,(map.get(pid)||0)+Math.min(qty,99));
    }
    const items=[...map.entries()].map(([pid,qty])=>{const p=list.find(x=>x.id===pid);return {pid,qty,name:p.name}});
    if(items.length<2)bad('Un combo necesita al menos 2 productos distintos');
    obj={name,cat,priceEvento,priceFactura,price:priceEvento,items};
  }else{
    const stock=Math.floor(+raw.stock);
    if(!(stock>=0)||Number.isNaN(stock))bad('Datos de producto inválidos');
    obj={name,cat,priceEvento,priceFactura,price:priceEvento,stock};
  }
  if(raw.id){
    const x=list.find(y=>y.id===raw.id);
    if(!x)bad('Producto no encontrado',404);
    const id=x.id;
    for(const k of Object.keys(x))delete x[k];
    Object.assign(x,{...obj,id});
    return id;
  }
  const id=newId();
  list.push({...obj,id});
  return id;
}

function deleteProduct(list,pid){
  if(list.some(p=>p.cat==='Combos'&&(p.items||[]).some(it=>it.pid===pid)))bad('Este producto pertenece a un combo. Quítalo del combo antes de eliminarlo');
  const i=list.findIndex(p=>p.id===pid);
  if(i>=0)list.splice(i,1);
}

function changeStock(list,pid,d){
  const p=list.find(x=>x.id===pid);
  if(!p)return;
  if(p.cat==='Combos')bad('El stock de un combo sale de sus productos');
  p.stock=Math.max(0,(p.stock||0)+(+d>0?1:-1));
}

function cloneProductsForEvent(products,newId){
  const map={};
  const out=products.map(p=>{
    const n=normProduct(p);
    const id=newId();
    map[p.id]=id;
    n.id=id;
    if(n.cat==='Combos')delete n.stock;else n.stock=0;
    return n;
  });
  for(const p of out)if(p.items)p.items=p.items.map(it=>({...it,pid:map[it.pid]})).filter(it=>it.pid);
  return out;
}

module.exports={normProduct,sale,voidSale,saveProduct,deleteProduct,changeStock,cloneProductsForEvent,round2};

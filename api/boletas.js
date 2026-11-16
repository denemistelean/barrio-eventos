const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');

function bad(m,s=400){const e=new Error(m);e.s=s;e.m=m;throw e}
function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){const t=b;b=a%b;a=t}return a||1}
function mix(s){let h=2166136261;const t=String(s);for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function soles(cents){const n=(cents/100).toFixed(2),p=n.split('.');return 'S/ '+p[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+p[1]}
function pdfText(s){return String(s==null?'':s).normalize('NFC').replace(/[^\u0000-\u00ff]/g,'')}

function catalog(products){
  const out=[],seen=new Set();
  for(const p of products||[]){
    if(p.cat==='Combos')continue;
    const cents=Math.round((+p.priceFactura||0)*100);
    if(!(cents>0)||!p.name)continue;
    const name=String(p.name).trim().slice(0,60);
    const key=name+'@'+cents;
    if(seen.has(key))continue;
    seen.add(key);
    out.push({name,cents});
  }
  return out;
}

function planBoletas(products,totalCents,n){
  n=Math.floor(+n);
  totalCents=Math.round(+totalCents);
  if(!(n>=1&&n<=40))bad('Indica entre 1 y 40 boletas');
  if(!(totalCents>0))bad('Ese medio de pago no tiene monto por repartir');
  if(totalCents>20000000)bad('El monto es demasiado alto para armar las boletas aquí');
  const prods=catalog(products);
  if(!prods.length)bad('No hay productos con precio factura para armar las boletas');
  const g=prods.reduce((a,p)=>gcd(a,p.cents),0);
  if(totalCents%g!==0)bad('Los precios de factura no pueden sumar ese monto exacto. Revisa el precio factura del catálogo.');
  const totalU=totalCents/g;
  if(totalU>2000000)bad('El monto es demasiado alto para armar las boletas aquí');
  const pu=prods.map(p=>({name:p.name,cents:p.cents,u:p.cents/g}));
  const can=new Uint8Array(totalU+1);
  const prev=new Int32Array(totalU+1);
  const which=new Int16Array(totalU+1);
  prev.fill(-1);which.fill(-1);can[0]=1;
  const byExp=[...pu].sort((a,b)=>b.u-a.u);
  for(let a=0;a<=totalU;a++){
    if(!can[a])continue;
    for(let i=0;i<byExp.length;i++){
      const nxt=a+byExp[i].u;
      if(nxt<=totalU&&!can[nxt]){can[nxt]=1;prev[nxt]=a;which[nxt]=pu.indexOf(byExp[i])}
    }
  }
  if(!can[totalU])bad('Los precios de factura no pueden sumar ese monto exacto. Revisa el precio factura del catálogo.');
  let minU=1;while(minU<=totalU&&!can[minU])minU++;
  if(n*minU>totalU)bad('Son demasiadas boletas para ese monto. Prueba con menos.');

  const weights=[];
  for(let i=0;i<n;i++)weights.push(Math.max(0.35,1+(i-(n-1)/2)*0.55));
  const used=[];
  let left=totalU;
  for(let i=0;i<n-1;i++){
    const slots=n-i;
    const remainW=weights.slice(i).reduce((a,b)=>a+b,0);
    const target=Math.round(left*(weights[i]/remainW));
    const maxTake=left-(slots-1)*minU;
    let pick=-1,best=Infinity;
    for(let a=minU;a<=maxTake;a++){
      if(!can[a]||used.includes(a))continue;
      const score=Math.abs(a-target);
      if(score<best){best=score;pick=a}
    }
    if(pick<0)bad('No pude armar montos distintos. Prueba con menos boletas.');
    used.push(pick);left-=pick;
  }
  const finish=nl=>{
    if(can[nl]&&nl>=minU&&!used.includes(nl)){used.push(nl);return true}
    return false;
  };
  if(!finish(left)){
    const stuck=left;
    let fixed=false;
    for(let j=used.length-1;j>=0&&!fixed;j--){
      for(let delta=1;delta<=totalU&&!fixed;delta++){
        for(const sign of [-1,1]){
          const np=used[j]+sign*delta, nl=stuck-sign*delta;
          if(np<minU||nl<minU||!can[np]||!can[nl]||np===nl)continue;
          if(used.some((v,k)=>k!==j&&(v===np||v===nl)))continue;
          used[j]=np;used.push(nl);fixed=true;break;
        }
      }
    }
    if(!fixed)bad('No pude armar montos distintos. Prueba con menos boletas.');
  }
  if(new Set(used).size!==used.length||used.reduce((a,b)=>a+b,0)!==totalU)bad('No pude armar montos distintos. Prueba con menos boletas.');

  function take(leftU,salt,bag){
    const order=[...pu].sort((a,b)=>((mix(a.name)+salt*97)%997)-((mix(b.name)+salt*97)%997)||b.u-a.u);
    let guard=0;
    while(leftU>0&&guard++<400){
      const choices=order.filter(p=>p.u<=leftU&&can[leftU-p.u]);
      if(!choices.length)return leftU;
      const pool=choices.slice().sort((a,b)=>b.u-a.u);
      const p=pool[(salt+guard)%Math.min(pool.length,4)];
      const have=bag.get(p.name)||0;
      const cap=Math.min(6,1+((salt+have)%3));
      if(have>=cap){
        const other=pool.find(x=>(bag.get(x.name)||0)<6&&can[leftU-x.u]);
        if(!other){
          const any=pool.find(x=>can[leftU-x.u]);
          if(!any)return leftU;
          bag.set(any.name,(bag.get(any.name)||0)+1);
          leftU-=any.u;
          continue;
        }
        bag.set(other.name,(bag.get(other.name)||0)+1);
        leftU-=other.u;
        continue;
      }
      let qty=1;
      const want=Math.min(cap-have,1+((salt+guard)%3));
      while(qty<want&&p.u*(qty+1)<=leftU&&can[leftU-p.u*(qty+1)])qty++;
      bag.set(p.name,have+qty);
      leftU-=p.u*qty;
    }
    return leftU;
  }

  const boletas=used.map((u,i)=>{
    const bag=new Map();
    let rest=take(u,i+1,bag);
    let guard=0;
    while(rest>0&&guard++<10000){
      const iCoin=which[rest];
      if(iCoin<0)bad('No se pudo armar una de las boletas');
      const p=pu[iCoin];
      bag.set(p.name,(bag.get(p.name)||0)+1);
      rest=prev[rest];
    }
    const items=[];
    let sum=0;
    for(const [name,qty] of bag){
      const p=pu.find(x=>x.name===name);
      const line=p.cents*qty;
      sum+=line;
      items.push({name,qty,unitCents:p.cents,totalCents:line});
    }
    items.sort((a,b)=>b.totalCents-a.totalCents||a.name.localeCompare(b.name));
    if(sum!==u*g)bad('Una boleta no cuadra con su monto');
    return {n:i+1,items,totalCents:sum,total:sum/100};
  });
  const grand=boletas.reduce((a,b)=>a+b.totalCents,0);
  if(grand!==totalCents)bad('La suma de las boletas no cuadra con el monto');
  boletas.sort((a,b)=>a.totalCents-b.totalCents||a.n-b.n);
  boletas.forEach((b,i)=>{b.n=i+1});
  return boletas;
}

async function buildPdf({boletas,totalCents,method,eventName,eventDate}){
  const doc=await PDFDocument.create();
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle('Boletas ejemplo');
  doc.setSubject('Guia para emision en SUNAT. No es un comprobante.');
  const ink=rgb(0.14,0.1,0.18), mute=rgb(0.42,0.38,0.48), line=rgb(0.78,0.74,0.84), acc=rgb(0.72,0.43,0);
  const label=method==='Tarjeta'?'Tarjeta (POS)':method;
  const issued=new Date().toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const W=595.28,H=841.89;
  boletas.forEach(b=>{
    const page=doc.addPage([W,H]);
    page.drawRectangle({x:32,y:32,width:W-64,height:H-64,borderColor:line,borderWidth:1.2});
    page.drawRectangle({x:32,y:H-118,width:W-64,height:86,color:rgb(0.98,0.95,0.9)});
    page.drawText('EJEMPLO',{x:48,y:H-58,size:11,font:bold,color:acc});
    page.drawText('BOLETA DE VENTA',{x:48,y:H-82,size:22,font:bold,color:ink});
    page.drawText(pdfText('No es un comprobante electronico SUNAT'),{x:48,y:H-100,size:10,font,color:mute});
    const serie='B001-'+String(b.n).padStart(6,'0');
    page.drawText(serie,{x:W-48-bold.widthOfTextAtSize(serie,16),y:H-78,size:16,font:bold,color:ink});
    page.drawText(b.n+' de '+boletas.length,{x:W-48-font.widthOfTextAtSize(b.n+' de '+boletas.length,10),y:H-96,size:10,font,color:mute});
    let y=H-150;
    const meta=[
      ['Evento',pdfText(eventName||'Evento')],
      ['Fecha del evento',pdfText(eventDate||'')],
      ['Referencia de cobro',pdfText(label+' por '+soles(totalCents))],
      ['Emitido como guia',pdfText(issued+' (Lima)')]
    ];
    meta.forEach(([k,v])=>{
      page.drawText(k,{x:48,y,size:9,font,color:mute});
      page.drawText(v,{x:190,y,size:11,font:bold,color:ink});
      y-=18;
    });
    y-=8;
    page.drawRectangle({x:48,y:y-6,width:W-96,height:22,color:rgb(0.95,0.93,0.97)});
    page.drawText('Cant.',{x:56,y,size:9,font:bold,color:mute});
    page.drawText(pdfText('Descripcion'),{x:110,y,size:9,font:bold,color:mute});
    page.drawText('P. unit.',{x:360,y,size:9,font:bold,color:mute});
    page.drawText('Importe',{x:470,y,size:9,font:bold,color:mute});
    y-=28;
    b.items.forEach(it=>{
      page.drawText(String(it.qty),{x:56,y,size:11,font,color:ink});
      const name=pdfText(it.name);
      const maxW=230;
      let shown=name;
      while(shown.length>1&&font.widthOfTextAtSize(shown,11)>maxW)shown=shown.slice(0,-2)+'...';
      page.drawText(shown,{x:110,y,size:11,font,color:ink});
      const unit=soles(it.unitCents), imp=soles(it.totalCents);
      page.drawText(unit,{x:430-font.widthOfTextAtSize(unit,11),y,size:11,font,color:ink});
      page.drawText(imp,{x:W-56-font.widthOfTextAtSize(imp,11),y,size:11,font,color:ink});
      y-=16;
      page.drawLine({start:{x:48,y:y+10},end:{x:W-48,y:y+10},thickness:0.4,color:line});
      y-=8;
    });
    const base=Math.round(b.totalCents/1.18), igv=b.totalCents-base;
    y-=10;
    const rows=[['Op. gravada',soles(base)],['IGV 18% (incluido)',soles(igv)]];
    rows.forEach(([k,v])=>{
      page.drawText(pdfText(k),{x:330,y,size:10,font,color:mute});
      page.drawText(v,{x:W-56-font.widthOfTextAtSize(v,10),y,size:10,font,color:ink});
      y-=16;
    });
    y-=6;
    page.drawText('TOTAL',{x:330,y,size:14,font:bold,color:ink});
    const tot=soles(b.totalCents);
    page.drawText(tot,{x:W-56-bold.widthOfTextAtSize(tot,16),y,size:16,font:bold,color:acc});
    const foot=pdfText('Precios de factura. Las '+boletas.length+' boletas de este PDF suman '+soles(totalCents)+'. Usalas como guia para emitir en SUNAT.');
    const words=foot.split(' '), lines=[];
    let cur='';
    words.forEach(w=>{const t=cur?cur+' '+w:w;if(font.widthOfTextAtSize(t,9)>W-120){if(cur)lines.push(cur);cur=w}else cur=t});
    if(cur)lines.push(cur);
    let fy=58+lines.length*12;
    lines.forEach(t=>{page.drawText(t,{x:48,y:fy,size:9,font,color:mute});fy-=12});
  });
  return doc.save();
}

module.exports={planBoletas,buildPdf,catalog};

"use client";
// Foto de perfil da equipe (ou as iniciais, quando não tem foto), igual no /agendar, no painel e na área
// da funcionária. A foto é reduzida no próprio aparelho antes de enviar: quadrada, 320 px, uns 20 KB.
export const fotoUrl=(id:string)=>'/api/foto?id='+encodeURIComponent(id);
const iniciais=(name:string)=>name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();

export function Avatar({name,photo,className='avatar'}:{name:string,photo?:string,className?:string}){
 return photo?<img className={className+' avatar-foto'} src={fotoUrl(photo)} alt={'Foto de '+name} loading="lazy"/>:<span className={className} aria-hidden="true">{iniciais(name)}</span>;
}

async function reduzir(file:File){
 if(!file.type.startsWith('image/'))throw Error('Escolha uma imagem.');
 const bmp=await createImageBitmap(file).catch(()=>{throw Error('Não foi possível abrir esta imagem. Tente uma foto JPG ou PNG.');});
 const lado=Math.min(bmp.width,bmp.height),tam=320,c=document.createElement('canvas');c.width=c.height=tam;
 c.getContext('2d')!.drawImage(bmp,(bmp.width-lado)/2,(bmp.height-lado)/2,lado,lado,0,0,tam,tam);
 return c.toDataURL('image/jpeg',0.82);
}

/** Reduz e envia a foto; devolve o id novo. */
export async function enviarFoto(staffId:string,file:File){
 const data=await reduzir(file);
 const r=await fetch('/api/foto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId,data})});
 const d:any=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível trocar a foto.');
 return d.photo as string;
}

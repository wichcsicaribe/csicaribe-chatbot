const { Redis } = require("@upstash/redis");
const kv = new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });
function safeParse(m){ try{ return typeof m==='string'?JSON.parse(m):m; }catch(e){ return {text:String(m),dir:'in',time:Date.now()}; } }

// 1. Subir archivo a Meta y conseguir media_id
async function uploadMedia(dataUrl, fileName, fileType){
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  const matches = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if(!matches) throw new Error('Archivo inválido');
  const mime = matches[1] || fileType || 'application/octet-stream';
  const buffer = Buffer.from(matches[2], 'base64');
  const form = new FormData();
  form.append('messaging_product','whatsapp');
  form.append('file', new Blob([buffer], {type:mime}), fileName || 'archivo');
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, { method:'POST', headers:{ Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}` }, body:form });
  const j = await r.json();
  if(!j.id) throw new Error('Upload falló: '+JSON.stringify(j));
  return { id:j.id, mime };
}

// 2. Enviar mensaje con archivo o texto
async function sendWhatsApp(to, text, file, fileName, fileType){
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  let body;
  if(file){
    const {id, mime} = await uploadMedia(file, fileName, fileType);
    let type='document';
    if(mime.startsWith('image/')) type='image';
    else if(mime.startsWith('video/')) type='video';
    else if(mime.startsWith('audio/')) type='audio';
    body={ messaging_product:'whatsapp', to, type, [type]:{ id, filename: type==='document'?fileName:undefined, caption: text||undefined } };
    // WhatsApp no deja caption en document con filename + caption en algunas versiones, por eso mandamos texto aparte si hay
    if(text && type==='document'){
      await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method:'POST', headers:{ Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify({ messaging_product:'whatsapp', to, type:'text', text:{body:text} }) });
      body[type].caption=undefined;
    }
  } else {
    body={ messaging_product:'whatsapp', to, type:'text', text:{body:text} };
  }
  const r=await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method:'POST', headers:{ Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  const j=await r.json(); if(j.error) throw new Error(JSON.stringify(j.error));
}

module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    if(req.method==='DELETE'){
      const {phone,index}=req.query; if(!phone) return res.json({ok:false});
      if(index!==undefined){ const list=await kv.lrange(`chat:${phone}`,0,-1); const idx=parseInt(index); if(list[idx]) await kv.lset(`chat:${phone}`,idx,JSON.stringify({...safeParse(list[idx]),deleted:true,text:'🗑️ Mensaje eliminado'})); return res.json({ok:true}); }
      await kv.del(`chat:${phone}`); await kv.del(`contact:${phone}`); try{await kv.zrem('chats',phone);}catch(e){} return res.json({ok:true});
    }
    if(req.method==='GET'){
      if(req.query.phone){ const msgs=await kv.lrange(`chat:${req.query.phone}`,0,-1); return res.json(msgs.map((m,i)=>({...safeParse(m),_index:i}))); }
      let phones=[]; try{phones=await kv.zrange('chats',0,-1);}catch(e){} phones=phones.reverse();
      const out=[]; for(const p of phones){ const c=await kv.hgetall(`contact:${p}`); if(c&&c.phone) out.push(c); } return res.json(out);
    }
    if(req.method==='POST'){
      const {phone,text,post_url,replyText,file,fileName,fileType}=req.body||{};
      if(!phone) return res.status(400).json({error:'phone required'});
      let finalText=text||''; if(replyText) finalText=`↩️ Respondiendo a: "${replyText}"\n${finalText}`;
      try{ await sendWhatsApp(phone, finalText, file, fileName, fileType); }catch(e){ console.error('Send fail',e); return res.status(500).json({error:String(e)}); }
      const contact=await kv.hgetall(`contact:${phone}`)||{};
      await kv.rpush(`chat:${phone}`, JSON.stringify({from:phone,name:contact.name||phone,text:finalText||`📎 ${fileName||'Archivo'}`,dir:'out',time:Date.now(),post_url:post_url||'',file:file||'',fileName:fileName||'',fileType:fileType||''}));
      await kv.zadd('chats',{score:Date.now(),member:phone});
      await kv.hset(`contact:${phone}`,{phone,name:contact.name||phone,lastMessage:finalText||`📎 ${fileName}`,lastTime:String(Date.now()),post_url:post_url||contact.post_url||''});
      return res.json({ok:true});
    }
  }catch(e){ console.error(e); return res.status(500).json({error:String(e)}); }
};

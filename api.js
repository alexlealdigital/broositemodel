// =====================================================
//  SUPABASE CONFIG
// =====================================================
const SUPABASE_URL  = 'https://nlxyvqrahgyqgpwjpfpe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5seHl2cXJhaGd5cWdwd2pwZnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMjYzNzEsImV4cCI6MjA5MzkwMjM3MX0.rcTp23nQJvOsroMz_uk9dKpI_pb8bD9KlGGAjOjxVI4';

let SESSION_TOKEN = null; // preenchido após login autenticado

// ---------- API helpers ----------
async function sbFetch(path, opts = {}
){
  const headers = {
    'apikey': SUPABASE_ANON,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...opts.headers
  };
  if(SESSION_TOKEN) headers['Authorization'] = 'Bearer ' + SESSION_TOKEN;
  const res = await fetch(SUPABASE_URL + path, {...opts, headers});
  if(!res.ok){
    const err = await res.json().catch(()=>({message:res.statusText}));
    throw new Error(err.message || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

async function sbGet(table, params=''){
  return sbFetch(`/rest/v1/${table}?${params}`);
}
async function sbPost(table, body){
  return sbFetch(`/rest/v1/${table}`, {method:'POST', body:JSON.stringify(body)});
}
async function sbPatch(table, id, body){
  return sbFetch(`/rest/v1/${table}?id=eq.${id}`, {method:'PATCH', body:JSON.stringify(body)});
}
async function sbDelete(table, id){
  return sbFetch(`/rest/v1/${table}?id=eq.${id}`, {method:'DELETE'});
}

// ---------- Storage upload ----------
async function uploadToStorage(bucket, file, path){
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const headers = {'apikey': SUPABASE_ANON};
  if(SESSION_TOKEN) headers['Authorization'] = 'Bearer ' + SESSION_TOKEN;
  const res = await fetch(url, {method:'POST', headers, body:file});
  if(!res.ok) throw new Error('Falha no upload: ' + res.statusText);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
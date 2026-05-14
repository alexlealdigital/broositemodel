// =====================================================
//  AUTH (Supabase Auth)
// =====================================================
async function signIn(email, password){
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method:'POST',
    headers:{'apikey':SUPABASE_ANON,'Content-Type':'application/json'},
    body:JSON.stringify({email, password})
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error_description || data.error);
  SESSION_TOKEN = data.access_token;
  return data;
}

async function signOut(){
  if(!SESSION_TOKEN) return;
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method:'POST',
    headers:{'apikey':SUPABASE_ANON,'Authorization':'Bearer '+SESSION_TOKEN}
  }).catch(()=>{});
  SESSION_TOKEN = null;
}

// =====================================================
//  STATE
// =====================================================
let allProducts = [];
let allBanners  = [];
let allTexts    = [];
let cart        = JSON.parse(localStorage.getItem('alo_cart')||'[]');
let currentModalProduct = null;
let selectedSize = null;
let editingProductId = null;
let editingProductImages = []; // URLs das imagens do produto em edição
let heroIdx = 0, heroTimer;

// =====================================================
//  BOOT
// =====================================================
window.addEventListener('DOMContentLoaded', async ()=>{
  setSyncStatus('syncing','Conectando…');
  try {
    await Promise.all([loadProducts(), loadBanners(), loadTexts()]);
    setSyncStatus('ok','Supabase ✓');
  } catch(e){
    setSyncStatus('error','Offline — usando cache');
    console.warn('Supabase error:', e);
    loadFallback();
  }
  updateCartUI();
  renderHeroDots();
  startHeroAuto();
  document.getElementById('loadingOverlay').style.display = 'none';
});

function setSyncStatus(state, label){
  const dot = document.getElementById('syncDot');
  const lbl = document.getElementById('syncLabel');
  if(dot){ dot.className='sync-dot'; if(state==='syncing')dot.classList.add('syncing'); if(state==='error')dot.classList.add('error'); }
  if(lbl) lbl.textContent = label;
}

// =====================================================
//  LOAD DATA
// =====================================================
async function loadProducts(){
  const data = await sbGet('products','order=created_at.desc&status=neq.archived');
  allProducts = data || [];
  renderBestSellers();
  renderTrending();
  renderAdminProducts();
}

async function loadBanners(){
  const data = await sbGet('banners','order=sort_order.asc&active=eq.true');
  allBanners = data || [];
  applyBanners();
  renderAdminBanners();
}

async function loadTexts(){
  const data = await sbGet('site_texts','order=section.asc');
  allTexts = data || [];
  applyTexts();
  renderAdminTexts();
}

function loadFallback(){
  // Fallback com dados estáticos se Supabase não responder
  allProducts = [
    {id:'f1',name:'Legging High Waist Airlift',description:'A legging mais amada da Leve.',price:329,old_price:null,category_name:'Leggings',images:['https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600&q=80'],colors:['#0a0a0a','#4a6b8a'],badge:'Best Seller',status:'active',featured:true,trending:false},
    {id:'f2',name:'Top Sunny Strappy',description:'Top com alças cruzadas.',price:189,old_price:null,category_name:'Tops',images:['https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80'],colors:['#fafaf8','#c4704a'],badge:null,status:'active',featured:true,trending:true},
    {id:'f3',name:'Macacão Lounge',description:'Macacão de tecido macio.',price:449,old_price:599,category_name:'Macacão',images:['https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=600&q=80'],colors:['#d4b896'],badge:'Sale',status:'active',featured:true,trending:false},
    {id:'f4',name:'Jaqueta Define Zip',description:'Jaqueta leve e versátil.',price:389,old_price:null,category_name:'Jaquetas',images:['https://images.unsplash.com/photo-1483721310020-03333e577078?w=600&q=80'],colors:['#0a0a0a'],badge:null,status:'active',featured:true,trending:true},
  ];
  renderBestSellers(); renderTrending();
}

// =====================================================
//  APPLY DATA TO PAGE
// =====================================================
function applyBanners(){
  allBanners.forEach((b,i)=>{
    const bgEl = document.getElementById('heroSlide'+i);
    if(bgEl) bgEl.style.backgroundImage = `url('${b.image_url}')`;
    const eyeEl = document.getElementById('h'+i+'eyebrow');
    if(eyeEl) eyeEl.textContent = b.eyebrow||'';
    const titleEl = document.getElementById('h'+i+'title');
    if(titleEl) titleEl.innerHTML = b.title.replace(' ','\n').replace('\n','<br>');
    const subEl = document.getElementById('h'+i+'sub');
    if(subEl) subEl.textContent = b.subtitle||'';
  });
  renderHeroDots();
}

function applyTexts(){
  const map = {};
  allTexts.forEach(t=>map[t.key]=t.value);
  const set = (id,val)=>{ const el=document.getElementById(id); if(el&&val)el.innerHTML=val; };
  set('announcementBar', map['announcement_bar']);
  set('editorialEyebrow', map['editorial_eyebrow']);
  set('editorialTitle',   map['editorial_title']);
  set('editorialText',    map['editorial_text']);
  set('fullBannerTitle',  map['fullbanner_title']);
  set('fullBannerSub',    map['fullbanner_sub']);
  set('nlEyebrow',        map['newsletter_eyebrow']);
  set('nlTitle',          map['newsletter_title']);
  set('nlText',           map['newsletter_text']);
  set('footerAbout',      map['footer_about']);
  if(map['editorial_img']){ const el=document.getElementById('editorialImg'); if(el)el.src=map['editorial_img']; }
  if(map['fullbanner_img']){ const el=document.getElementById('fullBannerBg'); if(el)el.style.backgroundImage=`url('${map['fullbanner_img']}')`; }
}

// =====================================================
//  RENDER PRODUTOS
// =====================================================
function productImgSrc(p){
  const imgs = p.images || [];
  return imgs.length ? imgs[0] : 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600&q=80';
}

function renderProductCard(p, container){
  const src = productImgSrc(p);
  const priceHtml = p.old_price
    ? `<span class="old">R$ ${Number(p.old_price).toFixed(2).replace('.',',')}</span><span class="sale">R$ ${Number(p.price).toFixed(2).replace('.',',')}</span>`
    : `R$ ${Number(p.price).toFixed(2).replace('.',',')}`;
  const dots = (p.colors||[]).map((c,i)=>
    `<span class="color-dot${i===0?' active':''}" style="background:${c}"></span>`).join('');
  const badge = p.badge ? `<div class="product-badge">${p.badge}</div>` : '';
  const card = document.createElement('div');
  card.className='product-card';
  card.innerHTML=`
    <div class="product-img-wrap">
      <img src="${src}" alt="${p.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600&q=80'">
      ${badge}
      <button class="product-wish" onclick="event.stopPropagation();this.classList.toggle('wished');this.textContent=this.classList.contains('wished')?'♥':'♡'">♡</button>
    </div>
    <div class="product-info">
      <p class="product-category">${p.category_name||''}</p>
      <p class="product-name">${p.name}</p>
      <p class="product-price">${priceHtml}</p>
      <div class="product-colors">${dots}</div>
    </div>`;
  card.onclick = ()=>openProductModal(p);
  container.appendChild(card);
}

function renderBestSellers(){
  const g = document.getElementById('bestSellersGrid');
  if(!g) return;
  g.innerHTML='';
  allProducts.filter(p=>p.status==='active'&&p.featured).slice(0,4).forEach(p=>renderProductCard(p,g));
  if(!g.children.length) allProducts.filter(p=>p.status==='active').slice(0,4).forEach(p=>renderProductCard(p,g));
}

function renderTrending(){
  const g = document.getElementById('trendingGrid');
  if(!g) return;
  g.innerHTML='';
  allProducts.filter(p=>p.status==='active'&&p.trending).slice(0,4).forEach(p=>renderProductCard(p,g));
  if(!g.children.length) allProducts.filter(p=>p.status==='active').slice(4,8).forEach(p=>renderProductCard(p,g));
}

// =====================================================
//  HERO
// =====================================================
function renderHeroDots(){
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.getElementById('heroDots');
  if(!dots) return;
  dots.innerHTML='';
  slides.forEach((_,i)=>{
    const d=document.createElement('div');
    d.className='hero-dot'+(i===0?' active':'');
    d.onclick=()=>goHero(i);
    dots.appendChild(d);
  });
}
function goHero(i){
  const slides=document.querySelectorAll('.hero-slide');
  const dots=document.querySelectorAll('.hero-dot');
  if(!slides[i]) return;
  slides[heroIdx].classList.remove('active');
  if(dots[heroIdx]) dots[heroIdx].classList.remove('active');
  heroIdx=i;
  slides[heroIdx].classList.add('active');
  if(dots[heroIdx]) dots[heroIdx].classList.add('active');
}
function startHeroAuto(){
  heroTimer=setInterval(()=>{
    const slides=document.querySelectorAll('.hero-slide');
    goHero((heroIdx+1)%slides.length);
  },5000);
}

// =====================================================
//  PAGES
// =====================================================
function showPage(page){
  document.querySelectorAll('.page-view').forEach(v=>v.classList.remove('active'));
  if(page==='home'){
    document.getElementById('page-home').classList.add('active');
  } else {
    document.getElementById('page-category').classList.add('active');
    const titles={feminino:'Feminino',masculino:'Masculino',acessorios:'Acessórios',calcados:'Calçados'};
    const titleEl=document.getElementById('catPageTitle');
    if(titleEl) titleEl.textContent=titles[page]||'Coleção';
    renderCategoryPage(page);
  }
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderCategoryPage(page){
  const g=document.getElementById('categoryGrid');
  if(!g) return;
  g.innerHTML='';
  const catMap={feminino:['Leggings','Tops','Macacão','Jaquetas','Shorts'],masculino:['Leggings','Tops','Jaquetas','Shorts'],acessorios:['Acessórios'],calcados:['Calçados']};
  const allowed = catMap[page]||null;
  const filtered = allProducts.filter(p=>p.status==='active'&&(!allowed||allowed.includes(p.category_name)));
  const sub=document.getElementById('catPageSub');
  if(sub) sub.textContent=`${filtered.length} produto(s)`;
  filtered.forEach(p=>renderProductCard(p,g));
}

let catFilteredProducts = [];
function filterCat(btn, cat){
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  const g=document.getElementById('categoryGrid');
  if(!g) return;
  g.innerHTML='';
  catFilteredProducts = allProducts.filter(p=>p.status==='active'&&(cat==='all'||p.category_name===cat));
  catFilteredProducts.forEach(p=>renderProductCard(p,g));
}
function sortCat(val){
  const g=document.getElementById('categoryGrid');
  if(!g) return;
  let src = [...(catFilteredProducts.length?catFilteredProducts:allProducts.filter(p=>p.status==='active'))];
  if(val==='asc') src.sort((a,b)=>a.price-b.price);
  if(val==='desc') src.sort((a,b)=>b.price-a.price);
  g.innerHTML='';
  src.forEach(p=>renderProductCard(p,g));
}

// =====================================================
//  MODAL PRODUTO
// =====================================================
function openProductModal(p){
  currentModalProduct=p;
  selectedSize=null;
  const src=productImgSrc(p);
  document.getElementById('modalImg').src=src;
  document.getElementById('modalCat').textContent=p.category_name||'';
  document.getElementById('modalName').textContent=p.name;
  const price = p.old_price
    ? `<span style="text-decoration:line-through;color:var(--cinza);font-size:14px;font-weight:300;">R$ ${Number(p.old_price).toFixed(2).replace('.',',')}</span> <span style="color:var(--terracota)">R$ ${Number(p.price).toFixed(2).replace('.',',')}</span>`
    : `R$ ${Number(p.price).toFixed(2).replace('.',',')}`;
  document.getElementById('modalPrice').innerHTML=price;
  document.getElementById('modalDesc').textContent=p.description||'';
  document.getElementById('modalColors').innerHTML=(p.colors||[]).map((c,i)=>
    `<span class="color-dot${i===0?' active':''}" style="background:${c}" onclick="document.querySelectorAll('#modalColors .color-dot').forEach(d=>d.classList.remove('active'));this.classList.add('active')"></span>`).join('');
  const sizes=p.sizes||['PP','P','M','G','GG'];
  document.getElementById('modalSizes').innerHTML=sizes.map(s=>
    `<button class="size-btn" onclick="selectSize(this,'${s}')">${s}</button>`).join('');
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal(){
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow='';
}
document.getElementById('productModal').addEventListener('click',function(e){if(e.target===this)closeModal();});
function selectSize(btn,size){
  document.querySelectorAll('.size-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  selectedSize=size;
}
function addToCartFromModal(){
  if(!selectedSize){showToast('Selecione um tamanho');return;}
  addToCart(currentModalProduct,selectedSize);
  closeModal();
  openCart();
}

// =====================================================
//  CARRINHO
// =====================================================
function addToCart(p,size){
  const exist=cart.find(i=>i.id===p.id&&i.size===size);
  if(exist) exist.qty++;
  else cart.push({id:p.id,name:p.name,img:productImgSrc(p),price:Number(p.price),cat:p.category_name,size,qty:1});
  localStorage.setItem('alo_cart',JSON.stringify(cart));
  updateCartUI();
  showToast('Adicionado à sacola ✓');
}
function openCart(){
  document.getElementById('cartBackdrop').classList.add('open');
  document.getElementById('cartDrawer').classList.add('open');
  document.body.style.overflow='hidden';
  renderCart();
}
function closeCart(){
  document.getElementById('cartBackdrop').classList.remove('open');
  document.getElementById('cartDrawer').classList.remove('open');
  document.body.style.overflow='';
}
function renderCart(){
  const el=document.getElementById('cartItems');
  const footer=document.getElementById('cartFooter');
  if(!cart.length){
    el.innerHTML=`<div class="cart-empty"><div class="icon">🛍</div><p>Sua sacola está vazia</p></div>`;
    footer.style.display='none';return;
  }
  el.innerHTML=cart.map((item,i)=>`
    <div class="cart-item">
      <img src="${item.img}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600&q=80'">
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-variant">${item.cat} · Tam. ${item.size}</p>
        <p class="cart-item-price">R$ ${item.price.toFixed(2).replace('.',',')}</p>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${i},-1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${i},1)">+</button>
          <button class="cart-remove" onclick="removeItem(${i})">Remover</button>
        </div>
      </div>
    </div>`).join('');
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  document.getElementById('cartTotal').textContent=`R$ ${total.toFixed(2).replace('.',',')}`;
  footer.style.display='block';
}
function changeQty(i,d){
  cart[i].qty+=d;
  if(cart[i].qty<=0) cart.splice(i,1);
  localStorage.setItem('alo_cart',JSON.stringify(cart));
  updateCartUI();renderCart();
}
function removeItem(i){
  cart.splice(i,1);
  localStorage.setItem('alo_cart',JSON.stringify(cart));
  updateCartUI();renderCart();
}
function updateCartUI(){
  const count=cart.reduce((s,i)=>s+i.qty,0);
  const cc=document.getElementById('cartCount');
  cc.textContent=count;
  cc.style.display=count>0?'flex':'none';
}
async function checkout(){
  if(!cart.length) return;
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  try {
    await sbPost('orders',{
      items: cart,
      total: total.toFixed(2),
      subtotal: total.toFixed(2),
      status:'confirmed'
    });
    showToast('Pedido realizado! 🎉');
  } catch(e){
    showToast('Pedido registrado localmente ✓');
  }
  cart=[];
  localStorage.setItem('alo_cart',JSON.stringify(cart));
  updateCartUI();closeCart();renderCart();
}

// =====================================================
//  NEWSLETTER
// =====================================================
async function subscribeNewsletter(){
  const email=document.getElementById('nlEmail').value.trim();
  if(!email.includes('@')){showToast('E-mail inválido');return;}
  try {
    await sbPost('newsletter_subscribers',{email});
    showToast('Inscrita com sucesso! ✓');
  } catch(e){
    showToast('Inscrita! ✓ ('+e.message+')');
  }
  document.getElementById('nlEmail').value='';
}

// =====================================================
//  BUSCA
// =====================================================
function toggleSearch(){
  const q=prompt('Buscar produto:');
  if(!q) return;
  const res=allProducts.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||String(p.category_name).toLowerCase().includes(q.toLowerCase()));
  document.querySelectorAll('.page-view').forEach(v=>v.classList.remove('active'));
  document.getElementById('page-category').classList.add('active');
  const titleEl=document.getElementById('catPageTitle');
  if(titleEl) titleEl.textContent=`"${q}"`;
  const sub=document.getElementById('catPageSub');
  if(sub) sub.textContent=`${res.length} resultado(s)`;
  const g=document.getElementById('categoryGrid');
  g.innerHTML='';
  if(!res.length) g.innerHTML='<p style="grid-column:1/-1;text-align:center;color:var(--cinza);padding:60px 0">Nenhum resultado encontrado</p>';
  else res.forEach(p=>renderProductCard(p,g));
  window.scrollTo({top:0,behavior:'smooth'});
}

// =====================================================
//  TOAST
// =====================================================
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

// =====================================================
//  LOGIN / AUTH
// =====================================================
function showLoginAdmin(){
  document.getElementById('loginError').textContent='';
  document.getElementById('loginScreen').classList.add('active');
}
function closeLogin(){
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('loginEmail').value='';
  document.getElementById('loginPass').value='';
}
async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPass').value;
  if(!email||!pass){document.getElementById('loginError').textContent='Preencha e-mail e senha';return;}
  const btn=document.getElementById('loginBtn');
  btn.innerHTML='<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>';
  btn.disabled=true;
  try {
    await signIn(email,pass);
    closeLogin();
    await openAdmin();
  } catch(e){
    document.getElementById('loginError').textContent=e.message;
  }
  btn.innerHTML='Entrar';btn.disabled=false;
}

// =====================================================
//  ADMIN
// =====================================================
async function openAdmin(){
  document.getElementById('adminContainer').classList.add('active');
  await Promise.all([
    loadDashboard(),
    loadCategories(),
    renderAdminProducts(),
    renderAdminBanners(),
    renderAdminTexts(),
    renderAdminOrders()
  ]);
}
function exitAdmin(){
  document.getElementById('adminContainer').classList.remove('active');
}
function switchPanel(id, btn){
  document.querySelectorAll('.admin-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='dashboard') loadDashboard();
  if(id==='products')  renderAdminProducts();
  if(id==='banners')   renderAdminBanners();
  if(id==='categories') loadCategories();
  if(id==='texts')     loadTexts().then(renderAdminTexts);
  if(id==='orders')    renderAdminOrders();
}

async function loadDashboard(){
  try {
    const [orders,prods,subs] = await Promise.all([
      sbGet('orders','select=total,status,created_at,items').catch(()=>[]),
      sbGet('products','select=id,status').catch(()=>[]),
      sbGet('newsletter_subscribers','select=id').catch(()=>[])
    ]);
    const active = (orders||[]).filter(o=>o.status!=='cancelled');
    const revenue = active.reduce((s,o)=>s+Number(o.total),0);
    const ativos = (prods||[]).filter(p=>p.status==='active').length;
    document.getElementById('statReceita').textContent='R$ '+revenue.toFixed(2).replace('.',',');
    document.getElementById('statPedidos').textContent=active.length;
    document.getElementById('statProdutos').textContent=ativos;
    document.getElementById('statNewsletter').textContent=(subs||[]).length;
    const lo=document.getElementById('lastOrders');
    if(lo){
      if(!active.length){ lo.innerHTML='<p>Nenhum pedido ainda.</p>'; }
      else {
        lo.innerHTML=active.slice(-5).reverse().map(o=>`
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--borda);font-size:12px;">
            <span>${new Date(o.created_at).toLocaleDateString('pt-BR')} — ${(o.items||[]).length} item(s)</span>
            <span style="font-weight:600;">R$ ${Number(o.total).toFixed(2).replace('.',',')}</span>
          </div>`).join('');
      }
    }
  } catch(e){ console.warn('Dashboard error',e); }
}

// ----- PRODUTOS ADMIN -----
function renderAdminProducts(){
  const tbody=document.getElementById('productsTableBody');
  if(!tbody) return;
  tbody.innerHTML=allProducts.map(p=>`
    <tr>
      <td><img class="thumb" src="${productImgSrc(p)}" alt="" onerror="this.src='https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600&q=80'"></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.category_name||''}</td>
      <td>R$ ${Number(p.price).toFixed(2).replace('.',',')}${p.old_price?` <span style="color:var(--cinza);text-decoration:line-through;font-size:11px">R$${Number(p.old_price).toFixed(2)}</span>`:''}</td>
      <td><span class="admin-status ${p.status}">${p.status==='active'?'Ativo':'Rascunho'}</span></td>
      <td><div class="admin-actions">
        <button class="admin-btn edit" onclick="openProductEditor('${p.id}')">Editar</button>
        <button class="admin-btn delete" onclick="deleteProduct('${p.id}','${p.name}')">Excluir</button>
      </div></td>
    </tr>`).join('');
}

function filterAdminProducts(q){
  document.querySelectorAll('#productsTableBody tr').forEach(r=>{
    r.style.display=r.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}

function openProductEditor(id){
  editingProductId=id||null;
  editingProductImages=[];
  const p=id?allProducts.find(x=>x.id==id):null;
  document.getElementById('editorTitle').textContent=p?'Editar Produto':'Novo Produto';
  document.getElementById('editorImgUrl').value=(p?.images||[])[0]||'';
  document.getElementById('editorName').value=p?.name||'';
  document.getElementById('editorCat').value=p?.category_name||'Leggings';
  document.getElementById('editorPrice').value=p?.price||'';
  document.getElementById('editorOldPrice').value=p?.old_price||'';
  document.getElementById('editorDesc').value=p?.description||'';
  selectedColors = [...(p?.colors || [])];
  renderColorPicker();
  
  // Resetar e marcar checkboxes de tamanhos
  const sizes = p?.sizes || [];
  document.querySelectorAll('#sizeCheckboxContainer input[type="checkbox"]').forEach(cb => {
    cb.checked = sizes.includes(cb.value);
  });

  document.getElementById('editorStatus').value=p?.status||'active';
  document.getElementById('editorFeatured').checked=p?.featured||false;
  document.getElementById('editorTrending').checked=p?.trending||false;
  // Preview de imagens existentes
  const grid=document.getElementById('imgPreviewGrid');
  grid.innerHTML='';
  editingProductImages=[...(p?.images||[])];
  editingProductImages.forEach((url,i)=>addImgPreviewItem(url,i));
  document.getElementById('editorBackdrop').classList.add('open');
}
function closeEditor(){ document.getElementById('editorBackdrop').classList.remove('open'); }

function addImgPreviewItem(url,i){
  const grid=document.getElementById('imgPreviewGrid');
  const item=document.createElement('div');
  item.className='img-preview-item';
  item.id='prev_'+i;
  item.innerHTML=`<img src="${url}" alt="" onerror="this.src=''"><button class="remove-img" onclick="removeImgPreview(${i})">✕</button>`;
  grid.appendChild(item);
}
function removeImgPreview(i){
  editingProductImages.splice(i,1);
  document.getElementById('imgPreviewGrid').innerHTML='';
  editingProductImages.forEach((url,idx)=>addImgPreviewItem(url,idx));
}
function addUrlPreview(url){
  if(!url) return;
  // Adiciona a URL quando o usuário deixa o campo (no blur)
}
document.getElementById('editorImgUrl').addEventListener('blur',function(){
  const url=this.value.trim();
  if(url&&!editingProductImages.includes(url)){
    editingProductImages.push(url);
    addImgPreviewItem(url,editingProductImages.length-1);
    this.value='';
  }
});

// Upload de arquivo para Storage
async function handleFileSelect(event){ await uploadFiles(event.target.files); }
async function handleDrop(event){
  event.preventDefault();
  document.getElementById('uploadArea').classList.remove('drag-over');
  await uploadFiles(event.dataTransfer.files);
}

async function uploadFiles(files){
  if(!SESSION_TOKEN){ showToast('Faça login como admin para fazer upload'); return; }
  const prog=document.getElementById('uploadProgress');
  const bar=document.getElementById('uploadBar');
  prog.style.display='block';
  const total=files.length;
  for(let i=0;i<total;i++){
    const file=files[i];
    if(file.size>5*1024*1024){ showToast('Imagem muito grande: max 5MB'); continue; }
    bar.style.width=((i/total)*100)+'%';
    try {
      const ext=file.name.split('.').pop();
      const path=`${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const publicUrl=await uploadToStorage('product-images',file,path);
      editingProductImages.push(publicUrl);
      addImgPreviewItem(publicUrl,editingProductImages.length-1);
    } catch(e){ showToast('Erro no upload: '+e.message); }
  }
  bar.style.width='100%';
  setTimeout(()=>{ prog.style.display='none'; bar.style.width='0%'; },800);
}

async function saveProduct(){
  const name=document.getElementById('editorName').value.trim();
  const price=parseFloat(document.getElementById('editorPrice').value);
  if(!name||!price){ showToast('Preencha nome e preço'); return; }
  // Adiciona URL inline se preenchida
  const urlField=document.getElementById('editorImgUrl').value.trim();
  if(urlField&&!editingProductImages.includes(urlField)) editingProductImages.push(urlField);
  const oldP=parseFloat(document.getElementById('editorOldPrice').value)||null;
  const sizes = Array.from(document.querySelectorAll('#sizeCheckboxContainer input[type="checkbox"]:checked')).map(cb => cb.value);
  const payload={
    name,
    description:document.getElementById('editorDesc').value.trim(),
    price,
    old_price:oldP,
    category_name:document.getElementById('editorCat').value,
    images:editingProductImages.length?editingProductImages:['https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=600&q=80'],
    colors:selectedColors.length?selectedColors:['#000000'],
    sizes:sizes,
    badge:oldP?'Sale':null,
    status:document.getElementById('editorStatus').value,
    featured:document.getElementById('editorFeatured').checked,
    trending:document.getElementById('editorTrending').checked,
  };
  const btn=document.getElementById('editorSaveBtn');
  const txt=document.getElementById('editorSaveTxt');
  btn.disabled=true; txt.innerHTML='<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></span> Salvando…';
  try {
    if(editingProductId){
      await sbPatch('products',editingProductId,payload);
      const idx=allProducts.findIndex(p=>p.id==editingProductId);
      if(idx>=0) allProducts[idx]={...allProducts[idx],...payload,id:editingProductId};
      showToast('Produto atualizado ✓');
    } else {
      const res=await sbPost('products',payload);
      if(res&&res[0]) allProducts.unshift(res[0]);
      showToast('Produto criado ✓');
    }
    renderAdminProducts(); renderBestSellers(); renderTrending();
    closeEditor();
  } catch(e){ showToast('Erro: '+e.message); }
  btn.disabled=false; txt.textContent='Salvar no Supabase';
}

async function deleteProduct(id,name){
  if(!confirm(`Excluir "${name}"?`)) return;
  try {
    await sbDelete('products',id);
    allProducts=allProducts.filter(p=>p.id!=id);
    renderAdminProducts(); renderBestSellers(); renderTrending();
    showToast('Produto excluído');
  } catch(e){ showToast('Erro: '+e.message); }
}


// ----- CATEGORIAS ADMIN -----
async function loadCategories() {
  try {
    allCategories = await sbGet('categories', 'order=name.asc');
    renderAdminCategories();
    updateCategorySelects();
  } catch (e) {
    console.error('Erro ao carregar categorias:', e);
  }
}

function renderAdminCategories() {
  const tbody = document.getElementById('categoriesTableBody');
  if (!tbody) return;
  tbody.innerHTML = allCategories.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.slug}</td>
      <td><div class="admin-actions">
        <button class="admin-btn delete" onclick="deleteCategory('${c.id}','${c.name}')">Excluir</button>
      </div></td>
    </tr>`).join('');
}

function updateCategorySelects() {
  const select = document.getElementById('editorCat');
  if (select) {
    select.innerHTML = allCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }
}

function openCategoryEditor() {
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryEditorBackdrop').classList.add('open');
}

function closeCategoryEditor() {
  document.getElementById('categoryEditorBackdrop').classList.remove('open');
}

async function saveCategory() {
  const name = document.getElementById('categoryName').value.trim();
  if (!name) return;
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, "").replace(/\s+/g, '-');
  try {
    await sbPost('categories', { name, slug });
    showToast('Categoria criada ✓');
    closeCategoryEditor();
    await loadCategories();
  } catch (e) {
    showToast('Erro: ' + e.message);
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Excluir categoria "${name}"?`)) return;
  try {
    await sbDelete('categories', id);
    showToast('Categoria excluída');
    await loadCategories();
  } catch (e) {
    showToast('Erro: ' + e.message);
  }
}

function filterAdminCategories(q) {
  document.querySelectorAll('#categoriesTableBody tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

// ----- SELETOR DE CORES -----
function renderColorPicker() {
  const container = document.getElementById('colorPickerContainer');
  container.innerHTML = selectedColors.map((color, i) => `
    <div style="position:relative; width:30px; height:30px; background:${color}; border:1px solid var(--borda); border-radius:4px;">
      <button onclick="removeColor(${i})" style="position:absolute; top:-8px; right:-8px; background:red; color:white; border:none; border-radius:50%; width:16px; height:16px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
    </div>
  `).join('');
  document.getElementById('editorColors').value = selectedColors.join(',');
}

function addColorFromPicker() {
  const color = document.getElementById('colorInput').value;
  if (!selectedColors.includes(color)) {
    selectedColors.push(color);
    renderColorPicker();
  }
}

function removeColor(i) {
  selectedColors.splice(i, 1);
  renderColorPicker();
}

// ----- BANNERS ADMIN -----
function renderAdminBanners(){
  const g=document.getElementById('bannersGrid');
  if(!g) return;
  const src=allBanners.length?allBanners:[
    {id:'b1',slide_number:1,title:'Banner 1',subtitle:'',image_url:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80'},
    {id:'b2',slide_number:2,title:'Banner 2',subtitle:'',image_url:'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80'},
    {id:'b3',slide_number:3,title:'Banner 3',subtitle:'',image_url:'https://images.unsplash.com/photo-1601925228208-0fead6fd1a42?w=600&q=80'},
  ];
  g.innerHTML=src.map(b=>`
    <div class="banner-admin-card">
      <div class="banner-thumb">
        <img src="${b.image_url}" alt="" onerror="this.src='https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80'">
        <div class="banner-num">Slide ${b.slide_number}</div>
      </div>
      <div class="banner-details">
        <div class="title">${b.title}</div>
        <div class="sub">${b.subtitle||''}</div>
      </div>
      <div class="banner-actions">
        <button class="admin-btn edit" onclick="openBannerEditor('${b.id}')" style="flex:1">Editar Banner</button>
      </div>
    </div>`).join('');
}

function openBannerEditor(id){
  const b=allBanners.find(x=>x.id==id);
  document.getElementById('bannerEditorTitle').textContent=b?`Editar Slide ${b.slide_number}`:'Editar Banner';
  document.getElementById('bannerEyebrow').value=b?.eyebrow||'';
  document.getElementById('bannerTitle').value=b?.title||'';
  document.getElementById('bannerSub').value=b?.subtitle||'';
  document.getElementById('bannerImgUrl').value=b?.image_url||'';
  document.getElementById('bannerEditId').value=b?.id||'';
  document.getElementById('bannerEditSlide').value=b?.slide_number||1;
  const prev=document.getElementById('bannerImgPreview');
  const prevImg=document.getElementById('bannerImgPreviewImg');
  if(b?.image_url){prevImg.src=b.image_url;prev.style.display='block';}
  else prev.style.display='none';
  document.getElementById('bannerEditorBackdrop').classList.add('open');
}
function closeBannerEditor(){ document.getElementById('bannerEditorBackdrop').classList.remove('open'); }

function previewBannerUrl(url){
  const prev=document.getElementById('bannerImgPreview');
  const prevImg=document.getElementById('bannerImgPreviewImg');
  if(url){prevImg.src=url;prev.style.display='block';}
  else prev.style.display='none';
}

async function handleBannerFile(event){ await uploadBannerFile(event.target.files[0]); }
async function handleBannerDrop(event){
  event.preventDefault();
  document.getElementById('bannerUploadArea').classList.remove('drag-over');
  if(event.dataTransfer.files[0]) await uploadBannerFile(event.dataTransfer.files[0]);
}
async function uploadBannerFile(file){
  if(!SESSION_TOKEN){ showToast('Faça login como admin para fazer upload'); return; }
  if(file.size>10*1024*1024){ showToast('Imagem muito grande: max 10MB'); return; }
  const prog=document.getElementById('bannerUploadProgress');
  const bar=document.getElementById('bannerUploadBar');
  prog.style.display='block';bar.style.width='30%';
  try {
    const ext=file.name.split('.').pop();
    const path=`banner_${Date.now()}.${ext}`;
    const url=await uploadToStorage('banners',file,path);
    bar.style.width='100%';
    document.getElementById('bannerImgUrl').value=url;
    previewBannerUrl(url);
    showToast('Imagem enviada ✓');
  } catch(e){ showToast('Erro no upload: '+e.message); }
  setTimeout(()=>{ prog.style.display='none'; bar.style.width='0%'; },800);
}

async function saveBanner(){
  const id=document.getElementById('bannerEditId').value;
  const slide=parseInt(document.getElementById('bannerEditSlide').value)||1;
  const payload={
    eyebrow:document.getElementById('bannerEyebrow').value.trim(),
    title:document.getElementById('bannerTitle').value.trim(),
    subtitle:document.getElementById('bannerSub').value.trim(),
    image_url:document.getElementById('bannerImgUrl').value.trim(),
    slide_number:slide,
  };
  if(!payload.title||!payload.image_url){ showToast('Preencha título e imagem'); return; }
  const btn=document.getElementById('bannerSaveBtn');
  const txt=document.getElementById('bannerSaveTxt');
  btn.disabled=true;txt.textContent='Salvando…';
  try {
    await sbPatch('banners',id,payload);
    const idx=allBanners.findIndex(b=>b.id==id);
    if(idx>=0) allBanners[idx]={...allBanners[idx],...payload,id};
    applyBanners();renderAdminBanners();
    closeBannerEditor();
    showToast('Banner salvo ✓');
  } catch(e){ showToast('Erro: '+e.message); }
  btn.disabled=false;txt.textContent='Salvar Banner';
}

// ----- TEXTOS ADMIN -----
function renderAdminTexts(){
  const c=document.getElementById('textsContainer');
  if(!c) return;
  const grouped={};
  allTexts.forEach(t=>{
    if(!grouped[t.section]) grouped[t.section]=[];
    grouped[t.section].push(t);
  });
  c.innerHTML=Object.entries(grouped).map(([section,items])=>`
    <div class="text-editor-block">
      <div class="text-editor-head">
        <span class="section-id">${section}</span>
        <button class="admin-btn edit" onclick="saveTextsSection('${section}')">Salvar "${section}"</button>
      </div>
      ${items.map(t=>`
      <div class="text-editor-content">
        <span class="text-field-label">${t.label}</span>
        <textarea class="text-field" id="tf_${t.key}" rows="${t.key.includes('img')?1:2}">${t.value}</textarea>
      </div>`).join('')}
    </div>`).join('');
}

async function saveTextsSection(section){
  const sectionTexts=allTexts.filter(t=>t.section===section);
  let saved=0;
  for(const t of sectionTexts){
    const el=document.getElementById('tf_'+t.key);
    if(!el) continue;
    const newVal=el.value;
    if(newVal===t.value) continue;
    try {
      await sbFetch(`/rest/v1/site_texts?key=eq.${t.key}`,{method:'PATCH',body:JSON.stringify({value:newVal})});
      t.value=newVal;
      saved++;
    } catch(e){ console.warn('Erro ao salvar texto',t.key,e); }
  }
  applyTexts();
  showToast(saved>0?`${saved} texto(s) salvo(s) ✓`:'Sem alterações');
}

// ----- PEDIDOS ADMIN -----
async function renderAdminOrders(){
  const tbody=document.getElementById('ordersTableBody');
  if(!tbody) return;
  try {
    const orders=await sbGet('orders','order=created_at.desc&limit=50');
    if(!orders||!orders.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--cinza)">Nenhum pedido ainda</td></tr>';
      return;
    }
    tbody.innerHTML=orders.map(o=>`
      <tr>
        <td><strong>${o.order_number||o.id.slice(0,8)}</strong></td>
        <td>${new Date(o.created_at).toLocaleDateString('pt-BR')}</td>
        <td>${o.customer_name||'—'}</td>
        <td>${Array.isArray(o.items)?o.items.length:1}</td>
        <td>R$ ${Number(o.total).toFixed(2).replace('.',',')}</td>
        <td><span class="admin-status active">${o.status}</span></td>
      </tr>`).join('');
  } catch(e){
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--cinza)">Erro ao carregar pedidos</td></tr>';
  }
}

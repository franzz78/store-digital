// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD9BmV4XKXuMWa4PZHpb7Bbt-rHs61m3lE",
  databaseURL: "https://absensi-polri-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "absensi-polri",
  storageBucket: "absensi-polri.firebasestorage.app",
  messagingSenderId: "19006760644",
  appId: "1:19006760644:web:b980f54aea123e92ed4b91"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const auth = firebase.auth();

// Global App State
let currentUser = null;
let userProfile = null;
let productsCache = {};
let bannersCache = [];
let activeCategoryFilter = "Semua";
let isAuthSignUp = false;
let currentActiveTicketId = null;
let currentCheckoutProduct = null;

// Initialize Web App
document.addEventListener('DOMContentLoaded', () => {
  runLoadingProgress();
  setupAuthObserver();
  setupRealtimeListeners();
});

// Loading Progress Logic
function runLoadingProgress() {
  let progress = 0;
  const fill = document.getElementById('progress-fill');
  const counter = document.getElementById('loading-counter');
  
  const timer = setInterval(() => {
    progress += Math.floor(Math.random() * 15) + 5;
    if (progress >= 100) {
      progress = 100;
      clearInterval(timer);
      setTimeout(() => {
        const screen = document.getElementById('loading-screen');
        screen.style.opacity = '0';
        screen.style.transition = 'opacity 0.4s ease';
        setTimeout(() => screen.classList.add('hidden'), 400);
      }, 300);
    }
    fill.style.width = progress + '%';
    counter.innerText = `Loading ${progress}%`;
  }, 80);
}

// Authentication State
function setupAuthObserver() {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    const authBtn = document.getElementById('auth-nav-btn');
    const adminLink = document.getElementById('admin-drawer-link');
    
    if (user) {
      authBtn.innerText = "Profil";
      authBtn.onclick = () => switchView('profile-view');
      document.getElementById('prof-uid').innerText = user.uid;
      
      db.ref(`users/${user.uid}`).on('value', snapshot => {
        userProfile = snapshot.val() || {};
        document.getElementById('user-points-display').innerText = userProfile.pointBalance || 0;
        document.getElementById('prof-name').innerText = userProfile.displayName || "User";
        document.getElementById('prof-role').innerText = userProfile.role || "USER";
        document.getElementById('prof-point').innerText = userProfile.pointBalance || 0;
        
        if (userProfile.role === 'ADMIN' || userProfile.role === 'OWNER') {
          adminLink.classList.remove('hidden');
          if (userProfile.role === 'OWNER') {
            document.getElementById('owner-tab-link').classList.remove('hidden');
          }
        }
      });
    } else {
      authBtn.innerText = "Login";
      authBtn.onclick = () => openAuthModal();
      document.getElementById('user-points-display').innerText = "0";
      adminLink.classList.add('hidden');
    }
  });
}

// Realtime Listeners
function setupRealtimeListeners() {
  db.ref('products').on('value', snapshot => {
    productsCache = snapshot.val() || {};
    renderProducts();
    renderAdminProducts();
  });

  db.ref('banners').on('value', snapshot => {
    const data = snapshot.val() || {};
    bannersCache = Object.values(data);
    renderBanners();
    renderAdminBanners();
  });

  db.ref('settings/storeStatus').on('value', snapshot => {
    const status = snapshot.val() || "OPEN";
    document.getElementById('store-status-badge').innerText = `STORE ${status}`;
    document.getElementById('footer-store-status').innerText = status;
    const ownerText = document.getElementById('owner-store-status-text');
    if(ownerText) ownerText.innerText = status;
  });

  db.ref('orders').on('value', snapshot => {
    const orders = snapshot.val() || {};
    renderUserOrders(orders);
    renderAdminOrders(orders);
    updateDashboardStats(orders);
  });
}

// Navigation View Switcher
function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

function toggleDrawer() {
  document.getElementById('mobile-drawer').classList.toggle('open');
}

document.getElementById('hamburger-btn').addEventListener('click', toggleDrawer);

// Render Product Catalog
function renderProducts() {
  const homeGrid = document.getElementById('home-product-grid');
  const allGrid = document.getElementById('all-product-grid');
  const commGrid = document.getElementById('community-product-grid');
  const searchQuery = document.getElementById('search-input').value.toLowerCase();
  
  let html = '';
  let commHtml = '';
  
  Object.keys(productsCache).forEach(key => {
    const p = productsCache[key];
    if (p.status === 'DISABLED') return;
    
    const matchesCategory = (activeCategoryFilter === 'Semua') ||
                            (activeCategoryFilter === 'Featured' && p.isFeatured) ||
                            (p.category === activeCategoryFilter);
    const matchesSearch = p.name.toLowerCase().includes(searchQuery);

    if (matchesCategory && matchesSearch) {
      const card = `
        <div class="product-card">
          <img src="${p.imageUrl}" class="product-img" alt="${p.name}" onerror="this.src='https://via.placeholder.com/300x180?text=No+Image'">
          <div class="product-info">
            <div class="product-title">${p.name}</div>
            <div class="product-seller">Seller: ${p.sellerName || 'Official'}</div>
            <div class="product-price">${p.isCommunityOnly ? p.pointPrice + ' POINT' : 'Rp ' + Number(p.price).toLocaleString('id-ID')}</div>
            <button class="btn-cyan w-full" onclick="openProductDetail('${key}')">BELI SEKARANG</button>
          </div>
        </div>
      `;
      
      if (p.isCommunityOnly) {
        commHtml += card;
      } else {
        html += card;
      }
    }
  });

  const empty = `<p class="text-muted">Tidak ada produk ditemukan.</p>`;
  if (homeGrid) homeGrid.innerHTML = html || empty;
  if (allGrid) allGrid.innerHTML = html || empty;
  if (commGrid) commGrid.innerHTML = commHtml || `<p class="text-muted">Tidak ada item khusus komunitas.</p>`;
}

function setCategoryFilter(cat, btn) {
  activeCategoryFilter = cat;
  document.querySelectorAll('.category-pills .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

// Product Detail Modal
function openProductDetail(key) {
  const p = productsCache[key];
  if (!p) return;
  
  const body = document.getElementById('product-detail-body');
  body.innerHTML = `
    <div>
      <img src="${p.imageUrl}" style="width:100%; border-radius:8px;" alt="${p.name}">
    </div>
    <div>
      <h2>${p.name}</h2>
      <p class="text-muted mt-2">${p.description}</p>
      <div class="mt-3">
        <p><strong>Kategori:</strong> ${p.category}</p>
        <p><strong>Stok:</strong> ${p.stock}</p>
        <p><strong>Seller:</strong> ${p.sellerName || 'Official'}</p>
      </div>
      <div class="product-price mt-3" style="font-size:1.5rem">
        ${p.isCommunityOnly ? p.pointPrice + ' POINT' : 'Rp ' + Number(p.price).toLocaleString('id-ID')}
      </div>
      <button class="btn-cyan w-full mt-4" onclick="startCheckout('${key}')">BUY NOW</button>
    </div>
  `;
  document.getElementById('product-detail-modal').classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Banner Slider Render
function renderBanners() {
  const slider = document.getElementById('banner-slider');
  const dots = document.getElementById('banner-dots');
  if (!bannersCache.length) {
    slider.innerHTML = `<div class="banner-slide active" style="background-image:url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe')"><div class="banner-caption"><h3>Store Logistik & Perlengkapan</h3></div></div>`;
    return;
  }
  
  let slideHtml = '';
  let dotHtml = '';
  bannersCache.forEach((b, idx) => {
    if (b.status === 'DISABLED') return;
    slideHtml += `
      <div class="banner-slide ${idx === 0 ? 'active' : ''}" style="background-image:url('${b.imageUrl}')">
        <div class="banner-caption"><h3>${b.title || 'Special Promo'}</h3></div>
      </div>
    `;
    dotHtml += `<div class="dot ${idx === 0 ? 'active' : ''}"></div>`;
  });
  slider.innerHTML = slideHtml;
  dots.innerHTML = dotHtml;
}

// Checkout Step System
function startCheckout(productKey) {
  closeModal('product-detail-modal');
  if (!currentUser) {
    Swal.fire('Login Diperlukan', 'Silakan login terlebih dahulu untuk bertransaksi.', 'warning');
    openAuthModal();
    return;
  }
  
  db.ref('settings/storeStatus').once('value', snap => {
    if (snap.val() === 'CLOSED') {
      Swal.fire('Store Sedang Ditutup', 'Toko sementara tidak menerima orderan baru.', 'error');
      return;
    }
    
    currentCheckoutProduct = { key: productKey, ...productsCache[productKey] };
    switchView('checkout-view');
    renderCheckoutStep(1);
  });
}

function renderCheckoutStep(step) {
  const container = document.getElementById('checkout-content');
  document.querySelectorAll('.step-item').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === step);
  });

  const p = currentCheckoutProduct;

  if (step === 1) {
    container.innerHTML = `
      <h3>01 Ringkasan Produk</h3>
      <p class="mt-2"><strong>${p.name}</strong></p>
      <p class="text-cyan">${p.isCommunityOnly ? p.pointPrice + ' POINT' : 'Rp ' + Number(p.price).toLocaleString('id-ID')}</p>
      <button class="btn-cyan mt-4" onclick="renderCheckoutStep(2)">Lanjut ke Payment</button>
    `;
  } else if (step === 2) {
    container.innerHTML = `
      <h3>02 Pilih Metode Pembayaran</h3>
      <div class="mt-3">
        ${p.isCommunityOnly ? `
          <button class="btn-cyan-outline w-full mt-2" onclick="processPointPayment()">Bayar Menggunakan Point (${p.pointPrice} PT)</button>
        ` : `
          <button class="btn-cyan-outline w-full mt-2" onclick="confirmPaymentMethod('GOPAY')">GoPay (085175218022)</button>
          <button class="btn-cyan-outline w-full mt-2" onclick="confirmPaymentMethod('POINT')">Point Internal (${p.pointPrice || 500} PT)</button>
        `}
      </div>
    `;
  }
}

// Payment Processing
function processPointPayment() {
  const cost = currentCheckoutProduct.pointPrice || 500;
  if ((userProfile.pointBalance || 0) < cost) {
    Swal.fire('Point Tidak Cukup', 'Saldo Point anda tidak mencukupi.', 'error');
    return;
  }

  // Atomic Point Transaction
  db.ref(`users/${currentUser.uid}/pointBalance`).transaction(current => {
    if ((current || 0) >= cost) {
      return current - cost;
    } else {
      return; // Abort
    }
  }, (error, committed) => {
    if (committed) {
      createOrderRecord('POINT', 'PAID');
      Swal.fire('Pembayaran Point Berhasil', 'Order berhasil diproses!', 'success');
    } else {
      Swal.fire('Gagal', 'Transaksi Point gagal.', 'error');
    }
  });
}

function confirmPaymentMethod(method) {
  if (method === 'POINT') {
    processPointPayment();
  } else {
    createOrderRecord('GOPAY', 'WAITING_PAYMENT');
  }
}

function createOrderRecord(method, status) {
  const now = Date.now();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const orderId = `ORD-${dateStr}-${randNum}`;
  const ticketId = `TCK-${dateStr}-${randNum}`;

  const orderData = {
    orderId,
    userId: currentUser.uid,
    username: userProfile.displayName || "User",
    productId: currentCheckoutProduct.key,
    productName: currentCheckoutProduct.name,
    sellerId: currentCheckoutProduct.sellerId || "MAIN",
    sellerName: currentCheckoutProduct.sellerName || "Official",
    price: currentCheckoutProduct.price,
    paymentMethod: method,
    status: status,
    createdAt: now,
    expiredAt: now + (24 * 60 * 60 * 1000), // 24 jam expiration
    ticketId
  };

  db.ref(`orders/${orderId}`).set(orderData);
  
  // Create Automatic Ticket
  db.ref(`tickets/${ticketId}`).set({
    ticketId,
    orderId,
    userId: currentUser.uid,
    sellerId: currentCheckoutProduct.sellerId || "MAIN",
    createdAt: now,
    status: "OPEN"
  });

  document.getElementById('checkout-content').innerHTML = `
    <h3>04 Order Created!</h3>
    <p class="mt-2">ID Order: <strong>${orderId}</strong></p>
    <p>Status: <span class="text-cyan">${status}</span></p>
    ${method === 'GOPAY' ? '<p class="mt-2">Silakan transfer GoPay ke: <strong>085175218022</strong></p>' : ''}
    <button class="btn-cyan mt-4" onclick="switchView('orders-view')">Lihat Orders Saya</button>
  `;
}

// Render Orders
function renderUserOrders(allOrders) {
  const container = document.getElementById('orders-list-container');
  if (!currentUser) return;
  
  let html = '';
  Object.values(allOrders).forEach(ord => {
    if (ord.userId === currentUser.uid) {
      const isExpired = Date.now() > ord.expiredAt && ord.status === 'WAITING_PAYMENT';
      const statusText = isExpired ? 'EXPIRED' : ord.status;
      
      html += `
        <div class="card-panel mt-3" style="background:var(--bg-card); padding:1rem; border-radius:8px; border:1px solid var(--border-color);">
          <div class="flex-between">
            <strong>${ord.orderId}</strong>
            <span class="text-cyan">${statusText}</span>
          </div>
          <p class="mt-2">${ord.productName}</p>
          <p class="text-muted fs-sm">Payment: ${ord.paymentMethod}</p>
          <button class="btn-cyan-outline mt-2" onclick="openTicketChat('${ord.ticketId}')">Buka Ticket Bantuan</button>
        </div>
      `;
    }
  });
  container.innerHTML = html || `<p class="text-muted">Belum ada pesanan.</p>`;
}

// Ticket Private Chat System
function openTicketChat(ticketId) {
  currentActiveTicketId = ticketId;
  switchView('tickets-view');
  document.getElementById('no-ticket-selected').classList.add('hidden');
  document.getElementById('active-chat-container').classList.remove('hidden');
  
  db.ref(`ticketMessages/${ticketId}`).on('value', snapshot => {
    const msgs = snapshot.val() || {};
    const box = document.getElementById('chat-messages');
    let html = '';
    Object.values(msgs).forEach(m => {
      const isMe = m.senderId === currentUser.uid;
      html += `<div class="msg-bubble ${isMe ? 'me' : 'other'}">${m.message}</div>`;
    });
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  });
}

function sendTicketMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || !currentActiveTicketId) return;

  const msgId = db.ref(`ticketMessages/${currentActiveTicketId}`).push().key;
  db.ref(`ticketMessages/${currentActiveTicketId}/${msgId}`).set({
    senderId: currentUser.uid,
    senderName: userProfile.displayName || "User",
    message: msg,
    timestamp: Date.now()
  });
  input.value = '';
}

// Auth Handlers
function openAuthModal() {
  document.getElementById('auth-modal').classList.add('open');
}

function toggleAuthMode() {
  isAuthSignUp = !isAuthSignUp;
  document.getElementById('auth-title').innerText = isAuthSignUp ? "Daftar Akun Baru" : "Login / Masuk";
  document.getElementById('auth-toggle-text').innerText = isAuthSignUp ? "Sudah punya akun? Login." : "Belum punya akun? Daftar disini.";
}

function handleAuthSubmit() {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-password').value;

  if (isAuthSignUp) {
    auth.createUserWithEmailAndPassword(email, pass)
      .then(res => {
        db.ref(`users/${res.user.uid}`).set({
          displayName: email.split('@')[0],
          role: "USER",
          pointBalance: 0,
          createdAt: Date.now()
        });
        closeModal('auth-modal');
        Swal.fire('Registrasi Berhasil', 'Akun dibuat!', 'success');
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  } else {
    auth.signInWithEmailAndPassword(email, pass)
      .then(() => {
        closeModal('auth-modal');
        Swal.fire('Login Berhasil', 'Selamat datang!', 'success');
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  }
}

function handleLogout() {
  auth.signOut().then(() => {
    switchView('home');
    Swal.fire('Logged Out', 'Anda berhasil keluar.', 'info');
  });
}

function updateDisplayName() {
  const name = document.getElementById('edit-display-name').value.trim();
  if (!name) return;
  db.ref(`users/${currentUser.uid}/displayName`).set(name);
  Swal.fire('Sukses', 'Nama berhasil diubah.', 'success');
}

// Admin Panel Logics
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`admin-tab-${tab}`).classList.add('active');
}

function renderAdminProducts() {
  const tbody = document.getElementById('admin-product-table');
  if (!tbody) return;
  let html = '';
  Object.keys(productsCache).forEach(k => {
    const p = productsCache[k];
    html += `
      <tr>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>Rp ${p.price}</td>
        <td>${p.stock}</td>
        <td>${p.sellerName || 'Official'}</td>
        <td><button class="btn-danger" onclick="deleteProduct('${k}')">Hapus</button></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function openProductModal() {
  document.getElementById('product-form-modal').classList.add('open');
}

function saveProduct() {
  const id = db.ref('products').push().key;
  const data = {
    name: document.getElementById('pform-name').value,
    description: document.getElementById('pform-desc').value,
    price: Number(document.getElementById('pform-price').value),
    pointPrice: Number(document.getElementById('pform-point').value),
    imageUrl: document.getElementById('pform-image').value,
    category: document.getElementById('pform-category').value,
    stock: Number(document.getElementById('pform-stock').value),
    sellerName: document.getElementById('pform-seller').value,
    isCommunityOnly: document.getElementById('pform-community').checked,
    isFeatured: document.getElementById('pform-featured').checked,
    status: 'ACTIVE'
  };
  db.ref(`products/${id}`).set(data);
  closeModal('product-form-modal');
  Swal.fire('Sukses', 'Produk ditambahkan.', 'success');
}

function deleteProduct(id) {
  db.ref(`products/${id}`).remove();
}

function addBannerPrompt() {
  if (bannersCache.length >= 15) {
    Swal.fire('Batas Maksimum', 'Maximum 15 banners allowed.', 'warning');
    return;
  }
  Swal.fire({
    title: 'Masukkan Image URL Banner',
    input: 'url',
    showCancelButton: true
  }).then(res => {
    if (res.value) {
      const id = db.ref('banners').push().key;
      db.ref(`banners/${id}`).set({ imageUrl: res.value, status: 'ACTIVE' });
    }
  });
}

function renderAdminBanners() {
  const container = document.getElementById('admin-banner-list');
  if (!container) return;
  let html = '';
  bannersCache.forEach(b => {
    html += `<img src="${b.imageUrl}" style="width:100%; height:100px; object-fit:cover; border-radius:8px;">`;
  });
  container.innerHTML = html;
}

function renderAdminOrders(orders) {
  const tbody = document.getElementById('admin-order-table');
  if (!tbody) return;
  let html = '';
  Object.values(orders).forEach(o => {
    html += `
      <tr>
        <td>${o.orderId}</td>
        <td>${o.username}</td>
        <td>${o.productName}</td>
        <td>Rp ${o.price}</td>
        <td>${o.paymentMethod}</td>
        <td>${o.status}</td>
        <td><button class="btn-cyan" onclick="updateOrderStatus('${o.orderId}', 'COMPLETED')">Complete</button></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function updateOrderStatus(orderId, status) {
  db.ref(`orders/${orderId}/status`).set(status);
}

function updateDashboardStats(orders) {
  const list = Object.values(orders);
  document.getElementById('stat-orders').innerText = list.length;
  document.getElementById('stat-pending').innerText = list.filter(o => o.status === 'WAITING_PAYMENT').length;
  document.getElementById('stat-completed').innerText = list.filter(o => o.status === 'COMPLETED').length;
  document.getElementById('stat-products').innerText = Object.keys(productsCache).length;
}

// Owner Controls
function toggleStoreStatus(status) {
  db.ref('settings/storeStatus').set(status);
  Swal.fire('Status Disimpan', `Toko sekarang ${status}`, 'success');
}

function assignAdminRole() {
  const uid = document.getElementById('owner-target-uid').value.trim();
  if (!uid) return;
  db.ref(`users/${uid}/role`).set('ADMIN');
  db.ref(`admins/${uid}`).set({ role: 'ADMIN' });
  Swal.fire('Admin Diangkat', `User ${uid} telah menjadi Admin.`, 'success');
}

function setUserPointsDirect() {
  const uid = document.getElementById('point-target-uid').value.trim();
  const amt = Number(document.getElementById('point-amount-input').value);
  if (!uid) return;
  db.ref(`users/${uid}/pointBalance`).set(amt);
  Swal.fire('Point Disimpan', `Point user diset ke ${amt}`, 'success');
}
/* ==========================================================================
   FIREBASE INITIALIZATION
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyD9BmV4XKXuMWa4PZHpb7Bbt-rHs61m3lE",
  databaseURL: "https://absensi-polri-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "absensi-polri",
  storageBucket: "absensi-polri.firebasestorage.app",
  messagingSenderId: "19006760644",
  appId: "1:19006760644:web:b980f54aea123e92ed4b91"
};

// Initialize Firebase App
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const auth = firebase.auth();

/* ==========================================================================
   GLOBAL APP STATE
   ========================================================================== */
const app = {
  currentUser: {
    uid: null,
    displayName: "Guest",
    role: "GUEST",
    points: 0,
    isLoggedIn: false
  },
  storeStatus: {
    isOpen: true,
    announcement: ""
  },
  products: {},
  banners: [],
  orders: {},
  tickets: {},
  ticketMessages: {},
  paymentMethods: {},
  sellers: {},
  admins: {},
  allUsers: {},
  currentActiveTicketId: null,
  sliderInterval: null,
  currentSlideIndex: 0,
  selectedProductForCheckout: null,

  init() {
    this.setupPWA();
    this.runLoadingScreen();
    this.bindEvents();
    this.setupAuthListener();
    this.setupRealtimeDatabaseListeners();
  },

  /* ------------------------------------------------------------------------
     PWA SERVICE WORKER
     ------------------------------------------------------------------------ */
  setupPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
          console.log('SW Registered:', reg.scope);
        }).catch(err => console.log('SW Reg Fail:', err));
      });
    }
  },

  /* ------------------------------------------------------------------------
     LOADING SCREEN ENGINE
     ------------------------------------------------------------------------ */
  runLoadingScreen() {
    let progress = 0;
    const bar = document.getElementById('loading-bar');
    const text = document.getElementById('loading-text');
    const screen = document.getElementById('loading-screen');

    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
          screen.style.opacity = '0';
          setTimeout(() => screen.classList.add('hidden'), 600);
        }, 300);
      }
      bar.style.width = `${progress}%`;
      text.innerText = `Loading ${progress}%`;
    }, 100);
  },

  /* ------------------------------------------------------------------------
     NAVIGATION & SPA ROUTER
     ------------------------------------------------------------------------ */
  navigateTo(sectionId) {
    document.querySelectorAll('.spa-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(nl => nl.classList.remove('active'));

    const targetSec = document.getElementById(`sec-${sectionId}`);
    if (targetSec) targetSec.classList.add('active');

    const targetNav = document.getElementById(`nl-${sectionId}`);
    if (targetNav) targetNav.classList.add('active');

    // Close Mobile Drawer
    document.getElementById('mobile-drawer').classList.remove('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* ------------------------------------------------------------------------
     AUTHENTICATION & USER SYSTEM
     ------------------------------------------------------------------------ */
  setupAuthListener() {
    auth.onAuthStateChanged(user => {
      if (user) {
        this.currentUser.uid = user.uid;
        this.currentUser.isLoggedIn = true;

        // Sync User Data Realtime
        db.ref(`users/${user.uid}`).on('value', snapshot => {
          const val = snapshot.val();
          if (val) {
            this.currentUser.displayName = val.displayName || "User";
            this.currentUser.role = val.role || "USER";
            this.currentUser.points = val.points || 0;
          } else {
            // First time Firebase Auth user
            const defaultUser = {
              uid: user.uid,
              displayName: user.email ? user.email.split('@')[0] : "User",
              role: "USER",
              points: 0,
              createdAt: firebase.database.ServerValue.TIMESTAMP
            };
            db.ref(`users/${user.uid}`).set(defaultUser);
          }
          this.updateUserInterface();
        });
      } else {
        // Anonymous/Guest Mode fallback
        let guestUid = localStorage.getItem('guest_uid');
        if (!guestUid) {
          guestUid = 'GST-' + Math.random().toString(36).substring(2, 9);
          localStorage.setItem('guest_uid', guestUid);
        }
        
        const guestName = localStorage.getItem('guest_name') || "Guest";

        this.currentUser = {
          uid: guestUid,
          displayName: guestName,
          role: "GUEST",
          points: parseInt(localStorage.getItem('guest_points') || "0"),
          isLoggedIn: false
        };

        this.updateUserInterface();
      }
    });
  },

  updateUserInterface() {
    document.getElementById('user-display-name').innerText = this.currentUser.displayName;
    document.getElementById('user-role-badge').innerText = this.currentUser.role;
    document.getElementById('profile-name-text').innerText = this.currentUser.displayName;
    document.getElementById('profile-role-text').innerText = `ROLE: ${this.currentUser.role}`;
    document.getElementById('profile-uid-text').innerText = this.currentUser.uid;
    document.getElementById('profile-points-text').innerText = `${this.currentUser.points.toLocaleString()} POINT`;
    document.getElementById('profile-avatar-letter').innerText = this.currentUser.displayName.charAt(0).toUpperCase();
    document.getElementById('community-user-points').innerText = `${this.currentUser.points.toLocaleString()} POINT`;

    // Owner UI Controls
    const ownerMenu = document.getElementById('owner-only-menu');
    if (this.currentUser.role === 'OWNER') {
      ownerMenu.classList.remove('hidden');
      document.getElementById('admin-sidebar-role').innerText = "OWNER FULL ACCESS";
    } else {
      ownerMenu.classList.add('hidden');
      document.getElementById('admin-sidebar-role').innerText = this.currentUser.role;
    }
  },

  /* ------------------------------------------------------------------------
     REALTIME DATABASE LISTENERS
     ------------------------------------------------------------------------ */
  setupRealtimeDatabaseListeners() {
    // Store Status
    db.ref('storeStatus').on('value', snap => {
      const val = snap.val();
      if (val) {
        this.storeStatus = val;
        const alertBanner = document.getElementById('store-closed-banner');
        if (!val.isOpen) {
          alertBanner.classList.remove('hidden');
        } else {
          alertBanner.classList.add('hidden');
        }
      }
    });

    // Banners Listener
    db.ref('banners').on('value', snap => {
      const data = snap.val() || {};
      this.banners = Object.values(data).filter(b => b.status === 'ACTIVE').sort((a,b) => a.order - b.order);
      this.renderBannerSlider();
      this.renderAdminBanners(data);
    });

    // Products Listener
    db.ref('products').on('value', snap => {
      this.products = snap.val() || {};
      this.renderProducts();
      this.renderAdminProducts();
      this.updateAdminDashboardStats();
    });

    // Orders Listener
    db.ref('orders').on('value', snap => {
      this.orders = snap.val() || {};
      this.checkExpiredOrders();
      this.renderUserOrders();
      this.renderAdminOrders();
      this.updateAdminDashboardStats();
    });

    // Payment Methods Listener
    db.ref('paymentMethods').on('value', snap => {
      this.paymentMethods = snap.val() || {};
      this.renderPublicPaymentMethods();
      this.renderAdminPayments();
    });

    // Tickets Listener
    db.ref('tickets').on('value', snap => {
      this.tickets = snap.val() || {};
      this.renderUserTickets();
      this.renderAdminTickets();
      this.updateAdminDashboardStats();
    });

    // Sellers & Admins Listener
    db.ref('sellers').on('value', snap => {
      this.sellers = snap.val() || {};
      this.renderAdminSellers();
      this.updateSellerFilterDropdown();
    });

    db.ref('admins').on('value', snap => {
      this.admins = snap.val() || {};
      this.renderAdminUsers();
    });

    db.ref('users').on('value', snap => {
      this.allUsers = snap.val() || {};
      this.renderAdminAllUsers();
      this.updateAdminDashboardStats();
    });
  },

  /* ------------------------------------------------------------------------
     BANNER SLIDER ENGINE (MAX 15)
     ------------------------------------------------------------------------ */
  renderBannerSlider() {
    const track = document.getElementById('slider-track');
    const dotsContainer = document.getElementById('slider-dots');
    track.innerHTML = '';
    dotsContainer.innerHTML = '';

    if (this.banners.length === 0) {
      document.getElementById('slider-wrapper').style.display = 'none';
      return;
    }
    document.getElementById('slider-wrapper').style.display = 'block';

    this.banners.slice(0, 15).forEach((b, idx) => {
      const slide = document.createElement('div');
      slide.className = 'slide-item';
      slide.innerHTML = `
        <img src="${b.imageUrl}" alt="Banner">
        ${b.title ? `<div class="slide-title">${b.title}</div>` : ''}
      `;
      track.appendChild(slide);

      const dot = document.createElement('div');
      dot.className = `dot ${idx === 0 ? 'active' : ''}`;
      dot.onclick = () => this.goToSlide(idx);
      dotsContainer.appendChild(dot);
    });

    if (this.sliderInterval) clearInterval(this.sliderInterval);
    this.sliderInterval = setInterval(() => this.nextSlide(), 4000);
  },

  goToSlide(index) {
    this.currentSlideIndex = index;
    const track = document.getElementById('slider-track');
    track.style.transform = `translateX(-${index * 100}%)`;
    
    document.querySelectorAll('.slider-dots .dot').forEach((d, i) => {
      d.classList.toggle('active', i === index);
    });
  },

  nextSlide() {
    if (this.banners.length === 0) return;
    this.currentSlideIndex = (this.currentSlideIndex + 1) % Math.min(this.banners.length, 15);
    this.goToSlide(this.currentSlideIndex);
  },

  prevSlide() {
    if (this.banners.length === 0) return;
    this.currentSlideIndex = (this.currentSlideIndex - 1 + Math.min(this.banners.length, 15)) % Math.min(this.banners.length, 15);
    this.goToSlide(this.currentSlideIndex);
  },

  /* ------------------------------------------------------------------------
     PRODUCTS RENDER & CATALOG
     ------------------------------------------------------------------------ */
  renderProducts() {
    const featuredGrid = document.getElementById('featured-products-grid');
    const allGrid = document.getElementById('all-products-grid');
    const communityGrid = document.getElementById('community-products-grid');

    featuredGrid.innerHTML = '';
    allGrid.innerHTML = '';
    communityGrid.innerHTML = '';

    const searchVal = (document.getElementById('product-search-input')?.value || '').toLowerCase();
    const catVal = document.getElementById('product-category-filter')?.value || 'ALL';
    const sellerVal = document.getElementById('product-seller-filter')?.value || 'ALL';

    const productArray = Object.values(this.products).filter(p => p.status === 'ACTIVE');

    if (productArray.length === 0) {
      allGrid.innerHTML = '<p class="text-muted">No products available.</p>';
      featuredGrid.innerHTML = '<p class="text-muted">No featured products.</p>';
      communityGrid.innerHTML = '<p class="text-muted">No community products.</p>';
      return;
    }

    productArray.forEach(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchVal) || (p.description && p.description.toLowerCase().includes(searchVal));
      const matchesCat = catVal === 'ALL' || p.category === catVal;
      const matchesSeller = sellerVal === 'ALL' || p.sellerId === sellerVal;

      if (matchesSearch && matchesCat && matchesSeller) {
        const cardHTML = this.createProductCardHTML(p);

        if (p.isCommunityOnly) {
          communityGrid.innerHTML += cardHTML;
        } else {
          allGrid.innerHTML += cardHTML;
          if (p.isFeatured) {
            featuredGrid.innerHTML += cardHTML;
          }
        }
      }
    });
  },

  createProductCardHTML(p) {
    const isCommunity = p.isCommunityOnly;
    const priceText = isCommunity ? `${p.price.toLocaleString()} POINT` : `Rp ${p.price.toLocaleString()}`;

    return `
      <div class="product-card">
        <img src="${p.imageUrl}" class="product-thumb" alt="${p.name}" loading="lazy">
        <div class="product-body">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="badge badge-cyan">${p.category || 'General'}</span>
            ${isCommunity ? '<span class="badge badge-warning">COMMUNITY ONLY</span>' : ''}
          </div>
          <h3 class="product-title">${p.name}</h3>
          <div class="product-meta">
            <span>Seller: ${p.sellerName || 'Admin'}</span>
            <span>Stok: ${p.stock}</span>
          </div>
          <div class="product-price">${priceText}</div>
          <div class="product-actions">
            <button class="btn btn-secondary btn-sm" onclick="app.viewProductDetail('${p.id}')">VIEW DETAIL</button>
            <button class="btn btn-primary btn-sm" onclick="app.initiateCheckout('${p.id}')">BUY NOW</button>
          </div>
        </div>
      </div>
    `;
  },

  viewProductDetail(productId) {
    const p = this.products[productId];
    if (!p) return;

    const modal = document.getElementById('product-detail-modal');
    const container = document.getElementById('product-detail-content');

    const priceText = p.isCommunityOnly ? `${p.price.toLocaleString()} POINT` : `Rp ${p.price.toLocaleString()}`;

    container.innerHTML = `
      <img src="${p.imageUrl}" class="product-detail-img" alt="${p.name}">
      <div>
        <span class="badge badge-cyan">${p.category}</span>
        <h2 style="margin:8px 0;">${p.name}</h2>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:12px;">${p.description || 'Tidak ada deskripsi.'}</p>
        <div class="product-price" style="font-size:1.5rem;">${priceText}</div>
        <p style="font-size:0.85rem; margin-bottom:16px;">
          <strong>Seller:</strong> ${p.sellerName}<br>
          <strong>Stock Tersedia:</strong> ${p.stock}<br>
          <strong>Pembayaran Didukung:</strong> ${p.isCommunityOnly ? 'ONLY POINT / COIN' : (p.allowedPaymentMethods ? p.allowedPaymentMethods.join(', ') : 'GOPAY, POINT')}
        </p>
        <button class="btn btn-primary w-100" onclick="app.closeModal('product-detail-modal'); app.initiateCheckout('${p.id}')">
          ${p.isCommunityOnly ? 'BUY NOW (COMMUNITY POINT)' : 'BUY NOW'}
        </button>
      </div>
    `;

    modal.classList.remove('hidden');
  },

  /* ------------------------------------------------------------------------
     CHECKOUT & ORDER SYSTEM
     ------------------------------------------------------------------------ */
  initiateCheckout(productId) {
    if (!this.storeStatus.isOpen) {
      Swal.fire({
        icon: 'error',
        title: 'Store Sedang Ditutup',
        text: 'Owner sedang menutup layanan transaksi untuk sementara.',
        confirmButtonColor: '#06b6d4'
      });
      return;
    }

    const p = this.products[productId];
    if (!p || p.stock <= 0) {
      Swal.fire('Stok Habis', 'Maaf, stok produk ini telah habis.', 'warning');
      return;
    }

    this.selectedProductForCheckout = p;
    const modal = document.getElementById('checkout-modal');
    const summary = document.getElementById('checkout-summary-body');

    let paymentOptions = '';
    if (p.isCommunityOnly) {
      paymentOptions = `<option value="POINT">POINT / COIN INTERNAL (Saldo: ${this.currentUser.points} PT)</option>`;
    } else {
      paymentOptions = `
        <option value="GOPAY">GoPay Official (085175218022)</option>
        <option value="POINT">POINT / COIN INTERNAL (Saldo: ${this.currentUser.points} PT)</option>
      `;
    }

    summary.innerHTML = `
      <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:16px;">
        <h4>${p.name}</h4>
        <p style="font-size:0.85rem; color:var(--text-muted);">Seller: ${p.sellerName}</p>
        <hr class="divider-light">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>Harga Produk:</span>
          <span>${p.isCommunityOnly ? `${p.price.toLocaleString()} POINT` : `Rp ${p.price.toLocaleString()}`}</span>
        </div>
      </div>

      <div class="form-group">
        <label>Pilih Metode Pembayaran</label>
        <select id="checkout-payment-method" class="form-select w-100" onchange="app.calculateCheckoutRemaining()">
          ${paymentOptions}
        </select>
      </div>

      <div id="checkout-point-calculation" class="card p-3 mb-3 bg-light">
        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
          <span>Saldo Point Saat Ini:</span>
          <strong>${this.currentUser.points.toLocaleString()} PT</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
          <span>Harga Item:</span>
          <strong style="color:var(--danger-color);">- ${p.price.toLocaleString()} PT</strong>
        </div>
        <hr class="divider-light">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>Sisa Saldo Point:</span>
          <span id="checkout-remaining-points">${(this.currentUser.points - p.price).toLocaleString()} PT</span>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    this.calculateCheckoutRemaining();
  },

  calculateCheckoutRemaining() {
    const method = document.getElementById('checkout-payment-method')?.value;
    const calcBox = document.getElementById('checkout-point-calculation');
    const p = this.selectedProductForCheckout;

    if (method === 'POINT') {
      calcBox.style.display = 'block';
      const rem = this.currentUser.points - p.price;
      const remSpan = document.getElementById('checkout-remaining-points');
      if (remSpan) {
        remSpan.innerText = `${rem.toLocaleString()} PT`;
        remSpan.style.color = rem < 0 ? 'var(--danger-color)' : 'var(--success-color)';
      }
    } else {
      calcBox.style.display = 'none';
    }
  },

  confirmOrder() {
    const p = this.selectedProductForCheckout;
    if (!p) return;

    const method = document.getElementById('checkout-payment-method').value;

    // Validate Point Balance
    if (method === 'POINT') {
      if (this.currentUser.points < p.price) {
        Swal.fire({
          icon: 'error',
          title: 'Point Tidak Cukup',
          text: `Saldo Point Anda (${this.currentUser.points}) tidak mencukupi untuk transaksi sebesar ${p.price} Point.`,
          confirmButtonColor: '#06b6d4'
        });
        return;
      }
    }

    const now = Date.now();
    const expiredAt = now + (24 * 60 * 60 * 1000); // 24 Hours
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
    const randFour = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${dateStr}-${randFour}`;
    const ticketId = `TCK-${dateStr}-${randFour}`;

    const orderData = {
      orderId: orderId,
      userId: this.currentUser.uid,
      username: this.currentUser.displayName,
      productId: p.id,
      productName: p.name,
      sellerId: p.sellerId || 'SELL_GLOBAL',
      sellerName: p.sellerName || 'Admin Logistik',
      price: p.price,
      paymentMethod: method,
      status: method === 'POINT' ? 'PAID' : 'WAITING_PAYMENT',
      createdAt: now,
      expiredAt: expiredAt,
      ticketId: ticketId
    };

    // Atomic Point Deduction if POINT
    if (method === 'POINT') {
      if (this.currentUser.isLoggedIn) {
        db.ref(`users/${this.currentUser.uid}/points`).transaction(current => {
          return (current || 0) - p.price;
        });
      } else {
        const newPts = this.currentUser.points - p.price;
        this.currentUser.points = newPts;
        localStorage.setItem('guest_points', newPts.toString());
      }
    }

    // Save Order and Create Automatic Support Ticket
    db.ref(`orders/${orderId}`).set(orderData);

    const ticketData = {
      ticketId: ticketId,
      orderId: orderId,
      userId: this.currentUser.uid,
      sellerId: p.sellerId || 'SELL_GLOBAL',
      status: 'OPEN',
      createdAt: now,
      lastUpdated: now
    };
    db.ref(`tickets/${ticketId}`).set(ticketData);

    // Initial message on ticket
    const initialMsg = {
      senderId: 'SYSTEM',
      senderName: 'System Logistik',
      message: `Order #${orderId} telah dibuat. Metode Pembayaran: ${method}. Silakan gunakan room chat ini untuk koordinasi penyerahan barang/aset.`,
      timestamp: now
    };
    db.ref(`ticketMessages/${ticketId}`).push(initialMsg);

    this.closeModal('checkout-modal');

    if (method === 'POINT') {
      Swal.fire({
        icon: 'success',
        title: 'Pembayaran Point Berhasil',
        text: `Order #${orderId} telah dibayar secara instant menggunakan Point!`,
        confirmButtonColor: '#06b6d4'
      });
    } else {
      Swal.fire({
        icon: 'info',
        title: 'Order Dibuat - WAITING PAYMENT',
        html: `Silakan lakukan transfer via <strong>GoPay 085175218022</strong> sebesar <strong>Rp ${p.price.toLocaleString()}</strong>.<br>Masa berlaku pembayaran: 24 Jam.`,
        confirmButtonColor: '#06b6d4'
      });
    }

    this.navigateTo('orders');
  },

  /* ------------------------------------------------------------------------
     24-HOUR EXPIRATION ENFORCEMENT
     ------------------------------------------------------------------------ */
  checkExpiredOrders() {
    const now = Date.now();
    Object.values(this.orders).forEach(ord => {
      if (ord.status === 'WAITING_PAYMENT' && ord.expiredAt && now > ord.expiredAt) {
        db.ref(`orders/${ord.orderId}/status`).set('EXPIRED');
      }
    });
  },

  /* ------------------------------------------------------------------------
     MY ORDERS RENDER
     ------------------------------------------------------------------------ */
  renderUserOrders() {
    const container = document.getElementById('user-orders-container');
    container.innerHTML = '';

    const filterVal = document.getElementById('order-status-filter')?.value || 'ALL';
    const userOrders = Object.values(this.orders).filter(o => o.userId === this.currentUser.uid);

    if (userOrders.length === 0) {
      container.innerHTML = '<p class="text-muted">Belum ada riwayat pesanan.</p>';
      return;
    }

    userOrders.sort((a,b) => b.createdAt - a.createdAt).forEach(ord => {
      if (filterVal !== 'ALL' && ord.status !== filterVal) return;

      const badgeClass = {
        'WAITING_PAYMENT': 'badge-warning',
        'PAID': 'badge-success',
        'PROCESSING': 'badge-cyan',
        'COMPLETED': 'badge-success',
        'EXPIRED': 'badge-danger',
        'CANCELLED': 'badge-danger'
      }[ord.status] || 'badge';

      let countdownHTML = '';
      if (ord.status === 'WAITING_PAYMENT') {
        const diff = ord.expiredAt - Date.now();
        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);
          countdownHTML = `<div class="order-countdown">Expired dalam: ${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}</div>`;
        }
      }

      container.innerHTML += `
        <div class="order-card">
          <div class="order-info">
            <h4>${ord.productName}</h4>
            <div style="font-size:0.85rem; color:var(--text-muted);">
              ID: <strong>${ord.orderId}</strong> | Seller: ${ord.sellerName} | ${new Date(ord.createdAt).toLocaleString()}
            </div>
            <div style="margin-top:4px;">
              <span class="badge ${badgeClass}">${ord.status}</span>
              <span class="badge badge-cyan" style="margin-left:6px;">${ord.paymentMethod}</span>
            </div>
            ${countdownHTML}
          </div>
          <div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--primary-cyan); text-align:right; margin-bottom:8px;">
              ${ord.paymentMethod === 'POINT' ? `${ord.price.toLocaleString()} PT` : `Rp ${ord.price.toLocaleString()}`}
            </div>
            <button class="btn btn-secondary btn-sm" onclick="app.openTicketForOrder('${ord.ticketId}')">VIEW TICKET</button>
          </div>
        </div>
      `;
    });
  },

  /* ------------------------------------------------------------------------
     PRIVATE CHAT REALTIME TICKET SYSTEM
     ------------------------------------------------------------------------ */
  renderUserTickets() {
    const listContainer = document.getElementById('tickets-list-container');
    listContainer.innerHTML = '';

    const myTickets = Object.values(this.tickets).filter(t => t.userId === this.currentUser.uid || this.currentUser.role === 'ADMIN' || this.currentUser.role === 'OWNER');

    if (myTickets.length === 0) {
      listContainer.innerHTML = '<small class="text-muted">Tidak ada ticket aktif.</small>';
      return;
    }

    myTickets.forEach(t => {
      const activeClass = this.currentActiveTicketId === t.ticketId ? 'active' : '';
      listContainer.innerHTML += `
        <div class="ticket-item ${activeClass}" onclick="app.openTicketChat('${t.ticketId}')">
          <strong style="font-size:0.85rem; display:block;">#${t.orderId}</strong>
          <span class="badge badge-cyan" style="font-size:0.65rem;">${t.status}</span>
        </div>
      `;
    });
  },

  openTicketForOrder(ticketId) {
    this.navigateTo('tickets');
    this.openTicketChat(ticketId);
  },

  openTicketChat(ticketId) {
    this.currentActiveTicketId = ticketId;
    this.renderUserTickets();

    document.getElementById('no-ticket-selected').classList.add('hidden');
    const chatBox = document.getElementById('active-chat-box');
    chatBox.classList.remove('hidden');

    const ticket = this.tickets[ticketId];
    if (ticket) {
      document.getElementById('chat-ticket-title').innerText = `Ticket #${ticket.orderId}`;
      document.getElementById('chat-ticket-status').innerText = ticket.status;
    }

    // Attach Realtime Listener for Messages
    db.ref(`ticketMessages/${ticketId}`).on('value', snap => {
      const messages = snap.val() || {};
      const body = document.getElementById('chat-messages-body');
      body.innerHTML = '';

      Object.values(messages).forEach(m => {
        const isMe = m.senderId === this.currentUser.uid;
        body.innerHTML += `
          <div class="chat-bubble ${isMe ? 'me' : 'other'}">
            <small style="display:block; font-size:0.7rem; opacity:0.8;">${m.senderName}</small>
            <div>${m.message}</div>
          </div>
        `;
      });
      body.scrollTop = body.scrollHeight;
    });
  },

  sendTicketMessage(e) {
    e.preventDefault();
    if (!this.currentActiveTicketId) return;

    const input = document.getElementById('chat-input-text');
    const text = input.value.trim();
    if (!text) return;

    const msg = {
      senderId: this.currentUser.uid,
      senderName: this.currentUser.displayName,
      message: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`ticketMessages/${this.currentActiveTicketId}`).push(msg);
    db.ref(`tickets/${this.currentActiveTicketId}/lastUpdated`).set(firebase.database.ServerValue.TIMESTAMP);
    input.value = '';
  },

  /* ------------------------------------------------------------------------
     PUBLIC PAYMENT METHODS DISPLAY
     ------------------------------------------------------------------------ */
  renderPublicPaymentMethods() {
    const grid = document.getElementById('public-payment-methods-grid');
    grid.innerHTML = '';

    const list = Object.values(this.paymentMethods).filter(pm => pm.status === 'ACTIVE');

    // Always append default GoPay
    grid.innerHTML = `
      <div class="card p-3" style="background:#fff; border:1px solid var(--border-color); border-radius:12px;">
        <span class="badge badge-cyan">UTAMA</span>
        <h3 style="margin:8px 0;">GoPay Official Store</h3>
        <p style="font-size:0.9rem; color:var(--text-muted);">Transfer Manual 24 Jam</p>
        <div style="font-size:1.25rem; font-weight:800; color:var(--primary-cyan); margin:8px 0;">085175218022</div>
        <small>a.n. Store Logistik & Perlengkapan</small>
      </div>
    `;

    list.forEach(pm => {
      grid.innerHTML += `
        <div class="card p-3" style="background:#fff; border:1px solid var(--border-color); border-radius:12px;">
          <span class="badge badge-success">SELLER METHOD</span>
          <h3 style="margin:8px 0;">${pm.name}</h3>
          <p style="font-size:0.9rem; color:var(--text-muted);">${pm.description || ''}</p>
          <div style="font-size:1.25rem; font-weight:800; color:var(--primary-cyan); margin:8px 0;">${pm.accountNumber}</div>
          <small>a.n. ${pm.accountOwner} (${pm.sellerId})</small>
        </div>
      `;
    });
  },

/* ------------------------------------------------------------------------
     ADMINISTRATOR PANEL LOGIC
     ------------------------------------------------------------------------ */
  switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-menu-item').forEach(m => m.classList.remove('active'));

    const targetPane = document.getElementById(`adm-tab-${tabId}`);
    if (targetPane) targetPane.classList.add('active');
  },

  updateAdminDashboardStats() {
    document.getElementById('st-products').innerText = Object.keys(this.products).length;
    
    const ordersArr = Object.values(this.orders);
    document.getElementById('st-orders').innerText = ordersArr.length;
    document.getElementById('st-pending').innerText = ordersArr.filter(o => o.status === 'WAITING_PAYMENT').length;
    document.getElementById('st-completed').innerText = ordersArr.filter(o => o.status === 'COMPLETED').length;
    document.getElementById('st-cancelled').innerText = ordersArr.filter(o => o.status === 'CANCELLED' || o.status === 'EXPIRED').length;

    document.getElementById('st-users').innerText = Object.keys(this.allUsers).length;
    
    const totalPts = Object.values(this.allUsers).reduce((acc, curr) => acc + (curr.points || 0), 0);
    document.getElementById('st-points').innerText = totalPts.toLocaleString();

    document.getElementById('st-tickets').innerText = Object.values(this.tickets).filter(t => t.status === 'OPEN').length;
  },

  /* ------------------------------------------------------------------------
     ADMIN CRUD: PRODUCTS
     ------------------------------------------------------------------------ */
  renderAdminProducts() {
    const tbody = document.getElementById('admin-products-tbody');
    tbody.innerHTML = '';

    Object.values(this.products).forEach(p => {
      tbody.innerHTML += `
        <tr>
          <td><img src="${p.imageUrl}" alt="thumb"></td>
          <td><strong>${p.name}</strong></td>
          <td>${p.isCommunityOnly ? `${p.price} PT` : `Rp ${p.price.toLocaleString()}`}</td>
          <td>${p.category}</td>
          <td>${p.stock}</td>
          <td>${p.sellerName}</td>
          <td>${p.isCommunityOnly ? 'YA' : 'TIDAK'}</td>
          <td><span class="badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${p.status}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="app.toggleProductStatus('${p.id}', '${p.status}')">Toggle</button>
            <button class="btn btn-sm btn-outline-danger" onclick="app.deleteProduct('${p.id}')">Del</button>
          </td>
        </tr>
      `;
    });
  },

  openAddProductModal() {
    Swal.fire({
      title: 'Tambah Produk Baru',
      html: `
        <input id="sw-p-name" class="swal2-input" placeholder="Nama Produk">
        <input id="sw-p-price" type="number" class="swal2-input" placeholder="Harga (Rp atau Point)">
        <input id="sw-p-img" class="swal2-input" placeholder="URL Foto Produk">
        <select id="sw-p-cat" class="swal2-select">
          <option value="Perlengkapan">Perlengkapan</option>
          <option value="Logistik">Logistik</option>
          <option value="Aset Roblox">Aset Roblox</option>
        </select>
        <input id="sw-p-stock" type="number" class="swal2-input" placeholder="Jumlah Stok" value="100">
        <label style="display:block; margin-top:10px;"><input type="checkbox" id="sw-p-comm"> Community Only Product?</label>
      `,
      showCancelButton: true,
      confirmButtonText: 'Simpan Produk',
      preConfirm: () => {
        return {
          name: document.getElementById('sw-p-name').value,
          price: parseInt(document.getElementById('sw-p-price').value),
          imageUrl: document.getElementById('sw-p-img').value,
          category: document.getElementById('sw-p-cat').value,
          stock: parseInt(document.getElementById('sw-p-stock').value),
          isCommunityOnly: document.getElementById('sw-p-comm').checked
        };
      }
    }).then(res => {
      if (res.isConfirmed && res.value) {
        const id = 'PROD-' + Date.now();
        const pData = {
          id: id,
          ...res.value,
          sellerId: this.currentUser.uid,
          sellerName: this.currentUser.displayName,
          status: 'ACTIVE'
        };
        db.ref(`products/${id}`).set(pData);
        Swal.fire('Berhasil', 'Produk ditambahkan!', 'success');
      }
    });
  },

  toggleProductStatus(id, current) {
    const next = current === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    db.ref(`products/${id}/status`).set(next);
  },

  deleteProduct(id) {
    Swal.fire({
      title: 'Hapus Produk?',
      text: 'Tindakan ini tidak dapat dibatalkan.',
      icon: 'warning',
      showCancelButton: true
    }).then(res => {
      if (res.isConfirmed) {
        db.ref(`products/${id}`).remove();
      }
    });
  },

  /* ------------------------------------------------------------------------
     ADMIN CRUD: BANNERS (MAX 15)
     ------------------------------------------------------------------------ */
  renderAdminBanners(data) {
    const tbody = document.getElementById('admin-banners-tbody');
    tbody.innerHTML = '';

    Object.values(data).forEach(b => {
      tbody.innerHTML += `
        <tr>
          <td><img src="${b.imageUrl}" alt="banner"></td>
          <td>${b.title || '-'}</td>
          <td>${b.order}</td>
          <td><span class="badge ${b.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${b.status}</span></td>
          <td>
            <button class="btn btn-sm btn-outline-danger" onclick="app.deleteBanner('${b.id}')">Hapus</button>
          </td>
        </tr>
      `;
    });
  },

  openAddBannerModal() {
    if (this.banners.length >= 15) {
      Swal.fire('Maximum Banners', 'Maximum 15 banners allowed.', 'warning');
      return;
    }

    Swal.fire({
      title: 'Tambah Banner Baru',
      html: `
        <input id="sw-b-title" class="swal2-input" placeholder="Judul Banner (Opsional)">
        <input id="sw-b-url" class="swal2-input" placeholder="URL Image Banner">
        <input id="sw-b-order" type="number" class="swal2-input" placeholder="Urutan (1-15)" value="${this.banners.length + 1}">
      `,
      showCancelButton: true,
      confirmButtonText: 'Simpan Banner'
    }).then(res => {
      if (res.isConfirmed) {
        const id = 'BAN-' + Date.now();
        const bData = {
          id: id,
          title: document.getElementById('sw-b-title').value,
          imageUrl: document.getElementById('sw-b-url').value,
          order: parseInt(document.getElementById('sw-b-order').value),
          status: 'ACTIVE'
        };
        db.ref(`banners/${id}`).set(bData);
      }
    });
  },

  deleteBanner(id) {
    db.ref(`banners/${id}`).remove();
  },

  /* ------------------------------------------------------------------------
     ADMIN ORDERS & TICKETS MANAGEMENT
     ------------------------------------------------------------------------ */
  renderAdminOrders() {
    const tbody = document.getElementById('admin-orders-tbody');
    tbody.innerHTML = '';

    Object.values(this.orders).forEach(o => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${o.orderId}</strong></td>
          <td>${o.username}</td>
          <td>${o.productName}</td>
          <td>${o.price.toLocaleString()}</td>
          <td>${o.paymentMethod}</td>
          <td><span class="badge badge-cyan">${o.status}</span></td>
          <td>${new Date(o.createdAt).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="app.updateOrderStatus('${o.orderId}')">Status</button>
          </td>
        </tr>
      `;
    });
  },

  updateOrderStatus(orderId) {
    Swal.fire({
      title: 'Update Status Order',
      input: 'select',
      inputOptions: {
        'WAITING_PAYMENT': 'WAITING_PAYMENT',
        'PAID': 'PAID',
        'PROCESSING': 'PROCESSING',
        'COMPLETED': 'COMPLETED',
        'CANCELLED': 'CANCELLED'
      },
      showCancelButton: true
    }).then(res => {
      if (res.isConfirmed && res.value) {
        db.ref(`orders/${orderId}/status`).set(res.value);
      }
    });
  },

  renderAdminTickets() {
    const tbody = document.getElementById('admin-tickets-tbody');
    tbody.innerHTML = '';

    Object.values(this.tickets).forEach(t => {
      tbody.innerHTML += `
        <tr>
          <td>${t.ticketId}</td>
          <td>${t.orderId}</td>
          <td>${t.userId}</td>
          <td>${t.sellerId}</td>
          <td><span class="badge badge-warning">${t.status}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="app.openTicketForOrder('${t.ticketId}')">Buka Chat</button>
          </td>
        </tr>
      `;
    });
  },

  /* ------------------------------------------------------------------------
     ADMIN PAYMENTS CRUD
     ------------------------------------------------------------------------ */
  renderAdminPayments() {
    const tbody = document.getElementById('admin-payments-tbody');
    tbody.innerHTML = '';

    Object.values(this.paymentMethods).forEach(pm => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${pm.name}</strong></td>
          <td>${pm.description || '-'}</td>
          <td>${pm.accountNumber}</td>
          <td>${pm.accountOwner}</td>
          <td><span class="badge badge-success">${pm.status}</span></td>
          <td>
            <button class="btn btn-sm btn-outline-danger" onclick="app.deletePaymentMethod('${pm.id}')">Hapus</button>
          </td>
        </tr>
      `;
    });
  },

  openAddPaymentModal() {
    Swal.fire({
      title: 'Tambah Payment Method',
      html: `
        <input id="sw-pm-name" class="swal2-input" placeholder="Nama Payment (mis: QRIS/DANA)">
        <input id="sw-pm-desc" class="swal2-input" placeholder="Deskripsi Singkat">
        <input id="sw-pm-acc" class="swal2-input" placeholder="Nomor Rekening / HP">
        <input id="sw-pm-owner" class="swal2-input" placeholder="Nama Pemilik Akun">
      `,
      showCancelButton: true
    }).then(res => {
      if (res.isConfirmed) {
        const id = 'PAY-' + Date.now();
        const pmData = {
          id: id,
          name: document.getElementById('sw-pm-name').value,
          description: document.getElementById('sw-pm-desc').value,
          accountNumber: document.getElementById('sw-pm-acc').value,
          accountOwner: document.getElementById('sw-pm-owner').value,
          sellerId: this.currentUser.uid,
          status: 'ACTIVE'
        };
        db.ref(`paymentMethods/${id}`).set(pmData);
      }
    });
  },

  deletePaymentMethod(id) {
    db.ref(`paymentMethods/${id}`).remove();
  },

  /* ------------------------------------------------------------------------
     OWNER ONLY MANAGEMENT: ADMINS, SELLERS, USERS, STORE LOCK
     ------------------------------------------------------------------------ */
  renderAdminUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = '';

    Object.values(this.admins).forEach(a => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${a.name}</strong><br><small>${a.uid}</small></td>
          <td><span class="badge badge-cyan">${a.role}</span></td>
          <td><small>Products, Orders, Banners</small></td>
          <td>
            ${a.role !== 'OWNER' ? `<button class="btn btn-sm btn-outline-danger" onclick="app.revokeAdmin('${a.uid}')">Revoke Admin</button>` : '<em>Primary Owner</em>'}
          </td>
        </tr>
      `;
    });
  },

  openAddAdminModal() {
    Swal.fire({
      title: 'Tambah Admin Baru',
      html: `
        <input id="sw-adm-uid" class="swal2-input" placeholder="UID User Firebase">
        <input id="sw-adm-name" class="swal2-input" placeholder="Nama Admin">
      `,
      showCancelButton: true
    }).then(res => {
      if (res.isConfirmed) {
        const uid = document.getElementById('sw-adm-uid').value;
        const name = document.getElementById('sw-adm-name').value;
        db.ref(`admins/${uid}`).set({
          uid: uid,
          name: name,
          role: 'ADMIN',
          permissions: { manage_products: true, manage_orders: true }
        });
        db.ref(`users/${uid}/role`).set('ADMIN');
      }
    });
  },

  revokeAdmin(uid) {
    db.ref(`admins/${uid}`).remove();
    db.ref(`users/${uid}/role`).set('USER');
  },

  renderAdminSellers() {
    const tbody = document.getElementById('admin-sellers-tbody');
    tbody.innerHTML = '';

    Object.values(this.sellers).forEach(s => {
      tbody.innerHTML += `
        <tr>
          <td>${s.sellerId}</td>
          <td><strong>${s.sellerName}</strong></td>
          <td>${s.adminUid}</td>
          <td><span class="badge badge-success">${s.status}</span></td>
          <td>
            <button class="btn btn-sm btn-outline-danger" onclick="app.deleteSeller('${s.sellerId}')">Hapus</button>
          </td>
        </tr>
      `;
    });
  },

openAddSellerModal() {
    Swal.fire({
      title: 'Tambah Seller Baru',
      html: `
        <input id="sw-sell-id" class="swal2-input" placeholder="Seller ID (mis: SELL_ROBLOX)">
        <input id="sw-sell-name" class="swal2-input" placeholder="Nama Seller">
        <input id="sw-sell-uid" class="swal2-input" placeholder="Admin UID Terkait">
      `,
      showCancelButton: true
    }).then(res => {
      if (res.isConfirmed) {
        const sid = document.getElementById('sw-sell-id').value;
        db.ref(`sellers/${sid}`).set({
          sellerId: sid,
          sellerName: document.getElementById('sw-sell-name').value,
          adminUid: document.getElementById('sw-sell-uid').value,
          status: 'ACTIVE'
        });
      }
    });
  },

  deleteSeller(sid) {
    db.ref(`sellers/${sid}`).remove();
  },

  updateSellerFilterDropdown() {
    const select = document.getElementById('product-seller-filter');
    if (!select) return;
    select.innerHTML = '<option value="ALL">Semua Seller</option>';
    Object.values(this.sellers).forEach(s => {
      select.innerHTML += `<option value="${s.sellerId}">${s.sellerName}</option>`;
    });
  },

  renderAdminAllUsers() {
    const tbody = document.getElementById('admin-allusers-tbody');
    tbody.innerHTML = '';

    Object.values(this.allUsers).forEach(u => {
      tbody.innerHTML += `
        <tr>
          <td><small>${u.uid}</small></td>
          <td><strong>${u.displayName || 'User'}</strong></td>
          <td><span class="badge badge-cyan">${u.role || 'USER'}</span></td>
          <td><strong>${(u.points || 0).toLocaleString()} PT</strong></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="app.adjustUserPoints('${u.uid}', ${u.points || 0})">Set Points</button>
          </td>
        </tr>
      `;
    });
  },

  adjustUserPoints(uid, currentPts) {
    Swal.fire({
      title: 'Adjust Saldo Point',
      input: 'number',
      inputValue: currentPts,
      showCancelButton: true
    }).then(res => {
      if (res.isConfirmed && res.value !== "") {
        const newPts = parseInt(res.value);
        db.ref(`users/${uid}/points`).set(newPts);
      }
    });
  },

  saveStoreStatus() {
    const statusVal = document.getElementById('owner-store-status-select').value;
    db.ref('storeStatus/isOpen').set(statusVal === 'OPEN');
    Swal.fire('Disimpan', 'Status operasional store diperbarui.', 'success');
  },

  /* ------------------------------------------------------------------------
     UI BINDINGS & EVENT HANDLERS
     ------------------------------------------------------------------------ */
  bindEvents() {
    // Hamburger Menu Toggle
    const burger = document.getElementById('hamburger-btn');
    const drawer = document.getElementById('mobile-drawer');
    if (burger && drawer) {
      burger.addEventListener('click', () => {
        drawer.classList.toggle('active');
      });
    }

    // Slider Next/Prev
    document.getElementById('slider-prev')?.addEventListener('click', () => this.prevSlide());
    document.getElementById('slider-next')?.addEventListener('click', () => this.nextSlide());

    // Search and Filters
    document.getElementById('product-search-input')?.addEventListener('input', () => this.renderProducts());
    document.getElementById('product-category-filter')?.addEventListener('change', () => this.renderProducts());
    document.getElementById('product-seller-filter')?.addEventListener('change', () => this.renderProducts());
    document.getElementById('order-status-filter')?.addEventListener('change', () => this.renderUserOrders());

    // Ticket Form Submit
    document.getElementById('ticket-message-form')?.addEventListener('submit', (e) => this.sendTicketMessage(e));
    document.getElementById('close-ticket-btn')?.addEventListener('click', () => {
      if (this.currentActiveTicketId) {
        db.ref(`tickets/${this.currentActiveTicketId}/status`).set('CLOSED');
      }
    });

    // Confirm Order Button
    document.getElementById('btn-confirm-order')?.addEventListener('click', () => this.confirmOrder());

    // Profile Display Name Form Update
    document.getElementById('update-profile-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = document.getElementById('input-display-name').value.trim();
      if (!newName) return;

      if (this.currentUser.isLoggedIn) {
        db.ref(`users/${this.currentUser.uid}/displayName`).set(newName);
      } else {
        this.currentUser.displayName = newName;
        localStorage.setItem('guest_name', newName);
        this.updateUserInterface();
      }
      Swal.fire('Berhasil', 'Display Name diperbarui!', 'success');
    });

    // Firebase Login Auth Button
    document.getElementById('btn-login-firebase')?.addEventListener('click', () => {
      const email = document.getElementById('auth-email').value;
      const pass = document.getElementById('auth-password').value;

      auth.signInWithEmailAndPassword(email, pass).then(() => {
        Swal.fire('Login Berhasil', 'Welcome Administrator!', 'success');
        this.navigateTo('admin');
      }).catch(err => {
        Swal.fire('Login Gagal', err.message, 'error');
      });
    });
  },

  closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('hidden');
  }
};

// Start Engine On Document Ready
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
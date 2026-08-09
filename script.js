/* ==========================================================================
   STORE LOGISTIK & PERLENGKAPAN - CORE APPLICATION SCRIPT
   ========================================================================== */

// 1. FIREBASE INITIALIZATION
const firebaseConfig = {
  apiKey: "AIzaSyD9BmV4XKXuMWa4PZHpb7Bbt-rHs61m3lE",
  databaseURL: "https://absensi-polri-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "absensi-polri",
  storageBucket: "absensi-polri.firebasestorage.app",
  messagingSenderId: "19006760644",
  appId: "1:19006760644:web:b980f54aea123e92ed4b91"
};

// Initialize Legacy/Compat Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

// 2. STATE MANAGEMENT
let currentUser = {
    uid: null,
    username: "Guest",
    role: "GUEST",
    points: 0
};

let storeData = {
    isOpen: true,
    products: {},
    banners: {},
    orders: {},
    tickets: {},
    ticketMessages: {},
    payments: {},
    users: {},
    admins: {}
};

let selectedProductCheckout = null;
let activeTicketId = null;
let currentBannerIndex = 0;
let bannerAutoplayTimer = null;

// Initial Hardcoded Configs for first boot
const INIT_OWNER_PWD_HASH = "OWNERSTORE1999/2026##";
const INIT_ADMIN_PWD_HASH = "ADMINISTRATORSTORE1999##";

// 3. APPLICATION INIT & SERVICE WORKER
window.addEventListener('DOMContentLoaded', () => {
    initPWA();
    startLoadingAnimation();
    initAuthSession();
    attachRealtimeListeners();
});

function initPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker Registered'))
            .catch(err => console.error('SW Reg Failed:', err));
    }
}

// 4. LOADING SCREEN ANIMATION
function startLoadingAnimation() {
    let progress = 0;
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setTimeout(() => {
                const screen = document.getElementById('loadingScreen');
                screen.style.opacity = '0';
                setTimeout(() => screen.classList.add('hidden'), 500);
            }, 300);
        }
        progressBar.style.width = progress + '%';
        progressText.innerText = `Loading ${progress}%`;
    }, 120);
}

// 5. AUTHENTICATION & USER SESSION
function initAuthSession() {
    let localUid = localStorage.getItem('store_user_uid');
    let localName = localStorage.getItem('store_user_name');

    if (!localUid) {
        localUid = 'USER_' + Math.random().toString(36).substring(2, 10).toUpperCase();
        localStorage.setItem('store_user_uid', localUid);
    }
    if (!localName) {
        localName = 'Guest_' + localUid.substring(5, 9);
        localStorage.setItem('store_user_name', localName);
    }

    currentUser.uid = localUid;
    currentUser.username = localName;

    // Firebase Auth Anonymous Sign In
    auth.signInAnonymously().catch(err => console.log("Auth Anonymously Error:", err));

    // Sync User Data to RTDB
    db.ref('users/' + localUid).on('value', snapshot => {
        const val = snapshot.val();
        if (val) {
            currentUser.username = val.username || localName;
            currentUser.role = val.role || 'USER';
            currentUser.points = val.points || 0;
        } else {
            // First time user registration in DB
            db.ref('users/' + localUid).set({
                uid: localUid,
                username: localName,
                role: 'USER',
                points: 0,
                createdAt: Date.now(),
                lastLogin: Date.now()
            });
        }
        updateUserUI();
    });
}

function updateUserUI() {
    document.getElementById('activeUsername').innerText = currentUser.username;
    document.getElementById('profileUsername').innerText = currentUser.username;
    document.getElementById('profileRole').innerText = currentUser.role;
    document.getElementById('profileUid').innerText = currentUser.uid;
    document.getElementById('profilePoints').innerText = `${currentUser.points.toLocaleString()} POINT`;

    // Role Specific UI Visibility
    const ownerMenus = document.getElementById('ownerOnlyMenus');
    const adminLink = document.getElementById('nav-admin');

    if (currentUser.role === 'OWNER') {
        ownerMenus.classList.remove('hidden');
        adminLink.classList.remove('hidden');
        document.getElementById('adminSidebarRole').innerText = "OWNER";
        document.getElementById('adminSidebarName').innerText = currentUser.username;
        document.getElementById('btnLogoutAccount').classList.remove('hidden');
        document.getElementById('btnLoginAccount').classList.add('hidden');
    } else if (currentUser.role === 'ADMIN') {
        ownerMenus.classList.add('hidden');
        adminLink.classList.remove('hidden');
        document.getElementById('adminSidebarRole').innerText = "ADMIN";
        document.getElementById('adminSidebarName').innerText = currentUser.username;
        document.getElementById('btnLogoutAccount').classList.remove('hidden');
        document.getElementById('btnLoginAccount').classList.add('hidden');
    } else {
        ownerMenus.classList.add('hidden');
        document.getElementById('btnLogoutAccount').classList.add('hidden');
        document.getElementById('btnLoginAccount').classList.remove('hidden');
    }
}

// 6. REALTIME DATABASE LISTENERS
function attachRealtimeListeners() {
    // Store Status
    db.ref('storeStatus').on('value', snap => {
        const val = snap.val();
        storeData.isOpen = val ? val.isOpen : true;
        const closedNotice = document.getElementById('storeClosedNotice');
        const statusText = document.getElementById('currentStoreStatusText');

        if (!storeData.isOpen) {
            closedNotice.classList.remove('hidden');
            if(statusText) statusText.innerText = "CLOSED";
        } else {
            closedNotice.classList.add('hidden');
            if(statusText) statusText.innerText = "OPEN";
        }
    });

    // Products Listener
    db.ref('products').on('value', snap => {
        storeData.products = snap.val() || {};
        renderProducts();
        renderAdminProducts();
        updateStats();
    });

    // Banners Listener
    db.ref('banners').on('value', snap => {
        storeData.banners = snap.val() || {};
        renderBanners();
        renderAdminBanners();
    });

    // Orders Listener
    db.ref('orders').on('value', snap => {
        storeData.orders = snap.val() || {};
        renderOrders();
        renderAdminOrders();
        updateStats();
        checkOrderExpirations();
    });

    // Tickets Listener
    db.ref('tickets').on('value', snap => {
        storeData.tickets = snap.val() || {};
        renderTickets();
        renderAdminTickets();
        updateStats();
    });

    // Payment Methods Listener
    db.ref('paymentMethods').on('value', snap => {
        storeData.payments = snap.val() || {};
        renderPublicPayments();
        renderAdminPayments();
    });

    // Admin Users Listener (Owner View)
    db.ref('users').on('value', snap => {
        storeData.users = snap.val() || {};
        renderAdminUsers();
        renderAdminUserPoints();
        updateStats();
    });
}

// 7. VIEW SWITCHING & HAMBURGER
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(lnk => lnk.classList.remove('active'));
    
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');

    const navBtn = document.getElementById('nav-' + viewId.replace('View', ''));
    if (navBtn) navBtn.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.toggle('hidden');
}

// 8. BANNER SLIDER SYSTEM
function renderBanners() {
    const container = document.getElementById('bannerSlider');
    const dotsContainer = document.getElementById('sliderDots');
    const bannerBox = document.getElementById('bannerContainer');

    const activeBanners = Object.values(storeData.banners)
        .filter(b => b.status === 'ACTIVE')
        .sort((a,b) => a.order - b.order);

    if (activeBanners.length === 0) {
        bannerBox.classList.add('hidden');
        return;
    }

    bannerBox.classList.remove('hidden');
    container.innerHTML = '';
    dotsContainer.innerHTML = '';

    activeBanners.forEach((b, idx) => {
        container.innerHTML += `
            <div class="banner-slide">
                <img src="${b.imageUrl}" alt="${b.title}">
                ${b.title ? `<div class="banner-slide-title">${b.title}</div>` : ''}
            </div>
        `;
        dotsContainer.innerHTML += `<div class="dot ${idx === 0 ? 'active' : ''}" onclick="goToSlide(${idx})"></div>`;
    });

    resetBannerAutoplay(activeBanners.length);
}

function moveSlide(dir) {
    const activeBanners = Object.values(storeData.banners).filter(b => b.status === 'ACTIVE');
    if (activeBanners.length <= 1) return;
    
    currentBannerIndex = (currentBannerIndex + dir + activeBanners.length) % activeBanners.length;
    updateBannerPosition();
}

function goToSlide(idx) {
    currentBannerIndex = idx;
    updateBannerPosition();
}

function updateBannerPosition() {
    const slider = document.getElementById('bannerSlider');
    slider.style.transform = `translateX(-${currentBannerIndex * 100}%)`;
    
    document.querySelectorAll('.slider-dots .dot').forEach((dot, idx) => {
        dot.classList.toggle('active', idx === currentBannerIndex);
    });
}

function resetBannerAutoplay(total) {
    if (bannerAutoplayTimer) clearInterval(bannerAutoplayTimer);
    if (total <= 1) return;
    bannerAutoplayTimer = setInterval(() => {
        moveSlide(1);
    }, 4000);
}

// 9. PRODUCT SYSTEM & RENDERING
function renderProducts() {
    const featuredGrid = document.getElementById('featuredProductsGrid');
    const mainGrid = document.getElementById('mainProductsGrid');
    const commGrid = document.getElementById('communityProductsGrid');

    featuredGrid.innerHTML = '';
    mainGrid.innerHTML = '';
    commGrid.innerHTML = '';

    const allProds = Object.values(storeData.products).filter(p => p.status === 'ACTIVE');

    if (allProds.length === 0) {
        mainGrid.innerHTML = '<p class="text-muted">No products available.</p>';
        featuredGrid.innerHTML = '<p class="text-muted">No products available.</p>';
        commGrid.innerHTML = '<p class="text-muted">No community products available.</p>';
        return;
    }

    allProds.forEach(p => {
        const cardHTML = createProductCard(p);

        if (p.isCommunityOnly) {
            commGrid.innerHTML += cardHTML;
        } else {
            mainGrid.innerHTML += cardHTML;
            if (p.isFeatured) {
                featuredGrid.innerHTML += cardHTML;
            }
        }
    });

    populateCategoryFilter();
}

function createProductCard(p) {
    return `
        <div class="product-card">
            <div class="card-img-box">
                <img src="${p.imageUrl}" alt="${p.name}">
                ${p.isCommunityOnly ? '<span class="badge-community">COMMUNITY ONLY</span>' : ''}
            </div>
            <div class="card-body">
                <span class="card-category">${p.category}</span>
                <h3 class="card-title">${p.name}</h3>
                <span class="card-seller"><i class="fa-solid fa-store"></i> ${p.sellerName || 'Official'}</span>
                <div class="card-footer">
                    <div class="card-price">${p.isCommunityOnly ? p.price + ' POINT' : 'Rp ' + p.price.toLocaleString()}</div>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-sm" onclick="openProductDetail('${p.productId}')">BUY NOW</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function populateCategoryFilter() {
    const filter = document.getElementById('categoryFilter');
    const categories = [...new Set(Object.values(storeData.products).map(p => p.category))];
    filter.innerHTML = '<option value="ALL">Semua Kategori</option>';
    categories.forEach(c => {
        if(c) filter.innerHTML += `<option value="${c}">${c}</option>`;
    });
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const cat = document.getElementById('categoryFilter').value;
    const grid = document.getElementById('mainProductsGrid');

    grid.innerHTML = '';
    const filtered = Object.values(storeData.products).filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search);
        const matchCat = (cat === 'ALL' || p.category === cat);
        return matchSearch && matchCat && !p.isCommunityOnly && p.status === 'ACTIVE';
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<p>Produk tidak ditemukan.</p>';
        return;
    }

    filtered.forEach(p => grid.innerHTML += createProductCard(p));
}

// 10. PRODUCT DETAIL & CHECKOUT
function openProductDetail(productId) {
    const p = storeData.products[productId];
    if (!p) return;

    selectedProductCheckout = p;
    document.getElementById('dtlImg').src = p.imageUrl;
    document.getElementById('dtlName').innerText = p.name;
    document.getElementById('dtlDesc').innerText = p.description || 'Tidak ada deskripsi.';
    document.getElementById('dtlCategory').innerText = p.category;
    document.getElementById('dtlPrice').innerText = p.isCommunityOnly ? `${p.price} POINT` : `Rp ${p.price.toLocaleString()}`;
    document.getElementById('dtlSeller').innerText = p.sellerName || 'Official';
    document.getElementById('dtlStock').innerText = p.stock;

    document.getElementById('productDetailModal').classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function proceedCheckout() {
    if (!storeData.isOpen) {
        Swal.fire({
            icon: 'error',
            title: 'Store Sedang Ditutup',
            text: 'Toko saat ini tidak menerima pesanan baru.',
            confirmButtonColor: '#00bcd4'
        });
        return;
    }

    closeModal('productDetailModal');
    const p = selectedProductCheckout;

    document.getElementById('chkProductName').innerText = p.name;
    document.getElementById('chkPrice').innerText = p.isCommunityOnly ? `${p.price} POINT` : `Rp ${p.price.toLocaleString()}`;
    document.getElementById('chkUsername').innerText = currentUser.username;
    document.getElementById('chkSeller').innerText = p.sellerName || 'Official';

    const paySelect = document.getElementById('chkPaymentSelect');
    paySelect.innerHTML = '';

    if (p.isCommunityOnly) {
        paySelect.innerHTML = '<option value="POINT">POINT / COIN</option>';
    } else {
        paySelect.innerHTML = `
            <option value="GOPAY">GoPay (085175218022)</option>
            <option value="POINT">POINT / COIN</option>
        `;
    }

    handleCheckoutPaymentChange();
    document.getElementById('checkoutModal').classList.remove('hidden');
}

function handleCheckoutPaymentChange() {
    const payType = document.getElementById('chkPaymentSelect').value;
    const pointBox = document.getElementById('pointCalcBox');
    const gopayBox = document.getElementById('gopayInfoBox');

    if (payType === 'POINT') {
        pointBox.classList.remove('hidden');
        gopayBox.classList.add('hidden');

        const balance = currentUser.points;
        const price = selectedProductCheckout.price;
        const rem = balance - price;

        document.getElementById('chkPointBalance').innerText = `${balance.toLocaleString()} POINT`;
        document.getElementById('chkPointRemaining').innerText = `${rem.toLocaleString()} POINT`;
        document.getElementById('chkPointRemaining').style.color = rem < 0 ? '#ef4444' : '#00bcd4';
    } else {
        pointBox.classList.add('hidden');
        gopayBox.classList.remove('hidden');
    }
}

// 11. CONFIRM ORDER & ATOMIC POINT TRANSACTION
function confirmOrderSubmit() {
    const p = selectedProductCheckout;
    const paymentMethod = document.getElementById('chkPaymentSelect').value;

    if (paymentMethod === 'POINT') {
        if (currentUser.points < p.price) {
            Swal.fire({
                icon: 'error',
                title: 'Point Tidak Cukup',
                text: 'Saldo Point Anda tidak mencukupi untuk melakukan transaksi ini.',
                confirmButtonColor: '#00bcd4'
            });
            return;
        }

        // ATOMIC TRANSACTION FIREBASE
        const userPointRef = db.ref(`users/${currentUser.uid}/points`);
        userPointRef.transaction(currentPoints => {
            if ((currentPoints || 0) >= p.price) {
                return currentPoints - p.price;
            } else {
                return; // Abort transaction
            }
        }, (error, committed) => {
            if (error || !committed) {
                Swal.fire({ icon: 'error', title: 'Transaksi Gagal', text: 'Gagal memproses pengurangan point.' });
            } else {
                createOrderInDB(p, 'POINT', 'PAID');
            }
        });
    } else {
        createOrderInDB(p, 'GOPAY', 'WAITING_PAYMENT');
    }
}

function createOrderInDB(product, paymentMethod, initialStatus) {
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${dateStr}-${randNum}`;
    const ticketId = `TCK-${dateStr}-${randNum}`;

    const orderData = {
        orderId: orderId,
        userId: currentUser.uid,
        username: currentUser.username,
        productId: product.productId,
        productName: product.name,
        sellerId: product.sellerId || 'GLOBAL',
        sellerName: product.sellerName || 'Official',
        price: product.price,
        paymentMethod: paymentMethod,
        status: initialStatus,
        createdAt: Date.now(),
        expiredAt: Date.now() + (24 * 60 * 60 * 1000), // 24 Hours
        ticketId: ticketId
    };

    // Create Order & Private Ticket Parallel
    db.ref(`orders/${orderId}`).set(orderData);
    db.ref(`tickets/${ticketId}`).set({
        ticketId: ticketId,
        orderId: orderId,
        userId: currentUser.uid,
        sellerId: product.sellerId || 'GLOBAL',
        status: 'OPEN',
        createdAt: Date.now(),
        lastUpdated: Date.now()
    });

    closeModal('checkoutModal');

    Swal.fire({
        icon: 'success',
        title: paymentMethod === 'POINT' ? 'Pembayaran Point Berhasil' : 'Order Berhasil Dibuat',
        text: `Order ID: ${orderId}. Tiket bantuan obrolan telah dibuka.`,
        confirmButtonColor: '#00bcd4'
    }).then(() => {
        switchView('ordersView');
    });
}

// 12. ORDER HISTORY & EXPIRATION CHECK
function renderOrders() {
    const container = document.getElementById('ordersListContainer');
    container.innerHTML = '';

    const myOrders = Object.values(storeData.orders)
        .filter(o => o.userId === currentUser.uid || currentUser.role === 'OWNER' || currentUser.role === 'ADMIN')
        .sort((a,b) => b.createdAt - a.createdAt);

    if (myOrders.length === 0) {
        container.innerHTML = '<p class="text-muted">Belum ada riwayat pesanan.</p>';
        return;
    }

    myOrders.forEach(o => {
        const isExp = Date.now() > o.expiredAt && o.status === 'WAITING_PAYMENT';
        const displayStatus = isExp ? 'EXPIRED' : o.status;

        container.innerHTML += `
            <div class="order-card">
                <div class="order-info">
                    <h4>${o.productName}</h4>
                    <p>Order ID: <strong>${o.orderId}</strong> | Payment: ${o.paymentMethod}</p>
                    <p>Harga: <strong>${o.paymentMethod === 'POINT' ? o.price + ' POINT' : 'Rp ' + o.price.toLocaleString()}</strong></p>
                </div>
                <div>
                    <span class="status-badge status-${displayStatus}">${displayStatus}</span>
                    <br><br>
                    <button class="btn btn-outline-primary btn-sm" onclick="openTicketChat('${o.ticketId}')">VIEW TICKET</button>
                </div>
            </div>
        `;
    });
}

function checkOrderExpirations() {
    const now = Date.now();
    Object.values(storeData.orders).forEach(o => {
        if (o.status === 'WAITING_PAYMENT' && now > o.expiredAt) {
            db.ref(`orders/${o.orderId}/status`).set('EXPIRED');
        }
    });
}

// 13. TICKET REALTIME CHAT SYSTEM
function renderTickets() {
    const sidebar = document.getElementById('ticketsListSidebar');
    sidebar.innerHTML = '';

    const myTickets = Object.values(storeData.tickets)
        .filter(t => t.userId === currentUser.uid || currentUser.role === 'OWNER' || currentUser.role === 'ADMIN');

    if (myTickets.length === 0) {
        sidebar.innerHTML = '<p class="p-15 text-muted">Tidak ada tiket aktif.</p>';
        return;
    }

    myTickets.forEach(t => {
        sidebar.innerHTML += `
            <div class="ticket-item-card ${activeTicketId === t.ticketId ? 'active' : ''}" onclick="openTicketChat('${t.ticketId}')">
                <strong>${t.ticketId}</strong>
                <p style="font-size:0.75rem;">Order: ${t.orderId}</p>
                <span class="badge">${t.status}</span>
            </div>
        `;
    });
}

function openTicketChat(ticketId) {
    activeTicketId = ticketId;
    switchView('ticketsView');

    document.getElementById('noChatSelected').classList.add('hidden');
    document.getElementById('activeChatBox').classList.remove('hidden');
    document.getElementById('chatTicketTitle').innerText = `Ticket ID: ${ticketId}`;

    // Listen to messages
    db.ref(`ticketMessages/${ticketId}`).on('value', snap => {
        const msgs = snap.val() || {};
        const msgContainer = document.getElementById('chatMessages');
        msgContainer.innerHTML = '';

        Object.values(msgs).forEach(m => {
            const isMe = m.senderId === currentUser.uid;
            msgContainer.innerHTML += `
                <div class="chat-bubble ${isMe ? 'me' : 'other'}">
                    <small style="font-size:0.65rem; display:block;">${m.senderName}</small>
                    ${m.text}
                </div>
            `;
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !activeTicketId) return;

    const msgId = 'MSG_' + Date.now();
    db.ref(`ticketMessages/${activeTicketId}/${msgId}`).set({
        messageId: msgId,
        senderId: currentUser.uid,
        senderName: currentUser.username,
        senderRole: currentUser.role,
        text: text,
        timestamp: Date.now()
    });

    input.value = '';
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter') sendChatMessage();
}

// 14. ADMIN LOGIN & SECURITY MANAGEMENT
function openLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

function submitAdminLogin() {
    const pwd = document.getElementById('loginPasswordInput').value;
    
    if (pwd === INIT_OWNER_PWD_HASH) {
        db.ref(`users/${currentUser.uid}`).update({ role: 'OWNER' });
        closeModal('loginModal');
        Swal.fire({ icon: 'success', title: 'Login Owner Berhasil', confirmButtonColor: '#00bcd4' });
    } else if (pwd === INIT_ADMIN_PWD_HASH) {
        db.ref(`users/${currentUser.uid}`).update({ role: 'ADMIN' });
        closeModal('loginModal');
        Swal.fire({ icon: 'success', title: 'Login Admin Berhasil', confirmButtonColor: '#00bcd4' });
    } else {
        Swal.fire({ icon: 'error', title: 'Password Salah', text: 'Kredensial tidak valid.' });
    }
}

function handleLogout() {
    db.ref(`users/${currentUser.uid}`).update({ role: 'USER' });
    Swal.fire({ icon: 'info', title: 'Logout Berhasil', confirmButtonColor: '#00bcd4' });
}

// 15. ADMIN DASHBOARD PANELS & MODALS
function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.admin-menu-item').forEach(m => m.classList.remove('active'));

    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById('admTab-' + tabId).classList.add('active');
}

function updateStats() {
    document.getElementById('statProducts').innerText = Object.keys(storeData.products).length;
    document.getElementById('statOrders').innerText = Object.keys(storeData.orders).length;
    
    const ordersArr = Object.values(storeData.orders);
    document.getElementById('statPendingOrders').innerText = ordersArr.filter(o => o.status === 'WAITING_PAYMENT').length;
    document.getElementById('statCompletedOrders').innerText = ordersArr.filter(o => o.status === 'PAID').length;
    document.getElementById('statCancelledOrders').innerText = ordersArr.filter(o => o.status === 'EXPIRED').length;

    document.getElementById('statUsers').innerText = Object.keys(storeData.users).length;
    
    let totalPts = 0;
    Object.values(storeData.users).forEach(u => totalPts += (u.points || 0));
    document.getElementById('statPoints').innerText = totalPts.toLocaleString();

    document.getElementById('statTickets').innerText = Object.keys(storeData.tickets).length;
}

// ADMIN DATA TABLES RENDERING
function renderAdminProducts() {
    const tbody = document.getElementById('adminProductsTable');
    tbody.innerHTML = '';
    Object.values(storeData.products).forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td><img src="${p.imageUrl}" width="40" height="40" style="object-fit:cover; border-radius:4px;"></td>
                <td>${p.name}</td>
                <td>${p.isCommunityOnly ? p.price + ' PTS' : 'Rp ' + p.price.toLocaleString()}</td>
                <td>${p.category}</td>
                <td>${p.sellerName || 'Official'}</td>
                <td>${p.isCommunityOnly ? 'Community' : 'Regular'}</td>
                <td><span class="badge">${p.status}</span></td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.productId}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function openAddProductModal() {
    Swal.fire({
        title: 'Add New Product',
        html:
            '<input id="swName" class="swal2-input" placeholder="Product Name">' +
            '<input id="swPrice" type="number" class="swal2-input" placeholder="Price">' +
            '<input id="swImg" class="swal2-input" placeholder="Image URL">' +
            '<input id="swCat" class="swal2-input" placeholder="Category">' +
            '<input id="swStock" type="number" class="swal2-input" placeholder="Stock" value="99">' +
            '<label><input id="swComm" type="checkbox"> Community Only (Points)</label>',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Save Product',
        preConfirm: () => {
            return {
                name: document.getElementById('swName').value,
                price: parseInt(document.getElementById('swPrice').value),
                imageUrl: document.getElementById('swImg').value,
                category: document.getElementById('swCat').value,
                stock: parseInt(document.getElementById('swStock').value),
                isCommunityOnly: document.getElementById('swComm').checked
            }
        }
    }).then(result => {
        if (result.isConfirmed) {
            const val = result.value;
            const pId = 'PROD_' + Date.now();
            db.ref(`products/${pId}`).set({
                productId: pId,
                name: val.name,
                price: val.price,
                imageUrl: val.imageUrl,
                category: val.category,
                stock: val.stock,
                isCommunityOnly: val.isCommunityOnly,
                sellerId: currentUser.uid,
                sellerName: currentUser.username,
                status: 'ACTIVE',
                createdAt: Date.now()
            });
            Swal.fire('Saved!', 'Product created.', 'success');
        }
    });
}

function deleteProduct(productId) {
    Swal.fire({
        title: 'Delete Product?',
        text: "Action cannot be undone!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            db.ref(`products/${productId}`).remove();
        }
    });
}

// BANNERS ADMIN
function renderAdminBanners() {
    const tbody = document.getElementById('adminBannersTable');
    tbody.innerHTML = '';
    Object.values(storeData.banners).forEach(b => {
        tbody.innerHTML += `
            <tr>
                <td><img src="${b.imageUrl}" width="60" height="30" style="object-fit:cover;"></td>
                <td>${b.title || '-'}</td>
                <td>${b.order}</td>
                <td>${b.status}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteBanner('${b.bannerId}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function openAddBannerModal() {
    const currentCount = Object.keys(storeData.banners).length;
    if (currentCount >= 15) {
        Swal.fire({ icon: 'warning', title: 'Maximum 15 banners allowed.', confirmButtonColor: '#00bcd4' });
        return;
    }

    Swal.fire({
        title: 'Add Banner',
        html:
            '<input id="swBImg" class="swal2-input" placeholder="Banner Image URL">' +
            '<input id="swBTitle" class="swal2-input" placeholder="Banner Title">',
        showCancelButton: true,
        preConfirm: () => {
            return {
                imageUrl: document.getElementById('swBImg').value,
                title: document.getElementById('swBTitle').value
            }
        }
    }).then(res => {
        if (res.isConfirmed) {
            const bId = 'BANNER_' + Date.now();
            db.ref(`banners/${bId}`).set({
                bannerId: bId,
                imageUrl: res.value.imageUrl,
                title: res.value.title,
                status: 'ACTIVE',
                order: currentCount + 1
            });
        }
    });
}

function deleteBanner(bId) {
    db.ref(`banners/${bId}`).remove();
}

// PAYMENTS & PUBLIC INFO
function renderPublicPayments() {
    const container = document.getElementById('publicPaymentMethodsGrid');
    container.innerHTML = `
        <div class="card-box" style="background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0;">
            <h3><i class="fa-solid fa-mobile-screen cyan-text"></i> GoPay Official</h3>
            <p>Nomor: <strong>085175218022</strong></p>
            <small>An. Store Logistik & Perlengkapan</small>
        </div>
        <div class="card-box" style="background:white; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-top:15px;">
            <h3><i class="fa-solid fa-coins cyan-text"></i> POINT / COIN System</h3>
            <p>Digunakan khusus untuk produk Community Only & transaksi cepat.</p>
        </div>
    `;
}

function renderAdminPayments() {
    const tbody = document.getElementById('adminPaymentsTable');
    tbody.innerHTML = '';
    Object.values(storeData.payments).forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td>${p.name}</td>
                <td>${p.accountNumber}</td>
                <td>${p.accountOwner}</td>
                <td>${p.sellerId}</td>
                <td>${p.status}</td>
                <td><button class="btn btn-danger btn-sm" onclick="db.ref('paymentMethods/${p.paymentId}').remove()"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    });
}

function openAddPaymentModal() {
    Swal.fire({
        title: 'Add Payment Method',
        html:
            '<input id="swPName" class="swal2-input" placeholder="Name (e.g. Dana)">' +
            '<input id="swPNum" class="swal2-input" placeholder="Account Number">' +
            '<input id="swPOwner" class="swal2-input" placeholder="Owner Name">',
        showCancelButton: true,
        preConfirm: () => {
            return {
                name: document.getElementById('swPName').value,
                accountNumber: document.getElementById('swPNum').value,
                accountOwner: document.getElementById('swPOwner').value
            }
        }
    }).then(res => {
        if (res.isConfirmed) {
            const payId = 'PAY_' + Date.now();
            db.ref(`paymentMethods/${payId}`).set({
                paymentId: payId,
                name: res.value.name,
                accountNumber: res.value.accountNumber,
                accountOwner: res.value.accountOwner,
                sellerId: currentUser.uid,
                status: 'ACTIVE'
            });
        }
    });
}

// USER & POINT MANAGEMENT (OWNER)
function renderAdminUserPoints() {
    const tbody = document.getElementById('adminUserPointsTable');
    tbody.innerHTML = '';
    Object.values(storeData.users).forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td>${u.uid}</td>
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td><strong>${(u.points || 0).toLocaleString()} PTS</strong></td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="editUserPoints('${u.uid}', ${u.points || 0})">Edit Points</button>
                </td>
            </tr>
        `;
    });
}

function editUserPoints(uid, currentPts) {
    Swal.fire({
        title: 'Set User Point Balance',
        input: 'number',
        inputValue: currentPts,
        showCancelButton: true,
        confirmButtonText: 'Update Points'
    }).then(res => {
        if (res.isConfirmed) {
            db.ref(`users/${uid}/points`).set(parseInt(res.value));
        }
    });
}

// STORE LOCK & OTHER CONTROLS
function toggleStoreStatus(statusBool) {
    db.ref('storeStatus').set({
        isOpen: statusBool,
        updatedAt: Date.now(),
        updatedBy: currentUser.username
    });
    Swal.fire('Updated', `Store status changed to ${statusBool ? 'OPEN' : 'CLOSED'}`, 'success');
}

function saveOwnerSecuritySettings() {
    const adminP = document.getElementById('cfgAdminPassword').value;
    const ownerP = document.getElementById('cfgOwnerPassword').value;

    if(adminP) db.ref('ownerSettings/adminPasswordHash').set(adminP);
    if(ownerP) db.ref('ownerSettings/ownerPasswordHash').set(ownerP);

    Swal.fire('Saved', 'Owner security credentials updated successfully.', 'success');
}

function renderAdminOrders() {
    const tbody = document.getElementById('adminOrdersTable');
    tbody.innerHTML = '';
    Object.values(storeData.orders).forEach(o => {
        tbody.innerHTML += `
            <tr>
                <td>${o.orderId}</td>
                <td>${o.username}</td>
                <td>${o.productName}</td>
                <td>${o.price}</td>
                <td>${o.paymentMethod}</td>
                <td><span class="badge">${o.status}</span></td>
                <td>
                    <button class="btn btn-success btn-sm" onclick="db.ref('orders/${o.orderId}/status').set('PAID')">Approve</button>
                    <button class="btn btn-danger btn-sm" onclick="db.ref('orders/${o.orderId}/status').set('CANCELLED')">Cancel</button>
                </td>
            </tr>
        `;
    });
}

function renderAdminTickets() {
    const tbody = document.getElementById('adminTicketsTable');
    tbody.innerHTML = '';
    Object.values(storeData.tickets).forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td>${t.ticketId}</td>
                <td>${t.orderId}</td>
                <td>${t.userId}</td>
                <td>${t.status}</td>
                <td><button class="btn btn-primary btn-sm" onclick="openTicketChat('${t.ticketId}')">Chat</button></td>
            </tr>
        `;
    });
}

function renderAdminUsers() {
    const tbody = document.getElementById('adminUsersTable');
    tbody.innerHTML = '';
    Object.values(storeData.users).filter(u => u.role === 'ADMIN' || u.role === 'OWNER').forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td>${u.uid}</td>
                <td>ALL_PERMISSIONS</td>
                <td>-</td>
            </tr>
        `;
    });
}

function openChangeUsernameModal() {
    Swal.fire({
        title: 'Ganti Display Name',
        input: 'text',
        inputValue: currentUser.username,
        showCancelButton: true,
        confirmButtonText: 'Simpan'
    }).then(res => {
        if (res.isConfirmed && res.value.trim()) {
            db.ref(`users/${currentUser.uid}/username`).set(res.value.trim());
            localStorage.setItem('store_user_name', res.value.trim());
        }
    });
}
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, update, remove, get, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD9BmV4XKXuMWa4PZHpb7Bbt-rHs61m3lE",
  databaseURL: "https://absensi-polri-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "absensi-polri",
  storageBucket: "absensi-polri.firebasestorage.app",
  messagingSenderId: "19006760644",
  appId: "1:19006760644:web:b980f54aea123e92ed4b91"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Application State
let currentUser = null;
let currentRole = "GUEST";
let storeIsOpen = true;
let activeTicketId = null;
let bannerInterval = null;
let currentSlideIndex = 0;

let dbCache = {
  products: {},
  banners: {},
  orders: {},
  tickets: {},
  paymentMethods: {},
  users: {}
};

// --- INITIALIZATION & LOADING ---
window.addEventListener("DOMContentLoaded", () => {
  initLoadingScreen();
  initServiceWorker();
  setupAuth();
  setupRealtimeListeners();
});

function initLoadingScreen() {
  let progress = 0;
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const loadingScreen = document.getElementById("loading-screen");

  const interval = setInterval(() => {
    progress += 5;
    progressBar.style.width = `${progress}%`;
    progressText.innerText = `Loading ${progress}%`;

    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        loadingScreen.style.opacity = "0";
        setTimeout(() => loadingScreen.classList.add("hidden"), 500);
      }, 200);
    }
  }, 30);
}

function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.error);
  }
}

// --- AUTHENTICATION ---
function setupAuth() {
  signInAnonymously(auth).catch((err) => {
    Swal.fire("Koneksi Gagal", "Unable to connect to server.", "error");
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      const userRef = ref(db, `users/${user.uid}`);
      get(userRef).then((snap) => {
        if (!snap.exists()) {
          const defaultUserData = {
            uid: user.uid,
            displayName: "Guest",
            role: "GUEST",
            pointBalance: 0,
            createdAt: Date.now(),
            lastLogin: Date.now()
          };
          set(userRef, defaultUserData);
        } else {
          update(userRef, { lastLogin: Date.now() });
        }
      });
    }
  });
}

// --- REALTIME LISTENERS ---
function setupRealtimeListeners() {
  // Store Status Listener
  onValue(ref(db, "storeStatus"), (snap) => {
    const val = snap.val();
    storeIsOpen = val ? val.isOpen : true;
    const closedBar = document.getElementById("store-closed-bar");
    if (!storeIsOpen) {
      closedBar.classList.remove("hidden");
    } else {
      closedBar.classList.add("hidden");
    }
  });

  // Current User Profile Listener
  onAuthStateChanged(auth, (user) => {
    if (user) {
      onValue(ref(db, `users/${user.uid}`), (snap) => {
        const uData = snap.val();
        if (uData) {
          currentRole = uData.role || "GUEST";
          document.getElementById("nav-username").innerText = uData.displayName || "Guest";
          document.getElementById("prof-display-name").innerText = uData.displayName || "Guest";
          document.getElementById("prof-role").innerText = currentRole;
          document.getElementById("prof-points").innerText = `${uData.pointBalance || 0} POINT`;

          // Show Admin Nav Link if Authorized
          const adminNav = document.getElementById("admin-nav-item");
          const adminNavMob = document.getElementById("admin-nav-item-mobile");
          const ownerSidebar = document.getElementById("owner-only-sidebar-menu");

          if (currentRole === "ADMIN" || currentRole === "OWNER") {
            adminNav.classList.remove("hidden");
            adminNavMob.classList.remove("hidden");
          } else {
            adminNav.classList.add("hidden");
            adminNavMob.classList.add("hidden");
          }

          if (currentRole === "OWNER") {
            ownerSidebar.classList.remove("hidden");
          } else {
            ownerSidebar.classList.add("hidden");
          }
        }
      });
    }
  });

  // Products Listener
  onValue(ref(db, "products"), (snap) => {
    dbCache.products = snap.val() || {};
    renderProducts();
    renderFeaturedProducts();
    renderCommunityProducts();
    renderAdminProducts();
  });

  // Banners Listener
  onValue(ref(db, "banners"), (snap) => {
    dbCache.banners = snap.val() || {};
    renderBanners();
    renderAdminBanners();
  });

  // Orders Listener
  onValue(ref(db, "orders"), (snap) => {
    dbCache.orders = snap.val() || {};
    checkOrdersExpiration();
    renderUserOrders();
    renderAdminOrders();
  });

  // Tickets Listener
  onValue(ref(db, "tickets"), (snap) => {
    dbCache.tickets = snap.val() || {};
    renderUserTickets();
    renderAdminTickets();
  });

  // Payment Methods Listener
  onValue(ref(db, "paymentMethods"), (snap) => {
    dbCache.paymentMethods = snap.val() || {};
    renderPublicPayments();
    renderAdminPayments();
  });

  // Users Listener
  onValue(ref(db, "users"), (snap) => {
    dbCache.users = snap.val() || {};
    renderAdminUsers();
    renderAdminDashboardStats();
  });
}

// --- NAVIGATION SPA ---
window.switchTab = function (tabId) {
  const sections = document.querySelectorAll(".view-section");
  sections.forEach((sec) => sec.classList.remove("active"));

  const target = document.getElementById(`sec-${tabId}`);
  if (target) target.classList.add("active");

  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((ln) => ln.classList.remove("active"));

  const mobileMenu = document.getElementById("mobile-menu");
  mobileMenu.classList.remove("active");
};

window.toggleMobileMenu = function () {
  const mobileMenu = document.getElementById("mobile-menu");
  mobileMenu.classList.toggle("active");
};

// --- BANNER SLIDER ---
function renderBanners() {
  const container = document.getElementById("banner-container");
  const track = document.getElementById("slider-track");
  const dots = document.getElementById("slider-dots");

  track.innerHTML = "";
  dots.innerHTML = "";

  const activeBanners = Object.values(dbCache.banners).filter((b) => b.status === "ACTIVE");

  if (activeBanners.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");

  activeBanners.forEach((b, idx) => {
    const img = document.createElement("img");
    img.src = b.imageUrl;
    img.className = "slide-item";
    track.appendChild(img);

    const dot = document.createElement("div");
    dot.className = `dot ${idx === 0 ? "active" : ""}`;
    dot.onclick = () => goToSlide(idx);
    dots.appendChild(dot);
  });

  startBannerAutoplay(activeBanners.length);
}

function startBannerAutoplay(length) {
  if (bannerInterval) clearInterval(bannerInterval);
  bannerInterval = setInterval(() => {
    moveSlide(1, length);
  }, 4000);
}

window.moveSlide = function (dir, maxLen) {
  const activeBanners = Object.values(dbCache.banners).filter((b) => b.status === "ACTIVE");
  const len = maxLen || activeBanners.length;
  if (len <= 1) return;

  currentSlideIndex = (currentSlideIndex + dir + len) % len;
  goToSlide(currentSlideIndex);
};

function goToSlide(index) {
  currentSlideIndex = index;
  const track = document.getElementById("slider-track");
  track.style.transform = `translateX(-${index * 100}%)`;

  const dots = document.querySelectorAll(".slider-dots .dot");
  dots.forEach((d, i) => d.classList.toggle("active", i === index));
}

// --- RENDER PRODUCTS ---
function renderProducts() {
  const grid = document.getElementById("products-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const list = Object.values(dbCache.products).filter((p) => p.status === "ACTIVE" && !p.isCommunityOnly);

  if (list.length === 0) {
    grid.innerHTML = "<p>No products available.</p>";
    return;
  }

  list.forEach((p) => grid.appendChild(createProductCard(p)));
}

function renderFeaturedProducts() {
  const grid = document.getElementById("featured-products-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const list = Object.values(dbCache.products).filter((p) => p.status === "ACTIVE" && p.isFeatured);

  if (list.length === 0) {
    grid.innerHTML = "<p>Tidak ada produk unggulan saat ini.</p>";
    return;
  }

  list.forEach((p) => grid.appendChild(createProductCard(p)));
}

function renderCommunityProducts() {
  const grid = document.getElementById("community-products-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const list = Object.values(dbCache.products).filter((p) => p.status === "ACTIVE" && p.isCommunityOnly);

  if (list.length === 0) {
    grid.innerHTML = "<p>Tidak ada produk Community Only.</p>";
    return;
  }

  list.forEach((p) => grid.appendChild(createProductCard(p, true)));
}

function createProductCard(p, isCommunity = false) {
  const card = document.createElement("div");
  card.className = "product-card";
  card.innerHTML = `
    <img src="${p.imageUrl}" class="product-img" alt="${p.name}">
    <div class="product-info">
      <div class="product-title">${p.name}</div>
      <div class="product-price">${isCommunity ? p.price + " POINT" : "Rp " + p.price.toLocaleString("id-ID")}</div>
      <div class="product-meta">
        <span>Stok: ${p.stock}</span> | <span>Seller: ${p.sellerName || "Official"}</span>
        ${p.isCommunityOnly ? '<br><span class="badge-community">COMMUNITY ONLY</span>' : ""}
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary" onclick="viewProductDetail('${p.id}')">Detail</button>
        <button class="btn btn-primary" onclick="initiateCheckout('${p.id}')">BUY NOW</button>
      </div>
    </div>
  `;
  return card;
}

window.viewProductDetail = function (prodId) {
  const p = dbCache.products[prodId];
  if (!p) return;

  const container = document.getElementById("product-detail-content");
  container.innerHTML = `
    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
      <img src="${p.imageUrl}" style="max-width: 300px; width: 100%; border-radius: var(--radius-md);">
      <div>
        <h2>${p.name}</h2>
        <h3 style="color: var(--primary-cyan); margin: 10px 0;">
          ${p.isCommunityOnly ? p.price + " POINT" : "Rp " + p.price.toLocaleString("id-ID")}
        </h3>
        <p><strong>Kategori:</strong> ${p.category}</p>
        <p><strong>Stok:</strong> ${p.stock}</p>
        <p><strong>Seller:</strong> ${p.sellerName || "Official"}</p>
        <p style="margin-top: 15px;">${p.description}</p>
        <button class="btn btn-primary margin-top" onclick="initiateCheckout('${p.id}')">BUY NOW NOW</button>
      </div>
    </div>
  `;
  switchTab("product-detail");
};

// --- CHECKOUT & TRANSACTION SYSTEM ---
window.initiateCheckout = function (prodId) {
  if (!storeIsOpen) {
    Swal.fire("Store Ditutup", "Store Sedang Ditutup", "warning");
    return;
  }

  const p = dbCache.products[prodId];
  if (!p) return;

  if (p.stock <= 0) {
    Swal.fire("Stok Habis", "Produk ini sudah habis.", "error");
    return;
  }

  if (p.isCommunityOnly) {
    // Community Only - Only Point
    handlePointCheckout(p);
  } else {
    // Normal Product - Choice of Payment
    Swal.fire({
      title: "Pilih Metode Pembayaran",
      text: `Produk: ${p.name}`,
      input: "select",
      inputOptions: {
        POINT: "POINT / COIN",
        GOPAY: "GoPay (085175218022)"
      },
      showCancelButton: true,
      confirmButtonText: "Lanjut Checkout"
    }).then((res) => {
      if (res.isConfirmed) {
        if (res.value === "POINT") {
          handlePointCheckout(p);
        } else {
          handleGoPayCheckout(p);
        }
      }
    });
  }
};

function handlePointCheckout(p) {
  const userRef = ref(db, `users/${currentUser.uid}`);
  get(userRef).then((snap) => {
    const userData = snap.val();
    const balance = userData ? userData.pointBalance || 0 : 0;

    if (balance < p.price) {
      Swal.fire("Gagal", "Point Tidak Cukup", "error");
      return;
    }

    Swal.fire({
      title: "Konfirmasi Transaksi Poin",
      html: `
        <p>Saldo Anda: <strong>${balance} POINT</strong></p>
        <p>Harga: <strong>${p.price} POINT</strong></p>
        <p>Sisa Saldo: <strong>${balance - p.price} POINT</strong></p>
      `,
      showCancelButton: true,
      confirmButtonText: "CONFIRM ORDER"
    }).then((res) => {
      if (res.isConfirmed) {
        // Atomic Transaction Point Deduction
        runTransaction(userRef, (user) => {
          if (user) {
            if ((user.pointBalance || 0) >= p.price) {
              user.pointBalance -= p.price;
            } else {
              return; // Abort
            }
          }
          return user;
        }).then((txResult) => {
          if (!txResult.committed) {
            Swal.fire("Gagal", "Point Tidak Cukup", "error");
            return;
          }
          createOrder(p, "POINT", "PAID");
          Swal.fire("Berhasil", "Pembayaran Point Berhasil", "success");
        });
      }
    });
  });
}

function handleGoPayCheckout(p) {
  Swal.fire({
    title: "Transfer via GoPay",
    html: `
      <p>Silakan transfer sebesar <strong>Rp ${p.price.toLocaleString("id-ID")}</strong> ke nomor:</p>
      <h2 style="color: var(--primary-cyan); margin: 10px 0;">085175218022</h2>
      <p>A/N: Store Logistik</p>
    `,
    confirmButtonText: "SAYA SUDAH TRANSFER"
  }).then((res) => {
    if (res.isConfirmed) {
      createOrder(p, "GOPAY", "WAITING_PAYMENT");
      Swal.fire("Pesanan Dibuat", "Pesanan menunggu verifikasi pembayaran.", "info");
    }
  });
}

function createOrder(p, paymentMethod, initialStatus) {
  const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
  const ticketId = `TCK-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

  const now = Date.now();
  const orderData = {
    orderId,
    userId: currentUser.uid,
    username: document.getElementById("nav-username").innerText,
    productId: p.id,
    productName: p.name,
    sellerId: p.sellerId || "GLOBAL",
    sellerName: p.sellerName || "Official",
    price: p.price,
    paymentMethod,
    status: initialStatus,
    createdAt: now,
    expiredAt: now + 24 * 60 * 60 * 1000, // 24 Hours
    ticketId
  };

  set(ref(db, `orders/${orderId}`), orderData);

  // Auto Create Private Ticket
  const ticketData = {
    ticketId,
    orderId,
    userId: currentUser.uid,
    sellerId: p.sellerId || "GLOBAL",
    status: "OPEN",
    createdAt: now
  };
  set(ref(db, `tickets/${ticketId}`), ticketData);
}

function checkOrdersExpiration() {
  const now = Date.now();
  Object.values(dbCache.orders).forEach((ord) => {
    if (ord.status === "WAITING_PAYMENT" && ord.expiredAt && now > ord.expiredAt) {
      update(ref(db, `orders/${ord.orderId}`), { status: "EXPIRED" });
    }
  });
}

// --- RENDER USER ORDERS & TICKETS ---
function renderUserOrders() {
  const container = document.getElementById("orders-list-container");
  if (!container) return;
  container.innerHTML = "";

  const myOrders = Object.values(dbCache.orders).filter((o) => o.userId === currentUser?.uid);

  if (myOrders.length === 0) {
    container.innerHTML = "<p>Belum ada order.</p>";
    return;
  }

  myOrders.forEach((o) => {
    const card = document.createElement("div");
    card.className = "order-card";
    
    let countdownText = "";
    if (o.status === "WAITING_PAYMENT" && o.expiredAt) {
      const diff = o.expiredAt - Date.now();
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        countdownText = `<br><small style="color:red;">Exp: ${hours}j ${mins}m</small>`;
      }
    }

    card.innerHTML = `
      <div>
        <strong>${o.orderId}</strong> - ${o.productName}
        <br><small>Metode: ${o.paymentMethod} | Rp ${o.price.toLocaleString("id-ID")}</small>
        ${countdownText}
      </div>
      <div>
        <span class="status-badge status-${o.status}">${o.status}</span>
        <button class="btn btn-secondary margin-top-sm" onclick="openTicketChat('${o.ticketId}')">VIEW TICKET</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderUserTickets() {
  const container = document.getElementById("tickets-list-container");
  if (!container) return;
  container.innerHTML = "";

  const myTickets = Object.values(dbCache.tickets).filter((t) => t.userId === currentUser?.uid);

  if (myTickets.length === 0) {
    container.innerHTML = "<p>Tidak ada tiket bantuan aktif.</p>";
    return;
  }

  myTickets.forEach((t) => {
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.innerHTML = `
      <div>
        <strong>${t.ticketId}</strong> (Order: ${t.orderId})
        <br><small>Status: ${t.status}</small>
      </div>
      <button class="btn btn-primary" onclick="openTicketChat('${t.ticketId}')">Buka Chat</button>
    `;
    container.appendChild(card);
  });
}

// --- REALTIME CHAT SYSTEM ---
window.openTicketChat = function (tckId) {
  activeTicketId = tckId;
  const tck = dbCache.tickets[tckId];
  if (!tck) return;

  document.getElementById("chat-header-info").innerText = `Tiket: ${tck.ticketId} | Order: ${tck.orderId}`;
  
  // Realtime Messages Listener
  onValue(ref(db, `ticketMessages/${tckId}`), (snap) => {
    const msgs = snap.val() || {};
    const box = document.getElementById("chat-messages-box");
    box.innerHTML = "";

    Object.values(msgs).forEach((m) => {
      const bubble = document.createElement("div");
      const isMine = m.senderId === currentUser.uid;
      bubble.className = `chat-bubble ${isMine ? "mine" : "other"}`;
      bubble.innerHTML = `<strong>${m.senderName}:</strong> ${m.message}`;
      box.appendChild(bubble);
    });

    box.scrollTop = box.scrollHeight;
  });

  switchTab("ticket-chat");
};

window.sendChatMessage = function () {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !activeTicketId) return;

  const msgRef = push(ref(db, `ticketMessages/${activeTicketId}`));
  set(msgRef, {
    senderId: currentUser.uid,
    senderName: document.getElementById("nav-username").innerText,
    message: text,
    timestamp: Date.now()
  });

  input.value = "";
};

// --- PROFILE & ADMIN LOGIN ---
window.updateProfileName = function () {
  const name = document.getElementById("input-new-name").value.trim();
  if (!name) return;

  update(ref(db, `users/${currentUser.uid}`), { displayName: name }).then(() => {
    Swal.fire("Sukses", "Nama berhasil diperbarui.", "success");
  });
};

window.loginAdmin = function () {
  const pass = document.getElementById("input-admin-pass").value.trim();

  if (pass === "OWNERSTORE1999/2026##") {
    update(ref(db, `users/${currentUser.uid}`), { role: "OWNER" });
    Swal.fire("Owner Granted", "Akses Owner Berhasil!", "success");
  } else if (pass === "STOREASSET2026##") {
    update(ref(db, `users/${currentUser.uid}`), { role: "ADMIN" });
    Swal.fire("Admin Granted", "Akses Admin Berhasil!", "success");
  } else {
    Swal.fire("Gagal", "Password Administrator Salah!", "error");
  }
};

// --- ADMIN PANEL CONTROLLER ---
window.switchAdminSubTab = function (subId) {
  const pages = document.querySelectorAll(".admin-sub-page");
  pages.forEach((p) => p.classList.remove("active"));

  const btns = document.querySelectorAll(".admin-tab-btn");
  btns.forEach((b) => b.classList.remove("active"));

  document.getElementById(`admin-sub-${subId}`).classList.add("active");
};

function renderAdminDashboardStats() {
  const container = document.getElementById("stats-grid-container");
  if (!container) return;

  const totalProds = Object.keys(dbCache.products).length;
  const totalOrds = Object.keys(dbCache.orders).length;
  const pendingOrds = Object.values(dbCache.orders).filter((o) => o.status === "PENDING" || o.status === "WAITING_PAYMENT").length;
  const completedOrds = Object.values(dbCache.orders).filter((o) => o.status === "COMPLETED" || o.status === "PAID").length;

  container.innerHTML = `
    <div class="stat-card"><h3>${totalProds}</h3><p>Total Produk</p></div>
    <div class="stat-card"><h3>${totalOrds}</h3><p>Total Order</p></div>
    <div class="stat-card"><h3>${pendingOrds}</h3><p>Pending Order</p></div>
    <div class="stat-card"><h3>${completedOrds}</h3><p>Completed Order</p></div>
  `;
}

// --- ADMIN PRODUCT CRUD ---
function renderAdminProducts() {
  const table = document.getElementById("admin-products-table");
  if (!table) return;

  let html = `<table><thead><tr><th>Nama</th><th>Harga</th><th>Stok</th><th>Aksi</th></tr></thead><tbody>`;
  Object.values(dbCache.products).forEach((p) => {
    html += `
      <tr>
        <td>${p.name}</td>
        <td>${p.price}</td>
        <td>${p.stock}</td>
        <td>
          <button class="btn btn-secondary" onclick="deleteProduct('${p.id}')">Hapus</button>
        </td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  table.innerHTML = html;
}

window.openAddProductModal = function () {
  Swal.fire({
    title: "Tambah Produk Baru",
    html: `
      <input id="p-name" class="swal2-input" placeholder="Nama Produk">
      <input id="p-price" type="number" class="swal2-input" placeholder="Harga">
      <input id="p-img" class="swal2-input" placeholder="URL Gambar">
      <input id="p-stock" type="number" class="swal2-input" placeholder="Stok">
      <label><input id="p-comm" type="checkbox"> Community Only</label>
    `,
    confirmButtonText: "Simpan",
    preConfirm: () => {
      return {
        name: document.getElementById("p-name").value,
        price: parseInt(document.getElementById("p-price").value),
        imageUrl: document.getElementById("p-img").value,
        stock: parseInt(document.getElementById("p-stock").value),
        isCommunityOnly: document.getElementById("p-comm").checked
      };
    }
  }).then((res) => {
    if (res.isConfirmed && res.value) {
      const pid = `PROD-${Date.now()}`;
      set(ref(db, `products/${pid}`), {
        id: pid,
        ...res.value,
        status: "ACTIVE",
        createdAt: Date.now()
      });
      Swal.fire("Sukses", "Produk berhasil ditambahkan", "success");
    }
  });
};

window.deleteProduct = function (pid) {
  remove(ref(db, `products/${pid}`));
};

// --- ADMIN BANNERS (MAX 15) ---
function renderAdminBanners() {
  const table = document.getElementById("admin-banners-table");
  if (!table) return;

  let html = `<table><thead><tr><th>Preview</th><th>Aksi</th></tr></thead><tbody>`;
  Object.values(dbCache.banners).forEach((b) => {
    html += `
      <tr>
        <td><img src="${b.imageUrl}" style="height: 40px;"></td>
        <td><button class="btn btn-danger" onclick="deleteBanner('${b.id}')">Hapus</button></td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  table.innerHTML = html;
}

window.openAddBannerModal = function () {
  const count = Object.keys(dbCache.banners).length;
  if (count >= 15) {
    Swal.fire("Batas Maksimal", "Maximum 15 banners allowed.", "warning");
    return;
  }

  Swal.fire({
    title: "Tambah Banner",
    input: "url",
    inputPlaceholder: "Masukkan Image URL Banner",
    showCancelButton: true
  }).then((res) => {
    if (res.isConfirmed && res.value) {
      const bid = `BAN-${Date.now()}`;
      set(ref(db, `banners/${bid}`), {
        id: bid,
        imageUrl: res.value,
        status: "ACTIVE"
      });
      Swal.fire("Sukses", "Banner ditambahkan", "success");
    }
  });
};

window.deleteBanner = function (bid) {
  remove(ref(db, `banners/${bid}`));
};

// --- ADMIN ORDERS & TICKETS ---
function renderAdminOrders() {
  const table = document.getElementById("admin-orders-table");
  if (!table) return;

  let html = `<table><thead><tr><th>Order ID</th><th>User</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>`;
  Object.values(dbCache.orders).forEach((o) => {
    html += `
      <tr>
        <td>${o.orderId}</td>
        <td>${o.username}</td>
        <td>Rp ${o.price}</td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
        <td>
          <button class="btn btn-primary" onclick="updateOrderStatus('${o.orderId}', 'COMPLETED')">Selesaikan</button>
        </td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  table.innerHTML = html;
}

window.updateOrderStatus = function (oid, status) {
  update(ref(db, `orders/${oid}`), { status });
};

function renderAdminTickets() {
  const table = document.getElementById("admin-tickets-table");
  if (!table) return;

  let html = `<table><thead><tr><th>Ticket ID</th><th>Order ID</th><th>Aksi</th></tr></thead><tbody>`;
  Object.values(dbCache.tickets).forEach((t) => {
    html += `
      <tr>
        <td>${t.ticketId}</td>
        <td>${t.orderId}</td>
        <td><button class="btn btn-primary" onclick="openTicketChat('${t.ticketId}')">Respon Chat</button></td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  table.innerHTML = html;
}

// --- ADMIN USERS & POINTS ---
function renderAdminUsers() {
  const table = document.getElementById("admin-users-table");
  if (!table) return;

  let html = `<table><thead><tr><th>Nama</th><th>Role</th><th>Poin</th><th>Aksi</th></tr></thead><tbody>`;
  Object.values(dbCache.users).forEach((u) => {
    html += `
      <tr>
        <td>${u.displayName || "Guest"}</td>
        <td>${u.role}</td>
        <td>${u.pointBalance || 0}</td>
        <td><button class="btn btn-secondary" onclick="addPointsPrompt('${u.uid}')">+ Poin</button></td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  table.innerHTML = html;
}

window.addPointsPrompt = function (uid) {
  Swal.fire({
    title: "Tambah Poin",
    input: "number",
    inputPlaceholder: "Jumlah Poin"
  }).then((res) => {
    if (res.isConfirmed && res.value) {
      const added = parseInt(res.value);
      const userRef = ref(db, `users/${uid}`);
      runTransaction(userRef, (user) => {
        if (user) {
          user.pointBalance = (user.pointBalance || 0) + added;
        }
        return user;
      });
    }
  });
};

// --- PUBLIC PAYMENTS ---
function renderPublicPayments() {
  const grid = document.getElementById("public-payments-grid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="product-card" style="padding: 20px;">
      <h3>GoPay Resmi</h3>
      <p style="font-size: 1.5rem; color: var(--primary-cyan); font-weight: 800; margin: 10px 0;">085175218022</p>
      <p>A/N: Store Logistik</p>
    </div>
  `;
}

function renderAdminPayments() {
  const table = document.getElementById("admin-payments-table");
  if (!table) return;
  table.innerHTML = "<p>Metode pembayaran GoPay default aktif (085175218022).</p>";
}

// --- STORE LOCK (OWNER ONLY) ---
window.toggleStoreStatus = function () {
  if (currentRole !== "OWNER") return;
  set(ref(db, "storeStatus"), { isOpen: !storeIsOpen });
};
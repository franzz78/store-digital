// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD9BmV4XKXuMWa4PZHpb7Bbt-rHs61m3lE",
  databaseURL: "https://absensi-polri-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "absensi-polri",
  storageBucket: "absensi-polri.firebasestorage.app",
  messagingSenderId: "19006760644",
  appId: "1:19006760644:web:b980f54aea123e92ed4b91"
};

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Application State
let currentUser = {
  id: localStorage.getItem("store_user_id") || "usr_" + Math.random().toString(36).substr(2, 9),
  name: localStorage.getItem("store_user_name") || "Guest",
  role: "GUEST", // GUEST, ADMIN, OWNER
  points: 0
};

let storeClosed = false;
let currentActiveTicket = null;
let currentCategory = "Semua";

// Save User ID Persistent
localStorage.setItem("store_user_id", currentUser.id);

// Init Application
document.addEventListener("DOMContentLoaded", () => {
  runLoadingScreen();
  setupNavigation();
  initUserData();
  listenStoreStatus();
  listenBanners();
  listenProducts();
  listenOrders();
  setupAdminTabs();
});

// 1. Loading Screen Animasi
function runLoadingScreen() {
  let progress = 0;
  const progressBar = document.getElementById("progress");
  const loadingText = document.getElementById("loading-text");
  const screen = document.getElementById("loading-screen");

  const interval = setInterval(() => {
    progress += 5;
    progressBar.style.width = progress + "%";
    loadingText.innerText = `Loading ${progress}%`;

    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        screen.style.opacity = "0";
        screen.style.visibility = "hidden";
      }, 300);
    }
  }, 30);
}

// 2. Navigation & User System
function setupNavigation() {
  const toggle = document.getElementById("mobile-menu");
  const menu = document.getElementById("nav-menu");

  toggle.addEventListener("click", () => {
    menu.classList.toggle("active");
  });

  document.getElementById("user-btn").addEventListener("click", () => {
    if (currentUser.role === "GUEST") {
      Swal.fire({
        title: 'User Profile & Admin Login',
        html: `
          <input type="text" id="swal-name" class="swal2-input" placeholder="Nama Anda" value="${currentUser.name}">
          <p style="margin-top:10px; font-size:12px; color:#666;">Akses Administrator / Owner:</p>
          <input type="password" id="swal-pass" class="swal2-input" placeholder="Password Admin/Owner (Opsional)">
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan / Login',
        preConfirm: () => {
          return {
            name: document.getElementById('swal-name').value,
            pass: document.getElementById('swal-pass').value
          }
        }
      }).then((res) => {
        if (res.isConfirmed) {
          const { name, pass } = res.value;
          if (name) {
            currentUser.name = name;
            localStorage.setItem("store_user_name", name);
            db.ref(`users/${currentUser.id}/name`).set(name);
          }

          // Cek Password Administrator/Owner
          if (pass === "OWNERSTORE1999/2026##") {
            currentUser.role = "OWNER";
            Swal.fire('Login Success', 'Login sebagai OWNER', 'success');
          } else if (pass === "STOREASSET2026##") {
            currentUser.role = "ADMIN";
            Swal.fire('Login Success', 'Login sebagai ADMIN', 'success');
          } else if (pass !== "") {
            // Check in Database admins
            db.ref("admins").once("value", snap => {
              let found = false;
              snap.forEach(child => {
                if (child.val().password === pass) {
                  found = true;
                  currentUser.role = child.val().role || "ADMIN";
                }
              });
              if (found) {
                Swal.fire('Login Success', 'Login Admin Berhasil', 'success');
                updateUserUI();
              } else {
                Swal.fire('Error', 'Password Admin Salah', 'error');
              }
            });
          }
          updateUserUI();
        }
      });
    } else {
      Swal.fire({
        title: `Logged in: ${currentUser.name}`,
        text: `Role: ${currentUser.role}`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Logout Role',
        cancelButtonText: 'Tutup'
      }).then(r => {
        if(r.isConfirmed) {
          currentUser.role = "GUEST";
          updateUserUI();
          Swal.fire('Logout', 'Kembali ke mode Guest', 'info');
        }
      });
    }
  });

  // Topup Info
  document.getElementById("btn-topup-info").addEventListener("click", () => {
    Swal.fire("Info Point/Coin", "Point digunakan khusus untuk pembelian produk Community Only. Hubungi Admin via Ticket untuk pengisian Point.", "info");
  });
}

function initUserData() {
  db.ref(`users/${currentUser.id}`).on("value", snap => {
    const data = snap.val();
    if (data) {
      currentUser.points = data.points || 0;
      document.getElementById("user-points").innerText = currentUser.points.toLocaleString();
    } else {
      db.ref(`users/${currentUser.id}`).set({
        name: currentUser.name,
        points: 0
      });
    }
  });
  updateUserUI();
}

function updateUserUI() {
  document.getElementById("user-name").innerText = `${currentUser.name} (${currentUser.role})`;
  const adminNav = document.getElementById("admin-nav-item");
  const adminSec = document.getElementById("admin");

  if (currentUser.role === "ADMIN" || currentUser.role === "OWNER") {
    adminNav.classList.remove("hidden");
    document.getElementById("admin-role-badge").innerText = currentUser.role;

    if (currentUser.role === "OWNER") {
      document.querySelectorAll(".owner-only").forEach(el => el.classList.remove("hidden"));
    } else {
      document.querySelectorAll(".owner-only").forEach(el => el.classList.add("hidden"));
    }
  } else {
    adminNav.classList.add("hidden");
    adminSec.classList.add("hidden");
  }
}

// 3. Store Status Listener
function listenStoreStatus() {
  db.ref("store_status").on("value", snap => {
    storeClosed = snap.val() === "CLOSED";
    const statusBar = document.getElementById("store-status-bar");
    const currentStatusText = document.getElementById("current-store-status");

    if (storeClosed) {
      statusBar.classList.remove("hidden");
      if(currentStatusText) currentStatusText.innerText = "CLOSED";
    } else {
      statusBar.classList.add("hidden");
      if(currentStatusText) currentStatusText.innerText = "OPEN";
    }
    renderProducts();
  });

  document.getElementById("btn-toggle-store").addEventListener("click", () => {
    if (currentUser.role !== "OWNER") return;
    const newStatus = storeClosed ? "OPEN" : "CLOSED";
    db.ref("store_status").set(newStatus);
  });
}

// 4. Banner Slider System
function listenBanners() {
  db.ref("banners").on("value", snap => {
    const container = document.getElementById("slider-container");
    const adminTable = document.getElementById("admin-banner-table");
    container.innerHTML = "";
    adminTable.innerHTML = "";

    let banners = [];
    snap.forEach(child => {
      banners.push({ id: child.key, ...child.val() });
    });

    if (banners.length === 0) {
      container.innerHTML = `<div class="slide active"><img src="https://via.placeholder.com/800x200?text=Store+Logistik+%26+Perlengkapan" alt="Default"></div>`;
    } else {
      banners.filter(b => b.active).forEach((b, idx) => {
        container.innerHTML += `
          <div class="slide ${idx === 0 ? 'active' : ''}">
            <img src="${b.url}" alt="${b.title}">
          </div>
        `;
      });
      startBannerRotation();
    }

    // Admin List
    banners.forEach(b => {
      adminTable.innerHTML += `
        <tr>
          <td><img src="${b.url}" width="50" height="30" style="object-fit:cover;"></td>
          <td>${b.title}</td>
          <td>${b.active ? 'Aktif' : 'Nonaktif'}</td>
          <td>
            <button onclick="toggleBanner('${b.id}', ${!b.active})" class="btn-sm">${b.active ? 'Disable' : 'Enable'}</button>
            <button onclick="deleteBanner('${b.id}')" class="btn-sm" style="background:#ef4444; color:white;">Hapus</button>
          </td>
        </tr>
      `;
    });
  });

  document.getElementById("btn-add-banner").addEventListener("click", () => {
    db.ref("banners").once("value", snap => {
      if (snap.numChildren() >= 15) {
        return Swal.fire("Limit Reached", "Maksimal 15 Banner!", "warning");
      }
      Swal.fire({
        title: 'Tambah Banner',
        html: `
          <input type="text" id="b-title" class="swal2-input" placeholder="Judul Banner">
          <input type="text" id="b-url" class="swal2-input" placeholder="URL Gambar">
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan'
      }).then(r => {
        if (r.isConfirmed) {
          const title = document.getElementById('b-title').value;
          const url = document.getElementById('b-url').value;
          if (title && url) {
            db.ref("banners").push({ title, url, active: true });
          }
        }
      });
    });
  });
}

let bannerInterval;
function startBannerRotation() {
  clearInterval(bannerInterval);
  const slides = document.querySelectorAll(".slide");
  if (slides.length <= 1) return;
  let current = 0;
  bannerInterval = setInterval(() => {
    slides[current].classList.remove("active");
    current = (current + 1) % slides.length;
    slides[current].classList.add("active");
  }, 4000);
}

function toggleBanner(id, status) {
  db.ref(`banners/${id}/active`).set(status);
}

function deleteBanner(id) {
  db.ref(`banners/${id}`).remove();
}

// 5. Products System
let allProducts = [];
function listenProducts() {
  db.ref("products").on("value", snap => {
    allProducts = [];
    snap.forEach(child => {
      allProducts.push({ id: child.key, ...child.val() });
    });
    renderProducts();
    renderAdminProducts();
  });

  // Filter Categories
  document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      currentCategory = e.target.getAttribute("data-cat");
      renderProducts();
    });
  });

  document.getElementById("btn-add-product").addEventListener("click", () => showProductModal());
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  const communityGrid = document.getElementById("community-product-grid");
  grid.innerHTML = "";
  communityGrid.innerHTML = "";

  allProducts.forEach(p => {
    const isCommunity = p.communityOnly || p.category === "Community Only";
    const buyDisabled = storeClosed || p.stock <= 0;

    const cardHTML = `
      <div class="product-card">
        <img src="${p.imageUrl || 'https://via.placeholder.com/150'}" class="product-img" alt="${p.name}">
        <div class="product-info">
          <div class="product-title">${p.name}</div>
          <div class="product-price">${isCommunity ? p.price + ' Point' : 'Rp' + Number(p.price).toLocaleString()}</div>
          <div class="product-seller">Seller: ${p.seller || 'Official'} | Stock: ${p.stock}</div>
          <button class="btn-buy" ${buyDisabled ? 'disabled' : ''} onclick="buyProduct('${p.id}')">
            ${storeClosed ? 'STORE CLOSED' : (p.stock <= 0 ? 'HABIS' : 'BELI')}
          </button>
        </div>
      </div>
    `;

    if (isCommunity) {
      communityGrid.innerHTML += cardHTML;
    } else {
      if (currentCategory === "Semua" || p.category === currentCategory) {
        grid.innerHTML += cardHTML;
      }
    }
  });

  document.getElementById("dash-total-products").innerText = allProducts.length;
}

function renderAdminProducts() {
  const tbody = document.getElementById("admin-product-table");
  tbody.innerHTML = "";
  allProducts.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td><img src="${p.imageUrl}" width="40" height="40" style="object-fit:cover;"></td>
        <td>${p.name}</td>
        <td>${p.price}</td>
        <td>${p.category}</td>
        <td>${p.stock}</td>
        <td>
          <button onclick="editProduct('${p.id}')" class="btn-sm">Edit</button>
          <button onclick="deleteProduct('${p.id}')" class="btn-sm" style="background:#ef4444; color:white;">Hapus</button>
        </td>
      </tr>
    `;
  });
}

function showProductModal(productId = null) {
  const p = productId ? allProducts.find(x => x.id === productId) : {};
  Swal.fire({
    title: productId ? 'Edit Produk' : 'Tambah Produk',
    html: `
      <input type="text" id="p-name" class="swal2-input" placeholder="Nama Produk" value="${p.name || ''}">
      <input type="number" id="p-price" class="swal2-input" placeholder="Harga / Point" value="${p.price || ''}">
      <input type="text" id="p-image" class="swal2-input" placeholder="URL Foto" value="${p.imageUrl || ''}">
      <select id="p-category" class="swal2-input">
        <option value="Asset" ${p.category==='Asset'?'selected':''}>Asset</option>
        <option value="Baju" ${p.category==='Baju'?'selected':''}>Baju</option>
        <option value="Perlengkapan" ${p.category==='Perlengkapan'?'selected':''}>Perlengkapan</option>
        <option value="Community Only" ${p.category==='Community Only'?'selected':''}>Community Only</option>
      </select>
      <input type="number" id="p-stock" class="swal2-input" placeholder="Stock" value="${p.stock || 10}">
      <input type="text" id="p-seller" class="swal2-input" placeholder="Seller" value="${p.seller || 'Admin'}">
      <div style="margin-top:10px; text-align:left; font-size:14px;">
        <label><input type="checkbox" id="p-community" ${p.communityOnly ? 'checked':''}> Community Only (Point Payment)</label>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Simpan'
  }).then(r => {
    if (r.isConfirmed) {
      const data = {
        name: document.getElementById('p-name').value,
        price: Number(document.getElementById('p-price').value),
        imageUrl: document.getElementById('p-image').value,
        category: document.getElementById('p-category').value,
        stock: Number(document.getElementById('p-stock').value),
        seller: document.getElementById('p-seller').value,
        communityOnly: document.getElementById('p-community').checked
      };

      if (productId) {
        db.ref(`products/${productId}`).update(data);
      } else {
        db.ref("products").push(data);
      }
      Swal.fire('Berhasil', 'Data produk diperbarui', 'success');
    }
  });
}

function editProduct(id) { showProductModal(id); }
function deleteProduct(id) {
  Swal.fire({
    title: 'Hapus Produk?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Ya, Hapus'
  }).then(r => {
    if(r.isConfirmed) db.ref(`products/${id}`).remove();
  });
}

// 6. Buying & Order System
function buyProduct(productId) {
  if (storeClosed) {
    return Swal.fire("STORE CLOSED", "Toko sedang ditutup oleh Owner.", "error");
  }

  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const isCommunity = p.communityOnly || p.category === "Community Only";

  if (isCommunity) {
    // Transaction Firebase untuk Point
    const userRef = db.ref(`users/${currentUser.id}/points`);
    userRef.transaction(currentPoints => {
      if ((currentPoints || 0) >= p.price) {
        return currentPoints - p.price;
      } else {
        return; // Abort transaction
      }
    }, (error, committed, snapshot) => {
      if (error) {
        Swal.fire("Error", "Gagal memproses transaksi", "error");
      } else if (!committed) {
        Swal.fire("Point Tidak Cukup", "Point kamu tidak cukup untuk membeli produk ini.", "error");
      } else {
        // Point Replaced & Order Created
        createOrder(p, "Point / Coin", "PAID");
      }
    });
  } else {
    // GoPay / Regular Payment
    Swal.fire({
      title: 'Konfirmasi Pembelian',
      html: `
        <p><strong>${p.name}</strong></p>
        <p>Harga: Rp${p.price.toLocaleString()}</p>
        <p style="margin-top:10px;">Metode Pembayaran:</p>
        <select id="swal-payment-method" class="swal2-input">
          <option value="GoPay">GoPay (085175218022)</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Lanjutkan Pembayaran'
    }).then(r => {
      if (r.isConfirmed) {
        createOrder(p, "GoPay", "WAITING_PAYMENT");
      }
    });
  }
}

function createOrder(product, paymentMethod, initialStatus) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g,"");
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const orderId = `ORD-${dateStr}-${randNum}`;
  const expireTime = Date.now() + (24 * 60 * 60 * 1000); // 24 Jam

  const orderData = {
    orderId: orderId,
    userId: currentUser.id,
    userName: currentUser.name,
    productName: product.name,
    price: product.price,
    paymentMethod: paymentMethod,
    status: initialStatus,
    createdAt: Date.now(),
    expireAt: expireTime
  };

  db.ref(`orders/${orderId}`).set(orderData).then(() => {
    // Auto Create Chat Ticket
    db.ref(`tickets/${orderId}`).set({
      orderId: orderId,
      userId: currentUser.id,
      userName: currentUser.name,
      lastUpdate: Date.now()
    });

    // Curangi stok produk -1
    db.ref(`products/${product.id}/stock`).set(Math.max(0, product.stock - 1));

    if (paymentMethod === "GoPay") {
      Swal.fire({
        title: 'Instruksi Pembayaran GoPay',
        html: `
          <p>Silakan transfer sebesar <strong>Rp${product.price.toLocaleString()}</strong> ke:</p>
          <h3 style="color:#06b6d4; margin:10px 0;">085175218022</h3>
          <p>Order ID: <strong>${orderId}</strong></p>
          <p style="font-size:12px; color:#666;">Silakan kirim bukti pembayaran via Ticket Support.</p>
        `,
        icon: 'info'
      });
    } else {
      Swal.fire("Order Berhasil", "Pembayaran via Point Berhasil!", "success");
    }
  });
}

// 7. My Orders & Expiry Countdown Listener
function listenOrders() {
  db.ref("orders").on("value", snap => {
    const list = document.getElementById("orders-list");
    const adminTable = document.getElementById("admin-order-table");
    list.innerHTML = "";
    adminTable.innerHTML = "";

    let total = 0;
    let pending = 0;

    snap.forEach(child => {
      const o = child.val();
      total++;

      // Automatic Check Expiration (24 Hours)
      if (o.status === "WAITING_PAYMENT" && Date.now() > o.expireAt) {
        db.ref(`orders/${o.orderId}/status`).set("EXPIRED");
        o.status = "EXPIRED";
      }

      if (o.status === "PENDING" || o.status === "WAITING_PAYMENT") pending++;

      // User Order View
      if (o.userId === currentUser.id) {
        const timeLeft = Math.max(0, Math.floor((o.expireAt - Date.now()) / 1000));
        const hours = Math.floor(timeLeft / 3600);
        const mins = Math.floor((timeLeft % 3600) / 60);

        list.innerHTML += `
          <div class="order-card">
            <div class="order-info">
              <h4>${o.orderId} - ${o.productName}</h4>
              <p>Harga: ${typeof o.price === 'number' ? 'Rp'+o.price.toLocaleString() : o.price} | Method: ${o.paymentMethod}</p>
              ${o.status === 'WAITING_PAYMENT' ? `<p style="color:#eab308; font-weight:bold;">Sisa Waktu Bayar: ${hours}j ${mins}m</p>` : ''}
            </div>
            <div>
              <span class="status-badge status-${o.status}">${o.status}</span>
              <button onclick="openTicketModal('${o.orderId}')" class="btn-primary btn-sm mt-2">Chat Ticket</button>
            </div>
          </div>
        `;
      }

      // Admin Table View
      adminTable.innerHTML += `
        <tr>
          <td>${o.orderId}</td>
          <td>${o.userName}</td>
          <td>${o.productName}</td>
          <td>${o.paymentMethod}</td>
          <td><span class="status-badge status-${o.status}">${o.status}</span></td>
          <td>
            <select onchange="updateOrderStatus('${o.orderId}', this.value)" class="btn-sm">
              <option value="PENDING" ${o.status==='PENDING'?'selected':''}>PENDING</option>
              <option value="WAITING_PAYMENT" ${o.status==='WAITING_PAYMENT'?'selected':''}>WAITING_PAYMENT</option>
              <option value="PAID" ${o.status==='PAID'?'selected':''}>PAID</option>
              <option value="PROCESSING" ${o.status==='PROCESSING'?'selected':''}>PROCESSING</option>
              <option value="COMPLETED" ${o.status==='COMPLETED'?'selected':''}>COMPLETED</option>
              <option value="CANCELLED" ${o.status==='CANCELLED'?'selected':''}>CANCELLED</option>
            </select>
          </td>
        </tr>
      `;
    });

    document.getElementById("dash-total-orders").innerText = total;
    document.getElementById("dash-pending-orders").innerText = pending;
  });
}

function updateOrderStatus(orderId, status) {
  db.ref(`orders/${orderId}/status`).set(status);
  Swal.fire("Status Updated", `Order ${orderId} diubah ke ${status}`, "success");
}

// 8. Ticket Realtime Chat System
function openTicketModal(orderId) {
  currentActiveTicket = orderId;
  document.getElementById("modal-ticket-title").innerText = `Ticket Support #${orderId}`;
  document.getElementById("ticket-modal").classList.remove("hidden");
  listenTicketMessages(orderId, "user-chat-messages");
}

document.getElementById("close-ticket-modal").addEventListener("click", () => {
  document.getElementById("ticket-modal").classList.add("hidden");
});

document.getElementById("btn-send-chat").addEventListener("click", () => {
  const input = document.getElementById("chat-input");
  if (input.value.trim() && currentActiveTicket) {
    db.ref(`tickets/${currentActiveTicket}/messages`).push({
      sender: currentUser.name,
      role: currentUser.role,
      text: input.value.trim(),
      timestamp: Date.now()
    });
    input.value = "";
  }
});

function listenTicketMessages(orderId, containerId) {
  db.ref(`tickets/${orderId}/messages`).on("value", snap => {
    const box = document.getElementById(containerId);
    box.innerHTML = "";
    snap.forEach(child => {
      const msg = child.val();
      const isMe = msg.sender === currentUser.name;
      box.innerHTML += `
        <div class="chat-msg ${msg.role === 'ADMIN' || msg.role === 'OWNER' ? 'admin' : 'user'}">
          <strong>${msg.sender}:</strong> ${msg.text}
        </div>
      `;
    });
    box.scrollTop = box.scrollHeight;
  });
}

// Admin Ticket System
function listenAdminTickets() {
  db.ref("tickets").on("value", snap => {
    const list = document.getElementById("ticket-list-admin");
    list.innerHTML = "";
    snap.forEach(child => {
      const t = child.val();
      list.innerHTML += `
        <div class="ticket-item" onclick="loadAdminChat('${t.orderId}')">
          <strong>${t.orderId}</strong>
          <p style="font-size:12px;">User: ${t.userName}</p>
        </div>
      `;
    });
  });
}

function loadAdminChat(orderId) {
  currentActiveTicket = orderId;
  const chatArea = document.getElementById("admin-chat-area");
  chatArea.innerHTML = `
    <h4>Chat Ticket #${orderId}</h4>
    <div class="chat-box" id="admin-chat-messages"></div>
    <div class="chat-input-group">
      <input type="text" id="admin-chat-input" placeholder="Tulis balasan admin...">
      <button onclick="sendAdminChat()" class="btn-primary">Kirim</button>
    </div>
  `;
  listenTicketMessages(orderId, "admin-chat-messages");
}

function sendAdminChat() {
  const input = document.getElementById("admin-chat-input");
  if (input.value.trim() && currentActiveTicket) {
    db.ref(`tickets/${currentActiveTicket}/messages`).push({
      sender: "Admin (" + currentUser.name + ")",
      role: "ADMIN",
      text: input.value.trim(),
      timestamp: Date.now()
    });
    input.value = "";
  }
}

// 9. Admin Tabs Nav & Management
function setupAdminTabs() {
  document.querySelectorAll(".admin-tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      e.target.classList.add("active");
      const tabId = e.target.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");

      if (tabId === "tab-ticket") {
        listenAdminTickets();
      }
    });
  });

  // Owner Management: Add Admin
  document.getElementById("btn-create-admin").addEventListener("click", () => {
    const user = document.getElementById("new-admin-username").value;
    const pass = document.getElementById("new-admin-password").value;
    if (user && pass) {
      db.ref("admins").push({ username: user, password: pass, role: "ADMIN" }).then(() => {
        Swal.fire("Berhasil", "Admin baru ditambahkan", "success");
        document.getElementById("new-admin-username").value = "";
        document.getElementById("new-admin-password").value = "";
      });
    }
  });
}
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

// State Aplikasi
let currentUser = {
  id: localStorage.getItem("store_user_id") || "usr_" + Math.random().toString(36).substr(2, 9),
  name: localStorage.getItem("store_user_name") || "Guest",
  role: localStorage.getItem("store_user_role") || "GUEST", // GUEST, ADMIN, OWNER
  points: 0
};

let storeClosed = false;
let currentActiveTicket = null;
let currentCategory = "Semua";
let allProducts = [];
let allBanners = [];

// Simpan User ID ke LocalStorage
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
    if (progressBar) progressBar.style.width = progress + "%";
    if (loadingText) loadingText.innerText = `Loading ${progress}%`;

    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        if (screen) {
          screen.style.opacity = "0";
          screen.style.visibility = "hidden";
        }
      }, 300);
    }
  }, 25);
}

// 2. Navigation & Profile System
function setupNavigation() {
  const toggle = document.getElementById("mobile-menu");
  const menu = document.getElementById("nav-menu");

  if (toggle) {
    toggle.addEventListener("click", () => {
      menu.classList.toggle("active");
    });
  }

  document.getElementById("user-btn").addEventListener("click", () => {
    if (currentUser.role === "GUEST") {
      Swal.fire({
        title: 'Profil & Login Admin',
        html: `
          <input type="text" id="swal-name" class="swal2-input" placeholder="Nama Anda" value="${currentUser.name}">
          <p style="margin-top:12px; font-size:12px; color:#64748b; font-weight:bold;">AKSES ADMINISTRATOR / OWNER</p>
          <input type="password" id="swal-pass" class="swal2-input" placeholder="Password Admin/Owner">
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan / Login',
        cancelButtonText: 'Batal',
        preConfirm: () => {
          return {
            name: document.getElementById('swal-name').value.trim(),
            pass: document.getElementById('swal-pass').value.trim()
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
            localStorage.setItem("store_user_role", "OWNER");
            Swal.fire('Login Berhasil', 'Anda masuk sebagai OWNER toko', 'success');
          } else if (pass === "STOREASSET2026##") {
            currentUser.role = "ADMIN";
            localStorage.setItem("store_user_role", "ADMIN");
            Swal.fire('Login Berhasil', 'Anda masuk sebagai ADMINISTRATOR', 'success');
          } else if (pass !== "") {
            // Cek di Firebase node 'admins'
            db.ref("admins").once("value", snap => {
              let found = false;
              let role = "ADMIN";
              snap.forEach(child => {
                if (child.val().password === pass) {
                  found = true;
                  role = child.val().role || "ADMIN";
                }
              });

              if (found) {
                currentUser.role = role;
                localStorage.setItem("store_user_role", role);
                Swal.fire('Login Berhasil', `Login sebagai ${role}`, 'success');
              } else {
                Swal.fire('Login Gagal', 'Password Admin/Owner tidak valid', 'error');
              }
              updateUserUI();
            });
            return;
          } else {
            Swal.fire('Nama Disimpan', `Nama diubah menjadi ${name}`, 'success');
          }
          updateUserUI();
        }
      });
    } else {
      Swal.fire({
        title: `Logged in: ${currentUser.name}`,
        text: `Role Anda: ${currentUser.role}`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Logout Akses Admin',
        cancelButtonText: 'Tutup'
      }).then(r => {
        if (r.isConfirmed) {
          currentUser.role = "GUEST";
          localStorage.setItem("store_user_role", "GUEST");
          updateUserUI();
          Swal.fire('Logout', 'Anda kembali ke status Guest', 'info');
        }
      });
    }
  });

  document.getElementById("btn-topup-info").addEventListener("click", () => {
    Swal.fire("Info Point/Coin", "Point digunakan khusus untuk pembelian produk Community Only. Hubungi Admin via Ticket Chat untuk pengisian Point.", "info");
  });
}

function initUserData() {
  db.ref(`users/${currentUser.id}`).on("value", snap => {
    const data = snap.val();
    if (data) {
      currentUser.points = data.points || 0;
      const pointElem = document.getElementById("user-points");
      if (pointElem) pointElem.innerText = currentUser.points.toLocaleString();
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
      listenAdminsList();
    } else {
      document.querySelectorAll(".owner-only").forEach(el => el.classList.add("hidden"));
    }
  } else {
    adminNav.classList.add("hidden");
    adminSec.classList.add("hidden");
  }
}

// 3. Store Status Listener (Owner Control)
function listenStoreStatus() {
  db.ref("store_status").on("value", snap => {
    storeClosed = snap.val() === "CLOSED";
    const statusBar = document.getElementById("store-status-bar");
    const currentStatusText = document.getElementById("current-store-status");
    const toggleBtn = document.getElementById("btn-toggle-store");

    if (storeClosed) {
      statusBar.classList.remove("hidden");
      if (currentStatusText) {
        currentStatusText.innerText = "CLOSED";
        currentStatusText.style.color = "#ef4444";
      }
      if (toggleBtn) toggleBtn.innerText = "BUKA TOKO (OPEN STORE)";
    } else {
      statusBar.classList.add("hidden");
      if (currentStatusText) {
        currentStatusText.innerText = "OPEN";
        currentStatusText.style.color = "#06b6d4";
      }
      if (toggleBtn) toggleBtn.innerText = "TUTUP TOKO (CLOSE STORE)";
    }
    renderProducts();
  });

  document.getElementById("btn-toggle-store").addEventListener("click", () => {
    if (currentUser.role !== "OWNER") {
      return Swal.fire("Akses Ditolak", "Hanya OWNER yang dapat membuka/menutup store", "error");
    }
    const newStatus = storeClosed ? "OPEN" : "CLOSED";
    db.ref("store_status").set(newStatus).then(() => {
      Swal.fire("Store Status", `Status toko berhasil diubah ke: ${newStatus}`, "success");
    });
  });
}

// 4. Banner Management
let bannerInterval;
function listenBanners() {
  db.ref("banners").on("value", snap => {
    const container = document.getElementById("slider-container");
    const adminTable = document.getElementById("admin-banner-table");
    container.innerHTML = "";
    adminTable.innerHTML = "";

    allBanners = [];
    snap.forEach(child => {
      allBanners.push({ id: child.key, ...child.val() });
    });

    if (allBanners.length === 0) {
      container.innerHTML = `<div class="slide active"><img src="https://via.placeholder.com/800x200?text=STORE+LOGISTIK+%26+PERLENGKAPAN" alt="Default"></div>`;
    } else {
      allBanners.filter(b => b.active).forEach((b, idx) => {
        container.innerHTML += `
          <div class="slide ${idx === 0 ? 'active' : ''}">
            <img src="${b.url}" alt="${b.title}">
          </div>
        `;
      });
      startBannerRotation();
    }

    // Render Admin Table Banner
    allBanners.forEach(b => {
      adminTable.innerHTML += `
        <tr>
          <td><img src="${b.url}" width="60" height="35" style="object-fit:cover; border-radius:4px;"></td>
          <td><strong>${b.title}</strong></td>
          <td><span class="badge" style="background:${b.active ? '#10b981':'#64748b'}">${b.active ? 'Aktif' : 'Nonaktif'}</span></td>
          <td>
            <button onclick="editBanner('${b.id}')" class="btn-sm">Edit</button>
            <button onclick="toggleBanner('${b.id}', ${!b.active})" class="btn-sm">${b.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            <button onclick="deleteBanner('${b.id}')" class="btn-danger">Hapus</button>
          </td>
        </tr>
      `;
    });
  });

  document.getElementById("btn-add-banner").addEventListener("click", () => {
    if (allBanners.length >= 15) {
      return Swal.fire("Batas Maksimal", "Maksimal hanya 15 Banner yang diperbolehkan!", "warning");
    }
    showBannerModal();
  });
}

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

function showBannerModal(bannerId = null) {
  const b = bannerId ? allBanners.find(x => x.id === bannerId) : {};
  Swal.fire({
    title: bannerId ? 'Edit Banner' : 'Tambah Banner',
    html: `
      <input type="text" id="b-title" class="swal2-input" placeholder="Judul Banner" value="${b.title || ''}">
      <input type="text" id="b-url" class="swal2-input" placeholder="URL Gambar Banner" value="${b.url || ''}">
    `,
    showCancelButton: true,
    confirmButtonText: 'Simpan Banner'
  }).then(r => {
    if (r.isConfirmed) {
      const title = document.getElementById('b-title').value.trim();
      const url = document.getElementById('b-url').value.trim();
      if (!title || !url) {
        return Swal.fire("Gagal", "Semua field banner harus diisi!", "error");
      }

      if (bannerId) {
        db.ref(`banners/${bannerId}`).update({ title, url }).then(() => {
          Swal.fire("Berhasil", "Banner berhasil diperbarui", "success");
        });
      } else {
        db.ref("banners").push({ title, url, active: true }).then(() => {
          Swal.fire("Berhasil", "Banner baru berhasil ditambahkan", "success");
        });
      }
    }
  });
}

function editBanner(id) { showBannerModal(id); }
function toggleBanner(id, status) {
  db.ref(`banners/${id}/active`).set(status).then(() => {
    Swal.fire("Status Banner", "Status aktif banner diperbarui", "success");
  });
}
function deleteBanner(id) {
  Swal.fire({
    title: 'Hapus Banner?',
    text: 'Banner akan dihapus secara permanen.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Ya, Hapus'
  }).then(r => {
    if (r.isConfirmed) {
      db.ref(`banners/${id}`).remove().then(() => {
        Swal.fire("Berhasil", "Banner telah dihapus", "success");
      });
    }
  });
}

// 5. Products System & Management
function listenProducts() {
  db.ref("products").on("value", snap => {
    allProducts = [];
    snap.forEach(child => {
      allProducts.push({ id: child.key, ...child.val() });
    });
    renderProducts();
    renderAdminProducts();
  });

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
  if (!grid || !communityGrid) return;

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
          <div class="product-desc">${p.desc || 'Tidak ada deskripsi'}</div>
          <div class="product-price">${isCommunity ? p.price + ' Point' : 'Rp' + Number(p.price).toLocaleString()}</div>
          <div class="product-seller">Seller: ${p.seller || 'Admin'} | Stock: ${p.stock}</div>
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

  const totalElem = document.getElementById("dash-total-products");
  if (totalElem) totalElem.innerText = allProducts.length;
}

function renderAdminProducts() {
  const tbody = document.getElementById("admin-product-table");
  if (!tbody) return;
  tbody.innerHTML = "";

  allProducts.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td><img src="${p.imageUrl || 'https://via.placeholder.com/50'}" width="40" height="40" style="object-fit:cover; border-radius:4px;"></td>
        <td>
          <strong>${p.name}</strong><br>
          <small class="text-muted">${p.desc || '-'}</small>
        </td>
        <td>${p.communityOnly ? p.price + ' Point' : 'Rp' + Number(p.price).toLocaleString()}</td>
        <td><span class="badge">${p.category}</span></td>
        <td>${p.stock}</td>
        <td>${p.seller || 'Admin'}</td>
        <td>${p.payment || (p.communityOnly ? 'Point Only' : 'GoPay')}</td>
        <td>
          <button onclick="editProduct('${p.id}')" class="btn-sm">Edit</button>
          <button onclick="deleteProduct('${p.id}')" class="btn-danger">Hapus</button>
        </td>
      </tr>
    `;
  });
}

function showProductModal(productId = null) {
  const p = productId ? allProducts.find(x => x.id === productId) : {};
  Swal.fire({
    title: productId ? 'Edit Produk' : 'Tambah Produk Baru',
    html: `
      <input type="text" id="p-name" class="swal2-input" placeholder="Nama Produk" value="${p.name || ''}">
      <input type="text" id="p-desc" class="swal2-input" placeholder="Deskripsi Singkat" value="${p.desc || ''}">
      <input type="number" id="p-price" class="swal2-input" placeholder="Harga / Point" value="${p.price || ''}">
      <input type="text" id="p-image" class="swal2-input" placeholder="URL Foto Produk" value="${p.imageUrl || ''}">
      <select id="p-category" class="swal2-input">
        <option value="Asset" ${p.category==='Asset'?'selected':''}>Asset</option>
        <option value="Baju" ${p.category==='Baju'?'selected':''}>Baju</option>
        <option value="Perlengkapan" ${p.category==='Perlengkapan'?'selected':''}>Perlengkapan</option>
        <option value="Community Only" ${p.category==='Community Only'?'selected':''}>Community Only</option>
      </select>
      <input type="number" id="p-stock" class="swal2-input" placeholder="Jumlah Stock" value="${p.stock || 10}">
      <input type="text" id="p-seller" class="swal2-input" placeholder="Nama Seller" value="${p.seller || currentUser.name}">
      <select id="p-payment" class="swal2-input">
        <option value="GoPay" ${p.payment==='GoPay'?'selected':''}>GoPay</option>
        <option value="Point / Coin" ${p.payment==='Point / Coin'?'selected':''}>Point / Coin</option>
      </select>
      <div style="margin-top:12px; text-align:left; font-size:14px;">
        <label><input type="checkbox" id="p-community" ${p.communityOnly ? 'checked':''}> Set sebagai <strong>Community Only</strong> (Khusus Point)</label>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Simpan Produk'
  }).then(r => {
    if (r.isConfirmed) {
      const name = document.getElementById('p-name').value.trim();
      const desc = document.getElementById('p-desc').value.trim();
      const price = Number(document.getElementById('p-price').value);
      const imageUrl = document.getElementById('p-image').value.trim();
      const category = document.getElementById('p-category').value;
      const stock = Number(document.getElementById('p-stock').value);
      const seller = document.getElementById('p-seller').value.trim();
      const payment = document.getElementById('p-payment').value;
      const communityOnly = document.getElementById('p-community').checked;

      if (!name || isNaN(price) || !imageUrl) {
        return Swal.fire("Gagal", "Nama, Harga, dan URL Foto wajib diisi!", "error");
      }

      const productData = {
        name,
        desc,
        price,
        imageUrl,
        category,
        stock,
        seller: seller || "Admin",
        payment: communityOnly ? "Point / Coin" : payment,
        communityOnly,
        status: "ACTIVE"
      };

      if (productId) {
        db.ref(`products/${productId}`).update(productData).then(() => {
          Swal.fire('Berhasil', 'Data produk diperbarui', 'success');
        });
      } else {
        db.ref("products").push(productData).then(() => {
          Swal.fire('Berhasil', 'Produk baru ditambahkan', 'success');
        });
      }
    }
  });
}

function editProduct(id) { showProductModal(id); }
function deleteProduct(id) {
  Swal.fire({
    title: 'Hapus Produk?',
    text: 'Produk akan dihapus dari store.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Ya, Hapus'
  }).then(r => {
    if (r.isConfirmed) {
      db.ref(`products/${id}`).remove().then(() => {
        Swal.fire("Terhapus", "Produk berhasil dihapus", "success");
      });
    }
  });
}

// 6. Transaction & Orders System
function buyProduct(productId) {
  if (storeClosed) {
    return Swal.fire("STORE CLOSED", "Toko sedang ditutup oleh Owner.", "error");
  }

  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const isCommunity = p.communityOnly || p.category === "Community Only";

  if (isCommunity) {
    // Pengurangan Point dengan Firebase Transaction
    const userRef = db.ref(`users/${currentUser.id}/points`);
    userRef.transaction(currentPoints => {
      if ((currentPoints || 0) >= p.price) {
        return currentPoints - p.price;
      } else {
        return; // Transaksi Batal
      }
    }, (error, committed) => {
      if (error) {
        Swal.fire("Error", "Gagal memproses transaksi", "error");
      } else if (!committed) {
        Swal.fire("Point Tidak Cukup", `Point kamu (${currentUser.points}) tidak cukup untuk membeli produk ini (${p.price} Point).`, "error");
      } else {
        createOrder(p, "Point / Coin", "PAID");
      }
    });
  } else {
    // Pembayaran Non-Point (GoPay)
    Swal.fire({
      title: 'Konfirmasi Pembelian',
      html: `
        <p><strong>${p.name}</strong></p>
        <p>Total Harga: <strong>Rp${p.price.toLocaleString()}</strong></p>
        <p style="margin-top:10px;">Metode Pembayaran:</p>
        <select id="swal-payment-method" class="swal2-input">
          <option value="GoPay">GoPay (085175218022)</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Buat Pesanan'
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
    // Buat Ticket Chat Otomatis
    db.ref(`tickets/${orderId}`).set({
      orderId: orderId,
      userId: currentUser.id,
      userName: currentUser.name,
      lastUpdate: Date.now()
    });

    // Pengurangan stok
    db.ref(`products/${product.id}/stock`).set(Math.max(0, product.stock - 1));

    if (paymentMethod === "GoPay") {
      Swal.fire({
        title: 'Pesanan Dibuat',
        html: `
          <p>Transfer <strong>Rp${product.price.toLocaleString()}</strong> ke GoPay:</p>
          <h2 style="color:#06b6d4; margin:10px 0;">085175218022</h2>
          <p>Order ID: <strong>${orderId}</strong></p>
          <small style="color:#64748b;">Harap bayar dalam 24 Jam. Konfirmasi pembayaran dapat dikirim via Ticket Chat.</small>
        `,
        icon: 'info'
      });
    } else {
      Swal.fire("Pembelian Berhasil", "Pembayaran via Point Berhasil!", "success");
    }
  });
}

// 7. Orders & Admin Status Verifier
function listenOrders() {
  db.ref("orders").on("value", snap => {
    const list = document.getElementById("orders-list");
    const adminTable = document.getElementById("admin-order-table");
    if (list) list.innerHTML = "";
    if (adminTable) adminTable.innerHTML = "";

    let total = 0;
    let pending = 0;

    snap.forEach(child => {
      const o = child.val();
      total++;

      // Otomatis EXPIRED jika lewat 24 Jam
      if (o.status === "WAITING_PAYMENT" && Date.now() > o.expireAt) {
        db.ref(`orders/${o.orderId}/status`).set("EXPIRED");
        o.status = "EXPIRED";
      }

      if (o.status === "PENDING" || o.status === "WAITING_PAYMENT") pending++;

      // Tampilan Pesanan User
      if (list && o.userId === currentUser.id) {
        const timeLeft = Math.max(0, Math.floor((o.expireAt - Date.now()) / 1000));
        const hours = Math.floor(timeLeft / 3600);
        const mins = Math.floor((timeLeft % 3600) / 60);

        list.innerHTML += `
          <div class="order-card">
            <div class="order-info">
              <h4>${o.orderId} - ${o.productName}</h4>
              <p>Harga: ${typeof o.price === 'number' ? 'Rp'+o.price.toLocaleString() : o.price + ' Point'} | Payment: ${o.paymentMethod}</p>
              ${o.status === 'WAITING_PAYMENT' ? `<p style="color:#eab308; font-weight:bold; font-size:12px;">Sisa Waktu: ${hours}j ${mins}m</p>` : ''}
            </div>
            <div>
              <span class="status-badge status-${o.status}">${o.status}</span>
              <button onclick="openTicketModal('${o.orderId}')" class="btn-primary btn-sm mt-2"><i class="fa-solid fa-comments"></i> Chat Ticket</button>
            </div>
          </div>
        `;
      }

      // Tampilan Tabel Admin
      if (adminTable) {
        adminTable.innerHTML += `
          <tr>
            <td><strong>${o.orderId}</strong></td>
            <td>${o.userName}</td>
            <td>${o.productName}</td>
            <td>${typeof o.price === 'number' ? 'Rp'+o.price.toLocaleString() : o.price}</td>
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
                <option value="EXPIRED" ${o.status==='EXPIRED'?'selected':''}>EXPIRED</option>
              </select>
            </td>
          </tr>
        `;
      }
    });

    const totElem = document.getElementById("dash-total-orders");
    const pendElem = document.getElementById("dash-pending-orders");
    if (totElem) totElem.innerText = total;
    if (pendElem) pendElem.innerText = pending;
  });
}

function updateOrderStatus(orderId, status) {
  db.ref(`orders/${orderId}/status`).set(status).then(() => {
    Swal.fire("Status Updated", `Status order ${orderId} diubah menjadi ${status}`, "success");
  });
}

// 8. Ticket Realtime Support System
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
    if (!box) return;
    box.innerHTML = "";
    snap.forEach(child => {
      const msg = child.val();
      const isAdminRole = msg.role === 'ADMIN' || msg.role === 'OWNER';
      box.innerHTML += `
        <div class="chat-msg ${isAdminRole ? 'admin' : 'user'}">
          <strong>${msg.sender}:</strong> ${msg.text}
        </div>
      `;
    });
    box.scrollTop = box.scrollHeight;
  });
}

function listenAdminTickets() {
  db.ref("tickets").on("value", snap => {
    const list = document.getElementById("ticket-list-admin");
    if (!list) return;
    list.innerHTML = "";
    snap.forEach(child => {
      const t = child.val();
      list.innerHTML += `
        <div class="ticket-item ${currentActiveTicket === t.orderId ? 'active' : ''}" onclick="loadAdminChat('${t.orderId}')">
          <strong>${t.orderId}</strong>
          <p style="font-size:12px; color:#64748b;">User: ${t.userName}</p>
        </div>
      `;
    });
  });
}

function loadAdminChat(orderId) {
  currentActiveTicket = orderId;
  listenAdminTickets();
  const chatArea = document.getElementById("admin-chat-area");
  chatArea.innerHTML = `
    <h4 style="margin-bottom:10px;">Ticket Chat #${orderId}</h4>
    <div class="chat-box" id="admin-chat-messages"></div>
    <div class="chat-input-group">
      <input type="text" id="admin-chat-input" placeholder="Tulis pesan admin...">
      <button onclick="sendAdminChat()" class="btn-primary"><i class="fa-solid fa-paper-plane"></i> Kirim</button>
    </div>
  `;
  listenTicketMessages(orderId, "admin-chat-messages");
}

function sendAdminChat() {
  const input = document.getElementById("admin-chat-input");
  if (input && input.value.trim() && currentActiveTicket) {
    db.ref(`tickets/${currentActiveTicket}/messages`).push({
      sender: "Admin (" + currentUser.name + ")",
      role: "ADMIN",
      text: input.value.trim(),
      timestamp: Date.now()
    });
    input.value = "";
  }
}

// 9. Admin Navigation Tabs & Admin Management (Owner)
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

  // Owner: Tambah Admin Baru
  document.getElementById("btn-create-admin").addEventListener("click", () => {
    if (currentUser.role !== "OWNER") {
      return Swal.fire("Akses Ditolak", "Hanya OWNER yang dapat menambah Admin baru", "error");
    }
    const user = document.getElementById("new-admin-username").value.trim();
    const pass = document.getElementById("new-admin-password").value.trim();
    if (user && pass) {
      db.ref("admins").push({ username: user, password: pass, role: "ADMIN" }).then(() => {
        Swal.fire("Berhasil", `Admin ${user} berhasil ditambahkan`, "success");
        document.getElementById("new-admin-username").value = "";
        document.getElementById("new-admin-password").value = "";
      });
    } else {
      Swal.fire("Lengkapi Form", "Username dan Password wajib diisi!", "warning");
    }
  });
}

function listenAdminsList() {
  db.ref("admins").on("value", snap => {
    const tbody = document.getElementById("admin-users-table");
    if (!tbody) return;
    tbody.innerHTML = "";
    snap.forEach(child => {
      const a = child.val();
      tbody.innerHTML += `
        <tr>
          <td><strong>${a.username}</strong></td>
          <td><span class="badge">${a.role || 'ADMIN'}</span></td>
          <td>
            <button onclick="deleteAdmin('${child.key}')" class="btn-danger">Hapus Admin</button>
          </td>
        </tr>
      `;
    });
  });
}

function deleteAdmin(key) {
  if (currentUser.role !== "OWNER") return;
  Swal.fire({
    title: 'Hapus Akses Admin?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Ya, Hapus'
  }).then(r => {
    if (r.isConfirmed) {
      db.ref(`admins/${key}`).remove().then(() => {
        Swal.fire("Terhapus", "Akses admin berhasil dicabut", "success");
      });
    }
  });
}
// Admin Panel JavaScript

// Configuration - Updated for Remote Server
const API_BASE = 'http://213.142.159.135:3000/api';
// Güvenlik: Hardcoded admin anahtarı kaldırıldı. Geçici olarak localStorage üzerinden okunur.
const ADMIN_KEY = (function() {
    try {
        return localStorage.getItem('ADMIN_KEY') || '';
    } catch (_) {
        return '';
    }
})();

// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const pageTitle = document.getElementById('pageTitle');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    checkBackendConnection();
    showSection('dashboard');
}

// Backend connection check
async function checkBackendConnection() {
    console.log('🔍 Backend bağlantısı kontrol ediliyor...');
    
    try {
        showLoading(true);
        
        // Try health check endpoint first
        const healthResponse = await fetch(`${API_BASE}/health`);
        
        if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            console.log('✅ Backend sağlıklı:', healthData);
            showNotification('Backend bağlantısı başarılı!', 'success');
            
            // Load dashboard data after successful connection
            loadDashboardData();
        } else {
            throw new Error(`Health check failed: ${healthResponse.status}`);
        }
        
    } catch (error) {
        console.error('❌ Backend bağlantı hatası:', error);
        
        showConnectionError();
        
        // Try to load dashboard data anyway (maybe health endpoint doesn't exist)
        console.log('🔄 Health check başarısız, dashboard verilerini yüklemeye çalışıyor...');
        loadDashboardData();
    } finally {
        showLoading(false);
    }
}

function showConnectionError() {
    const errorHtml = `
        <div class="connection-error">
            <div class="error-icon">⚠️</div>
            <h3>Uzak Sunucu Bağlantı Sorunu</h3>
            <p>Admin paneli uzak sunucuya bağlanamıyor.</p>
            <div class="error-details">
                <p><strong>Kontrol edilecekler:</strong></p>
                <ul>
                    <li>Uzak sunucu çalışıyor mu? (213.142.159.135:3000)</li>
                    <li>URL doğru mu: <code>${API_BASE}</code></li>
                    <li>CORS ayarları yapıldı mı?</li>
                    <li>İnternet bağlantısı var mı?</li>
                    <li>Firewall engellemesi var mı?</li>
                </ul>
                <div class="connection-info">
                    <p><strong>Bağlantı Bilgileri:</strong></p>
                    <p>🌐 Uzak Sunucu: 213.142.159.135:3000</p>
                    <p>🔧 Admin Panel: localhost:8080</p>
                    <p>📡 API Endpoint: ${API_BASE}</p>
                </div>
            </div>
            <div class="error-actions">
                <button onclick="checkBackendConnection()" class="btn-primary">
                    <i class="fas fa-sync"></i> Tekrar Dene
                </button>
                <button onclick="testConnection()" class="btn-secondary">
                    <i class="fas fa-network-wired"></i> Bağlantı Testi
                </button>
                <button onclick="openBackendInstructions()" class="btn-secondary">
                    <i class="fas fa-question-circle"></i> Yardım
                </button>
            </div>
        </div>
    `;
    
    // Show error in dashboard
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        dashboardSection.innerHTML = errorHtml;
    }
}

// Bağlantı testi fonksiyonu
async function testConnection() {
    showLoading(true);
    showNotification('Bağlantı testi yapılıyor...', 'info');
    
    try {
        // Ping testi
        const pingStart = Date.now();
        const pingResponse = await fetch(`${API_BASE}/health`, {
            method: 'GET',
            mode: 'cors'
        });
        const pingTime = Date.now() - pingStart;
        
        if (pingResponse.ok) {
            const healthData = await pingResponse.json();
            showNotification(`✅ Bağlantı başarılı! Ping: ${pingTime}ms`, 'success');
            console.log('Health check data:', healthData);
        } else {
            throw new Error(`HTTP ${pingResponse.status}: ${pingResponse.statusText}`);
        }
    } catch (error) {
        console.error('Connection test failed:', error);
        showNotification(`❌ Bağlantı başarısız: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

function openBackendInstructions() {
    const instructions = `
Uzak Sunucu Bağlantı Sorunları:

1. Uzak Sunucu Kontrolü:
   - IP: 213.142.159.135
   - Port: 3000
   - URL: http://213.142.159.135:3000/api

2. CORS Ayarları:
   - Uzak sunucuda CORS tüm origin'lere açık olmalı
   - origin: true ayarı yapılmış olmalı

3. Firewall Kontrolü:
   - Port 3000'in açık olduğundan emin olun
   - İnternet bağlantınızı kontrol edin

4. Test Komutları:
   - curl http://213.142.159.135:3000/api/health
   - ping 213.142.159.135

5. Admin Panel:
   - localhost:8080'de çalışıyor
   - Uzak sunucuya API istekleri gönderiyor
    `;
    
    alert(instructions);
}

function setupEventListeners() {
    // Sidebar toggle
    sidebarToggle.addEventListener('click', toggleSidebar);
    
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);
            setActiveNavItem(this);
        });
    });
    
    // Responsive sidebar
    if (window.innerWidth <= 768) {
        sidebar.classList.add('collapsed');
    }
    
    window.addEventListener('resize', function() {
        if (window.innerWidth <= 768) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    });
}

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
}

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show selected section
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
    
    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'users': 'Kullanıcı Yönetimi',
        'orders': 'Sipariş Yönetimi',
        'products': 'Ürün Yönetimi',
        'campaigns': 'Kampanya Yönetimi',
        'segments': 'Müşteri Segmentleri',
        'analytics': 'Analitik ve Raporlar',
        'tenants': 'Tenant Yönetimi',
        'settings': 'Ayarlar'
    };
    
    pageTitle.textContent = titles[sectionName] || 'Dashboard';
    
    // Load section data
    loadSectionData(sectionName);
}

function setActiveNavItem(activeItem) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    activeItem.classList.add('active');
}

function showLoading(show = true) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    console.log(`🔄 API Request: ${endpoint}`);
    
    try {
        const url = `${API_BASE}${endpoint}`;
        console.log(`📡 Requesting: ${url}`);
        
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': ADMIN_KEY,
                ...options.headers
            }
        });
        
        console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (jsonError) {
                console.warn('Could not parse error response as JSON:', jsonError);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log(`✅ API Success: ${endpoint}`, data);
        return data;
        
    } catch (error) {
        console.error(`❌ API Error for ${endpoint}:`, error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            const connectionError = `Backend sunucusuna bağlanılamıyor. Sunucu çalışıyor mu?\n\nKontrol edin:\n1. Backend sunucusu port 3000'de çalışıyor mu?\n2. URL doğru mu: ${API_BASE}\n3. CORS ayarları yapıldı mı?`;
            showNotification(connectionError, 'error');
            console.error('🔍 Connection troubleshooting:', {
                apiBase: API_BASE,
                endpoint: endpoint,
                fullUrl: `${API_BASE}${endpoint}`,
                error: error.message
            });
        } else {
            showNotification('API Hatası: ' + error.message, 'error');
        }
        
        throw error;
    }
}

// Dashboard Functions
async function loadDashboardData() {
    try {
        showLoading(true);
        
        // Load stats and charts data in parallel
        const [statsData, chartsData] = await Promise.all([
            apiRequest('/admin/stats'),
            apiRequest('/admin/charts')
        ]);
        
        if (statsData.success) {
            updateDashboardStats(statsData.data);
        }
        
        if (chartsData.success) {
            initializeCharts(chartsData.data);
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Dashboard verileri yüklenirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

function updateDashboardStats(stats) {
    console.log('📊 Updating dashboard stats:', stats);
    
    try {
        document.getElementById('totalUsers').textContent = safeString(stats.users, '0');
        document.getElementById('totalProducts').textContent = safeString(stats.products, '0');
        document.getElementById('totalOrders').textContent = safeString(stats.orders, '0');
        document.getElementById('monthlyRevenue').textContent = `${formatCurrency(stats.monthlyRevenue)} ₺`;
        
        console.log('✅ Dashboard stats updated successfully');
    } catch (error) {
        console.error('❌ Error updating dashboard stats:', error);
        showNotification('Dashboard güncellenirken hata oluştu', 'error');
    }
}

// Chart variables to store chart instances
let salesChart, ordersChart, revenueChart, productsChart;

function initializeCharts(data) {
    console.log('📈 Initializing charts with data:', data);
    
    try {
        // Destroy existing charts if they exist
        if (salesChart) salesChart.destroy();
        if (ordersChart) ordersChart.destroy();
        if (revenueChart) revenueChart.destroy();
        if (productsChart) productsChart.destroy();
        
        // Initialize all charts
        createSalesChart(data.dailySales);
        createOrdersChart(data.orderStatuses);
        createRevenueChart(data.monthlyRevenue);
        createProductsChart(data.topProducts);
        
        console.log('✅ All charts initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing charts:', error);
        showNotification('Grafikler yüklenirken hata oluştu', 'error');
    }
}

function createSalesChart(dailySales) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    
    // Generate last 7 days labels
    const labels = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }));
    }
    
    // Map data to labels
    const salesData = labels.map(label => {
        const found = dailySales.find(sale => {
            const saleDate = new Date(sale.date);
            const labelDate = saleDate.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
            return labelDate === label;
        });
        return found ? found.revenue : 0;
    });
    
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Günlük Satış (₺)',
                data: salesData,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + ' ₺';
                        }
                    }
                }
            }
        }
    });
}

function createOrdersChart(orderStatuses) {
    const ctx = document.getElementById('ordersChart').getContext('2d');
    
    const statusColors = {
        'pending': '#ffc107',
        'processing': '#17a2b8',
        'shipped': '#6c757d',
        'delivered': '#28a745',
        'cancelled': '#dc3545'
    };
    
    const statusLabels = {
        'pending': 'Beklemede',
        'processing': 'İşleniyor',
        'shipped': 'Kargoda',
        'delivered': 'Teslim Edildi',
        'cancelled': 'İptal'
    };
    
    const labels = orderStatuses.map(status => statusLabels[status.status] || status.status);
    const data = orderStatuses.map(status => status.count);
    const colors = orderStatuses.map(status => statusColors[status.status] || '#6c757d');
    
    ordersChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

function createRevenueChart(monthlyRevenue) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    
    const labels = monthlyRevenue.map(item => {
        const [year, month] = item.month.split('-');
        return new Date(year, month - 1).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });
    });
    
    const data = monthlyRevenue.map(item => item.revenue);
    
    revenueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Aylık Gelir (₺)',
                data: data,
                backgroundColor: 'rgba(40, 167, 69, 0.8)',
                borderColor: '#28a745',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('tr-TR') + ' ₺';
                        }
                    }
                }
            }
        }
    });
}

function createProductsChart(topProducts) {
    const ctx = document.getElementById('productsChart').getContext('2d');
    
    const labels = topProducts.map(product => {
        // Truncate long product names
        return product.name.length > 20 ? product.name.substring(0, 20) + '...' : product.name;
    });
    
    const data = topProducts.map(product => product.totalSold);
    
    const colors = [
        '#667eea',
        '#764ba2',
        '#f093fb',
        '#f5576c',
        '#4facfe'
    ];
    
    productsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Satış Adedi',
                data: data,
                backgroundColor: colors.slice(0, data.length),
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

// Users Functions
async function loadUsers() {
    try {
        showLoading(true);
        const usersData = await apiRequest('/admin/users');
        
        if (usersData.success) {
            updateUsersTable(usersData.data);
        }
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersTableBody').innerHTML = `
            <tr><td colspan="6" class="loading">Kullanıcılar yüklenirken hata oluştu</td></tr>
        `;
    } finally {
        showLoading(false);
    }
}

function updateUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Kullanıcı bulunamadı</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${safeString(user.id)}</td>
            <td>${safeString(user.name)}</td>
            <td>${safeString(user.email)}</td>
            <td>${safeString(user.phone)}</td>
            <td>${safeString(user.tenantName)}</td>
            <td>${formatDate(user.createdAt)}</td>
        </tr>
    `).join('');
}

// Orders Functions
async function loadOrders() {
    try {
        showLoading(true);
        const ordersData = await apiRequest('/admin/orders');
        
        if (ordersData.success) {
            updateOrdersTable(ordersData.data);
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        document.getElementById('ordersTableBody').innerHTML = `
            <tr><td colspan="6" class="loading">Siparişler yüklenirken hata oluştu</td></tr>
        `;
    } finally {
        showLoading(false);
    }
}

function updateOrdersTable(orders) {
    console.log('📦 Updating orders table:', orders);
    
    const tbody = document.getElementById('ordersTableBody');
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Sipariş bulunamadı</td></tr>';
        return;
    }
    
    try {
        tbody.innerHTML = orders.map((order, index) => {
            console.log(`📋 Processing order ${index + 1}:`, order);
            
            // Format product items
            let productsHtml = '';
            if (order.items && order.items.length > 0) {
                productsHtml = order.items.map(item => `
                    <div class="order-item">
                        <span class="product-name">${safeString(item.productName)}</span>
                        <span class="product-quantity">x${safeString(item.quantity)}</span>
                        <span class="product-price">${formatCurrency(item.price)} ₺</span>
                    </div>
                `).join('');
            } else {
                productsHtml = '<span class="no-items">Ürün bilgisi yok</span>';
            }
            
            return `
            <tr>
                <td>${safeString(order.id)}</td>
                <td>
                    <div class="customer-info">
                        <strong>${safeString(order.userName)}</strong>
                        <small>${safeString(order.userEmail, '')}</small>
                    </div>
                </td>
                <td>
                    <div class="order-products">
                        ${productsHtml}
                        ${order.items && order.items.length > 1 ? `<small class="item-count">${order.items.length} ürün</small>` : ''}
                    </div>
                </td>
                <td class="order-total">${formatCurrency(order.totalAmount)} ₺</td>
                <td><span class="status-badge ${safeString(order.status, 'pending')}">${getStatusText(order.status)}</span></td>
                <td>${formatDate(order.createdAt)}</td>
                <td>
                    <div class="order-actions">
                        <button onclick="showOrderDetails(${order.id})" class="btn-secondary" style="margin-bottom: 5px;">
                            <i class="fas fa-eye"></i> Detay
                        </button>
                        <select onchange="updateOrderStatus(${order.id}, this.value)" class="btn-secondary order-status-select">
                            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Beklemede</option>
                            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>İşleniyor</option>
                            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Kargoda</option>
                            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Teslim Edildi</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>İptal</option>
                        </select>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
        
        console.log('✅ Orders table updated successfully');
    } catch (error) {
        console.error('❌ Error updating orders table:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Tablo güncellenirken hata oluştu</td></tr>';
        showNotification('Sipariş tablosu güncellenirken hata oluştu', 'error');
    }
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        showLoading(true);
        await apiRequest(`/admin/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        
        showNotification('Sipariş durumu güncellendi', 'success');
        loadOrders(); // Refresh the table
    } catch (error) {
        console.error('Error updating order status:', error);
        showNotification('Sipariş durumu güncellenirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Tenants Functions
async function loadTenants() {
    try {
        showLoading(true);
        const tenantsData = await apiRequest('/tenants');
        
        if (tenantsData.success) {
            updateTenantsTable(tenantsData.data);
        }
    } catch (error) {
        console.error('Error loading tenants:', error);
        document.getElementById('tenantsTableBody').innerHTML = `
            <tr><td colspan="6" class="loading">Tenants yüklenirken hata oluştu</td></tr>
        `;
    } finally {
        showLoading(false);
    }
}

function updateTenantsTable(tenants) {
    const tbody = document.getElementById('tenantsTableBody');
    
    if (!tenants || tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Tenant bulunamadı</td></tr>';
        return;
    }
    
    tbody.innerHTML = tenants.map(tenant => `
        <tr>
            <td>${safeString(tenant.id)}</td>
            <td>${safeString(tenant.name)}</td>
            <td>${safeString(tenant.domain)}</td>
            <td>${safeString(tenant.subdomain)}</td>
            <td><span class="status-badge ${tenant.isActive ? 'online' : 'cancelled'}">${tenant.isActive ? 'Aktif' : 'Pasif'}</span></td>
            <td>${formatDate(tenant.createdAt)}</td>
        </tr>
    `).join('');
}

// Product Sync Function
async function triggerProductSync() {
    try {
        showLoading(true);
        await apiRequest('/sync/products', { method: 'POST' });
        showNotification('Ürün senkronizasyonu başlatıldı', 'success');
    } catch (error) {
        console.error('Error triggering product sync:', error);
        showNotification('Ürün senkronizasyonu başlatılırken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Section Data Loading
function loadSectionData(sectionName) {
    switch(sectionName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'users':
            loadUsers();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'products':
            loadProducts();
            break;
        case 'campaigns':
            loadCampaigns();
            break;
        case 'segments':
            loadSegments();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'tenants':
            loadTenants();
            break;
        default:
            break;
    }
}

// Products Functions
async function loadProducts() {
    try {
        showLoading(true);
        const productsData = await apiRequest('/admin/products');
        
        if (productsData.success) {
            updateProductsTable(productsData.data);
            updateProductStats(productsData.data);
        }
    } catch (error) {
        console.error('Error loading products:', error);
        document.getElementById('productsTableBody').innerHTML = `
            <tr><td colspan="8" class="loading">Ürünler yüklenirken hata oluştu</td></tr>
        `;
    } finally {
        showLoading(false);
    }
}

function updateProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');
    
    if (!products || products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Ürün bulunamadı</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td>${safeString(product.id)}</td>
            <td>
                <div class="product-info">
                    <strong>${safeString(product.name)}</strong>
                    ${product.brand ? `<small>${safeString(product.brand)}</small>` : ''}
                </div>
            </td>
            <td>${safeString(product.category)}</td>
            <td class="product-price">${formatCurrency(product.price)} ₺</td>
            <td>
                <span class="stock-status ${getStockStatus(product.stock)}">${safeString(product.stock)}</span>
            </td>
            <td>
                ${product.hasVariations ? 
                    '<span class="variation-indicator"><i class="fas fa-layer-group"></i> Var</span>' : 
                    '<span class="text-muted">-</span>'
                }
            </td>
            <td>${formatDate(product.lastUpdated)}</td>
            <td>
                <div class="product-actions">
                    <button onclick="viewProduct(${product.id})" class="btn-secondary">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="editProduct(${product.id})" class="btn-secondary">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateProductStats(products) {
    const totalProducts = products.length;
    const totalVariations = products.filter(p => p.hasVariations).length;
    const lowStock = products.filter(p => p.stock < 10).length;
    
    document.getElementById('totalProductsCount').textContent = totalProducts;
    document.getElementById('totalVariationsCount').textContent = totalVariations;
    document.getElementById('lowStockCount').textContent = lowStock;
}

function getStockStatus(stock) {
    if (stock === 0) return 'out';
    if (stock < 10) return 'low';
    if (stock < 50) return 'medium';
    return 'high';
}

// Campaigns Functions
async function loadCampaigns() {
    try {
        showLoading(true);
        const campaignsData = await apiRequest('/campaigns');
        
        if (campaignsData.success) {
            updateCampaignsTable(campaignsData.data);
            updateCampaignStats(campaignsData.data);
        }
    } catch (error) {
        console.error('Error loading campaigns:', error);
        document.getElementById('campaignsTableBody').innerHTML = `
            <tr><td colspan="9" class="loading">Kampanyalar yüklenirken hata oluştu</td></tr>
        `;
    } finally {
        showLoading(false);
    }
}

function updateCampaignsTable(campaigns) {
    const tbody = document.getElementById('campaignsTableBody');
    
    if (!campaigns || campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">Kampanya bulunamadı</td></tr>';
        return;
    }
    
    tbody.innerHTML = campaigns.map(campaign => `
        <tr>
            <td>${safeString(campaign.id)}</td>
            <td>
                <div class="campaign-info">
                    <strong>${safeString(campaign.name)}</strong>
                    ${campaign.description ? `<small>${safeString(campaign.description)}</small>` : ''}
                </div>
            </td>
            <td><span class="campaign-type ${campaign.type}">${getCampaignTypeText(campaign.type)}</span></td>
            <td><span class="status-badge ${campaign.status}">${getStatusText(campaign.status)}</span></td>
            <td>${safeString(campaign.segmentName, 'Tüm Müşteriler')}</td>
            <td>${formatDiscount(campaign.discountValue, campaign.discountType)}</td>
            <td>${safeString(campaign.usedCount)}/${safeString(campaign.usageLimit, '∞')}</td>
            <td>${formatDate(campaign.startDate)}</td>
            <td>
                <div class="campaign-actions">
                    <button onclick="viewCampaign(${campaign.id})" class="btn-secondary">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="editCampaign(${campaign.id})" class="btn-secondary">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteCampaign(${campaign.id})" class="btn-secondary">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateCampaignStats(campaigns) {
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const totalUsage = campaigns.reduce((sum, c) => sum + (c.usedCount || 0), 0);
    
    document.getElementById('totalCampaignsCount').textContent = totalCampaigns;
    document.getElementById('activeCampaignsCount').textContent = activeCampaigns;
    document.getElementById('campaignUsageCount').textContent = totalUsage;
}

// Segments Functions
async function loadSegments() {
    try {
        showLoading(true);
        const segmentsData = await apiRequest('/campaigns/segments');
        
        if (segmentsData.success) {
            updateSegmentsTable(segmentsData.data);
            updateSegmentStats(segmentsData.data);
        }
    } catch (error) {
        console.error('Error loading segments:', error);
        document.getElementById('segmentsTableBody').innerHTML = `
            <tr><td colspan="8" class="loading">Segmentler yüklenirken hata oluştu</td></tr>
        `;
    } finally {
        showLoading(false);
    }
}

function updateSegmentsTable(segments) {
    const tbody = document.getElementById('segmentsTableBody');
    
    if (!segments || segments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Segment bulunamadı</td></tr>';
        return;
    }
    
    tbody.innerHTML = segments.map(segment => `
        <tr>
            <td>${safeString(segment.id)}</td>
            <td>
                <div class="segment-info">
                    <strong>${safeString(segment.name)}</strong>
                </div>
            </td>
            <td>${safeString(segment.description, 'Açıklama yok')}</td>
            <td>
                <div class="criteria-preview">
                    ${Object.entries(segment.criteria).map(([key, value]) => 
                        `<span class="criteria-tag">${getCriteriaLabel(key)}: ${value}</span>`
                    ).join('')}
                </div>
            </td>
            <td>${safeString(segment.customerCount, '0')}</td>
            <td><span class="status-badge ${segment.isActive ? 'active' : 'paused'}">${segment.isActive ? 'Aktif' : 'Pasif'}</span></td>
            <td>${formatDate(segment.createdAt)}</td>
            <td>
                <div class="segment-actions">
                    <button onclick="viewSegment(${segment.id})" class="btn-secondary">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="editSegment(${segment.id})" class="btn-secondary">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteSegment(${segment.id})" class="btn-secondary">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateSegmentStats(segments) {
    const totalSegments = segments.length;
    const totalCustomers = segments.reduce((sum, s) => sum + (s.customerCount || 0), 0);
    
    document.getElementById('totalSegmentsCount').textContent = totalSegments;
    document.getElementById('totalCustomersInSegments').textContent = totalCustomers;
}

// Analytics Functions
async function loadAnalytics() {
    try {
        showLoading(true);
        
        // Load analytics data in parallel
        const [segmentData, campaignData, productData] = await Promise.all([
            apiRequest('/campaigns/segments'),
            apiRequest('/campaigns'),
            apiRequest('/admin/products')
        ]);
        
        if (segmentData.success) {
            createSegmentDistributionChart(segmentData.data);
        }
        
        if (campaignData.success) {
            createCampaignPerformanceChart(campaignData.data);
            updateCampaignPerformanceTable(campaignData.data);
        }
        
        if (productData.success) {
            createCategoryDistributionChart(productData.data);
            createStockStatusChart(productData.data);
            updateTopProductsTable(productData.data);
        }
        
    } catch (error) {
        console.error('Error loading analytics:', error);
        showNotification('Analitik veriler yüklenirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Refresh Functions
function refreshUsers() {
    loadUsers();
}

function refreshOrders() {
    loadOrders();
}

function refreshProducts() {
    loadProducts();
}

function refreshCampaigns() {
    loadCampaigns();
}

function refreshSegments() {
    loadSegments();
}

function refreshAnalytics() {
    loadAnalytics();
}

function refreshTenants() {
    loadTenants();
}

function refreshDashboard() {
    loadDashboardData();
}

// Utility Functions
function formatDate(dateString) {
    if (!dateString) return '-';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.warn('Invalid date string:', dateString);
        return '-';
    }
}

function formatCurrency(value, decimals = 2) {
    try {
        const num = parseFloat(value);
        if (isNaN(num)) return '0.00';
        return num.toFixed(decimals);
    } catch (error) {
        console.warn('Invalid currency value:', value);
        return '0.00';
    }
}

function safeString(value, defaultValue = '-') {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    return String(value);
}

function getStatusText(status) {
    const statusTexts = {
        'pending': 'Beklemede',
        'processing': 'İşleniyor',
        'shipped': 'Kargoda',
        'delivered': 'Teslim Edildi',
        'cancelled': 'İptal'
    };
    
    return statusTexts[status] || status;
}

function showNotification(message, type = 'info') {
    // Simple notification system
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    if (type === 'success') {
        notification.style.background = '#28a745';
    } else if (type === 'error') {
        notification.style.background = '#dc3545';
    } else {
        notification.style.background = '#17a2b8';
    }
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Order Details Modal Functions
async function showOrderDetails(orderId) {
    try {
        showLoading(true);
        
        // Get order details
        const orderData = await apiRequest(`/admin/orders/${orderId}`);
        
        if (orderData.success) {
            displayOrderModal(orderData.data);
        }
    } catch (error) {
        console.error('Error loading order details:', error);
        showNotification('Sipariş detayları yüklenirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

function displayOrderModal(order) {
    const modal = document.getElementById('orderModal');
    const modalBody = document.getElementById('orderModalBody');
    
    let productsHtml = '';
    if (order.items && order.items.length > 0) {
        productsHtml = `
            <div class="order-products-detail">
                <h4>Sipariş Edilen Ürünler (${order.items.length} adet)</h4>
                ${order.items.map(item => `
                    <div class="product-detail-item">
                        ${item.productImage ? 
                            `<img src="${item.productImage}" alt="${item.productName}" class="product-image" onerror="this.style.display='none'">` : 
                            '<div class="product-image" style="background: #f0f2f5; display: flex; align-items: center; justify-content: center; color: #999;"><i class="fas fa-image"></i></div>'
                        }
                        <div class="product-detail-info">
                            <div class="product-detail-name">${safeString(item.productName)}</div>
                            <div class="product-detail-meta">
                                <span>Adet: ${safeString(item.quantity)}</span>
                                <span>Birim Fiyat: ${formatCurrency(item.price)} ₺</span>
                                <span>Toplam: ${formatCurrency(parseFloat(item.price) * parseFloat(item.quantity))} ₺</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    modalBody.innerHTML = `
        <div class="order-detail-item">
            <span class="order-detail-label">Sipariş ID:</span>
            <span class="order-detail-value">#${safeString(order.id)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Müşteri:</span>
            <span class="order-detail-value">${safeString(order.userName)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Email:</span>
            <span class="order-detail-value">${safeString(order.userEmail)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Durum:</span>
            <span class="order-detail-value">
                <span class="status-badge ${safeString(order.status, 'pending')}">${getStatusText(order.status)}</span>
            </span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Toplam Tutar:</span>
            <span class="order-detail-value" style="font-weight: 600; color: #28a745; font-size: 16px;">
                ${formatCurrency(order.totalAmount)} ₺
            </span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Ödeme Yöntemi:</span>
            <span class="order-detail-value">${safeString(order.paymentMethod)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Şehir:</span>
            <span class="order-detail-value">${safeString(order.city)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">İlçe:</span>
            <span class="order-detail-value">${safeString(order.district)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Tam Adres:</span>
            <span class="order-detail-value">${safeString(order.fullAddress || order.shippingAddress)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Sipariş Tarihi:</span>
            <span class="order-detail-value">${formatDate(order.createdAt)}</span>
        </div>
        <div class="order-detail-item">
            <span class="order-detail-label">Tenant:</span>
            <span class="order-detail-value">${safeString(order.tenantName)}</span>
        </div>
        ${productsHtml}
    `;
    
    modal.classList.remove('hidden');
}

function closeOrderModal() {
    const modal = document.getElementById('orderModal');
    modal.classList.add('hidden');
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('orderModal');
    if (event.target === modal) {
        closeOrderModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeOrderModal();
    }
});

// Helper Functions
function getCampaignTypeText(type) {
    const typeMap = {
        'discount': 'İndirim',
        'free_shipping': 'Ücretsiz Kargo',
        'bundle': 'Paket Kampanyası',
        'loyalty': 'Sadakat Programı',
        'seasonal': 'Mevsimsel',
        'birthday': 'Doğum Günü',
        'abandoned_cart': 'Terk Edilen Sepet'
    };
    return typeMap[type] || type;
}

function formatDiscount(value, type) {
    if (!value) return '-';
    if (type === 'percentage') return `${value}%`;
    if (type === 'fixed') return `${value} ₺`;
    return value;
}

function getCriteriaLabel(key) {
    const labelMap = {
        'minOrders': 'Min Sipariş',
        'maxOrders': 'Max Sipariş',
        'minSpent': 'Min Harcama',
        'maxSpent': 'Max Harcama',
        'lastOrderDays': 'Son Sipariş',
        'rfmScore': 'RFM Skoru'
    };
    return labelMap[key] || key;
}

// Modal Functions
function openCreateCampaignModal() {
    document.getElementById('createCampaignModal').classList.remove('hidden');
    loadSegmentsForSelect();
}

function openCreateSegmentModal() {
    document.getElementById('createSegmentModal').classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

async function loadSegmentsForSelect() {
    try {
        const segmentsData = await apiRequest('/campaigns/segments');
        const select = document.getElementById('targetSegment');
        
        if (segmentsData.success) {
            select.innerHTML = '<option value="">Tüm Müşteriler</option>';
            segmentsData.data.forEach(segment => {
                const option = document.createElement('option');
                option.value = segment.id;
                option.textContent = segment.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading segments for select:', error);
    }
}

// Chart Functions
function createSegmentDistributionChart(segments) {
    const ctx = document.getElementById('segmentDistributionChart').getContext('2d');
    
    const labels = segments.map(s => s.name);
    const data = segments.map(s => s.customerCount || 0);
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function createCampaignPerformanceChart(campaigns) {
    const ctx = document.getElementById('campaignPerformanceChart').getContext('2d');
    
    const labels = campaigns.map(c => c.name);
    const data = campaigns.map(c => c.usedCount || 0);
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kullanım Sayısı',
                data: data,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function createCategoryDistributionChart(products) {
    const ctx = document.getElementById('categoryDistributionChart').getContext('2d');
    
    const categoryCount = {};
    products.forEach(p => {
        categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
    });
    
    const labels = Object.keys(categoryCount);
    const data = Object.values(categoryCount);
    
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function createStockStatusChart(products) {
    const ctx = document.getElementById('stockStatusChart').getContext('2d');
    
    const stockStatus = {
        'Yüksek': products.filter(p => p.stock >= 50).length,
        'Orta': products.filter(p => p.stock >= 10 && p.stock < 50).length,
        'Düşük': products.filter(p => p.stock > 0 && p.stock < 10).length,
        'Tükendi': products.filter(p => p.stock === 0).length
    };
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(stockStatus),
            datasets: [{
                data: Object.values(stockStatus),
                backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function updateTopProductsTable(products) {
    const tbody = document.getElementById('topProductsTableBody');
    
    // Sort by stock (assuming higher stock = more popular)
    const sortedProducts = products.sort((a, b) => b.stock - a.stock).slice(0, 5);
    
    tbody.innerHTML = sortedProducts.map(product => `
        <tr>
            <td>${safeString(product.name)}</td>
            <td>${safeString(product.stock)}</td>
            <td>${formatCurrency(product.price * product.stock)} ₺</td>
            <td>${safeString(product.category)}</td>
        </tr>
    `).join('');
}

function updateCampaignPerformanceTable(campaigns) {
    const tbody = document.getElementById('campaignPerformanceTableBody');
    
    tbody.innerHTML = campaigns.map(campaign => `
        <tr>
            <td>${safeString(campaign.name)}</td>
            <td>${safeString(campaign.usedCount)}</td>
            <td>${((campaign.usedCount / (campaign.usageLimit || 1)) * 100).toFixed(1)}%</td>
            <td>${formatCurrency(campaign.usedCount * (campaign.discountValue || 0))} ₺</td>
        </tr>
    `).join('');
}

// Placeholder functions for future implementation
function viewProduct(id) {
    console.log('View product:', id);
    showNotification('Ürün detayları yakında eklenecek', 'info');
}

function editProduct(id) {
    console.log('Edit product:', id);
    showNotification('Ürün düzenleme yakında eklenecek', 'info');
}

function viewCampaign(id) {
    console.log('View campaign:', id);
    showNotification('Kampanya detayları yakında eklenecek', 'info');
}

function editCampaign(id) {
    console.log('Edit campaign:', id);
    showNotification('Kampanya düzenleme yakında eklenecek', 'info');
}

function deleteCampaign(id) {
    if (confirm('Bu kampanyayı silmek istediğinizden emin misiniz?')) {
        console.log('Delete campaign:', id);
        showNotification('Kampanya silme yakında eklenecek', 'info');
    }
}

function viewSegment(id) {
    console.log('View segment:', id);
    showNotification('Segment detayları yakında eklenecek', 'info');
}

function editSegment(id) {
    console.log('Edit segment:', id);
    showNotification('Segment düzenleme yakında eklenecek', 'info');
}

function deleteSegment(id) {
    if (confirm('Bu segmenti silmek istediğinizden emin misiniz?')) {
        console.log('Delete segment:', id);
        showNotification('Segment silme yakında eklenecek', 'info');
    }
}

async function createAutomaticSegments() {
    try {
        showLoading(true);
        await apiRequest('/campaigns/segments/auto-create', { method: 'POST' });
        showNotification('Otomatik segmentler oluşturuldu', 'success');
        loadSegments();
    } catch (error) {
        console.error('Error creating automatic segments:', error);
        showNotification('Otomatik segmentler oluşturulurken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Form Handlers
document.addEventListener('DOMContentLoaded', function() {
    // Campaign form handler
    const campaignForm = document.getElementById('createCampaignForm');
    if (campaignForm) {
        campaignForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const campaignData = Object.fromEntries(formData.entries());
            
            try {
                showLoading(true);
                await apiRequest('/campaigns', {
                    method: 'POST',
                    body: JSON.stringify(campaignData)
                });
                
                showNotification('Kampanya başarıyla oluşturuldu', 'success');
                closeModal('createCampaignModal');
                loadCampaigns();
            } catch (error) {
                console.error('Error creating campaign:', error);
                showNotification('Kampanya oluşturulurken hata oluştu', 'error');
            } finally {
                showLoading(false);
            }
        });
    }
    
    // Segment form handler
    const segmentForm = document.getElementById('createSegmentForm');
    if (segmentForm) {
        segmentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const segmentData = {
                name: formData.get('name'),
                description: formData.get('description'),
                criteria: {
                    minOrders: formData.get('minOrders') ? parseInt(formData.get('minOrders')) : undefined,
                    maxOrders: formData.get('maxOrders') ? parseInt(formData.get('maxOrders')) : undefined,
                    minSpent: formData.get('minSpent') ? parseFloat(formData.get('minSpent')) : undefined,
                    maxSpent: formData.get('maxSpent') ? parseFloat(formData.get('maxSpent')) : undefined,
                    lastOrderDays: formData.get('lastOrderDays') ? parseInt(formData.get('lastOrderDays')) : undefined
                }
            };
            
            // Remove undefined values
            Object.keys(segmentData.criteria).forEach(key => {
                if (segmentData.criteria[key] === undefined) {
                    delete segmentData.criteria[key];
                }
            });
            
            try {
                showLoading(true);
                await apiRequest('/campaigns/segments', {
                    method: 'POST',
                    body: JSON.stringify(segmentData)
                });
                
                showNotification('Segment başarıyla oluşturuldu', 'success');
                closeModal('createSegmentModal');
                loadSegments();
            } catch (error) {
                console.error('Error creating segment:', error);
                showNotification('Segment oluşturulurken hata oluştu', 'error');
            } finally {
                showLoading(false);
            }
        });
    }
});

// Export functions for global access
window.refreshUsers = refreshUsers;
window.refreshOrders = refreshOrders;
window.refreshProducts = refreshProducts;
window.refreshCampaigns = refreshCampaigns;
window.refreshSegments = refreshSegments;
window.refreshAnalytics = refreshAnalytics;
window.refreshTenants = refreshTenants;
window.refreshDashboard = refreshDashboard;
window.triggerProductSync = triggerProductSync;
window.updateOrderStatus = updateOrderStatus;
window.checkBackendConnection = checkBackendConnection;
window.testConnection = testConnection;
window.openBackendInstructions = openBackendInstructions;
window.showOrderDetails = showOrderDetails;
window.closeOrderModal = closeOrderModal;
window.openCreateCampaignModal = openCreateCampaignModal;
window.openCreateSegmentModal = openCreateSegmentModal;
window.closeModal = closeModal;
window.createAutomaticSegments = createAutomaticSegments;
window.createWeeklyFlashDeal = async function createWeeklyFlashDeal() {
    try {
        const name = prompt('Kampanya adı (ör: Haftalık Flash İndirim):', 'Haftalık Flash İndirim');
        if (!name) return;
        const discountType = prompt('İndirim türü (percentage|fixed):', 'percentage');
        if (!discountType) return;
        const discountValueStr = prompt(`İndirim değeri (${discountType === 'fixed' ? 'TL' : '%'}):`, discountType === 'fixed' ? '50' : '15');
        if (!discountValueStr) return;
        const discountValue = parseFloat(discountValueStr);
        if (isNaN(discountValue)) return alert('Geçersiz indirim değeri');
        const productIdsStr = prompt('Kapsanacak ürün ID listesi (virgülle ayrılmış, boş bırakılırsa tüm ürünlere uygulanır):', '');
        const minOrderStr = prompt('Minimum sipariş tutarı (opsiyonel):', '0');
        const minOrderAmount = parseFloat(minOrderStr || '0') || 0;

        const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const body = {
            name,
            description: 'Yönetim panelinden oluşturulan 1 haftalık flash indirim',
            type: 'discount',
            status: 'active',
            discountType,
            discountValue,
            minOrderAmount,
            applicableProducts: productIdsStr ? productIdsStr.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x)) : null,
            startDate: new Date().toISOString(),
            endDate,
            isActive: true
        };

        showLoading(true);
        const res = await apiRequest('/campaigns', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (res && res.success) {
            showNotification('Haftalık flash indirim oluşturuldu', 'success');
            refreshCampaigns();
        } else {
            showNotification('Flash indirim oluşturulamadı', 'error');
        }
    } catch (e) {
        console.error('Flash deal create error:', e);
        showNotification('Flash indirim oluşturulurken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
};

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const { poolWrapper } = require('./database-schema');
const { authenticateAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

// Security middleware
app.use(helmet());
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS - Admin panel için
app.use(cors({
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','X-API-Key','X-Admin-Key']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await poolWrapper.execute('SELECT 1');
    res.json({ 
      success: true, 
      message: 'Admin server is healthy',
      timestamp: new Date().toISOString(),
      port: PORT
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// ==================== ADMIN DASHBOARD API ====================

// Admin stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    console.log('📊 Admin stats requested');
    
    // Get user count
    const [userCountRows] = await poolWrapper.execute('SELECT COUNT(*) as count FROM users');
    const userCount = userCountRows[0].count;
    
    // Get product count
    const [productCountRows] = await poolWrapper.execute('SELECT COUNT(*) as count FROM products');
    const productCount = productCountRows[0].count;
    
    // Get order count
    const [orderCountRows] = await poolWrapper.execute('SELECT COUNT(*) as count FROM orders');
    const orderCount = orderCountRows[0].count;
    
    // Get tenant count
    const [tenantCountRows] = await poolWrapper.execute('SELECT COUNT(*) as count FROM tenants');
    const tenantCount = tenantCountRows[0].count;
    
    // Get recent orders
    const [recentOrders] = await poolWrapper.execute(`
      SELECT o.*, u.name as userName, u.email as userEmail
      FROM orders o
      LEFT JOIN users u ON o.userId = u.id
      ORDER BY o.createdAt DESC
      LIMIT 5
    `);
    
    // Get monthly revenue
    const [revenueRows] = await poolWrapper.execute(`
      SELECT 
        DATE_FORMAT(createdAt, '%Y-%m') as month,
        SUM(totalAmount) as revenue
      FROM orders 
      WHERE status = 'delivered'
      GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
      ORDER BY month DESC
      LIMIT 12
    `);
    
    const stats = {
      userCount,
      productCount,
      orderCount,
      tenantCount,
      recentOrders: recentOrders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        userName: order.userName,
        userEmail: order.userEmail,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt
      })),
      monthlyRevenue: revenueRows
    };
    
    console.log('📊 Stats calculated:', stats);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    res.status(500).json({ success: false, message: 'Error getting stats', error: error.message });
  }
});

// Admin charts
app.get('/api/admin/charts', authenticateAdmin, async (req, res) => {
  try {
    console.log('📈 Admin charts requested');
    
    // Daily sales for last 30 days
    const [dailySales] = await poolWrapper.execute(`
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as orderCount,
        SUM(totalAmount) as totalRevenue
      FROM orders 
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    `);
    
    // Order status distribution
    const [orderStatuses] = await poolWrapper.execute(`
      SELECT status, COUNT(*) as count
      FROM orders
      GROUP BY status
    `);
    
    // Monthly revenue for last 12 months
    const [monthlyRevenue] = await poolWrapper.execute(`
      SELECT 
        DATE_FORMAT(createdAt, '%Y-%m') as month,
        SUM(totalAmount) as revenue
      FROM orders 
      WHERE status = 'delivered'
        AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
      ORDER BY month DESC
    `);
    
    // Top products by sales
    const [topProducts] = await poolWrapper.execute(`
      SELECT 
        p.id,
        p.name,
        p.price,
        COUNT(oi.id) as salesCount,
        SUM(oi.quantity) as totalQuantity,
        SUM(oi.quantity * oi.price) as totalRevenue
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.productId
      LEFT JOIN orders o ON oi.orderId = o.id AND o.status = 'delivered'
      GROUP BY p.id, p.name, p.price
      ORDER BY salesCount DESC
      LIMIT 10
    `);
    
    const chartData = {
      dailySales,
      orderStatuses,
      monthlyRevenue,
      topProducts
    };
    
    console.log('📈 Charts calculated:', {
      dailySalesCount: dailySales.length,
      orderStatusCount: orderStatuses.length,
      monthlyRevenueCount: monthlyRevenue.length,
      topProductsCount: topProducts.length
    });
    
    res.json({ success: true, data: chartData });
  } catch (error) {
    console.error('❌ Error getting chart data:', error);
    res.status(500).json({ success: false, message: 'Error getting chart data', error: error.message });
  }
});

// ==================== ADMIN USERS API ====================

// Get all users
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const [rows] = await poolWrapper.execute(`
      SELECT id, name, email, phone, createdAt, lastLoginAt
      FROM users 
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);
    
    const [countRows] = await poolWrapper.execute('SELECT COUNT(*) as total FROM users');
    const total = countRows[0].total;
    
    res.json({ 
      success: true, 
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ success: false, message: 'Error getting users' });
  }
});

// ==================== ADMIN ORDERS API ====================

// Get all orders
app.get('/api/admin/orders', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const [rows] = await poolWrapper.execute(`
      SELECT o.*, u.name as userName, u.email as userEmail
      FROM orders o
      LEFT JOIN users u ON o.userId = u.id
      ORDER BY o.createdAt DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);
    
    const [countRows] = await poolWrapper.execute('SELECT COUNT(*) as total FROM orders');
    const total = countRows[0].total;
    
    res.json({ 
      success: true, 
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ success: false, message: 'Error getting orders' });
  }
});

// Get single order
app.get('/api/admin/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [orderRows] = await poolWrapper.execute(`
      SELECT o.*, u.name as userName, u.email as userEmail, u.phone as userPhone
      FROM orders o
      LEFT JOIN users u ON o.userId = u.id
      WHERE o.id = ?
    `, [id]);
    
    if (orderRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const [itemRows] = await poolWrapper.execute(`
      SELECT oi.*, p.name as productName, p.image as productImage
      FROM order_items oi
      LEFT JOIN products p ON oi.productId = p.id
      WHERE oi.orderId = ?
    `, [id]);
    
    const order = {
      ...orderRows[0],
      items: itemRows
    };
    
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ success: false, message: 'Error getting order' });
  }
});

// Update order status
app.put('/api/admin/orders/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const [result] = await poolWrapper.execute(
      'UPDATE orders SET status = ?, updatedAt = NOW() WHERE id = ?',
      [status, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    res.json({ success: true, message: 'Order status updated' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Error updating order status' });
  }
});

// ==================== ADMIN PRODUCTS API ====================

// Get all products
app.get('/api/admin/products', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM products ORDER BY lastUpdated DESC'
    );
    
    // Clean HTML entities from all products
    const cleanedProducts = rows.map(cleanProductData);
    
    res.json({ success: true, data: cleanedProducts });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ success: false, message: 'Error getting products' });
  }
});

// Get single product
app.get('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    console.log('📦 Admin requesting product detail for ID:', productId);
    
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Ürün bulunamadı' 
      });
    }
    
    // Clean HTML entities from product data
    const cleanedProduct = cleanProductData(rows[0]);
    
    console.log('📦 Product detail found:', cleanedProduct.name);
    res.json({ success: true, data: cleanedProduct });
  } catch (error) {
    console.error('Error getting product detail:', error);
    res.status(500).json({ success: false, message: 'Error getting product detail' });
  }
});

// Get all categories
app.get('/api/admin/categories', authenticateAdmin, async (req, res) => {
  try {
    console.log('📂 Admin requesting categories');
    
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM categories ORDER BY name ASC'
    );
    
    console.log('📂 Categories found:', rows.length);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ success: false, message: 'Error getting categories' });
  }
});

// ==================== ADMIN FLASH DEALS API ====================

// Get all flash deals
app.get('/api/admin/flash-deals', authenticateAdmin, async (req, res) => {
  try {
    console.log('⚡ Admin requesting flash deals');
    
    const [rows] = await poolWrapper.execute(`
      SELECT fd.*, 
             CASE 
               WHEN fd.target_type = 'category' THEN c.name
               WHEN fd.target_type = 'product' THEN p.name
               ELSE 'Tüm Ürünler'
             END as target_name
      FROM flash_deals fd
      LEFT JOIN categories c ON fd.target_type = 'category' AND fd.target_id = c.id
      LEFT JOIN products p ON fd.target_type = 'product' AND fd.target_id = p.id
      ORDER BY fd.created_at DESC
    `);
    
    console.log('⚡ Flash deals found:', rows.length);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Error getting flash deals:', error);
    res.status(500).json({ success: false, message: 'Error getting flash deals' });
  }
});

// Create flash deal
app.post('/api/admin/flash-deals', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, discount_type, discount_value, target_type, target_id, start_date, end_date } = req.body;
    
    console.log('⚡ Creating flash deal:', { name, discount_type, discount_value, target_type, target_id });
    
    // Validate required fields
    if (!name || !discount_type || !discount_value || !target_type || !start_date || !end_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Gerekli alanlar eksik' 
      });
    }
    
    // Validate discount type
    if (!['percentage', 'fixed'].includes(discount_type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Geçersiz indirim türü' 
      });
    }
    
    // Validate target type
    if (!['category', 'product'].includes(target_type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Geçersiz hedef türü' 
      });
    }
    
    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (startDate >= endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bitiş tarihi başlangıç tarihinden sonra olmalı' 
      });
    }
    
    // Check if target exists
    if (target_type === 'category' && target_id) {
      const [categoryRows] = await poolWrapper.execute('SELECT id FROM categories WHERE id = ?', [target_id]);
      if (categoryRows.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Kategori bulunamadı' 
        });
      }
    }
    
    if (target_type === 'product' && target_id) {
      const [productRows] = await poolWrapper.execute('SELECT id FROM products WHERE id = ?', [target_id]);
      if (productRows.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Ürün bulunamadı' 
        });
      }
    }
    
    // Insert flash deal
    const [result] = await poolWrapper.execute(`
      INSERT INTO flash_deals (name, description, discount_type, discount_value, target_type, target_id, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, description, discount_type, discount_value, target_type, target_id, start_date, end_date]);
    
    console.log('⚡ Flash deal created with ID:', result.insertId);
    res.json({ 
      success: true, 
      message: 'Flash indirim başarıyla oluşturuldu',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('❌ Error creating flash deal:', error);
    res.status(500).json({ success: false, message: 'Error creating flash deal' });
  }
});

// Update flash deal
app.put('/api/admin/flash-deals/:id', authenticateAdmin, async (req, res) => {
  try {
    const flashDealId = req.params.id;
    const { name, description, discount_type, discount_value, target_type, target_id, start_date, end_date, is_active } = req.body;
    
    console.log('⚡ Updating flash deal:', flashDealId);
    
    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    
    if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (discount_type !== undefined) { updateFields.push('discount_type = ?'); updateValues.push(discount_type); }
    if (discount_value !== undefined) { updateFields.push('discount_value = ?'); updateValues.push(discount_value); }
    if (target_type !== undefined) { updateFields.push('target_type = ?'); updateValues.push(target_type); }
    if (target_id !== undefined) { updateFields.push('target_id = ?'); updateValues.push(target_id); }
    if (start_date !== undefined) { updateFields.push('start_date = ?'); updateValues.push(start_date); }
    if (end_date !== undefined) { updateFields.push('end_date = ?'); updateValues.push(end_date); }
    if (is_active !== undefined) { updateFields.push('is_active = ?'); updateValues.push(is_active); }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Güncellenecek alan bulunamadı' 
      });
    }
    
    updateValues.push(flashDealId);
    
    const [result] = await poolWrapper.execute(`
      UPDATE flash_deals 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `, updateValues);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Flash indirim bulunamadı' 
      });
    }
    
    console.log('⚡ Flash deal updated:', flashDealId);
    res.json({ 
      success: true, 
      message: 'Flash indirim başarıyla güncellendi' 
    });
  } catch (error) {
    console.error('❌ Error updating flash deal:', error);
    res.status(500).json({ success: false, message: 'Error updating flash deal' });
  }
});

// Delete flash deal
app.delete('/api/admin/flash-deals/:id', authenticateAdmin, async (req, res) => {
  try {
    const flashDealId = req.params.id;
    
    console.log('⚡ Deleting flash deal:', flashDealId);
    
    const [result] = await poolWrapper.execute(
      'DELETE FROM flash_deals WHERE id = ?',
      [flashDealId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Flash indirim bulunamadı' 
      });
    }
    
    console.log('⚡ Flash deal deleted:', flashDealId);
    res.json({ 
      success: true, 
      message: 'Flash indirim başarıyla silindi' 
    });
  } catch (error) {
    console.error('❌ Error deleting flash deal:', error);
    res.status(500).json({ success: false, message: 'Error deleting flash deal' });
  }
});

// ==================== UTILITY FUNCTIONS ====================

// Clean product data from HTML entities
function cleanProductData(product) {
  if (!product) return product;
  
  const cleaned = { ...product };
  
  // Clean common fields that might contain HTML entities
  const fieldsToClean = ['name', 'description', 'brand', 'category'];
  
  fieldsToClean.forEach(field => {
    if (cleaned[field] && typeof cleaned[field] === 'string') {
      cleaned[field] = cleaned[field]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&nbsp;/g, ' ');
    }
  });
  
  return cleaned;
}

// Start server
app.listen(PORT, () => {
  console.log(`🔧 Admin Server running on port ${PORT}`);
  console.log(`🌐 Admin API: http://localhost:${PORT}/api`);
  console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
});

module.exports = app;

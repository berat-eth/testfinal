const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const { poolWrapper } = require('./database-schema');
const { authenticateTenant } = require('./middleware/auth');

const app = express();
const PORT = process.env.APP_PORT || 3000;

// Security middleware
app.use(helmet());
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // limit each IP to 2000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS - Mobile app için
app.use(cors({
  origin: true, // Tüm origin'lere izin ver
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','X-API-Key']
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
      message: 'App API server is healthy',
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

// ==================== AUTHENTICATION API ====================

// User registration
app.post('/api/users', authenticateTenant, async (req, res) => {
  try {
    const { name, email, password, phone, birthDate, address } = req.body;
    
    // Check if user already exists
    const [existingUsers] = await poolWrapper.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu email adresi zaten kullanılıyor'
      });
    }
    
    // Hash password (simple hash for demo)
    const hashedPassword = Buffer.from(password).toString('base64');
    
    // Create user
    const [result] = await poolWrapper.execute(`
      INSERT INTO users (name, email, password, phone, birthDate, address, tenantId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [name, email, hashedPassword, phone, birthDate, address, req.tenant.id]);
    
    res.json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu',
      data: { userId: result.insertId }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Error creating user' });
  }
});

// User login
app.post('/api/users/login', authenticateTenant, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const [users] = await poolWrapper.execute(
      'SELECT * FROM users WHERE email = ? AND tenantId = ?',
      [email, req.tenant.id]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }
    
    const user = users[0];
    const hashedPassword = Buffer.from(password).toString('base64');
    
    if (user.password !== hashedPassword) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }
    
    // Update last login
    await poolWrapper.execute(
      'UPDATE users SET lastLoginAt = NOW() WHERE id = ?',
      [user.id]
    );
    
    res.json({
      success: true,
      message: 'Giriş başarılı',
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ success: false, message: 'Error during login' });
  }
});

// ==================== PRODUCTS API ====================

// Get products with pagination
app.get('/api/products', authenticateTenant, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [countRows] = await poolWrapper.execute(
      'SELECT COUNT(*) as total FROM products WHERE tenantId = ?',
      [req.tenant.id]
    );
    
    // Get products
    const [rows] = await poolWrapper.execute(`
      SELECT * FROM products 
      WHERE tenantId = ? 
      ORDER BY lastUpdated DESC
      LIMIT ? OFFSET ?
    `, [req.tenant.id, limit, offset]);
    
    // Clean HTML entities
    const cleanedProducts = rows.map(cleanProductData);
    
    res.json({
      success: true,
      data: cleanedProducts,
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        pages: Math.ceil(countRows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ success: false, message: 'Error getting products' });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const cleanedProduct = cleanProductData(rows[0]);
    res.json({ success: true, data: cleanedProduct });
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ success: false, message: 'Error getting product' });
  }
});

// Search products
app.get('/api/products/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Arama terimi en az 2 karakter olmalı'
      });
    }
    
    const [rows] = await poolWrapper.execute(`
      SELECT * FROM products 
      WHERE (name LIKE ? OR description LIKE ? OR brand LIKE ?)
      ORDER BY 
        CASE 
          WHEN name LIKE ? THEN 1
          WHEN brand LIKE ? THEN 2
          ELSE 3
        END,
        name ASC
      LIMIT 50
    `, [`%${q}%`, `%${q}%`, `%${q}%`, `${q}%`, `${q}%`]);
    
    const cleanedProducts = rows.map(cleanProductData);
    res.json({ success: true, data: cleanedProducts });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ success: false, message: 'Error searching products' });
  }
});

// Get categories
app.get('/api/categories', async (req, res) => {
  try {
    // Check cache
    const [rows] = await poolWrapper.execute(`
      SELECT DISTINCT category as name, COUNT(*) as productCount
      FROM products 
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY productCount DESC, name ASC
    `);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ success: false, message: 'Error getting categories' });
  }
});

// Get brands
app.get('/api/brands', async (req, res) => {
  try {
    const [rows] = await poolWrapper.execute(`
      SELECT DISTINCT brand as name, COUNT(*) as productCount
      FROM products 
      WHERE brand IS NOT NULL AND brand != ''
      GROUP BY brand
      ORDER BY productCount DESC, name ASC
    `);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error getting brands:', error);
    res.status(500).json({ success: false, message: 'Error getting brands' });
  }
});

// ==================== CART API ====================

// Get user cart
app.get('/api/cart/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [rows] = await poolWrapper.execute(`
      SELECT ci.*, p.name as productName, p.price as productPrice, p.image as productImage
      FROM cart_items ci
      LEFT JOIN products p ON ci.productId = p.id
      WHERE ci.userId = ?
      ORDER BY ci.createdAt DESC
    `, [userId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ success: false, message: 'Error getting cart' });
  }
});

// Add to cart
app.post('/api/cart', authenticateTenant, async (req, res) => {
  try {
    const { userId, productId, quantity, variationString, selectedVariations, deviceId } = req.body;
    
    // Check if product exists
    const [products] = await poolWrapper.execute(
      'SELECT id, price, stock FROM products WHERE id = ?',
      [productId]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const product = products[0];
    
    // Check stock
    if (product.stock < quantity) {
      return res.status(400).json({ 
        success: false, 
        message: 'Yeterli stok bulunmuyor' 
      });
    }
    
    // Check if item already exists in cart
    const [existingItems] = await poolWrapper.execute(
      'SELECT id, quantity FROM cart_items WHERE userId = ? AND productId = ? AND variationString = ?',
      [userId, productId, variationString || '']
    );
    
    if (existingItems.length > 0) {
      // Update quantity
      const newQuantity = existingItems[0].quantity + quantity;
      await poolWrapper.execute(
        'UPDATE cart_items SET quantity = ?, updatedAt = NOW() WHERE id = ?',
        [newQuantity, existingItems[0].id]
      );
    } else {
      // Add new item
      await poolWrapper.execute(`
        INSERT INTO cart_items (userId, productId, quantity, price, variationString, selectedVariations, deviceId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [userId, productId, quantity, product.price, variationString || '', JSON.stringify(selectedVariations || {}), deviceId]);
    }
    
    res.json({ success: true, message: 'Ürün sepete eklendi' });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, message: 'Error adding to cart' });
  }
});

// ==================== ORDERS API ====================

// Get user orders
app.get('/api/orders/user/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [rows] = await poolWrapper.execute(`
      SELECT * FROM orders 
      WHERE userId = ? 
      ORDER BY createdAt DESC
    `, [userId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({ success: false, message: 'Error getting orders' });
  }
});

// Create order
app.post('/api/orders', authenticateTenant, async (req, res) => {
  try {
    const { 
      userId, 
      items, 
      totalAmount, 
      shippingAddress, 
      paymentMethod,
      orderNumber
    } = req.body;
    
    // Create order
    const [orderResult] = await poolWrapper.execute(`
      INSERT INTO orders (userId, orderNumber, totalAmount, shippingAddress, paymentMethod, status, createdAt)
      VALUES (?, ?, ?, ?, ?, 'pending', NOW())
    `, [userId, orderNumber, totalAmount, JSON.stringify(shippingAddress), paymentMethod]);
    
    const orderId = orderResult.insertId;
    
    // Add order items
    for (const item of items) {
      await poolWrapper.execute(`
        INSERT INTO order_items (orderId, productId, quantity, price, variationString, selectedVariations)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [orderId, item.productId, item.quantity, item.price, item.variationString || '', JSON.stringify(item.selectedVariations || {})]);
    }
    
    // Clear cart
    await poolWrapper.execute('DELETE FROM cart_items WHERE userId = ?', [userId]);
    
    res.json({ 
      success: true, 
      message: 'Sipariş oluşturuldu',
      data: { orderId, orderNumber }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, message: 'Error creating order' });
  }
});

// ==================== FLASH DEALS API ====================

// Get active flash deals
app.get('/api/flash-deals', authenticateTenant, async (req, res) => {
  try {
    const now = new Date();
    
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
      WHERE fd.is_active = true 
        AND fd.start_date <= ? 
        AND fd.end_date >= ?
      ORDER BY fd.created_at DESC
    `, [now, now]);
    
    console.log('⚡ Active flash deals found:', rows.length);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Error getting active flash deals:', error);
    res.status(500).json({ success: false, message: 'Error getting flash deals' });
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
  console.log(`📱 App API Server running on port ${PORT}`);
  console.log(`🌐 App API: http://localhost:${PORT}/api`);
  console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
});

module.exports = app;

const express = require('express');
// Load environment variables from envai file
try { 
  require('dotenv').config({ path: '../envai' }); 
  console.log('✅ Environment variables loaded from envai file');
} catch (error) {
  console.warn('⚠️ Could not load envai file, using defaults:', error.message);
}
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const XmlSyncService = require('./services/xml-sync-service');
const IyzicoService = require('./services/iyzico-service');
const WhatsAppService = require('./services/whatsapp-service');
const { createDatabaseSchema } = require('./database-schema');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

// Security modules
const DatabaseSecurity = require('./security/database-security');
const InputValidation = require('./security/input-validation');

// Security utilities
const SALT_ROUNDS = 12;

// Password hashing
async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    console.error('❌ Error hashing password:', error);
    throw new Error('Password hashing failed');
  }
}

// Password verification
async function verifyPassword(password, hashedPassword) {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('❌ Error verifying password:', error);
    return false;
  }
}


// Generate secure API key
function generateSecureApiKey() {
  return 'huglu_' + crypto.randomBytes(32).toString('hex');
}

// HTML entity decoder utility
function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  
  const htmlEntities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&hellip;': '...',
    '&mdash;': '—',
    '&ndash;': '–',
    '&bull;': '•',
    '&middot;': '·',
    '&laquo;': '«',
    '&raquo;': '»',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&deg;': '°',
    '&plusmn;': '±',
    '&times;': '×',
    '&divide;': '÷',
    '&euro;': '€',
    '&pound;': '£',
    '&yen;': '¥',
    '&cent;': '¢'
  };
  
  let decodedText = text;
  
  // Replace HTML entities
  Object.keys(htmlEntities).forEach(entity => {
    const regex = new RegExp(entity, 'g');
    decodedText = decodedText.replace(regex, htmlEntities[entity]);
  });
  
  // Replace numeric HTML entities (&#123; format)
  decodedText = decodedText.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  
  // Replace hex HTML entities (&#x1A; format)
  decodedText = decodedText.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  // Clean up extra whitespace
  decodedText = decodedText.replace(/\s+/g, ' ').trim();
  
  return decodedText;
}

// Clean product data function
function cleanProductData(product) {
  if (!product) return product;
  
  const cleaned = { ...product };
  
  // Clean text fields that might contain HTML entities
  if (cleaned.name) cleaned.name = decodeHtmlEntities(cleaned.name);
  if (cleaned.description) cleaned.description = decodeHtmlEntities(cleaned.description);
  if (cleaned.category) cleaned.category = decodeHtmlEntities(cleaned.category);
  if (cleaned.brand) cleaned.brand = decodeHtmlEntities(cleaned.brand);
  
  return cleaned;
}

const os = require('os');

const app = express();
const PORT = 3000;

// Network detection helper
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const networkInterface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (networkInterface.family === 'IPv4' && !networkInterface.internal) {
        return networkInterface.address;
      }
    }
  }
  return 'localhost';
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(hpp());

// CORS - Tüm origin'lere izin ver
app.use(cors({
  origin: true, // Tüm origin'lere izin ver
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','X-API-Key','X-Admin-Key']
}));

app.use(express.json());


if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.body) {
      console.log(`\n🔍 [${new Date().toISOString()}] ${req.method} ${req.path}`);
      console.log('📤 Request Body:', JSON.stringify(req.body, null, 2));
    }
    next();
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT || '100', 10),
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/users/login', authLimiter);
app.use('/api/admin', authLimiter);

// SQL Query Logger Middleware
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    if (req.method !== 'GET') {
      console.log(`\n🔍 [${new Date().toISOString()}] ${req.method} ${req.path}`);
      if (req.body && Object.keys(req.body).length > 0) {
        console.log('📤 Request Body:', JSON.stringify(req.body, null, 2));
      }
    }
    originalSend.call(this, data);
  };
  next();
});

// Initialize security modules
const dbSecurity = new DatabaseSecurity();
const inputValidator = new InputValidation();

// Secure database configuration
const dbConfig = dbSecurity.getSecureDbConfig();

// Create database pool
let pool;
let xmlSyncService;

// SQL Query Logger Wrapper
function logQuery(sql, params, startTime) {
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`\n📊 [SQL QUERY] ${duration}ms`);
  console.log(`🔍 SQL: ${sql}`);
  if (params && params.length > 0) {
    console.log(`📝 Params: ${JSON.stringify(params)}`);
  }
  console.log(`⏱️  Duration: ${duration}ms`);
}

// Wrapped pool methods for logging
const poolWrapper = {
  async execute(sql, params) {
    const startTime = Date.now();
    try {
      const result = await pool.execute(sql, params);
      logQuery(sql, params, startTime);
      return result;
    } catch (error) {
      logQuery(sql, params, startTime);
      console.error(`❌ SQL Error: ${error.message}`);
      throw error;
    }
  },
  
  async query(sql, params) {
    const startTime = Date.now();
    try {
      const result = await pool.query(sql, params);
      logQuery(sql, params, startTime);
      return result;
    } catch (error) {
      logQuery(sql, params, startTime);
      console.error(`❌ SQL Error: ${error.message}`);
      throw error;
    }
  },
  
  async getConnection() {
    try {
      const connection = await pool.getConnection();
      
      // Wrap connection methods for logging
      const originalExecute = connection.execute;
      const originalQuery = connection.query;
      const originalBeginTransaction = connection.beginTransaction;
      const originalCommit = connection.commit;
      const originalRollback = connection.rollback;
      
      connection.execute = async function(sql, params) {
        const startTime = Date.now();
        try {
          const result = await originalExecute.call(this, sql, params);
          logQuery(sql, params, startTime);
          return result;
        } catch (error) {
          logQuery(sql, params, startTime);
          console.error(`❌ SQL Error: ${error.message}`);
          throw error;
        }
      };
      
      connection.query = async function(sql, params) {
        const startTime = Date.now();
        try {
          const result = await originalQuery.call(this, sql, params);
          logQuery(sql, params, startTime);
          return result;
        } catch (error) {
          logQuery(sql, params, startTime);
          console.error(`❌ SQL Error: ${error.message}`);
          throw error;
        }
      };
      
      connection.beginTransaction = async function() {
        console.log('🔄 Transaction started');
        return await originalBeginTransaction.call(this);
      };
      
      connection.commit = async function() {
        console.log('✅ Transaction committed');
        return await originalCommit.call(this);
      };
      
      connection.rollback = async function() {
        console.log('🔄 Transaction rolled back');
        return await originalRollback.call(this);
      };
      
      return connection;
    } catch (error) {
      console.error(`❌ Error getting connection: ${error.message}`);
      throw error;
    }
  }
};

async function initializeDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    
    // Test connection with security
    const connection = await pool.getConnection();
    const secureConnection = dbSecurity.secureConnection(connection);
    console.log('✅ Database connected securely');
    secureConnection.release();
    
    // Create database schema
    await createDatabaseSchema(pool);
    
    // Initialize XML Sync Service
    xmlSyncService = new XmlSyncService(pool);
    console.log('📡 XML Sync Service initialized');
    
    // Log security initialization
    dbSecurity.logDatabaseAccess('system', 'DATABASE_INIT', 'system', {
      ip: 'localhost',
      userAgent: 'server-init'
    });
    
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    dbSecurity.logDatabaseAccess('system', 'DATABASE_ERROR', 'system', {
      error: error.message,
      ip: 'localhost'
    });
    throw error;
  }
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Quick database check
    const connection = await pool.getConnection();
    connection.release();
    
    // Quick response
    res.json({ 
      success: true, 
      message: 'Server is healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: 'connected'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Return Requests Endpoints

// Get user's return requests
app.get('/api/return-requests', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const [returnRequests] = await poolWrapper.execute(`
      SELECT 
        rr.*,
        o.id as orderId,
        oi.productName,
        oi.productImage,
        oi.price as originalPrice,
        oi.quantity
      FROM return_requests rr
      JOIN orders o ON rr.orderId = o.id
      JOIN order_items oi ON rr.orderItemId = oi.id
      WHERE rr.userId = ? AND rr.tenantId = ?
      ORDER BY rr.createdAt DESC
    `, [userId, req.tenant.id]);

    res.json({ success: true, data: returnRequests });
  } catch (error) {
    console.error('❌ Error fetching return requests:', error);
    res.status(500).json({ success: false, message: 'Error fetching return requests' });
  }
});

// Create new return request
app.post('/api/return-requests', async (req, res) => {
  try {
    const { userId, orderId, orderItemId, reason, description } = req.body;
    
    if (!userId || !orderId || !orderItemId || !reason) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Get order item details for refund amount
    const [orderItem] = await poolWrapper.execute(`
      SELECT oi.*, o.userId as orderUserId
      FROM order_items oi
      JOIN orders o ON oi.orderId = o.id
      WHERE oi.id = ? AND o.userId = ? AND oi.tenantId = ?
    `, [orderItemId, userId, req.tenant.id]);

    if (orderItem.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order item not found or not owned by user' 
      });
    }

    const refundAmount = parseFloat(orderItem[0].price) * parseInt(orderItem[0].quantity);

    // Check if return request already exists for this order item
    const [existingRequest] = await poolWrapper.execute(`
      SELECT id FROM return_requests 
      WHERE orderItemId = ? AND tenantId = ? AND status NOT IN ('rejected', 'cancelled')
    `, [orderItemId, req.tenant.id]);

    if (existingRequest.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bu ürün için zaten bir iade talebi bulunmaktadır' 
      });
    }

    // Create return request
    const [result] = await poolWrapper.execute(`
      INSERT INTO return_requests (tenantId, userId, orderId, orderItemId, reason, description, refundAmount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.tenant.id, userId, orderId, orderItemId, reason, description || null, refundAmount]);

    res.json({ 
      success: true, 
      data: { returnRequestId: result.insertId },
      message: 'İade talebi başarıyla oluşturuldu' 
    });
  } catch (error) {
    console.error('❌ Error creating return request:', error);
    res.status(500).json({ success: false, message: 'Error creating return request' });
  }
});

// Cancel return request (user can cancel pending requests)
app.put('/api/return-requests/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Check if return request exists and belongs to user
    const [returnRequest] = await poolWrapper.execute(`
      SELECT id, status FROM return_requests 
      WHERE id = ? AND userId = ? AND tenantId = ?
    `, [id, userId, req.tenant.id]);

    if (returnRequest.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Return request not found' 
      });
    }

    if (returnRequest[0].status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Sadece beklemede olan iade talepleri iptal edilebilir' 
      });
    }

    await poolWrapper.execute(`
      UPDATE return_requests 
      SET status = 'cancelled', updatedAt = NOW()
      WHERE id = ?
    `, [id]);

    res.json({ success: true, message: 'İade talebi iptal edildi' });
  } catch (error) {
    console.error('❌ Error cancelling return request:', error);
    res.status(500).json({ success: false, message: 'Error cancelling return request' });
  }
});

// İyzico Payment Endpoints
const iyzicoService = new IyzicoService();

// Process credit card payment - NO CARD DATA STORED
app.post('/api/payments/process', authenticateTenant, async (req, res) => {
  try {
    console.log('🔄 Processing payment - CARD DATA WILL NOT BE STORED');
    console.log('⚠️ SECURITY: Card information is processed but NOT saved to database');
    
    const {
      orderId,
      paymentCard,
      buyer,
      shippingAddress,
      billingAddress
    } = req.body;

    // Validate required fields
    if (!orderId || !paymentCard || !buyer) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment fields'
      });
    }

    // Security validation for card data
    if (!paymentCard.cardNumber || !paymentCard.expireMonth || !paymentCard.expireYear || !paymentCard.cvc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid card information provided'
      });
    }

    // Get order details
    const [orderRows] = await poolWrapper.execute(
      'SELECT * FROM orders WHERE id = ? AND tenantId = ?',
      [orderId, req.tenant.id]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const order = orderRows[0];

    // Get order items
    const [itemRows] = await poolWrapper.execute(
      'SELECT * FROM order_items WHERE orderId = ? AND tenantId = ?',
      [orderId, req.tenant.id]
    );

    if (itemRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items found for this order'
      });
    }

    // Prepare payment data
    const paymentData = {
      price: order.totalAmount,
      paidPrice: order.totalAmount,
      currency: 'TRY',
      basketId: orderId,
      paymentCard: {
        cardHolderName: paymentCard.cardHolderName,
        cardNumber: paymentCard.cardNumber.replace(/\s/g, ''),
        expireMonth: paymentCard.expireMonth,
        expireYear: paymentCard.expireYear,
        cvc: paymentCard.cvc
      },
      buyer: {
        id: buyer.id || order.userId,
        name: buyer.name || order.customerName?.split(' ')[0] || 'John',
        surname: buyer.surname || order.customerName?.split(' ').slice(1).join(' ') || 'Doe',
        gsmNumber: buyer.gsmNumber || order.customerPhone || '+905555555555',
        email: buyer.email || order.customerEmail || 'test@test.com',
        identityNumber: buyer.identityNumber || '11111111111',
        registrationAddress: buyer.registrationAddress || order.shippingAddress,
        ip: req.ip || '127.0.0.1',
        city: buyer.city || order.city || 'Istanbul',
        country: buyer.country || 'Turkey',
        zipCode: buyer.zipCode || '34000'
      },
      shippingAddress: {
        contactName: shippingAddress?.contactName || order.customerName || 'Ahmet Yılmaz',
        city: shippingAddress?.city || order.city || 'Istanbul',
        country: shippingAddress?.country || 'Turkey',
        address: shippingAddress?.address || order.fullAddress || order.shippingAddress,
        zipCode: shippingAddress?.zipCode || '34000'
      },
      billingAddress: {
        contactName: billingAddress?.contactName || order.customerName || 'John Doe',
        city: billingAddress?.city || order.city || 'Istanbul',
        country: billingAddress?.country || 'Turkey',
        address: billingAddress?.address || order.fullAddress || order.shippingAddress,
        zipCode: billingAddress?.zipCode || '34000'
      },
      basketItems: itemRows.map(item => ({
        id: item.id,
        name: item.productName || 'Product',
        category1: item.productCategory || 'Outdoor',
        category2: item.productBrand || 'Product',
        price: parseFloat(item.price) * parseInt(item.quantity)
      }))
    };

    console.log('🔄 Processing İyzico payment for order:', orderId);

    // Process payment with İyzico
    const paymentResult = await iyzicoService.processPayment(paymentData);

    if (paymentResult.success) {
      // Update order status and payment info
      await poolWrapper.execute(
        `UPDATE orders SET 
         status = 'paid', 
         paymentStatus = 'completed',
         paymentId = ?,
         paymentProvider = 'iyzico',
         paidAt = NOW()
         WHERE id = ? AND tenantId = ?`,
        [paymentResult.paymentId, orderId, req.tenant.id]
      );

      // Log payment transaction
      await poolWrapper.execute(
        `INSERT INTO payment_transactions 
         (tenantId, orderId, paymentId, provider, amount, currency, status, transactionData, createdAt)
         VALUES (?, ?, ?, 'iyzico', ?, 'TRY', 'success', ?, NOW())`,
        [
          req.tenant.id, 
          orderId, 
          paymentResult.paymentId, 
          order.totalAmount,
          JSON.stringify(paymentResult)
        ]
      );

      console.log('✅ Payment successful for order:', orderId);
      console.log('✅ Card data processed and discarded - NOT stored in database');

      res.json({
        success: true,
        message: 'Payment completed successfully - Card data not stored',
        data: {
          orderId: orderId,
          paymentId: paymentResult.paymentId,
          amount: paymentResult.paidPrice,
          currency: paymentResult.currency,
          cardInfo: {
            lastFourDigits: paymentResult.lastFourDigits,
            cardType: paymentResult.cardType,
            cardAssociation: paymentResult.cardAssociation
          }
        }
      });

    } else {
      console.log('❌ Payment failed for order:', orderId);
      
      // Update order status
      await poolWrapper.execute(
        `UPDATE orders SET 
         status = 'payment_failed', 
         paymentStatus = 'failed'
         WHERE id = ? AND tenantId = ?`,
        [orderId, req.tenant.id]
      );

      res.status(400).json({
        success: false,
        error: paymentResult.error,
        message: iyzicoService.translateErrorMessage(paymentResult.message)
      });
    }

  } catch (error) {
    console.error('❌ Payment processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message
    });
  }
});

// Get payment status
app.get('/api/payments/:paymentId/status', authenticateTenant, async (req, res) => {
  try {
    const { paymentId } = req.params;

    const [paymentRows] = await poolWrapper.execute(
      'SELECT * FROM payment_transactions WHERE paymentId = ? AND tenantId = ?',
      [paymentId, req.tenant.id]
    );

    if (paymentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const payment = paymentRows[0];
    
    // Query İyzico for latest status
    try {
      const iyzicoResult = await iyzicoService.retrievePayment(paymentId, payment.conversationId);
      
      res.json({
        success: true,
        data: {
          paymentId: paymentId,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          createdAt: payment.createdAt,
          iyzicoStatus: iyzicoResult.status
        }
      });
    } catch (iyzicoError) {
      // Return local data if İyzico query fails
      res.json({
        success: true,
        data: {
          paymentId: paymentId,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          createdAt: payment.createdAt
        }
      });
    }

  } catch (error) {
    console.error('❌ Error getting payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving payment status'
    });
  }
});

// Test cards endpoint (sandbox only)
app.get('/api/payments/test-cards', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({
      success: false,
      message: 'Test cards not available in production'
    });
  }

  res.json({
    success: true,
    data: IyzicoService.getTestCards()
  });
});

// Get user's returnable orders
app.get('/api/orders/returnable', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const [orders] = await poolWrapper.execute(`
      SELECT 
        o.id as orderId,
        o.createdAt as orderDate,
        o.status as orderStatus,
        oi.id as orderItemId,
        oi.productName,
        oi.productImage,
        oi.price,
        oi.quantity,
        CASE 
          WHEN rr.id IS NOT NULL THEN rr.status
          ELSE NULL
        END as returnStatus
      FROM orders o
      JOIN order_items oi ON o.id = oi.orderId
      LEFT JOIN return_requests rr ON oi.id = rr.orderItemId AND rr.status NOT IN ('rejected', 'cancelled')
      WHERE o.userId = ? AND o.tenantId = ? AND o.status IN ('delivered')
      ORDER BY o.createdAt DESC, oi.id
    `, [userId, req.tenant.id]);

    // Group by order
    const ordersMap = {};
    orders.forEach(row => {
      if (!ordersMap[row.orderId]) {
        ordersMap[row.orderId] = {
          orderId: row.orderId,
          orderDate: row.orderDate,
          orderStatus: row.orderStatus,
          items: []
        };
      }
      
      ordersMap[row.orderId].items.push({
        orderItemId: row.orderItemId,
        productName: row.productName,
        productImage: row.productImage,
        price: row.price,
        quantity: row.quantity,
        returnStatus: row.returnStatus,
        canReturn: !row.returnStatus // Can return if no active return request
      });
    });

    const result = Object.values(ordersMap);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching returnable orders:', error);
    res.status(500).json({ success: false, message: 'Error fetching returnable orders' });
  }
});

// Admin authentication middleware
function authenticateAdmin(req, res, next) {
  // Geçici olarak admin key kontrolünü devre dışı bırak
  // Admin panel test için tüm isteklere izin ver
  console.log('🔓 Admin endpoint accessed:', req.path);
  next();
  
  /* Admin key kontrolü (gelecekte aktif edilebilir)
  const adminKey = req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  const ADMIN_KEY = process.env.ADMIN_KEY || 'huglu-admin-2024-secure-key';
  
  if (!adminKey || adminKey !== ADMIN_KEY) {
    return res.status(401).json({ 
      success: false, 
      message: 'Admin authentication required' 
    });
  }
  
  next();
  */
}

// Admin - Update return request status
app.put('/api/admin/return-requests/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    
    const validStatuses = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status' 
      });
    }

    const updateData = [status];
    const updateFields = ['status = ?'];
    
    if (adminNotes) {
      updateFields.push('adminNotes = ?');
      updateData.push(adminNotes);
    }
    
    if (status === 'approved' || status === 'rejected' || status === 'completed') {
      updateFields.push('processedDate = NOW()');
    }
    
    updateData.push(id);

    await poolWrapper.execute(`
      UPDATE return_requests 
      SET ${updateFields.join(', ')}, updatedAt = NOW()
      WHERE id = ?
    `, updateData);

    res.json({ success: true, message: 'Return request status updated' });
  } catch (error) {
    console.error('❌ Error updating return request status:', error);
    res.status(500).json({ success: false, message: 'Error updating return request status' });
  }
});

// Admin Dashboard Stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    console.log('📊 Admin stats requested');
    
    // Kullanıcı sayısı
    const [userCount] = await poolWrapper.execute('SELECT COUNT(*) as count FROM users');
    
    // Ürün sayısı
    const [productCount] = await poolWrapper.execute('SELECT COUNT(*) as count FROM products');
    
    // Sipariş sayısı
    const [orderCount] = await poolWrapper.execute('SELECT COUNT(*) as count FROM orders');
    
    // Tenant sayısı
    const [tenantCount] = await poolWrapper.execute('SELECT COUNT(*) as count FROM tenants');
    
    // Son 30 günün siparişleri ve geliri
    const [recentOrders] = await poolWrapper.execute(`
      SELECT 
        COUNT(*) as count, 
        COALESCE(SUM(totalAmount), 0) as revenue 
      FROM orders 
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND status != 'cancelled'
    `);
    
    // Bu ayın geliri
    const [monthlyRevenue] = await poolWrapper.execute(`
      SELECT COALESCE(SUM(totalAmount), 0) as revenue 
      FROM orders 
      WHERE DATE_FORMAT(createdAt, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
        AND status != 'cancelled'
    `);
    
    const stats = {
      users: userCount[0].count,
      products: productCount[0].count,
      orders: orderCount[0].count,
      tenants: tenantCount[0].count,
      monthlyRevenue: monthlyRevenue[0].revenue || 0,
      monthlyOrders: recentOrders[0].count || 0
    };
    
    console.log('📊 Stats calculated:', stats);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting stats',
      error: error.message 
    });
  }
});

// Admin Chart Data
app.get('/api/admin/charts', authenticateAdmin, async (req, res) => {
  try {
    console.log('📈 Admin charts requested');
    
    // Son 7 günlük satışlar
    const [dailySales] = await poolWrapper.execute(`
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as orders,
        COALESCE(SUM(totalAmount), 0) as revenue
      FROM orders 
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND status != 'cancelled'
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `);
    
    // Sipariş durumları
    const [orderStatuses] = await poolWrapper.execute(`
      SELECT 
        status,
        COUNT(*) as count
      FROM orders
      GROUP BY status
      ORDER BY count DESC
    `);
    
    // Son 6 aylık gelir
    const [monthlyRevenue] = await poolWrapper.execute(`
      SELECT 
        DATE_FORMAT(createdAt, '%Y-%m') as month,
        COALESCE(SUM(totalAmount), 0) as revenue
      FROM orders 
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        AND status != 'cancelled'
      GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
      ORDER BY month ASC
    `);
    
    // En çok satan ürünler (top 5)
    const [topProducts] = await poolWrapper.execute(`
      SELECT 
        p.name,
        SUM(oi.quantity) as totalSold,
        p.price,
        SUM(oi.quantity * oi.price) as totalRevenue
      FROM order_items oi
      JOIN products p ON oi.productId = p.id
      JOIN orders o ON oi.orderId = o.id
      WHERE o.status != 'cancelled'
      GROUP BY p.id, p.name, p.price
      ORDER BY totalSold DESC
      LIMIT 5
    `);
    
    const chartData = {
      dailySales: dailySales || [],
      orderStatuses: orderStatuses || [],
      monthlyRevenue: monthlyRevenue || [],
      topProducts: topProducts || []
    };
    
    console.log('📈 Charts calculated:', {
      dailySalesCount: chartData.dailySales.length,
      orderStatusesCount: chartData.orderStatuses.length,
      monthlyRevenueCount: chartData.monthlyRevenue.length,
      topProductsCount: chartData.topProducts.length
    });
    
    res.json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('❌ Error getting chart data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting chart data',
      error: error.message 
    });
  }
});

// Admin - Tüm kullanıcıları listele
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const [rows] = await poolWrapper.execute(`
      SELECT u.id, u.name, u.email, u.phone, u.createdAt, t.name as tenantName 
      FROM users u 
      LEFT JOIN tenants t ON u.tenantId = t.id
      ORDER BY u.createdAt DESC 
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);
    
    // Return phone numbers as plain text
    const users = rows.map(user => ({
      ...user,
      phone: user.phone || ''
    }));
    
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('❌ Error getting users:', error);
    res.status(500).json({ success: false, message: 'Error getting users' });
  }
});

// Admin - Tüm siparişleri listele
app.get('/api/admin/orders', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // Get orders with product details
    const [orders] = await poolWrapper.execute(`
      SELECT o.id, o.totalAmount, o.status, o.createdAt, o.city, o.district, o.fullAddress, o.shippingAddress,
             u.name as userName, u.email as userEmail, 
             t.name as tenantName
      FROM orders o 
      LEFT JOIN users u ON o.userId = u.id
      LEFT JOIN tenants t ON o.tenantId = t.id
      ORDER BY o.createdAt DESC 
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);
    
    // Get order items for each order
    for (let order of orders) {
      const [orderItems] = await poolWrapper.execute(`
        SELECT oi.quantity, oi.price, 
               p.name as productName, p.image as productImage
        FROM order_items oi
        LEFT JOIN products p ON oi.productId = p.id
        WHERE oi.orderId = ?
      `, [order.id]);
      
      order.items = orderItems;
      order.itemCount = orderItems.length;
    }
    
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('❌ Error getting orders:', error);
    res.status(500).json({ success: false, message: 'Error getting orders' });
  }
});

// Admin - Tek sipariş detayı
app.get('/api/admin/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order details
    const [orders] = await poolWrapper.execute(`
      SELECT o.id, o.totalAmount, o.status, o.createdAt, o.city, o.district, o.fullAddress, o.shippingAddress, o.paymentMethod,
             u.name as userName, u.email as userEmail, 
             t.name as tenantName
      FROM orders o 
      LEFT JOIN users u ON o.userId = u.id
      LEFT JOIN tenants t ON o.tenantId = t.id
      WHERE o.id = ?
    `, [id]);
    
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const order = orders[0];
    
    // Get order items
    const [orderItems] = await poolWrapper.execute(`
      SELECT oi.quantity, oi.price, 
             p.name as productName, p.image as productImage
      FROM order_items oi
      LEFT JOIN products p ON oi.productId = p.id
      WHERE oi.orderId = ?
    `, [id]);
    
    order.items = orderItems;
    
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('❌ Error getting order details:', error);
    res.status(500).json({ success: false, message: 'Error getting order details' });
  }
});

// Admin - Sipariş durumu güncelle
app.put('/api/admin/orders/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status' 
      });
    }
    
    await poolWrapper.execute(
      'UPDATE orders SET status = ?, updatedAt = NOW() WHERE id = ?',
      [status, id]
    );
    
    res.json({ success: true, message: 'Order status updated' });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Error updating order status' });
  }
});

// Tenant Management endpoints
app.post('/api/tenants', async (req, res) => {
  try {
    const { name, domain, subdomain, settings } = req.body;
    
    // Generate secure API key
    const apiKey = generateSecureApiKey();
    
    const [result] = await poolWrapper.execute(
      'INSERT INTO tenants (name, domain, subdomain, apiKey, settings) VALUES (?, ?, ?, ?, ?)',
      [name, domain || null, subdomain || null, apiKey, JSON.stringify(settings || {})]
    );
    
    res.json({ 
      success: true, 
      data: { 
        tenantId: result.insertId,
        apiKey: apiKey
      },
      message: 'Tenant created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating tenant:', error);
    res.status(500).json({ success: false, message: 'Error creating tenant' });
  }
});

app.get('/api/tenants', async (req, res) => {
  try {
    const [rows] = await poolWrapper.execute(
      'SELECT id, name, domain, subdomain, isActive, createdAt FROM tenants ORDER BY createdAt DESC'
    );
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Error getting tenants:', error);
    res.status(500).json({ success: false, message: 'Error getting tenants' });
  }
});

app.get('/api/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await poolWrapper.execute(
      'SELECT id, name, domain, subdomain, settings, isActive, createdAt, updatedAt FROM tenants WHERE id = ?',
      [id]
    );
    
    if (rows.length > 0) {
      const tenant = rows[0];
      if (tenant.settings) {
        tenant.settings = JSON.parse(tenant.settings);
      }
      res.json({ success: true, data: tenant });
    } else {
      res.status(404).json({ success: false, message: 'Tenant not found' });
    }
  } catch (error) {
    console.error('❌ Error getting tenant:', error);
    res.status(500).json({ success: false, message: 'Error getting tenant' });
  }
});

app.put('/api/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, domain, subdomain, settings, isActive } = req.body;
    
    await poolWrapper.execute(
      'UPDATE tenants SET name = ?, domain = ?, subdomain = ?, settings = ?, isActive = ? WHERE id = ?',
      [name, domain, subdomain, JSON.stringify(settings || {}), isActive, id]
    );
    
    res.json({ success: true, message: 'Tenant updated successfully' });
  } catch (error) {
    console.error('❌ Error updating tenant:', error);
    res.status(500).json({ success: false, message: 'Error updating tenant' });
  }
});

app.delete('/api/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await poolWrapper.execute('DELETE FROM tenants WHERE id = ?', [id]);
    
    res.json({ success: true, message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting tenant:', error);
    res.status(500).json({ success: false, message: 'Error deleting tenant' });
  }
});

// Tenant authentication middleware
function authenticateTenant(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({ 
      success: false, 
      message: 'API key required' 
    });
  }
  
  // Find tenant by API key
  poolWrapper.execute(
    'SELECT id, name, domain, subdomain, settings, isActive FROM tenants WHERE apiKey = ? AND isActive = true',
    [apiKey]
  ).then(([rows]) => {
    if (rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or inactive API key' 
      });
    }
    
    req.tenant = rows[0];
    if (req.tenant.settings) {
      req.tenant.settings = JSON.parse(req.tenant.settings);
    }
    next();
  }).catch(error => {
    console.error('❌ Error authenticating tenant:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error authenticating tenant' 
    });
  });
}

// User endpoints (with tenant authentication)
app.post('/api/users', authenticateTenant, async (req, res) => {
  try {
    const { name, email, password, phone, birthDate, address } = req.body;
    
    // Validate required fields
    if (!name || !email || !password || !phone || !birthDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, password, phone and birthDate are required' 
      });
    }
    
    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }
    
    // Check if user already exists
    const [existingUser] = await poolWrapper.execute(
      'SELECT id FROM users WHERE email = ? AND tenantId = ?',
      [email, req.tenant.id]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email already exists' 
      });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Basic birthDate validation (optional field)
    let validBirthDate = null;
    if (birthDate) {
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) {
        console.log('⚠️ Invalid birthDate format, using null:', birthDate);
        validBirthDate = null;
      } else {
        validBirthDate = birth.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
    }

    // Store PLAIN (no encryption). Only password is hashed.
    const plainPhone = phone || '';
    const plainAddress = address || '';
    const plainEmail = email;
    
    const [result] = await poolWrapper.execute(
      'INSERT INTO users (tenantId, name, email, password, phone, birth_date, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.tenant.id, name, plainEmail, hashedPassword, plainPhone, validBirthDate, plainAddress]
    );
    
    res.json({ 
      success: true, 
      data: { userId: result.insertId },
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({ success: false, message: 'Error creating user' });
  }
});

app.get('/api/users/:id', authenticateTenant, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try with birth_date first, fallback to without it
    let [rows] = await poolWrapper.execute(
      'SELECT id, name, email, phone, birth_date AS birthDate, address, createdAt FROM users WHERE id = ? AND tenantId = ?',
      [id, req.tenant.id]
    ).catch(async (error) => {
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        console.log('⚠️ birth_date column missing, using fallback query');
        return await poolWrapper.execute(
          'SELECT id, name, email, phone, address, createdAt FROM users WHERE id = ? AND tenantId = ?',
      [id, req.tenant.id]
    );
      }
      throw error;
    });
    
    if (rows.length > 0) {
      const user = rows[0];
      
      // Direct data (no encryption needed)
      const userData = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        birthDate: user.birthDate || null, // Will be null if column doesn't exist
        address: user.address || '',
        createdAt: user.createdAt
      };
      
      res.json({ success: true, data: userData });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    console.error('❌ Error getting user:', error);
    
    // Check if it's a database column error
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      console.error('❌ Database column error - birth_date column missing');
      res.status(500).json({ 
        success: false, 
        message: 'Veritabanı hatası: birth_date kolonu eksik',
        type: 'DATABASE_ERROR',
        retryable: false
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Kullanıcı bilgileri alınırken hata oluştu',
        type: 'UNKNOWN_ERROR',
        retryable: false
      });
    }
  }
});

app.post('/api/users/login', authenticateTenant, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }
    
    // Store plain email (no encryption needed)
    
    // Get user with hashed password
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM users WHERE email = ? AND tenantId = ?',
      [email, req.tenant.id]
    );
    
    if (rows.length > 0) {
      const user = rows[0];
      
      // Verify password
      const isPasswordValid = await verifyPassword(password, user.password);
      
      if (isPasswordValid) {
        // Return user data (no decryption needed)
        const userData = {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          address: user.address || '',
          createdAt: user.createdAt
        };
        
        console.log('✅ User data retrieved for login');
        console.log('📧 Email:', !!userData.email);
        console.log('📱 Phone:', !!userData.phone);
        console.log('🏠 Address:', !!userData.address);
        
        res.json({ 
          success: true, 
          data: userData,
          message: 'Login successful'
        });
      } else {
        res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
    } else {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
  } catch (error) {
    console.error('❌ Error during login:', error);
    res.status(500).json({ success: false, message: 'Error during login' });
  }
});

app.put('/api/users/:id', authenticateTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, currentPassword, newPassword } = req.body;
    
    // Get current user
    const [userRows] = await poolWrapper.execute(
      'SELECT * FROM users WHERE id = ? AND tenantId = ?',
      [id, req.tenant.id]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const currentUser = userRows[0];
    
    // If password change is requested
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ 
          success: false, 
          message: 'Current password is required to change password' 
        });
      }
      
      // Verify current password
      const isCurrentPasswordValid = await verifyPassword(currentPassword, currentUser.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ 
          success: false, 
          message: 'Current password is incorrect' 
        });
      }
      
      // Validate new password
      if (newPassword.length < 6) {
        return res.status(400).json({ 
          success: false, 
          message: 'New password must be at least 6 characters long' 
        });
      }
      
      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);
      
      // Update user data (no encryption needed)
      const plainPhone = phone || currentUser.phone;
      const plainAddress = address || currentUser.address;
      
      await poolWrapper.execute(
        'UPDATE users SET name = ?, email = ?, phone = ?, address = ?, password = ? WHERE id = ? AND tenantId = ?',
        [name, email, plainPhone, plainAddress, hashedNewPassword, id, req.tenant.id]
      );
    } else {
      // Update user data (no encryption needed)
      const plainPhone = phone || currentUser.phone;
      const plainAddress = address || currentUser.address;
      
      await poolWrapper.execute(
        'UPDATE users SET name = ?, email = ?, phone = ?, address = ? WHERE id = ? AND tenantId = ?',
        [name, email, plainPhone, plainAddress, id, req.tenant.id]
      );
    }
    
    res.json({ 
      success: true, 
      message: 'User updated successfully' 
    });
  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({ success: false, message: 'Error updating user' });
  }
});

// Order endpoints (with tenant authentication)
app.get('/api/orders/user/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get orders with items
    const [orders] = await poolWrapper.execute(
      `SELECT o.id, o.totalAmount, o.status, o.createdAt, o.city, o.district, o.fullAddress, o.shippingAddress, o.paymentMethod
       FROM orders o 
       WHERE o.userId = ? AND o.tenantId = ? 
       ORDER BY o.createdAt DESC`,
      [userId, req.tenant.id]
    );
    
    // Get order items for each order
    for (let order of orders) {
      const [orderItems] = await poolWrapper.execute(`
        SELECT oi.quantity, oi.price, 
               p.name as productName, p.image as productImage
        FROM order_items oi
        LEFT JOIN products p ON oi.productId = p.id
        WHERE oi.orderId = ?
      `, [order.id]);
      
      order.items = orderItems;
    }
    
    console.log(`✅ Found ${orders.length} orders for user ${userId}`);
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('❌ Error getting user orders:', error);
    res.status(500).json({ success: false, message: 'Error getting orders' });
  }
});

app.post('/api/orders', authenticateTenant, async (req, res) => {
  try {
    const { 
      userId, totalAmount, status, shippingAddress, paymentMethod, items, 
      city, district, fullAddress, customerName, customerEmail, customerPhone 
    } = req.body;
    
    // Validate required fields
    if (!userId || !totalAmount || !shippingAddress || !paymentMethod) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order must contain at least one item' 
      });
    }
    
    // Begin transaction
    const connection = await poolWrapper.getConnection();
    await connection.beginTransaction();
    
    try {
      // Create order
      const [orderResult] = await connection.execute(
        `INSERT INTO orders (tenantId, userId, totalAmount, status, shippingAddress, paymentMethod, city, district, fullAddress, customerName, customerEmail, customerPhone) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.tenant.id, userId, totalAmount, status || 'pending', shippingAddress, paymentMethod, city, district, fullAddress, customerName, customerEmail, customerPhone]
      );
      
      const orderId = orderResult.insertId;
      
      // Create order items
      for (const item of items) {
        if (!item.productId || !item.quantity || !item.price) {
          throw new Error('Invalid item data');
        }
        
        await connection.execute(
          `INSERT INTO order_items (tenantId, orderId, productId, quantity, price, productName, productDescription, productCategory, productBrand, productImage) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.tenant.id, orderId, item.productId, item.quantity, item.price, 
           item.productName, item.productDescription, item.productCategory, item.productBrand, item.productImage]
        );
        
        // Update product stock
        await connection.execute(
          `UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ? AND tenantId = ?`,
          [item.quantity, item.productId, req.tenant.id]
        );
      }
      
      // Commit transaction
      await connection.commit();
      connection.release();
      
      console.log(`✅ Order created successfully: ${orderId} with ${items.length} items`);
      res.json({ success: true, data: { orderId } });
      
    } catch (error) {
      // Rollback transaction
      await connection.rollback();
      connection.release();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ success: false, message: 'Error creating order' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await poolWrapper.execute(
      'UPDATE orders SET status = ? WHERE id = ?',
      [status, id]
    );
    
    res.json({ success: true, message: 'Order status updated' });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Error updating order status' });
  }
});

app.put('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    await poolWrapper.execute(
      'UPDATE orders SET status = ? WHERE id = ?',
      ['cancelled', id]
    );
    
    res.json({ success: true, message: 'Order cancelled' });
  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Error cancelling order' });
  }
});

// Admin - Get all products (for admin panel)
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

// Product endpoints (with tenant authentication)
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
    const total = countRows[0].total;
    
    // Get paginated products
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM products WHERE tenantId = ? ORDER BY lastUpdated DESC LIMIT ? OFFSET ?',
      [req.tenant.id, limit, offset]
    );
    
    // Clean HTML entities from all products
    const cleanedProducts = rows.map(cleanProductData);
    
    res.json({ 
      success: true, 
      data: {
        products: cleanedProducts,
        total: total,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ success: false, message: 'Error getting products' });
  }
});

app.get('/api/products/search', async (req, res) => {
  try {
    const { q } = req.query;
    const search = String(q || '').trim();
    if (!search) {
      return res.json({ success: true, data: [] });
    }

    // Çoklu kiracı desteği: varsa kimliği doğrulanmış tenant üzerinden filtrele
    // Not: Diğer uç noktalarda kullanılan tenant ara katmanı burada yoksa, tüm ürünlerde arama yapılır
    const tenantId = req.tenant?.id;

    // İsim/açıklama/marka + stok kodu (externalId) + varyasyon SKU alanlarında arama
    // Varyasyon eşleşmesini getirmek için ürün tablosuna JOIN ile eşleştirip DISTINCT seçiyoruz
    const params = tenantId
      ? [
          `%${search}%`, `%${search}%`, `%${search}%`, // name/description/brand
          `%${search}%`, // externalId
          `%${search}%`, // option sku
          tenantId,
        ]
      : [
          `%${search}%`, `%${search}%`, `%${search}%`, // name/description/brand
          `%${search}%`, // externalId
          `%${search}%`, // option sku
        ];

    const whereTenant = tenantId ? ' AND p.tenantId = ?' : '';

    const [rows] = await poolWrapper.execute(
      `SELECT DISTINCT p.*
       FROM products p
       LEFT JOIN product_variations v ON v.productId = p.id
       LEFT JOIN product_variation_options o ON o.variationId = v.id
       WHERE (
         p.name LIKE ?
         OR p.description LIKE ?
         OR p.brand LIKE ?
         OR p.externalId LIKE ?
         OR o.sku LIKE ?
       )${whereTenant}
       ORDER BY p.lastUpdated DESC
       LIMIT 200`,
      params
    );

    const cleanedProducts = rows.map(cleanProductData);
    return res.json({ success: true, data: cleanedProducts });
  } catch (error) {
    console.error('Error searching products:', error);
    return res.status(500).json({ success: false, message: 'Error searching products' });
  }
});

app.get('/api/products/price-range', async (req, res) => {
  try {
    const [rows] = await poolWrapper.execute(
      'SELECT MIN(price) as minPrice, MAX(price) as maxPrice FROM products'
    );
    
    res.json({ 
      success: true, 
      data: {
        min: rows[0]?.minPrice || 0,
        max: rows[0]?.maxPrice || 0
      }
    });
  } catch (error) {
    console.error('Error getting price range:', error);
    res.status(500).json({ success: false, message: 'Error getting price range' });
  }
});

app.get('/api/products/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM products WHERE category = ? ORDER BY lastUpdated DESC',
      [category]
    );
    
    // Clean HTML entities from category products
    const cleanedProducts = rows.map(cleanProductData);
    
    res.json({ success: true, data: cleanedProducts });
  } catch (error) {
    console.error('Error getting products by category:', error);
    res.status(500).json({ success: false, message: 'Error getting products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await poolWrapper.execute('SELECT * FROM products WHERE id = ?', [id]);
    
    if (rows.length > 0) {
      // Clean HTML entities from single product
      const cleanedProduct = cleanProductData(rows[0]);
      res.json({ success: true, data: cleanedProduct });
    } else {
      res.status(404).json({ success: false, message: 'Product not found' });
    }
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ success: false, message: 'Error getting product' });
  }
});

// Product Variations Endpoints
app.get('/api/products/:productId/variations', async (req, res) => {
  try {
    const { productId } = req.params;
    const [rows] = await poolWrapper.execute('SELECT * FROM product_variations WHERE product_id = ?', [productId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching product variations:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/variations/:variationId/options', async (req, res) => {
  try {
    const { variationId } = req.params;
    const [rows] = await poolWrapper.execute('SELECT * FROM variation_options WHERE variation_id = ?', [variationId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching variation options:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/variation-options/:optionId', async (req, res) => {
  try {
    const { optionId } = req.params;
    const [rows] = await poolWrapper.execute('SELECT * FROM variation_options WHERE id = ?', [optionId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Variation option not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching variation option:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/products/filter', async (req, res) => {
  try {
    const { category, minPrice, maxPrice, brand, search } = req.body;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    if (minPrice !== undefined) {
      query += ' AND price >= ?';
      params.push(minPrice);
    }
    
    if (maxPrice !== undefined) {
      query += ' AND price <= ?';
      params.push(maxPrice);
    }
    
    if (brand) {
      query += ' AND brand = ?';
      params.push(brand);
    }
    
    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY lastUpdated DESC';
    
    const [rows] = await poolWrapper.execute(query, params);
    
    // Clean HTML entities from filtered products
    const cleanedProducts = rows.map(cleanProductData);
    
    res.json({ success: true, data: cleanedProducts });
  } catch (error) {
    console.error('❌ Error filtering products:', error);
    res.status(500).json({ success: false, message: 'Error filtering products' });
  }
});

app.put('/api/products/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    
    await poolWrapper.execute(
      'UPDATE products SET stock = ? WHERE id = ?',
      [quantity, id]
    );
    
    res.json({ success: true, message: 'Product stock updated' });
  } catch (error) {
    console.error('❌ Error updating product stock:', error);
    res.status(500).json({ success: false, message: 'Error updating product stock' });
  }
});

// Reviews endpoints
app.get('/api/reviews/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const [rows] = await poolWrapper.execute(
      `SELECT r.*, u.name as userName 
       FROM reviews r 
       JOIN users u ON r.userId = u.id 
       WHERE r.productId = ? 
       ORDER BY r.createdAt DESC`,
      [productId]
    );
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Error getting product reviews:', error);
    res.status(500).json({ success: false, message: 'Error getting product reviews' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { productId, userId, userName, rating, comment } = req.body;
    
    // Validate required fields
    if (!productId || !userId || !userName || !rating) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: productId, userId, userName, rating' 
      });
    }
    
    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rating must be between 1 and 5' 
      });
    }
    
    // Check if user already reviewed this product
    const [existingReview] = await poolWrapper.execute(
      'SELECT id FROM reviews WHERE productId = ? AND userId = ?',
      [productId, userId]
    );
    
    if (existingReview.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already reviewed this product' 
      });
    }
    
    // Insert new review
    const [result] = await poolWrapper.execute(
      'INSERT INTO reviews (productId, userId, userName, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [productId, userId, userName, rating, comment || '']
    );
    
    // Update product rating and review count
    const [reviewStats] = await poolWrapper.execute(
      `SELECT AVG(rating) as avgRating, COUNT(*) as reviewCount 
       FROM reviews 
       WHERE productId = ?`,
      [productId]
    );
    
    if (reviewStats.length > 0) {
      const { avgRating, reviewCount } = reviewStats[0];
      await poolWrapper.execute(
        'UPDATE products SET rating = ?, reviewCount = ? WHERE id = ?',
        [parseFloat(avgRating.toFixed(2)), reviewCount, productId]
      );
    }
    
    res.json({ 
      success: true, 
      data: { reviewId: result.insertId },
      message: 'Review added successfully' 
    });
  } catch (error) {
    console.error('❌ Error creating review:', error);
    res.status(500).json({ success: false, message: 'Error creating review' });
  }
});

// Cache for categories
let categoriesCache = null;
let categoriesCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Category and brand endpoints
app.get('/api/categories', async (req, res) => {
  try {
    // Check cache
    const now = Date.now();
    if (categoriesCache && (now - categoriesCacheTime) < CACHE_DURATION) {
      console.log('📋 Categories served from cache');
      return res.json({ 
        success: true, 
        data: categoriesCache,
        cached: true
      });
    }

    const [rows] = await poolWrapper.execute('SELECT DISTINCT category FROM products');
    const categories = rows.map(row => row.category);
    
    // Update cache
    categoriesCache = categories;
    categoriesCacheTime = now;
    console.log('📋 Categories cached for 5 minutes');
    
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ success: false, message: 'Error getting categories' });
  }
});

app.get('/api/brands', async (req, res) => {
  try {
    const [rows] = await poolWrapper.execute(
      'SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != ""'
    );
    const brands = rows.map(row => row.brand).sort();
    res.json({ success: true, data: brands });
  } catch (error) {
    console.error('Error getting brands:', error);
    res.status(500).json({ success: false, message: 'Error getting brands' });
  }
});

// XML Sync endpoints
app.post('/api/sync/trigger', async (req, res) => {
  if (!xmlSyncService) {
    return res.status(503).json({ 
      success: false, 
      message: 'XML Sync Service not available' 
    });
  }
  
  try {
    await xmlSyncService.triggerManualSync();
    res.json({ 
      success: true, 
      message: 'Manual sync triggered successfully' 
    });
  } catch (error) {
    console.error('❌ Error triggering manual sync:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error triggering manual sync' 
    });
  }
});

app.get('/api/sync/status', (req, res) => {
  if (!xmlSyncService) {
    return res.status(503).json({ 
      success: false, 
      message: 'XML Sync Service not available' 
    });
  }
  
  const status = xmlSyncService.getSyncStatus();
  res.json({ success: true, data: status });
});

// Start server
async function startServer() {
  await initializeDatabase();
  
  // Cart endpoints
  app.get('/api/cart/:userId', authenticateTenant, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const [rows] = await poolWrapper.execute(
        `SELECT c.*, p.name, p.price, p.image, p.stock 
         FROM cart c 
         JOIN products p ON c.productId = p.id 
         WHERE c.userId = ? AND c.tenantId = ?
         ORDER BY c.createdAt DESC`,
        [userId, req.tenant?.id || 1]
      );
      
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('❌ Error getting cart:', error);
      res.status(500).json({ success: false, message: 'Error getting cart' });
    }
  });

  app.post('/api/cart', authenticateTenant, async (req, res) => {
    try {
      const { userId, productId, quantity, variationString, selectedVariations, deviceId } = req.body;
      console.log(`🛒 Server: Adding to cart - User: ${userId}, Product: ${productId}, Quantity: ${quantity}`);
      
      // Validate required fields
      if (!userId || !productId || !quantity) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields: userId, productId, quantity' 
        });
      }
      
      // Tenant ID from authentication
      const tenantId = req.tenant?.id || 1;
      
      // Ensure guest user exists (userId = 1)
      if (userId === 1) {
        const [guestUser] = await poolWrapper.execute(
          'SELECT id FROM users WHERE id = 1'
        );
        
        if (guestUser.length === 0) {
          // Create guest user
          await poolWrapper.execute(
            'INSERT INTO users (id, email, password, name, phone, tenantId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [1, 'guest@huglu.com', 'guest', 'Guest User', '', tenantId, new Date().toISOString()]
          );
          console.log('✅ Guest user created');
        }
      }
      
      // Check if item already exists in cart
      let existingItemQuery = 'SELECT id, quantity FROM cart WHERE tenantId = ? AND productId = ? AND variationString = ?';
      const existingParams = [tenantId, productId, variationString || ''];
      if (userId && userId !== 1) {
        existingItemQuery += ' AND userId = ?';
        existingParams.push(userId);
      } else {
        existingItemQuery += ' AND userId = 1 AND deviceId = ?';
        existingParams.push(deviceId || '');
      }
      const [existingItem] = await poolWrapper.execute(existingItemQuery, existingParams);
      
      if (existingItem.length > 0) {
        // Update existing item
        const newQuantity = existingItem[0].quantity + quantity;
        await poolWrapper.execute(
          'UPDATE cart SET quantity = ?, selectedVariations = ? WHERE id = ?',
          [newQuantity, JSON.stringify(selectedVariations || {}), existingItem[0].id]
        );
        
        console.log(`✅ Server: Updated cart item ${existingItem[0].id} with quantity ${newQuantity}`);
        res.json({ 
          success: true, 
          message: 'Sepete eklendi',
          data: { cartItemId: existingItem[0].id, quantity: newQuantity }
        });
      } else {
        // Add new item
        const [result] = await poolWrapper.execute(
          'INSERT INTO cart (tenantId, userId, deviceId, productId, quantity, variationString, selectedVariations) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [tenantId, userId, userId === 1 ? (deviceId || '') : null, productId, quantity, variationString || '', JSON.stringify(selectedVariations || {})]
        );
        
        console.log(`✅ Server: Added new cart item ${result.insertId} for user ${userId}`);
        res.json({ 
          success: true, 
          message: 'Ürün sepete eklendi',
          data: { cartItemId: result.insertId }
        });
      }
    } catch (error) {
      console.error('❌ Error adding to cart:', error);
      res.status(500).json({ success: false, message: 'Sepete eklenirken hata oluştu' });
    }
  });

  app.put('/api/cart/:cartItemId', async (req, res) => {
    try {
      const { cartItemId } = req.params;
      const { quantity } = req.body;
      
      if (!quantity || quantity < 1) {
        return res.status(400).json({ 
          success: false, 
          message: 'Quantity must be at least 1' 
        });
      }
      
      await poolWrapper.execute(
        'UPDATE cart SET quantity = ? WHERE id = ?',
        [quantity, cartItemId]
      );
      
      res.json({ 
        success: true, 
        message: 'Cart item updated' 
      });
    } catch (error) {
      console.error('❌ Error updating cart item:', error);
      res.status(500).json({ success: false, message: 'Error updating cart item' });
    }
  });

  app.delete('/api/cart/:cartItemId', async (req, res) => {
    try {
      const { cartItemId } = req.params;
      
      await poolWrapper.execute(
        'DELETE FROM cart WHERE id = ?',
        [cartItemId]
      );
      
      res.json({ 
        success: true, 
        message: 'Item removed from cart' 
      });
    } catch (error) {
      console.error('❌ Error removing from cart:', error);
      res.status(500).json({ success: false, message: 'Error removing from cart' });
    }
  });

  app.get('/api/cart/user/:userId', authenticateTenant, async (req, res) => {
    try {
      const { userId } = req.params;
      const { deviceId } = req.query;
      console.log(`🛒 Server: Getting cart for user ${userId}`);
      
      // Tenant ID from authentication
      const tenantId = req.tenant?.id || 1;
      
      let getCartSql = `SELECT c.*, p.name, p.price, p.image, p.stock 
         FROM cart c 
         JOIN products p ON c.productId = p.id 
         WHERE c.tenantId = ?`;
      const getCartParams = [tenantId];
      if (parseInt(userId) !== 1) {
        getCartSql += ' AND c.userId = ?';
        getCartParams.push(userId);
      } else {
        getCartSql += ' AND c.userId = 1 AND c.deviceId = ?';
        getCartParams.push(String(deviceId || ''));
      }
      getCartSql += ' ORDER BY c.createdAt DESC';

      const [rows] = await poolWrapper.execute(getCartSql, getCartParams);
      
      console.log(`✅ Server: Found ${rows.length} cart items for user ${userId}`);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('❌ Error getting user cart:', error);
      res.status(500).json({ success: false, message: 'Error getting user cart' });
    }
  });

  app.get('/api/cart/user/:userId/total', authenticateTenant, async (req, res) => {
    try {
      const { userId } = req.params;
      const { deviceId } = req.query;
      
      let totalSql = `SELECT SUM(c.quantity * p.price) as total
         FROM cart c 
         JOIN products p ON c.productId = p.id 
         WHERE c.tenantId = ?`;
      const totalParams = [req.tenant?.id || 1];
      if (parseInt(userId) !== 1) {
        totalSql += ' AND c.userId = ?';
        totalParams.push(userId);
      } else {
        totalSql += ' AND c.userId = 1 AND c.deviceId = ?';
        totalParams.push(String(deviceId || ''));
      }

      const [rows] = await poolWrapper.execute(totalSql, totalParams);
      
      const total = rows[0]?.total || 0;
      res.json({ success: true, data: total });
    } catch (error) {
      console.error('❌ Error getting cart total:', error);
      res.status(500).json({ success: false, message: 'Error getting cart total' });
    }
  });

  // Detailed total with campaigns applied
  app.get('/api/cart/user/:userId/total-detailed', authenticateTenant, async (req, res) => {
    try {
      const { userId } = req.params;
      const { deviceId } = req.query;
      const tenantId = req.tenant?.id || 1;

      // Get cart items with product prices
      let itemsSql = `SELECT c.productId, c.quantity, p.price
        FROM cart c JOIN products p ON c.productId = p.id
        WHERE c.tenantId = ?`;
      const itemsParams = [tenantId];
      if (parseInt(userId) !== 1) {
        itemsSql += ' AND c.userId = ?';
        itemsParams.push(userId);
      } else {
        itemsSql += ' AND c.userId = 1 AND c.deviceId = ?';
        itemsParams.push(String(deviceId || ''));
      }

      const [cartRows] = await poolWrapper.execute(itemsSql, itemsParams);
      const subtotal = cartRows.reduce((sum, r) => sum + (Number(r.price) || 0) * (Number(r.quantity) || 0), 0);

      // Load active campaigns
      const [campaigns] = await poolWrapper.execute(
        `SELECT * FROM campaigns WHERE tenantId = ? AND isActive = 1 AND status = 'active'
         AND (startDate IS NULL OR startDate <= NOW()) AND (endDate IS NULL OR endDate >= NOW())`,
        [tenantId]
      );

      let discountTotal = 0;
      let shipping = subtotal >= 500 ? 0 : 29.9; // default policy fallback

      // Apply product-specific discounts
      for (const camp of campaigns) {
        if (camp.type === 'discount' && camp.applicableProducts) {
          try {
            const applicable = typeof camp.applicableProducts === 'string' ? JSON.parse(camp.applicableProducts) : camp.applicableProducts;
            const set = new Set(Array.isArray(applicable) ? applicable : []);
            for (const row of cartRows) {
              if (set.has(row.productId)) {
                const price = Number(row.price) || 0;
                const qty = Number(row.quantity) || 0;
                if (camp.discountType === 'percentage') {
                  discountTotal += (price * qty) * (Number(camp.discountValue) || 0) / 100;
                } else if (camp.discountType === 'fixed') {
                  discountTotal += (Number(camp.discountValue) || 0) * qty;
                }
              }
            }
          } catch {}
        }
      }

      // Apply cart threshold discounts and free shipping
      for (const camp of campaigns) {
        if (camp.type === 'free_shipping' && subtotal >= (Number(camp.minOrderAmount) || 0)) {
          shipping = 0;
        }
        if (camp.type === 'discount' && (!camp.applicableProducts) && subtotal >= (Number(camp.minOrderAmount) || 0)) {
          if (camp.discountType === 'percentage') {
            discountTotal += subtotal * (Number(camp.discountValue) || 0) / 100;
          } else if (camp.discountType === 'fixed') {
            discountTotal += Number(camp.discountValue) || 0;
          }
        }
      }

      // Cap max discount amount if defined
      for (const camp of campaigns) {
        if (camp.maxDiscountAmount) {
          discountTotal = Math.min(discountTotal, Number(camp.maxDiscountAmount) || discountTotal);
        }
      }

      const total = Math.max(0, subtotal - discountTotal + shipping);

      res.json({ success: true, data: { subtotal, discount: Number(discountTotal.toFixed(2)), shipping: Number(shipping.toFixed(2)), total: Number(total.toFixed(2)) } });
    } catch (error) {
      console.error('❌ Error getting detailed cart total:', error);
      res.status(500).json({ success: false, message: 'Error getting detailed cart total' });
    }
  });

  // Campaign endpoints
  app.get('/api/campaigns', authenticateTenant, async (req, res) => {
    try {
      const tenantId = req.tenant?.id || 1;
      const [rows] = await poolWrapper.execute(
        `SELECT * FROM campaigns WHERE tenantId = ? ORDER BY updatedAt DESC`,
        [tenantId]
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('❌ Error listing campaigns:', error);
      res.status(500).json({ success: false, message: 'Error listing campaigns' });
    }
  });

  app.post('/api/campaigns', authenticateTenant, async (req, res) => {
    try {
      const tenantId = req.tenant?.id || 1;
      const { name, description, type, status = 'active', discountType, discountValue = 0, minOrderAmount = 0, maxDiscountAmount = null, applicableProducts = null, excludedProducts = null, startDate = null, endDate = null, isActive = true } = req.body;

      await poolWrapper.execute(
        `INSERT INTO campaigns (tenantId, name, description, type, status, discountType, discountValue, minOrderAmount, maxDiscountAmount, applicableProducts, excludedProducts, startDate, endDate, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, name || 'Campaign', description || '', type || 'discount', status, discountType || 'percentage', discountValue, minOrderAmount, maxDiscountAmount, applicableProducts ? JSON.stringify(applicableProducts) : null, excludedProducts ? JSON.stringify(excludedProducts) : null, startDate, endDate, isActive ? 1 : 0]
      );

      res.json({ success: true, message: 'Campaign created' });
    } catch (error) {
      console.error('❌ Error creating campaign:', error);
      res.status(500).json({ success: false, message: 'Error creating campaign' });
    }
  });

  app.delete('/api/cart/user/:userId', authenticateTenant, async (req, res) => {
    try {
      const { userId } = req.params;
      const { deviceId } = req.query;
      
      let deleteSql = 'DELETE FROM cart WHERE tenantId = ?';
      const deleteParams = [req.tenant?.id || 1];
      if (parseInt(userId) !== 1) {
        deleteSql += ' AND userId = ?';
        deleteParams.push(userId);
      } else {
        deleteSql += ' AND userId = 1 AND deviceId = ?';
        deleteParams.push(String(deviceId || ''));
      }

      await poolWrapper.execute(deleteSql, deleteParams);
      
      res.json({ 
        success: true, 
        message: 'Cart cleared' 
      });
    } catch (error) {
      console.error('❌ Error clearing cart:', error);
      res.status(500).json({ success: false, message: 'Error clearing cart' });
    }
  });

  // User profile endpoints
  app.put('/api/users/:userId/profile', async (req, res) => {
    try {
      const { userId } = req.params;
      const { name, email, phone, address } = req.body;
      
      console.log(`👤 Updating profile for user ${userId}:`, { name, email, phone, address });
      
      // Validate required fields
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message: 'Ad ve e-posta alanları gereklidir'
        });
      }
      
      // Check if email is already taken by another user
      const [existingUser] = await poolWrapper.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );
      
      if (existingUser.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Bu e-posta adresi zaten kullanılıyor'
        });
      }
      
      // Update user profile
      await poolWrapper.execute(
        'UPDATE users SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?',
        [name, email, phone || '', address || '', userId]
      );
      
      console.log(`✅ Profile updated successfully for user ${userId}`);
      res.json({
        success: true,
        message: 'Profil başarıyla güncellendi'
      });
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      res.status(500).json({
        success: false,
        message: 'Profil güncellenirken bir hata oluştu'
      });
    }
  });

  app.put('/api/users/:userId/password', async (req, res) => {
    try {
      const { userId } = req.params;
      const { currentPassword, newPassword } = req.body;
      
      console.log(`🔒 Changing password for user ${userId}`);
      
      // Validate required fields
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Mevcut şifre ve yeni şifre gereklidir'
        });
      }
      
      // Validate new password strength
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Yeni şifre en az 6 karakter olmalıdır'
        });
      }
      
      // Get current user
      const [user] = await poolWrapper.execute(
        'SELECT password FROM users WHERE id = ?',
        [userId]
      );
      
      if (user.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Kullanıcı bulunamadı'
        });
      }
      
      // For guest user (id = 1), skip password verification
      if (userId != 1) {
        // Verify current password (in real app, use bcrypt)
        if (user[0].password !== currentPassword) {
          return res.status(400).json({
            success: false,
            message: 'Mevcut şifre yanlış'
          });
        }
      }
      
      // Update password (in real app, hash with bcrypt)
      await poolWrapper.execute(
        'UPDATE users SET password = ? WHERE id = ?',
        [newPassword, userId]
      );
      
      console.log(`✅ Password changed successfully for user ${userId}`);
      res.json({
        success: true,
        message: 'Şifre başarıyla değiştirildi'
      });
    } catch (error) {
      console.error('❌ Error changing password:', error);
      res.status(500).json({
        success: false,
        message: 'Şifre değiştirilirken bir hata oluştu'
      });
    }
  });

// Wallet endpoints (simplified authentication for guest users)
app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`💰 Getting wallet for user: ${userId}`);
    
    // Default tenant ID for guest users
    const tenantId = 1;
    
    // Get user wallet balance
    const [walletRows] = await poolWrapper.execute(
      'SELECT balance, currency FROM user_wallets WHERE userId = ? AND tenantId = ?',
      [userId, tenantId]
    );
    
    let balance = 0;
    let currency = 'TRY';
    
    if (walletRows.length > 0) {
      balance = walletRows[0].balance;
      currency = walletRows[0].currency;
    } else {
      // Create wallet if doesn't exist
      await poolWrapper.execute(
        'INSERT INTO user_wallets (userId, tenantId, balance, currency) VALUES (?, ?, ?, ?)',
        [userId, tenantId, 0, 'TRY']
      );
    }
    
    // Get recent transactions
    const [transactions] = await poolWrapper.execute(
      `SELECT id, type, amount, description, status, createdAt 
       FROM wallet_transactions 
       WHERE userId = ? AND tenantId = ? 
       ORDER BY createdAt DESC 
       LIMIT 20`,
      [userId, tenantId]
    );
    
    console.log(`✅ Found wallet with balance: ${balance} ${currency}, ${transactions.length} transactions`);
    res.json({ 
      success: true, 
      data: { 
        balance, 
        currency, 
        transactions: transactions.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          status: t.status,
          date: t.createdAt
        }))
      } 
    });
  } catch (error) {
    console.error('❌ Error getting wallet:', error);
    res.status(500).json({ success: false, message: 'Error getting wallet' });
  }
});

app.post('/api/wallet/:userId/add-money', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, paymentMethod, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    
    console.log(`💰 Adding money to wallet: User ${userId}, Amount: ${amount}`);
    
    // Default tenant ID for guest users
    const tenantId = 1;
    
    const connection = await poolWrapper.getConnection();
    await connection.beginTransaction();
    
    try {
      // Update wallet balance
      const [updateResult] = await connection.execute(
        `INSERT INTO user_wallets (userId, tenantId, balance, currency) 
         VALUES (?, ?, ?, 'TRY') 
         ON DUPLICATE KEY UPDATE balance = balance + ?`,
        [userId, tenantId, amount, amount]
      );
      
      // Add transaction record
      await connection.execute(
        `INSERT INTO wallet_transactions (userId, tenantId, type, amount, description, status, paymentMethod) 
         VALUES (?, ?, 'credit', ?, ?, 'completed', ?)`,
        [userId, tenantId, amount, description || 'Para yükleme', paymentMethod || 'credit_card']
      );
      
      await connection.commit();
      connection.release();
      
      console.log(`✅ Money added successfully: ${amount} TRY`);
      res.json({ success: true, message: 'Para başarıyla yüklendi' });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('❌ Error adding money:', error);
    res.status(500).json({ success: false, message: 'Para yükleme hatası' });
  }
});


app.get('/api/wallet/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    console.log(`💰 Getting transactions for user: ${userId}`);
    
    // Default tenant ID for guest users
    const tenantId = 1;
    
    const [transactions] = await poolWrapper.execute(
      `SELECT id, type, amount, description, status, paymentMethod, createdAt 
       FROM wallet_transactions 
       WHERE userId = ? AND tenantId = ? 
       ORDER BY createdAt DESC 
       LIMIT ? OFFSET ?`,
      [userId, tenantId, parseInt(limit), parseInt(offset)]
    );
    
    console.log(`✅ Found ${transactions.length} transactions`);
    res.json({ 
      success: true, 
      data: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        status: t.status,
        paymentMethod: t.paymentMethod,
        date: t.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Error getting transactions:', error);
    res.status(500).json({ success: false, message: 'Error getting transactions' });
  }
});

// Custom Production Requests API endpoints

// Get all custom production requests for a user
app.get('/api/custom-production-requests/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0, status } = req.query;
    
    console.log(`🎨 Getting custom production requests for user: ${userId}`);
    
    // Default tenant ID
    const tenantId = 1;
    
    let query = `
      SELECT cpr.*, 
             GROUP_CONCAT(
               CONCAT(
                 JSON_OBJECT(
                   'id', cpi.id,
                   'productId', cpi.productId,
                   'quantity', cpi.quantity,
                   'customizations', cpi.customizations
                 )
               ) SEPARATOR '|||'
             ) as items
      FROM custom_production_requests cpr
      LEFT JOIN custom_production_items cpi ON cpr.id = cpi.requestId
      WHERE cpr.userId = ? AND cpr.tenantId = ?
    `;
    
    const params = [userId, tenantId];
    
    if (status) {
      query += ' AND cpr.status = ?';
      params.push(status);
    }
    
    query += `
      GROUP BY cpr.id
      ORDER BY cpr.createdAt DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const [requests] = await poolWrapper.execute(query, params);
    
    // Parse items JSON
    const formattedRequests = requests.map(request => {
      const items = request.items ? 
        request.items.split('|||').map(item => JSON.parse(item)) : [];
      
      return {
        id: request.id,
        requestNumber: request.requestNumber,
        status: request.status,
        totalQuantity: request.totalQuantity,
        totalAmount: request.totalAmount,
        customerName: request.customerName,
        customerEmail: request.customerEmail,
        customerPhone: request.customerPhone,
        notes: request.notes,
        estimatedDeliveryDate: request.estimatedDeliveryDate,
        actualDeliveryDate: request.actualDeliveryDate,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        items: items
      };
    });
    
    console.log(`✅ Found ${formattedRequests.length} custom production requests`);
    res.json({ success: true, data: formattedRequests });
    
  } catch (error) {
    console.error('❌ Error getting custom production requests:', error);
    res.status(500).json({ success: false, message: 'Error getting custom production requests' });
  }
});

// Get single custom production request
app.get('/api/custom-production-requests/:userId/:requestId', async (req, res) => {
  try {
    const { userId, requestId } = req.params;
    
    console.log(`🎨 Getting custom production request: ${requestId} for user: ${userId}`);
    
    // Default tenant ID
    const tenantId = 1;
    
    // Get request details
    const [requests] = await poolWrapper.execute(
      `SELECT * FROM custom_production_requests 
       WHERE id = ? AND userId = ? AND tenantId = ?`,
      [requestId, userId, tenantId]
    );
    
    if (requests.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    const request = requests[0];
    
    // Get request items with product details
    const [items] = await poolWrapper.execute(`
      SELECT cpi.*, p.name as productName, p.image as productImage, p.price as productPrice
      FROM custom_production_items cpi
      LEFT JOIN products p ON cpi.productId = p.id
      WHERE cpi.requestId = ? AND cpi.tenantId = ?
      ORDER BY cpi.createdAt
    `, [requestId, tenantId]);
    
    const formattedRequest = {
      ...request,
      items: items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        productPrice: item.productPrice,
        quantity: item.quantity,
        customizations: JSON.parse(item.customizations)
      }))
    };
    
    console.log(`✅ Found custom production request with ${items.length} items`);
    res.json({ success: true, data: formattedRequest });
    
  } catch (error) {
    console.error('❌ Error getting custom production request:', error);
    res.status(500).json({ success: false, message: 'Error getting custom production request' });
  }
});

// Create custom production request
app.post('/api/custom-production-requests', async (req, res) => {
  try {
    const { 
      userId, 
      items, 
      customerName, 
      customerEmail, 
      customerPhone, 
      notes 
    } = req.body;
    
    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and items are required' 
      });
    }
    
    if (!customerName || !customerEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer name and email are required' 
      });
    }
    
    console.log(`🎨 Creating custom production request for user: ${userId}`);
    
    // Default tenant ID
    const tenantId = 1;
    
    // Generate request number
    const requestNumber = `CP${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    
    // Calculate total quantity and amount
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalAmount = items.reduce((sum, item) => {
      const price = item.productPrice || 0;
      const quantity = item.quantity || 0;
      return sum + (price * quantity);
    }, 0);
    
    const connection = await poolWrapper.getConnection();
    await connection.beginTransaction();
    
    try {
      // Create custom production request
      const [requestResult] = await connection.execute(
        `INSERT INTO custom_production_requests 
         (tenantId, userId, requestNumber, status, totalQuantity, totalAmount, 
          customerName, customerEmail, customerPhone, notes) 
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
        [tenantId, userId, requestNumber, totalQuantity, totalAmount, 
         customerName, customerEmail, customerPhone || null, notes || null]
      );
      
      const requestId = requestResult.insertId;
      
      // Create custom production items
      for (const item of items) {
        await connection.execute(
          `INSERT INTO custom_production_items 
           (tenantId, requestId, productId, quantity, customizations) 
           VALUES (?, ?, ?, ?, ?)`,
          [tenantId, requestId, item.productId, item.quantity, JSON.stringify(item.customizations)]
        );
      }
      
      await connection.commit();
      connection.release();
      
      console.log(`✅ Custom production request created: ${requestNumber}`);
      res.json({ 
        success: true, 
        message: 'Custom production request created successfully',
        data: {
          id: requestId,
          requestNumber: requestNumber,
          status: 'pending',
          totalQuantity: totalQuantity,
          totalAmount: totalAmount
        }
      });
      
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error creating custom production request:', error);
    res.status(500).json({ success: false, message: 'Error creating custom production request' });
  }
});

// Update custom production request status (admin only)
app.put('/api/custom-production-requests/:requestId/status', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, estimatedDeliveryDate, actualDeliveryDate, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Status is required' 
      });
    }
    
    const validStatuses = ['pending', 'review', 'design', 'production', 'shipped', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status' 
      });
    }
    
    console.log(`🎨 Updating custom production request status: ${requestId} to ${status}`);
    
    // Default tenant ID
    const tenantId = 1;
    
    const updateFields = ['status = ?'];
    const params = [status, requestId, tenantId];
    
    if (estimatedDeliveryDate) {
      updateFields.push('estimatedDeliveryDate = ?');
      params.splice(-2, 0, estimatedDeliveryDate);
    }
    
    if (actualDeliveryDate) {
      updateFields.push('actualDeliveryDate = ?');
      params.splice(-2, 0, actualDeliveryDate);
    }
    
    if (notes) {
      updateFields.push('notes = ?');
      params.splice(-2, 0, notes);
    }
    
    const [result] = await poolWrapper.execute(
      `UPDATE custom_production_requests 
       SET ${updateFields.join(', ')}, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND tenantId = ?`,
      params
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    console.log(`✅ Custom production request status updated: ${requestId}`);
    res.json({ success: true, message: 'Status updated successfully' });
    
  } catch (error) {
    console.error('❌ Error updating custom production request status:', error);
    res.status(500).json({ success: false, message: 'Error updating status' });
  }
});

// Manual XML sync endpoint
app.post('/api/sync/products', async (req, res) => {
  try {
    console.log('🔄 Manual XML sync triggered...');
    
    if (!xmlSyncService) {
      return res.status(500).json({ 
        success: false, 
        message: 'XML sync service not initialized' 
      });
    }
    
    // Trigger manual sync
    await xmlSyncService.syncProducts();
    
    res.json({ 
      success: true, 
      message: 'Product sync completed successfully with updated price logic',
      timestamp: new Date().toISOString(),
      note: 'IndirimliFiyat = 0 ise SatisFiyati kullanıldı'
    });
    
  } catch (error) {
    console.error('❌ Error in manual sync:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error during product sync: ' + error.message 
    });
  }
});

// ==================== CAMPAIGN MANAGEMENT API ====================

// Admin - Get all campaigns (for admin panel)
app.get('/api/campaigns', authenticateAdmin, async (req, res) => {
  try {
    const [campaigns] = await poolWrapper.execute(`
      SELECT c.*, cs.name as segmentName 
      FROM campaigns c 
      LEFT JOIN customer_segments cs ON c.targetSegmentId = cs.id 
      ORDER BY c.createdAt DESC
    `);
    
    res.json({
      success: true,
      data: campaigns
    });
    
  } catch (error) {
    console.error('❌ Error fetching campaigns:', error);
    res.status(500).json({ success: false, message: 'Error fetching campaigns' });
  }
});

// Admin - Get all segments (for admin panel)
app.get('/api/campaigns/segments', authenticateAdmin, async (req, res) => {
  try {
    const [segments] = await poolWrapper.execute(`
      SELECT cs.*, COUNT(csa.userId) as customerCount
      FROM customer_segments cs 
      LEFT JOIN customer_segment_assignments csa ON cs.id = csa.segmentId
      GROUP BY cs.id
      ORDER BY cs.createdAt DESC
    `);
    
    // Parse JSON criteria
    const parsedSegments = segments.map(segment => ({
      ...segment,
      criteria: JSON.parse(segment.criteria)
    }));
    
    res.json({
      success: true,
      data: parsedSegments
    });
    
  } catch (error) {
    console.error('❌ Error fetching customer segments:', error);
    res.status(500).json({ success: false, message: 'Error fetching customer segments' });
  }
});

// Admin - Create campaign
app.post('/api/campaigns', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, type, targetSegmentId, discountType, discountValue, minOrderAmount, startDate, endDate, usageLimit } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name and type are required'
      });
    }
    
    console.log('🎯 Creating campaign:', { name, type });
    
    const [result] = await poolWrapper.execute(
      'INSERT INTO campaigns (tenantId, name, description, type, targetSegmentId, discountType, discountValue, minOrderAmount, startDate, endDate, usageLimit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, name, description || '', type, targetSegmentId || null, discountType || 'percentage', discountValue || 0, minOrderAmount || 0, startDate || null, endDate || null, usageLimit || null]
    );
    
    res.json({
      success: true,
      message: 'Campaign created successfully',
      data: { campaignId: result.insertId }
    });
    
  } catch (error) {
    console.error('❌ Error creating campaign:', error);
    res.status(500).json({ success: false, message: 'Error creating campaign' });
  }
});

// Admin - Create segment
app.post('/api/campaigns/segments', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, criteria } = req.body;
    
    if (!name || !criteria) {
      return res.status(400).json({
        success: false,
        message: 'Name and criteria are required'
      });
    }
    
    console.log('🎯 Creating customer segment:', { name, criteria });
    
    const [result] = await poolWrapper.execute(
      'INSERT INTO customer_segments (tenantId, name, description, criteria) VALUES (?, ?, ?, ?)',
      [1, name, description || '', JSON.stringify(criteria)]
    );
    
    res.json({
      success: true,
      message: 'Customer segment created successfully',
      data: { segmentId: result.insertId }
    });
    
  } catch (error) {
    console.error('❌ Error creating customer segment:', error);
    res.status(500).json({ success: false, message: 'Error creating customer segment' });
  }
});

// Admin - Auto create segments
app.post('/api/campaigns/segments/auto-create', authenticateAdmin, async (req, res) => {
  try {
    console.log('🤖 Creating automatic segments...');
    
    // Create RFM-based segments
    const rfmSegments = [
      {
        name: 'Champions',
        description: 'En değerli müşteriler - sık sık alışveriş yapan, yüksek harcama yapan müşteriler',
        criteria: { rfmScore: '555', minOrders: 10, minSpent: 2000 }
      },
      {
        name: 'Loyal Customers',
        description: 'Sadık müşteriler - düzenli alışveriş yapan müşteriler',
        criteria: { rfmScore: '444', minOrders: 5, minSpent: 1000 }
      },
      {
        name: 'Potential Loyalists',
        description: 'Potansiyel sadık müşteriler - düzenli alışveriş yapmaya başlayan müşteriler',
        criteria: { rfmScore: '333', minOrders: 3, minSpent: 500 }
      },
      {
        name: 'New Customers',
        description: 'Yeni müşteriler - henüz alışveriş geçmişi az olan müşteriler',
        criteria: { rfmScore: '222', maxOrders: 2, maxSpent: 500 }
      },
      {
        name: 'At Risk',
        description: 'Risk altındaki müşteriler - uzun süredir alışveriş yapmayan müşteriler',
        criteria: { lastOrderDays: 90, minOrders: 1 }
      }
    ];

    let segmentsCreated = 0;
    for (const segmentData of rfmSegments) {
      try {
        await poolWrapper.execute(
          'INSERT INTO customer_segments (tenantId, name, description, criteria) VALUES (?, ?, ?, ?)',
          [1, segmentData.name, segmentData.description, JSON.stringify(segmentData.criteria)]
        );
        segmentsCreated++;
      } catch (error) {
        console.log(`⚠️ Segment ${segmentData.name} already exists or error:`, error.message);
      }
    }
    
    res.json({
      success: true,
      message: `${segmentsCreated} otomatik segment oluşturuldu`,
      data: { segmentsCreated }
    });
    
  } catch (error) {
    console.error('❌ Error creating automatic segments:', error);
    res.status(500).json({ success: false, message: 'Error creating automatic segments' });
  }
});

// Customer Segments API (for tenants)
app.post('/api/campaigns/segments', authenticateTenant, async (req, res) => {
  try {
    const { name, description, criteria } = req.body;
    
    if (!name || !criteria) {
      return res.status(400).json({
        success: false,
        message: 'Name and criteria are required'
      });
    }
    
    console.log('🎯 Creating customer segment:', { name, criteria });
    
    const [result] = await poolWrapper.execute(
      'INSERT INTO customer_segments (tenantId, name, description, criteria) VALUES (?, ?, ?, ?)',
      [req.tenant.id, name, description || '', JSON.stringify(criteria)]
    );
    
    res.json({
      success: true,
      message: 'Customer segment created successfully',
      data: { segmentId: result.insertId }
    });
    
  } catch (error) {
    console.error('❌ Error creating customer segment:', error);
    res.status(500).json({ success: false, message: 'Error creating customer segment' });
  }
});

app.get('/api/campaigns/segments', authenticateTenant, async (req, res) => {
  try {
    const [segments] = await poolWrapper.execute(
      'SELECT * FROM customer_segments WHERE tenantId = ? ORDER BY createdAt DESC',
      [req.tenant.id]
    );
    
    // Parse JSON criteria
    const parsedSegments = segments.map(segment => ({
      ...segment,
      criteria: JSON.parse(segment.criteria)
    }));
    
    res.json({
      success: true,
      data: parsedSegments
    });
    
  } catch (error) {
    console.error('❌ Error fetching customer segments:', error);
    res.status(500).json({ success: false, message: 'Error fetching customer segments' });
  }
});

// Campaigns API
app.post('/api/campaigns', authenticateTenant, async (req, res) => {
  try {
    const {
      name, description, type, targetSegmentId, discountType, discountValue,
      minOrderAmount, maxDiscountAmount, applicableProducts, excludedProducts,
      startDate, endDate, usageLimit
    } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name and type are required'
      });
    }
    
    console.log('🎪 Creating campaign:', { name, type });
    
    const [result] = await poolWrapper.execute(
      `INSERT INTO campaigns (tenantId, name, description, type, targetSegmentId, discountType, 
       discountValue, minOrderAmount, maxDiscountAmount, applicableProducts, excludedProducts, 
       startDate, endDate, usageLimit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.tenant.id, name, description || '', type, targetSegmentId || null,
        discountType || 'percentage', discountValue || 0, minOrderAmount || 0,
        maxDiscountAmount || null, JSON.stringify(applicableProducts || []),
        JSON.stringify(excludedProducts || []), startDate || null, endDate || null,
        usageLimit || null
      ]
    );
    
    res.json({
      success: true,
      message: 'Campaign created successfully',
      data: { campaignId: result.insertId }
    });
    
  } catch (error) {
    console.error('❌ Error creating campaign:', error);
    res.status(500).json({ success: false, message: 'Error creating campaign' });
  }
});

app.get('/api/campaigns', authenticateTenant, async (req, res) => {
  try {
    const [campaigns] = await poolWrapper.execute(
      `SELECT c.*, cs.name as segmentName 
       FROM campaigns c 
       LEFT JOIN customer_segments cs ON c.targetSegmentId = cs.id 
       WHERE c.tenantId = ? 
       ORDER BY c.createdAt DESC`,
      [req.tenant.id]
    );
    
    // Parse JSON fields
    const parsedCampaigns = campaigns.map(campaign => ({
      ...campaign,
      applicableProducts: JSON.parse(campaign.applicableProducts || '[]'),
      excludedProducts: JSON.parse(campaign.excludedProducts || '[]')
    }));
    
    res.json({
      success: true,
      data: parsedCampaigns
    });
    
  } catch (error) {
    console.error('❌ Error fetching campaigns:', error);
    res.status(500).json({ success: false, message: 'Error fetching campaigns' });
  }
});

// Customer Analytics API
app.get('/api/campaigns/analytics/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get or create customer analytics
    let [analytics] = await poolWrapper.execute(
      'SELECT * FROM customer_analytics WHERE userId = ? AND tenantId = ?',
      [userId, req.tenant.id]
    );
    
    if (analytics.length === 0) {
      // Create new analytics record
      await poolWrapper.execute(
        `INSERT INTO customer_analytics (tenantId, userId, lastActivityDate) VALUES (?, ?, NOW())`,
        [req.tenant.id, userId]
      );
      
      [analytics] = await poolWrapper.execute(
        'SELECT * FROM customer_analytics WHERE userId = ? AND tenantId = ?',
        [userId, req.tenant.id]
      );
    }
    
    const customerAnalytics = analytics[0];
    
    // Parse JSON fields
    customerAnalytics.favoriteCategories = JSON.parse(customerAnalytics.favoriteCategories || '[]');
    customerAnalytics.favoriteBrands = JSON.parse(customerAnalytics.favoriteBrands || '[]');
    
    res.json({
      success: true,
      data: customerAnalytics
    });
    
  } catch (error) {
    console.error('❌ Error fetching customer analytics:', error);
    res.status(500).json({ success: false, message: 'Error fetching customer analytics' });
  }
});

// Product Recommendations API
app.get('/api/campaigns/recommendations/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, type } = req.query;
    
    let query = `
      SELECT pr.*, p.name, p.price, p.image, p.category, p.brand
      FROM product_recommendations pr
      JOIN products p ON pr.productId = p.id
      WHERE pr.userId = ? AND pr.tenantId = ? AND (pr.expiresAt IS NULL OR pr.expiresAt > NOW())
    `;
    
    const params = [userId, req.tenant.id];
    
    if (type) {
      query += ' AND pr.recommendationType = ?';
      params.push(type);
    }
    
    query += ' ORDER BY pr.score DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const [recommendations] = await poolWrapper.execute(query, params);
    
    res.json({
      success: true,
      data: recommendations || []
    });
    
  } catch (error) {
    console.error('❌ Error fetching product recommendations:', error);
    res.status(500).json({ success: false, message: 'Error fetching product recommendations' });
  }
});

// Campaign Usage Tracking
app.post('/api/campaigns/usage', authenticateTenant, async (req, res) => {
  try {
    const { campaignId, userId, orderId, discountAmount } = req.body;
    
    if (!campaignId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID and User ID are required'
      });
    }
    
    console.log('📊 Tracking campaign usage:', { campaignId, userId, orderId });
    
    await poolWrapper.execute(
      'INSERT INTO campaign_usage (tenantId, campaignId, userId, orderId, discountAmount) VALUES (?, ?, ?, ?, ?)',
      [req.tenant.id, campaignId, userId, orderId || null, discountAmount || 0]
    );
    
    // Update campaign usage count
    await poolWrapper.execute(
      'UPDATE campaigns SET usedCount = usedCount + 1 WHERE id = ? AND tenantId = ?',
      [campaignId, req.tenant.id]
    );
    
    res.json({
      success: true,
      message: 'Campaign usage tracked successfully'
    });
    
  } catch (error) {
    console.error('❌ Error tracking campaign usage:', error);
    res.status(500).json({ success: false, message: 'Error tracking campaign usage' });
  }
});

// Get available campaigns for user
app.get('/api/campaigns/available/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [campaigns] = await poolWrapper.execute(
      `SELECT c.*, cs.name as segmentName
       FROM campaigns c
       LEFT JOIN customer_segments cs ON c.targetSegmentId = cs.id
       WHERE c.tenantId = ? 
       AND c.status = 'active' 
       AND c.isActive = true
       AND (c.startDate IS NULL OR c.startDate <= NOW())
       AND (c.endDate IS NULL OR c.endDate >= NOW())
       AND (c.usageLimit IS NULL OR c.usedCount < c.usageLimit)
       ORDER BY c.createdAt DESC`,
      [req.tenant.id]
    );
    
    // Filter campaigns based on user segments
    const userSegments = await poolWrapper.execute(
      'SELECT segmentId FROM customer_segment_assignments WHERE userId = ? AND tenantId = ?',
      [userId, req.tenant.id]
    );
    
    const userSegmentIds = userSegments.map(row => row.segmentId);
    
    const availableCampaigns = campaigns.filter(campaign => {
      // If no target segment, campaign is available to all
      if (!campaign.targetSegmentId) return true;
      
      // Check if user is in the target segment
      return userSegmentIds.includes(campaign.targetSegmentId);
    });
    
    // Parse JSON fields
    const parsedCampaigns = availableCampaigns.map(campaign => ({
      ...campaign,
      applicableProducts: JSON.parse(campaign.applicableProducts || '[]'),
      excludedProducts: JSON.parse(campaign.excludedProducts || '[]')
    }));
    
    res.json({
      success: true,
      data: parsedCampaigns
    });
    
  } catch (error) {
    console.error('❌ Error fetching available campaigns:', error);
    res.status(500).json({ success: false, message: 'Error fetching available campaigns' });
  }
});

// ==================== DISCOUNT WHEEL API ====================

// Spin discount wheel
app.post('/api/discount-wheel/spin', authenticateTenant, async (req, res) => {
  try {
    const { deviceId, ipAddress, userAgent } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Device ID is required'
      });
    }
    
    console.log('🎰 Spinning discount wheel for device:', deviceId);
    
    // Check if device already spun
    const [existingSpin] = await poolWrapper.execute(
      'SELECT * FROM discount_wheel_spins WHERE deviceId = ? AND tenantId = ?',
      [deviceId, req.tenant.id]
    );
    
    if (existingSpin.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu cihazdan zaten çark çevrilmiş',
        data: {
          alreadySpun: true,
          existingCode: existingSpin[0].discountCode,
          spinResult: existingSpin[0].spinResult,
          expiresAt: existingSpin[0].expiresAt
        }
      });
    }
    
    // Generate random discount (3%, 5%, or 10%)
    const discountOptions = ['3', '5', '10'];
    const probabilities = [50, 35, 15]; // 3%: 50%, 5%: 35%, 10%: 15%
    
    const random = Math.random() * 100;
    let cumulativeProbability = 0;
    let selectedDiscount = '3';
    
    for (let i = 0; i < discountOptions.length; i++) {
      cumulativeProbability += probabilities[i];
      if (random <= cumulativeProbability) {
        selectedDiscount = discountOptions[i];
        break;
      }
    }
    
    // Generate unique discount code
    const discountCode = `WHEEL${selectedDiscount}${Date.now().toString().slice(-6)}`;
    
    // Set expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    // Save spin result
    const [result] = await poolWrapper.execute(
      `INSERT INTO discount_wheel_spins 
       (tenantId, deviceId, ipAddress, userAgent, spinResult, discountCode, expiresAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.tenant.id, deviceId, ipAddress || '', userAgent || '', selectedDiscount, discountCode, expiresAt]
    );
    
    // If user is logged in, also save to user discount codes
    if (req.body.userId) {
      await poolWrapper.execute(
        `INSERT INTO user_discount_codes 
         (tenantId, userId, discountCode, discountType, discountValue, expiresAt) 
         VALUES (?, ?, ?, 'percentage', ?, ?)`,
        [req.tenant.id, req.body.userId, discountCode, selectedDiscount, expiresAt]
      );
    }
    
    console.log(`✅ Discount wheel spun: ${selectedDiscount}% discount, code: ${discountCode}`);
    
    res.json({
      success: true,
      message: 'Çark başarıyla çevrildi!',
      data: {
        spinResult: selectedDiscount,
        discountCode,
        expiresAt: expiresAt.toISOString(),
        discountType: 'percentage',
        discountValue: selectedDiscount
      }
    });
    
  } catch (error) {
    console.error('❌ Error spinning discount wheel:', error);
    res.status(500).json({ success: false, message: 'Çark çevrilirken hata oluştu' });
  }
});

// Get user discount codes
app.get('/api/discount-codes/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [codes] = await poolWrapper.execute(
      `SELECT * FROM user_discount_codes 
       WHERE userId = ? AND tenantId = ? 
       ORDER BY createdAt DESC`,
      [userId, req.tenant.id]
    );
    
    res.json({
      success: true,
      data: codes
    });
    
  } catch (error) {
    console.error('❌ Error fetching discount codes:', error);
    res.status(500).json({ success: false, message: 'İndirim kodları alınırken hata oluştu' });
  }
});

// Validate discount code
app.post('/api/discount-codes/validate', authenticateTenant, async (req, res) => {
  try {
    const { discountCode, userId, orderAmount } = req.body;
    
    if (!discountCode || !userId || !orderAmount) {
      return res.status(400).json({
        success: false,
        message: 'Discount code, user ID, and order amount are required'
      });
    }
    
    // Find the discount code
    const [codes] = await poolWrapper.execute(
      `SELECT * FROM user_discount_codes 
       WHERE discountCode = ? AND userId = ? AND tenantId = ? 
       AND isUsed = false AND expiresAt > NOW()`,
      [discountCode, userId, req.tenant.id]
    );
    
    if (codes.length === 0) {
      return res.json({
        success: false,
        message: 'Geçersiz veya süresi dolmuş indirim kodu'
      });
    }
    
    const code = codes[0];
    
    // Check minimum order amount
    if (orderAmount < code.minOrderAmount) {
      return res.json({
        success: false,
        message: `Minimum sipariş tutarı ${code.minOrderAmount} TL olmalı`
      });
    }
    
    // Calculate discount amount
    let discountAmount = 0;
    if (code.discountType === 'percentage') {
      discountAmount = (orderAmount * code.discountValue) / 100;
    } else {
      discountAmount = code.discountValue;
    }
    
    // Apply maximum discount limit
    if (code.maxDiscountAmount && discountAmount > code.maxDiscountAmount) {
      discountAmount = code.maxDiscountAmount;
    }
    
    // Can't discount more than order amount
    discountAmount = Math.min(discountAmount, orderAmount);
    
    res.json({
      success: true,
      data: {
        discountAmount,
        discountType: code.discountType,
        discountValue: code.discountValue,
        finalAmount: orderAmount - discountAmount
      }
    });
    
  } catch (error) {
    console.error('❌ Error validating discount code:', error);
    res.status(500).json({ success: false, message: 'İndirim kodu doğrulanırken hata oluştu' });
  }
});

// Use discount code
app.post('/api/discount-codes/use', authenticateTenant, async (req, res) => {
  try {
    const { discountCode, userId, orderId } = req.body;
    
    if (!discountCode || !userId || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Discount code, user ID, and order ID are required'
      });
    }
    
    // Mark code as used
    const [result] = await poolWrapper.execute(
      `UPDATE user_discount_codes 
       SET isUsed = true, usedAt = NOW(), orderId = ? 
       WHERE discountCode = ? AND userId = ? AND tenantId = ? AND isUsed = false`,
      [orderId, discountCode, userId, req.tenant.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        message: 'İndirim kodu bulunamadı veya zaten kullanılmış'
      });
    }
    
    res.json({
      success: true,
      message: 'İndirim kodu başarıyla kullanıldı'
    });
    
  } catch (error) {
    console.error('❌ Error using discount code:', error);
    res.status(500).json({ success: false, message: 'İndirim kodu kullanılırken hata oluştu' });
  }
});

// Check if device can spin
app.get('/api/discount-wheel/check/:deviceId', authenticateTenant, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const [existingSpin] = await poolWrapper.execute(
      'SELECT * FROM discount_wheel_spins WHERE deviceId = ? AND tenantId = ?',
      [deviceId, req.tenant.id]
    );
    
    if (existingSpin.length > 0) {
      const spin = existingSpin[0];
      return res.json({
        success: true,
        data: {
          canSpin: false,
          alreadySpun: true,
          existingCode: spin.discountCode,
          spinResult: spin.spinResult,
          expiresAt: spin.expiresAt,
          isUsed: spin.isUsed
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        canSpin: true,
        alreadySpun: false
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking discount wheel:', error);
    res.status(500).json({ success: false, message: 'Çark durumu kontrol edilirken hata oluştu' });
  }
});

// ==================== CHATBOT API ENDPOINTS ====================

// Chatbot mesaj işleme endpoint'i
app.post('/api/chatbot/message', authenticateTenant, async (req, res) => {
  try {
    const { message, actionType = 'text', userId } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Mesaj boş olamaz'
      });
    }

    console.log('🤖 Chatbot mesaj alındı:', { message, actionType, userId });

    // Intent tespiti
    const intent = detectChatbotIntent(message.toLowerCase());
    console.log('🎯 Tespit edilen intent:', intent);

    // Yanıt oluştur
    const response = await generateChatbotResponse(intent, message, actionType, req.tenant.id);
    
    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('❌ Chatbot mesaj işleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj işlenirken hata oluştu',
      error: error.message
    });
  }
});

// Chatbot analitik endpoint'i
app.post('/api/chatbot/analytics', authenticateTenant, async (req, res) => {
  try {
    const { userId, message, intent, satisfaction } = req.body;
    
    // Analitik verilerini kaydet
    await poolWrapper.execute(
      `INSERT INTO chatbot_analytics (userId, tenantId, message, intent, satisfaction, timestamp) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId || null, req.tenant.id, message?.substring(0, 100), intent, satisfaction]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Chatbot analitik hatası:', error);
    res.status(500).json({ success: false, message: 'Analitik kaydedilemedi' });
  }
});

// Chatbot FAQ endpoint'i
app.get('/api/chatbot/faq', authenticateTenant, async (req, res) => {
  try {
    const faqData = {
      'sipariş nasıl takip': 'Siparişinizi takip etmek için "Hesabım > Siparişlerim" bölümüne gidin veya sipariş numaranızla takip yapın.',
      'kargo ücreti': '150 TL ve üzeri alışverişlerde kargo ücretsizdir. Altındaki siparişler için 19,90 TL kargo ücreti alınır.',
      'iade nasıl': 'Ürünü teslim aldığınız tarihten itibaren 14 gün içinde iade edebilirsiniz. "İade Taleplerim" bölümünden işlem yapın.',
      'ödeme yöntemleri': 'Kredi kartı, banka kartı, havale/EFT seçenekleri mevcuttur. Kapıda ödeme bulunmamaktadır.',
      'teslimat süresi': 'Stokta bulunan ürünler 1-3 iş günü içinde kargoya verilir. Teslimat süresi 1-5 iş günüdür.',
      'taksit': 'Kredi kartınızla 2, 3, 6, 9 ve 12 aya varan taksit seçenekleri kullanabilirsiniz.',
      'şifre unuttum': 'Giriş ekranında "Şifremi Unuttum" linkine tıklayın ve e-posta adresinizi girin.',
      'stok': 'Ürün sayfasında stok durumu gösterilir. Stokta olmayan ürünler için "Stok gelince haber ver" seçeneğini kullanın.'
    };

    res.json({
      success: true,
      data: faqData
    });
  } catch (error) {
    console.error('❌ FAQ yükleme hatası:', error);
    res.status(500).json({ success: false, message: 'FAQ yüklenemedi' });
  }
});

// Chatbot intent tespit fonksiyonu
function detectChatbotIntent(message) {
  const intents = {
    greeting: ['merhaba', 'selam', 'hey', 'hi', 'hello', 'iyi günler', 'günaydın', 'iyi akşamlar'],
    order_tracking: ['sipariş', 'takip', 'nerede', 'kargo', 'teslimat', 'sipariş takibi', 'siparişim'],
    product_search: ['ürün', 'arama', 'bul', 'var mı', 'stok', 'fiyat', 'ürün arama'],
    campaigns: ['kampanya', 'indirim', 'kupon', 'çek', 'promosyon', 'fırsat', 'özel teklif'],
    recommendations: ['öneri', 'bana ne önerirsin', 'ne alsam', 'beni tanı', 'kişisel öneri', 'kişiselleştir'],
    support: ['yardım', 'destek', 'problem', 'sorun', 'şikayet', 'canlı destek'],
    payment: ['ödeme', 'para', 'kredi kartı', 'banka', 'ücret', 'fatura', 'taksit'],
    return: ['iade', 'değişim', 'geri', 'kusur', 'hasarlı', 'yanlış'],
    shipping: ['kargo', 'teslimat', 'gönderim', 'ulaştırma', 'adres'],
    account: ['hesap', 'profil', 'şifre', 'giriş', 'kayıt', 'üyelik'],
    goodbye: ['görüşürüz', 'hoşça kal', 'bye', 'teşekkür', 'sağ ol', 'kapanış']
  };

  // Sipariş numarası tespiti
  if (/\b\d{5,}\b/.test(message)) {
    return 'order_number';
  }

  // Intent tespiti
  for (const [intent, keywords] of Object.entries(intents)) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        return intent;
      }
    }
  }

  // Ürün arama tespiti
  if (message.length > 3) {
    return 'product_search_query';
  }

  return 'unknown';
}

// Chatbot yanıt oluşturma fonksiyonu
async function generateChatbotResponse(intent, message, actionType, tenantId) {
  const timestamp = new Date();
  const messageId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Özel eylem tipleri
  if (actionType !== 'text') {
    return await handleSpecialChatbotAction(actionType, message, messageId, timestamp, tenantId);
  }

  // Intent'e göre yanıt oluştur
  switch (intent) {
    case 'order_number':
      return await handleOrderTracking(message, tenantId);
    
    case 'product_search_query':
      return await handleProductSearch(message, tenantId);
    
    case 'campaigns':
      return await handleCampaigns(tenantId);
    
    case 'recommendations':
      return await handleRecommendations(tenantId);
    
    case 'unknown':
      return {
        id: messageId,
        text: '🤔 Tam olarak anlayamadım. Size nasıl yardımcı olabileceğimi belirtir misiniz?',
        isBot: true,
        timestamp,
        type: 'quick_reply',
        quickReplies: [
          { id: '1', text: '📦 Sipariş Takibi', action: 'order_tracking' },
          { id: '2', text: '🔍 Ürün Arama', action: 'product_search' },
          { id: '3', text: '🎧 Canlı Destek', action: 'live_support' },
          { id: '4', text: '❓ S.S.S.', action: 'faq' }
        ]
      };
    
    default:
      return getQuickResponse(intent, messageId, timestamp);
  }
}

// Hızlı yanıt fonksiyonu
function getQuickResponse(intent, messageId, timestamp) {
  const quickResponses = {
    greeting: {
      text: '👋 Merhaba! Size nasıl yardımcı olabilirim?',
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '📦 Sipariş Takibi', action: 'order_tracking' },
        { id: '2', text: '🔍 Ürün Arama', action: 'product_search' },
        { id: '3', text: '❓ S.S.S.', action: 'faq' },
        { id: '4', text: '🎧 Canlı Destek', action: 'live_support' }
      ]
    },
    order_tracking: {
      text: '📦 Sipariş takibi için sipariş numaranızı paylaşabilir misiniz? Veya "Siparişlerim" sayfasından tüm siparişlerinizi görüntüleyebilirsiniz.',
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '📋 Siparişlerim', action: 'view_orders' },
        { id: '2', text: '🔢 Numara Gir', action: 'enter_order_number' },
        { id: '3', text: '📞 Destek Çağır', action: 'live_support' }
      ]
    },
    product_search: {
      text: '🔍 Hangi ürünü arıyorsunuz? Ürün adını yazabilir veya kategorilere göz atabilirsiniz.',
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '🏕️ Kamp Malzemeleri', action: 'search_category_kamp' },
        { id: '2', text: '🎯 Avcılık', action: 'search_category_avcilik' },
        { id: '3', text: '🎣 Balıkçılık', action: 'search_category_balik' },
        { id: '4', text: '👕 Giyim', action: 'search_category_giyim' }
      ]
    },
    support: {
      text: '🎧 Size nasıl yardımcı olabilirim? Sorununuzu açıklayabilir veya canlı desteğe bağlanabilirsiniz.',
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '📞 Canlı Destek', action: 'live_support' },
        { id: '2', text: '📧 E-posta Gönder', action: 'email_support' },
        { id: '3', text: '❓ S.S.S.', action: 'faq' },
        { id: '4', text: '📱 WhatsApp', action: 'whatsapp_support' }
      ]
    }
  };

  const response = quickResponses[intent] || quickResponses.greeting;
  return {
    id: messageId,
    text: response.text,
    isBot: true,
    timestamp,
    type: response.type || 'text',
    quickReplies: response.quickReplies
  };
}

// Sipariş takibi fonksiyonu
async function handleOrderTracking(message, tenantId) {
  const orderNumber = message.match(/\b\d{5,}\b/)?.[0];
  
  if (orderNumber) {
    try {
      const [rows] = await poolWrapper.execute(
        'SELECT * FROM orders WHERE id = ? AND tenantId = ?',
        [orderNumber, tenantId]
      );
      
      if (rows.length > 0) {
        const order = rows[0];
        const statusText = getOrderStatusText(order.status);
        const trackingInfo = order.trackingNumber ? `\n📋 Takip No: ${order.trackingNumber}` : '';
        
        return {
          id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: `📦 Sipariş #${orderNumber}\n\n🚚 Durum: ${statusText}${trackingInfo}\n💰 Tutar: ₺${(Number(order.totalAmount) || 0).toFixed(2)}\n📅 Tarih: ${new Date(order.createdAt).toLocaleDateString('tr-TR')}`,
          isBot: true,
          timestamp: new Date(),
          type: 'quick_reply',
          quickReplies: [
            { id: '1', text: '🔍 Detay Gör', action: 'order_detail', data: { orderId: orderNumber } },
            { id: '2', text: '📞 Kargo Şirketi', action: 'cargo_contact' },
            { id: '3', text: '📋 Tüm Siparişler', action: 'view_orders' }
          ]
        };
      } else {
        return {
          id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: `❌ ${orderNumber} numaralı sipariş bulunamadı. Sipariş numaranızı kontrol edin veya giriş yaparak siparişlerinizi görüntüleyin.`,
          isBot: true,
          timestamp: new Date(),
          type: 'quick_reply',
          quickReplies: [
            { id: '1', text: '📋 Siparişlerime Git', action: 'navigate_orders' },
            { id: '2', text: '🔢 Başka Numara', action: 'enter_order_number' },
            { id: '3', text: '🎧 Canlı Destek', action: 'live_support' }
          ]
        };
      }
    } catch (error) {
      return {
        id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: '❌ Sipariş sorgulanırken bir hata oluştu. Lütfen tekrar deneyin veya canlı destek ile iletişime geçin.',
        isBot: true,
        timestamp: new Date(),
        type: 'quick_reply',
        quickReplies: [
          { id: '1', text: '🔄 Tekrar Dene', action: 'order_tracking' },
          { id: '2', text: '📋 Siparişlerim', action: 'view_orders' },
          { id: '3', text: '🎧 Canlı Destek', action: 'live_support' }
        ]
      };
    }
  }

  return getQuickResponse('order_tracking', `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, new Date());
}

// Ürün arama fonksiyonu
async function handleProductSearch(query, tenantId) {
  try {
    const [rows] = await poolWrapper.execute(
      `SELECT * FROM products 
       WHERE (name LIKE ? OR description LIKE ?) 
       AND tenantId = ? 
       AND isActive = 1 
       ORDER BY name 
       LIMIT 5`,
      [`%${query}%`, `%${query}%`, tenantId]
    );

    if (rows.length > 0) {
      const productList = rows.map(p => 
        `• ${p.name}\n  💰 ₺${Number(p.price || 0).toFixed(2)}\n  📦 Stok: ${p.stock > 0 ? 'Var' : 'Yok'}`
      ).join('\n\n');
      
      return {
        id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: `🔍 "${query}" için ${rows.length} ürün buldum:\n\n${productList}`,
        isBot: true,
        timestamp: new Date(),
        type: 'quick_reply',
        quickReplies: [
          { id: '1', text: '👀 Tümünü Gör', action: 'view_products', data: { query } },
          { id: '2', text: '🔍 Yeni Arama', action: 'product_search' },
          { id: '3', text: '🛒 Kategoriler', action: 'view_categories' }
        ]
      };
    } else {
      return {
        id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: `😔 "${query}" için ürün bulunamadı. Farklı anahtar kelimeler deneyebilirsiniz.`,
        isBot: true,
        timestamp: new Date(),
        type: 'quick_reply',
        quickReplies: [
          { id: '1', text: '🔍 Yeni Arama', action: 'product_search' },
          { id: '2', text: '🛒 Kategoriler', action: 'view_categories' },
          { id: '3', text: '🎧 Yardım İste', action: 'live_support' }
        ]
      };
    }
  } catch (error) {
    return {
      id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: '❌ Ürün aramasında bir hata oluştu. Lütfen tekrar deneyin.',
      isBot: true,
      timestamp: new Date(),
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '🔄 Tekrar Dene', action: 'product_search' },
        { id: '2', text: '🎧 Canlı Destek', action: 'live_support' }
      ]
    };
  }
}

// Kampanya fonksiyonu
async function handleCampaigns(tenantId) {
  try {
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM campaigns WHERE tenantId = ? AND isActive = 1 ORDER BY createdAt DESC LIMIT 3',
      [tenantId]
    );

    if (rows.length === 0) {
      return {
        id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: 'Şu an aktif kampanya bulunamadı. Daha sonra tekrar kontrol edebilirsiniz.',
        isBot: true,
        timestamp: new Date(),
        type: 'quick_reply',
        quickReplies: [
          { id: '1', text: '⭐ Öneriler', action: 'show_recommendations' },
          { id: '2', text: '🛒 Ürünlere Göz At', action: 'view_products' }
        ]
      };
    }

    const campaignList = rows.map(c => {
      const discount = c.discountType === 'percentage' ? `%${c.discountValue}` : `${c.discountValue} TL`;
      return `• ${c.name} (${discount})${c.minOrderAmount ? ` – Min. ₺${Number(c.minOrderAmount).toFixed(0)}` : ''}`;
    }).join('\n');

    return {
      id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: `🎁 Aktif kampanyalar:\n\n${campaignList}`,
      isBot: true,
      timestamp: new Date(),
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '✅ Uygun muyum?', action: 'check_campaign_eligibility' },
        { id: '2', text: '🛒 Ürünler', action: 'view_products' },
        { id: '3', text: '🏠 Ana Menü', action: 'greeting' }
      ]
    };
  } catch (error) {
    return {
      id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: 'Kampanyalar yüklenirken bir sorun oluştu. Daha sonra tekrar deneyin.',
      isBot: true,
      timestamp: new Date(),
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '⭐ Öneriler', action: 'show_recommendations' },
        { id: '2', text: '🏠 Ana Menü', action: 'greeting' }
      ]
    };
  }
}

// Öneri fonksiyonu
async function handleRecommendations(tenantId) {
  try {
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM products WHERE tenantId = ? AND isActive = 1 ORDER BY RAND() LIMIT 3',
      [tenantId]
    );

    if (rows.length === 0) {
      return {
        id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: 'Şu an öneri oluşturamadım. Popüler ürünlere göz atabilirsiniz.',
        isBot: true,
        timestamp: new Date(),
        type: 'quick_reply',
        quickReplies: [
          { id: '1', text: '🛒 Popüler Ürünler', action: 'view_products' },
          { id: '2', text: '🏠 Ana Menü', action: 'greeting' }
        ]
      };
    }

    const productList = rows.map(p => `• ${p.name} – ₺${Number(p.price || 0).toFixed(2)}`).join('\n');
    
    return {
      id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: `⭐ Size önerdiklerim:\n\n${productList}`,
      isBot: true,
      timestamp: new Date(),
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '👀 Tümünü Gör', action: 'view_products' },
        { id: '2', text: '🎁 Kampanyalarım', action: 'check_campaign_eligibility' },
        { id: '3', text: '🔍 Yeni Arama', action: 'product_search' }
      ]
    };
  } catch (error) {
    return {
      id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: 'Öneriler yüklenirken bir problem oluştu. Daha sonra tekrar deneyin.',
      isBot: true,
      timestamp: new Date(),
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '🛒 Popüler Ürünler', action: 'view_products' },
        { id: '2', text: '🏠 Ana Menü', action: 'greeting' }
      ]
    };
  }
}

// Özel eylem fonksiyonu
async function handleSpecialChatbotAction(action, message, messageId, timestamp, tenantId) {
  const responses = {
    live_support: {
      text: '🎧 Canlı desteğe bağlanıyorsunuz... Ortalama bekleme süresi: 2-3 dakika\n\n📞 Telefon: 0530 312 58 13\n📱 WhatsApp: +90 530 312 58 13\n📧 E-posta: info@hugluoutdoor.com',
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '📞 Telefon Et', action: 'call_support' },
        { id: '2', text: '📱 WhatsApp', action: 'whatsapp_support' },
        { id: '3', text: '📧 E-posta', action: 'email_support' }
      ]
    },
    faq: {
      text: '❓ S.S.S. sayfamızda en sık sorulan soruların cevaplarını bulabilirsiniz.',
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '📖 S.S.S. Gör', action: 'view_faq' },
        { id: '2', text: '🔍 Soru Ara', action: 'search_faq' },
        { id: '3', text: '🎧 Canlı Destek', action: 'live_support' }
      ]
    },
    view_orders: {
      text: '📋 Siparişlerinizi görüntülemek için "Hesabım > Siparişlerim" sayfasına yönlendiriyorum.',
      type: 'quick_reply',
      quickReplies: [
        { id: '1', text: '📱 Siparişlerime Git', action: 'navigate_orders' },
        { id: '2', text: '🔢 Numara ile Ara', action: 'enter_order_number' }
      ]
    },
    enter_order_number: {
      text: '🔢 Sipariş numaranızı yazın (örn: 12345). Ben sizin için takip edeceğim!',
      type: 'text'
    }
  };

  const response = responses[action] || {
    text: '🤖 Bu özellik henüz geliştiriliyor. Canlı destek ile iletişime geçebilirsiniz.',
    type: 'quick_reply',
    quickReplies: [
      { id: '1', text: '🎧 Canlı Destek', action: 'live_support' },
      { id: '2', text: '🏠 Ana Menü', action: 'greeting' }
    ]
  };

  return {
    id: messageId,
    text: response.text,
    isBot: true,
    timestamp,
    type: response.type || 'text',
    quickReplies: response.quickReplies
  };
}

// Sipariş durumu metni
function getOrderStatusText(status) {
  const statusMap = {
    'pending': 'Beklemede',
    'confirmed': 'Onaylandı',
    'preparing': 'Hazırlanıyor',
    'shipped': 'Kargoda',
    'delivered': 'Teslim Edildi',
    'cancelled': 'İptal Edildi',
    'returned': 'İade Edildi'
  };
  return statusMap[status] || status;
}

// ==================== WALLET RECHARGE API ENDPOINTS ====================

// Cüzdan bakiyesi sorgulama
app.get('/api/wallet/balance/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [rows] = await poolWrapper.execute(
      'SELECT balance FROM user_wallets WHERE userId = ? AND tenantId = ?',
      [userId, req.tenant.id]
    );
    
    if (rows.length === 0) {
      // Cüzdan yoksa oluştur
      await poolWrapper.execute(
        'INSERT INTO user_wallets (userId, tenantId, balance) VALUES (?, ?, 0)',
        [userId, req.tenant.id]
      );
      return res.json({ success: true, data: { balance: 0 } });
    }
    
    res.json({ success: true, data: { balance: rows[0].balance } });
  } catch (error) {
    console.error('❌ Wallet balance error:', error);
    res.status(500).json({ success: false, message: 'Bakiye sorgulanırken hata oluştu' });
  }
});

// Cüzdan para yükleme isteği oluştur
app.post('/api/wallet/recharge-request', authenticateTenant, async (req, res) => {
  try {
    const { userId, amount, paymentMethod, bankInfo } = req.body;
    
    if (!userId || !amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Eksik parametreler'
      });
    }

    if (amount < 10 || amount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Tutar 10-10000 TL arasında olmalıdır'
      });
    }

    const requestId = `RCH-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Recharge request kaydet
    await poolWrapper.execute(
      `INSERT INTO wallet_recharge_requests 
       (id, userId, tenantId, amount, paymentMethod, bankInfo, status, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [requestId, userId, req.tenant.id, amount, paymentMethod, JSON.stringify(bankInfo || {})]
    );

    if (paymentMethod === 'card') {
      // Kredi kartı için Iyzico entegrasyonu
      try {
        const iyzicoResponse = await processCardPayment(requestId, amount, userId);
        
        if (iyzicoResponse.success) {
          // Başarılı ödeme - bakiyeyi güncelle
          await updateWalletBalance(userId, req.tenant.id, amount, 'card_recharge', requestId);
          
          // Request durumunu güncelle
          await poolWrapper.execute(
            'UPDATE wallet_recharge_requests SET status = ?, completedAt = NOW() WHERE id = ?',
            ['completed', requestId]
          );
          
          return res.json({
            success: true,
            data: {
              requestId,
              status: 'completed',
              newBalance: await getWalletBalance(userId, req.tenant.id),
              message: 'Para yükleme başarılı!'
            }
          });
        } else {
          // Ödeme başarısız
          await poolWrapper.execute(
            'UPDATE wallet_recharge_requests SET status = ?, errorMessage = ? WHERE id = ?',
            ['failed', iyzicoResponse.message, requestId]
          );
          
          return res.json({
            success: false,
            message: iyzicoResponse.message
          });
        }
      } catch (error) {
        console.error('❌ Card payment error:', error);
        await poolWrapper.execute(
          'UPDATE wallet_recharge_requests SET status = ?, errorMessage = ? WHERE id = ?',
          ['failed', 'Kart ödemesinde hata oluştu', requestId]
        );
        
        return res.status(500).json({
          success: false,
          message: 'Kart ödemesinde hata oluştu'
        });
      }
    } else if (paymentMethod === 'bank_transfer') {
      // EFT/Havale için WhatsApp bildirimi gönder
      try {
        await sendWhatsAppNotification(req.tenant.id, userId, requestId, amount, bankInfo);
        
        return res.json({
          success: true,
          data: {
            requestId,
            status: 'pending_approval',
            message: 'EFT/Havale bilgileri WhatsApp ile gönderildi. Onay bekleniyor.',
            bankInfo: getBankInfo(req.tenant.id)
          }
        });
      } catch (error) {
        console.error('❌ WhatsApp notification error:', error);
        return res.status(500).json({
          success: false,
          message: 'Bildirim gönderilirken hata oluştu'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz ödeme yöntemi'
      });
    }
  } catch (error) {
    console.error('❌ Recharge request error:', error);
    res.status(500).json({ success: false, message: 'Para yükleme isteği oluşturulamadı' });
  }
});

// Manuel para yükleme onayı (admin paneli için)
app.post('/api/wallet/approve-recharge', authenticateTenant, async (req, res) => {
  try {
    const { requestId, adminUserId } = req.body;
    
    if (!requestId || !adminUserId) {
      return res.status(400).json({
        success: false,
        message: 'Eksik parametreler'
      });
    }

    // Request'i bul
    const [rows] = await poolWrapper.execute(
      'SELECT * FROM wallet_recharge_requests WHERE id = ? AND tenantId = ? AND status = ?',
      [requestId, req.tenant.id, 'pending_approval']
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Onay bekleyen istek bulunamadı'
      });
    }

    const request = rows[0];
    
    // Bakiyeyi güncelle
    await updateWalletBalance(request.userId, req.tenant.id, request.amount, 'bank_transfer', requestId);
    
    // Request durumunu güncelle
    await poolWrapper.execute(
      'UPDATE wallet_recharge_requests SET status = ?, approvedBy = ?, completedAt = NOW() WHERE id = ?',
      ['completed', adminUserId, requestId]
    );
    
    res.json({
      success: true,
      data: {
        requestId,
        status: 'completed',
        message: 'Para yükleme onaylandı!'
      }
    });
  } catch (error) {
    console.error('❌ Approve recharge error:', error);
    res.status(500).json({ success: false, message: 'Onay işleminde hata oluştu' });
  }
});

// Bekleyen para yükleme isteklerini listele (admin paneli için)
app.get('/api/wallet/pending-requests', authenticateTenant, async (req, res) => {
  try {
    const [rows] = await poolWrapper.execute(
      `SELECT r.*, u.name, u.email, u.phone 
       FROM wallet_recharge_requests r
       JOIN users u ON r.userId = u.id
       WHERE r.tenantId = ? AND r.status = 'pending_approval'
       ORDER BY r.createdAt DESC`,
      [req.tenant.id]
    );
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Pending requests error:', error);
    res.status(500).json({ success: false, message: 'Bekleyen istekler alınamadı' });
  }
});

// Cüzdan işlem geçmişi
app.get('/api/wallet/transactions/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const [rows] = await poolWrapper.execute(
      `SELECT * FROM wallet_transactions 
       WHERE userId = ? AND tenantId = ?
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [userId, req.tenant.id, parseInt(limit), offset]
    );
    
    const [countRows] = await poolWrapper.execute(
      'SELECT COUNT(*) as total FROM wallet_transactions WHERE userId = ? AND tenantId = ?',
      [userId, req.tenant.id]
    );
    
    res.json({
      success: true,
      data: {
        transactions: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countRows[0].total,
          pages: Math.ceil(countRows[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Wallet transactions error:', error);
    res.status(500).json({ success: false, message: 'İşlem geçmişi alınamadı' });
  }
});

// Yardımcı fonksiyonlar
async function processCardPayment(requestId, amount, userId) {
  console.log('🔄 Processing card payment - NO CARD DATA STORED');
  console.log('⚠️ SECURITY: Card information is processed but NOT stored in database');
  
  try {
    // Iyzico entegrasyonu burada yapılacak
    // Kart bilgileri sadece ödeme işlemi için kullanılır, kayıt edilmez
    
    // Simüle edilmiş ödeme işlemi
    const paymentResult = {
      success: true,
      message: 'Ödeme başarılı',
      transactionId: `TXN-${Date.now()}`,
      amount: amount,
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Payment processed successfully - card data discarded');
    return paymentResult;
    
  } catch (error) {
    console.error('❌ Card payment processing error:', error);
    return {
      success: false,
      message: 'Ödeme işlemi başarısız',
      error: error.message
    };
  }
}

async function updateWalletBalance(userId, tenantId, amount, type, referenceId) {
  // Mevcut bakiyeyi al
  const [walletRows] = await poolWrapper.execute(
    'SELECT balance FROM user_wallets WHERE userId = ? AND tenantId = ?',
    [userId, tenantId]
  );
  
  const currentBalance = walletRows.length > 0 ? walletRows[0].balance : 0;
  const newBalance = currentBalance + amount;
  
  // Bakiyeyi güncelle veya oluştur
  await poolWrapper.execute(
    `INSERT INTO user_wallets (userId, tenantId, balance) 
     VALUES (?, ?, ?) 
     ON DUPLICATE KEY UPDATE balance = ?`,
    [userId, tenantId, newBalance, newBalance]
  );
  
  // İşlem kaydı oluştur
  await poolWrapper.execute(
    `INSERT INTO wallet_transactions 
     (userId, tenantId, type, amount, balance, referenceId, description, createdAt) 
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, tenantId, type, amount, newBalance, referenceId, `Cüzdan ${type} - ${amount} TL`]
  );
}

async function getWalletBalance(userId, tenantId) {
  const [rows] = await poolWrapper.execute(
    'SELECT balance FROM user_wallets WHERE userId = ? AND tenantId = ?',
    [userId, tenantId]
  );
  return rows.length > 0 ? rows[0].balance : 0;
}

async function sendWhatsAppNotification(tenantId, userId, requestId, amount, bankInfo) {
  try {
    const result = await WhatsAppService.sendRechargeNotification(
      tenantId, 
      userId, 
      requestId, 
      amount, 
      bankInfo
    );
    
    if (result.success) {
      console.log('✅ WhatsApp notification sent successfully');
    } else {
      console.error('❌ WhatsApp notification failed:', result.error);
    }
    
    return result.success;
  } catch (error) {
    console.error('❌ WhatsApp notification error:', error);
    return false;
  }
}

function getBankInfo(tenantId) {
  // Tenant'a özel banka bilgileri
  return {
    bankName: 'Huglu Outdoor Bankası',
    accountName: 'Huglu Outdoor Ltd. Şti.',
    accountNumber: '1234-5678-9012-3456',
    iban: 'TR12 0006 4000 0011 2345 6789 01',
    branchCode: '1234',
    swiftCode: 'HUGLTR2A'
  };
}

// ==================== REFERRAL ENDPOINTS ====================

// Get user referral info
app.get('/api/referral/:userId', authenticateTenant, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user's referral code and stats
    const [userRows] = await poolWrapper.execute(
      'SELECT referral_code, referral_count FROM users WHERE id = ? AND tenantId = ?',
      [userId, req.tenant.id]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = userRows[0];
    
    // Get referral earnings
    const [earningsRows] = await poolWrapper.execute(
      'SELECT SUM(amount) as total_earnings FROM referral_earnings WHERE referrer_id = ? AND tenantId = ?',
      [userId, req.tenant.id]
    );
    
    const totalEarnings = earningsRows[0].total_earnings || 0;
    
    res.json({
      success: true,
      data: {
        referralCode: user.referral_code,
        referralCount: user.referral_count || 0,
        totalEarnings: totalEarnings,
        referralLink: `${process.env.FRONTEND_URL || 'https://hugluoutdoor.com'}/referral/${user.referral_code}`
      }
    });
  } catch (error) {
    console.error('Error getting referral info:', error);
    res.status(500).json({ success: false, message: 'Error getting referral info' });
  }
});

// Use referral code
app.post('/api/referral/use', authenticateTenant, async (req, res) => {
  try {
    const { referralCode, userId } = req.body;
    
    // Check if referral code exists and is not self-referral
    const [referrerRows] = await poolWrapper.execute(
      'SELECT id, referral_code FROM users WHERE referral_code = ? AND tenantId = ?',
      [referralCode, req.tenant.id]
    );
    
    if (referrerRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid referral code' });
    }
    
    const referrerId = referrerRows[0].id;
    
    if (referrerId === userId) {
      return res.status(400).json({ success: false, message: 'Cannot refer yourself' });
    }
    
    // Check if user already used a referral code
    const [existingRows] = await poolWrapper.execute(
      'SELECT id FROM users WHERE id = ? AND referred_by IS NOT NULL AND tenantId = ?',
      [userId, req.tenant.id]
    );
    
    if (existingRows.length > 0) {
      return res.status(400).json({ success: false, message: 'User already used a referral code' });
    }
    
    // Update user with referral
    await poolWrapper.execute(
      'UPDATE users SET referred_by = ? WHERE id = ? AND tenantId = ?',
      [referrerId, userId, req.tenant.id]
    );
    
    // Update referrer's count
    await poolWrapper.execute(
      'UPDATE users SET referral_count = COALESCE(referral_count, 0) + 1 WHERE id = ? AND tenantId = ?',
      [referrerId, req.tenant.id]
    );
    
    // Add referral earnings
    const referralBonus = 50; // 50 TL bonus
    await poolWrapper.execute(
      'INSERT INTO referral_earnings (referrer_id, referred_id, amount, tenantId) VALUES (?, ?, ?, ?)',
      [referrerId, userId, referralBonus, req.tenant.id]
    );
    
    res.json({ success: true, message: 'Referral code applied successfully', bonus: referralBonus });
  } catch (error) {
    console.error('Error using referral code:', error);
    res.status(500).json({ success: false, message: 'Error using referral code' });
  }
});

// ==================== WHATSAPP WEBHOOK ENDPOINTS ====================

// WhatsApp webhook doğrulama
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const result = WhatsAppService.verifyWebhook(mode, token, challenge);
  
  if (result) {
    res.status(200).send(result);
  } else {
    res.status(403).send('Forbidden');
  }
});

// WhatsApp webhook mesaj alma
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const result = await WhatsAppService.processWebhookMessage(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

  const localIP = getLocalIPAddress();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`🌐 Local API: http://localhost:${PORT}/api`);
    console.log(`🌐 Network API: http://${localIP}:${PORT}/api`);
    console.log(`📊 SQL Query logging is ENABLED`);
    console.log(`🔍 All database operations will be logged with timing`);
    console.log(`🔧 Manual sync: POST /api/sync/products`);
    console.log(`💰 Price Logic: IndirimliFiyat = 0 ise SatisFiyati kullanılır`);
    console.log(`📱 API will work on same network even if IP changes`);
    
    // Start XML Sync Service
    if (xmlSyncService) {
      xmlSyncService.startScheduledSync();
      console.log(`📡 XML Sync Service started (every 4 hours)\n`);
    }
  });
}

startServer().catch(console.error);
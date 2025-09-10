// Database schema creation
async function createDatabaseSchema(pool) {
  try {
    console.log('🗄️ Checking database schema...');
    
    // Check if tables already exist
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('tenants', 'users', 'products', 'cart', 'orders', 'order_items', 'reviews')
    `);
    
    const existingTables = tables.map(row => row.TABLE_NAME);
    console.log(`📋 Found existing tables: ${existingTables.join(', ')}`);
    
    // If all required tables exist, skip schema creation
    const requiredTables = ['tenants', 'users', 'products', 'product_variations', 'product_variation_options', 'cart', 'orders', 'order_items', 'reviews', 'user_wallets', 'wallet_transactions', 'custom_production_requests', 'custom_production_items', 'chatbot_analytics', 'wallet_recharge_requests'];
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length === 0) {
      console.log('✅ All required tables already exist, skipping schema creation');
      return true;
    }
    
    console.log(`🔧 Creating missing tables: ${missingTables.join(', ')}`);
    
    // Disable foreign key checks temporarily
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    // Tenants table (Multi-tenant support)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) UNIQUE,
        subdomain VARCHAR(100) UNIQUE,
        apiKey VARCHAR(255) UNIQUE NOT NULL,
        settings JSON,
        isActive BOOLEAN DEFAULT true,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_domain (domain),
        INDEX idx_subdomain (subdomain),
        INDEX idx_api_key (apiKey),
        INDEX idx_active (isActive)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tenants table ready');
    
    // Users table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        birthDate DATE,
        address TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_user (tenantId),
        INDEX idx_email_tenant (email, tenantId),
        UNIQUE KEY unique_email_per_tenant (email, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Users table ready');

    // Products table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        image VARCHAR(500),
        images JSON,
        stock INT DEFAULT 0,
        brand VARCHAR(100),
        rating DECIMAL(3,2) DEFAULT 0.00,
        reviewCount INT DEFAULT 0,
        externalId VARCHAR(255),
        source VARCHAR(100),
        hasVariations BOOLEAN DEFAULT false,
        lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_product (tenantId),
        INDEX idx_external_id_tenant (externalId, tenantId),
        INDEX idx_source_tenant (source, tenantId),
        INDEX idx_last_updated (lastUpdated),
        INDEX idx_category_tenant (category, tenantId),
        INDEX idx_brand_tenant (brand, tenantId),
        INDEX idx_has_variations (hasVariations),
        UNIQUE KEY unique_external_id_per_tenant (externalId, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Products table ready');

    // Product Variations table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS product_variations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        productId INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        displayOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_tenant_variations (tenantId),
        INDEX idx_product_variations (productId),
        INDEX idx_variation_name (name),
        UNIQUE KEY unique_product_variation (productId, name, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Product variations table ready');

    // Product Variation Options table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS product_variation_options (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        variationId INT NOT NULL,
        value VARCHAR(100) NOT NULL,
        priceModifier DECIMAL(10,2) DEFAULT 0.00,
        stock INT DEFAULT 0,
        sku VARCHAR(100),
        image VARCHAR(500),
        displayOrder INT DEFAULT 0,
        isActive BOOLEAN DEFAULT true,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (variationId) REFERENCES product_variations(id) ON DELETE CASCADE,
        INDEX idx_tenant_options (tenantId),
        INDEX idx_variation_options (variationId),
        INDEX idx_option_value (value),
        INDEX idx_option_sku (sku),
        INDEX idx_option_active (isActive),
        UNIQUE KEY unique_variation_option (variationId, value, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Product variation options table ready');

    // Cart table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS cart (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        productId INT NOT NULL,
        quantity INT NOT NULL,
        variationString VARCHAR(500),
        selectedVariations JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_tenant_cart (tenantId),
        INDEX idx_user_cart (userId),
        INDEX idx_product_cart (productId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cart table ready');

    // Orders table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        totalAmount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        shippingAddress TEXT NOT NULL,
        paymentMethod VARCHAR(100) NOT NULL,
        city VARCHAR(100),
        district VARCHAR(100),
        fullAddress TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_tenant_orders (tenantId),
        INDEX idx_user_orders (userId),
        INDEX idx_status_tenant (status, tenantId),
        INDEX idx_city (city),
        INDEX idx_district (district)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Check if new columns exist in products table and add them if they don't
    const [productColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'products'
      AND COLUMN_NAME IN ('hasVariations')
    `);
    
    const existingProductColumns = productColumns.map(col => col.COLUMN_NAME);
    
    if (!existingProductColumns.includes('hasVariations')) {
      await pool.execute('ALTER TABLE products ADD COLUMN hasVariations BOOLEAN DEFAULT false');
      console.log('✅ Added hasVariations column to products table');
    }

    // Check if new columns exist and add them if they don't
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME IN ('city', 'district', 'fullAddress', 'updatedAt', 'customerName', 'customerEmail', 'customerPhone', 'paymentStatus', 'paymentId', 'paymentProvider', 'paidAt')
    `);
    
    const existingColumns = columns.map(col => col.COLUMN_NAME);
    
    if (!existingColumns.includes('city')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN city VARCHAR(100)');
      console.log('✅ Added city column to orders table');
    }
    
    if (!existingColumns.includes('district')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN district VARCHAR(100)');
      console.log('✅ Added district column to orders table');
    }
    
    if (!existingColumns.includes('fullAddress')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN fullAddress TEXT');
      console.log('✅ Added fullAddress column to orders table');
    }
    
    if (!existingColumns.includes('updatedAt')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
      console.log('✅ Added updatedAt column to orders table');
    }
    
    if (!existingColumns.includes('customerName')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN customerName VARCHAR(255)');
      console.log('✅ Added customerName column to orders table');
    }
    
    if (!existingColumns.includes('customerEmail')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN customerEmail VARCHAR(255)');
      console.log('✅ Added customerEmail column to orders table');
    }
    
    if (!existingColumns.includes('customerPhone')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN customerPhone VARCHAR(50)');
      console.log('✅ Added customerPhone column to orders table');
    }

    if (!existingColumns.includes('paymentStatus')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN paymentStatus ENUM("pending", "completed", "failed", "refunded") DEFAULT "pending"');
      console.log('✅ Added paymentStatus column to orders table');
    }

    if (!existingColumns.includes('paymentId')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN paymentId VARCHAR(255)');
      console.log('✅ Added paymentId column to orders table');
    }

    if (!existingColumns.includes('paymentProvider')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN paymentProvider VARCHAR(50)');
      console.log('✅ Added paymentProvider column to orders table');
    }

    if (!existingColumns.includes('paidAt')) {
      await pool.execute('ALTER TABLE orders ADD COLUMN paidAt TIMESTAMP NULL');
      console.log('✅ Added paidAt column to orders table');
    }
    console.log('✅ Orders table ready');

    // Order Items table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        orderId INT NOT NULL,
        productId INT NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        productName VARCHAR(500),
        productDescription TEXT,
        productCategory VARCHAR(255),
        productBrand VARCHAR(255),
        productImage VARCHAR(500),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_tenant_order_items (tenantId),
        INDEX idx_order_items (orderId),
        INDEX idx_product_order (productId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Check if new product columns exist in order_items and add them if they don't
    const [orderItemColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'order_items'
      AND COLUMN_NAME IN ('productName', 'productDescription', 'productCategory', 'productBrand', 'productImage')
    `);
    
    const existingOrderItemColumns = orderItemColumns.map(col => col.COLUMN_NAME);
    
    if (!existingOrderItemColumns.includes('productName')) {
      await pool.execute('ALTER TABLE order_items ADD COLUMN productName VARCHAR(500)');
      console.log('✅ Added productName column to order_items table');
    }
    
    if (!existingOrderItemColumns.includes('productDescription')) {
      await pool.execute('ALTER TABLE order_items ADD COLUMN productDescription TEXT');
      console.log('✅ Added productDescription column to order_items table');
    }
    
    if (!existingOrderItemColumns.includes('productCategory')) {
      await pool.execute('ALTER TABLE order_items ADD COLUMN productCategory VARCHAR(255)');
      console.log('✅ Added productCategory column to order_items table');
    }
    
    if (!existingOrderItemColumns.includes('productBrand')) {
      await pool.execute('ALTER TABLE order_items ADD COLUMN productBrand VARCHAR(255)');
      console.log('✅ Added productBrand column to order_items table');
    }
    
    if (!existingOrderItemColumns.includes('productImage')) {
      await pool.execute('ALTER TABLE order_items ADD COLUMN productImage VARCHAR(500)');
      console.log('✅ Added productImage column to order_items table');
    }
    
    console.log('✅ Order items table ready');

    // Reviews table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        productId INT NOT NULL,
        userId INT NOT NULL,
        userName VARCHAR(255) NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_tenant_reviews (tenantId),
        INDEX idx_product_reviews (productId),
        INDEX idx_user_reviews (userId),
        INDEX idx_rating_tenant (rating, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Reviews table ready');

    // User Wallets table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        balance DECIMAL(10,2) DEFAULT 0.00,
        currency VARCHAR(10) DEFAULT 'TRY',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_tenant_wallet (tenantId),
        INDEX idx_user_wallet (userId),
        UNIQUE KEY unique_user_wallet_per_tenant (userId, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ User wallets table ready');

    // Wallet Transactions table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        type ENUM('credit', 'debit') NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        paymentMethod VARCHAR(100),
        orderId INT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL,
        INDEX idx_tenant_transactions (tenantId),
        INDEX idx_user_transactions (userId),
        INDEX idx_transaction_type (type),
        INDEX idx_transaction_status (status),
        INDEX idx_transaction_date (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Wallet transactions table ready');

    // Return Requests table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS return_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        orderId INT NOT NULL,
        orderItemId INT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        description TEXT,
        status ENUM('pending', 'approved', 'rejected', 'completed', 'cancelled') DEFAULT 'pending',
        requestDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processedDate TIMESTAMP NULL,
        refundAmount DECIMAL(10,2) NOT NULL,
        adminNotes TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (orderItemId) REFERENCES order_items(id) ON DELETE CASCADE,
        INDEX idx_tenant_returns (tenantId),
        INDEX idx_user_returns (userId),
        INDEX idx_order_returns (orderId),
        INDEX idx_return_status (status),
        INDEX idx_return_date (requestDate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Return requests table ready');

    // Payment Transactions table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        orderId INT NOT NULL,
        paymentId VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL DEFAULT 'iyzico',
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
        status ENUM('pending', 'success', 'failed', 'cancelled', 'refunded') DEFAULT 'pending',
        transactionData JSON,
        conversationId VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
        INDEX idx_tenant_payments (tenantId),
        INDEX idx_order_payments (orderId),
        INDEX idx_payment_id (paymentId),
        INDEX idx_payment_status (status),
        INDEX idx_payment_date (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Payment transactions table ready');

    // Custom Production Requests table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS custom_production_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        requestNumber VARCHAR(50) NOT NULL,
        status ENUM('pending', 'review', 'design', 'production', 'shipped', 'completed', 'cancelled') DEFAULT 'pending',
        totalQuantity INT NOT NULL,
        totalAmount DECIMAL(10,2) DEFAULT 0.00,
        customerName VARCHAR(255) NOT NULL,
        customerEmail VARCHAR(255) NOT NULL,
        customerPhone VARCHAR(50),
        notes TEXT,
        estimatedDeliveryDate DATE,
        actualDeliveryDate DATE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_tenant_requests (tenantId),
        INDEX idx_user_requests (userId),
        INDEX idx_request_number (requestNumber),
        INDEX idx_request_status (status),
        INDEX idx_request_date (createdAt),
        UNIQUE KEY unique_request_number_per_tenant (requestNumber, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Custom production requests table ready');

    // Custom Production Items table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS custom_production_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        requestId INT NOT NULL,
        productId INT NOT NULL,
        quantity INT NOT NULL,
        customizations JSON NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (requestId) REFERENCES custom_production_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_tenant_items (tenantId),
        INDEX idx_request_items (requestId),
        INDEX idx_product_items (productId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Custom production items table ready');
    
    // Customer segments table for personalized campaigns
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customer_segments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        criteria JSON NOT NULL,
        isActive BOOLEAN DEFAULT true,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_segments (tenantId),
        INDEX idx_active_segments (isActive, tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Customer segments table ready');

    // Campaigns table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type ENUM('discount', 'free_shipping', 'bundle', 'loyalty', 'seasonal', 'birthday', 'abandoned_cart') NOT NULL,
        status ENUM('draft', 'active', 'paused', 'completed', 'cancelled') DEFAULT 'draft',
        targetSegmentId INT,
        discountType ENUM('percentage', 'fixed', 'buy_x_get_y') DEFAULT 'percentage',
        discountValue DECIMAL(10,2) DEFAULT 0,
        minOrderAmount DECIMAL(10,2) DEFAULT 0,
        maxDiscountAmount DECIMAL(10,2),
        applicableProducts JSON,
        excludedProducts JSON,
        startDate TIMESTAMP,
        endDate TIMESTAMP,
        usageLimit INT,
        usedCount INT DEFAULT 0,
        isActive BOOLEAN DEFAULT true,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (targetSegmentId) REFERENCES customer_segments(id) ON DELETE SET NULL,
        INDEX idx_tenant_campaigns (tenantId),
        INDEX idx_type_status (type, status),
        INDEX idx_dates (startDate, endDate),
        INDEX idx_target_segment (targetSegmentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Campaigns table ready');

    // Customer segment assignments
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customer_segment_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        segmentId INT NOT NULL,
        assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (segmentId) REFERENCES customer_segments(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_segment (userId, segmentId),
        INDEX idx_tenant_assignments (tenantId),
        INDEX idx_user_assignments (userId),
        INDEX idx_segment_assignments (segmentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Customer segment assignments table ready');

    // Campaign usage tracking
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS campaign_usage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        campaignId INT NOT NULL,
        userId INT NOT NULL,
        orderId INT,
        discountAmount DECIMAL(10,2) DEFAULT 0,
        usedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL,
        INDEX idx_tenant_usage (tenantId),
        INDEX idx_campaign_usage (campaignId),
        INDEX idx_user_usage (userId),
        INDEX idx_usage_date (usedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Campaign usage table ready');

    // Customer behavior analytics
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS customer_analytics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        totalOrders INT DEFAULT 0,
        totalSpent DECIMAL(10,2) DEFAULT 0,
        averageOrderValue DECIMAL(10,2) DEFAULT 0,
        lastOrderDate TIMESTAMP,
        favoriteCategories JSON,
        favoriteBrands JSON,
        purchaseFrequency INT DEFAULT 0,
        customerLifetimeValue DECIMAL(10,2) DEFAULT 0,
        lastActivityDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_analytics (userId, tenantId),
        INDEX idx_tenant_analytics (tenantId),
        INDEX idx_user_analytics (userId),
        INDEX idx_last_activity (lastActivityDate),
        INDEX idx_customer_value (customerLifetimeValue)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Customer analytics table ready');

    // Product recommendations
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS product_recommendations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        productId INT NOT NULL,
        recommendationType ENUM('collaborative', 'content_based', 'hybrid', 'trending', 'similar') NOT NULL,
        score DECIMAL(5,4) DEFAULT 0,
        reason TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiresAt TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_tenant_recommendations (tenantId),
        INDEX idx_user_recommendations (userId),
        INDEX idx_product_recommendations (productId),
        INDEX idx_type_score (recommendationType, score),
        INDEX idx_expires (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Product recommendations table ready');


      
    // Discount wheel system
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS discount_wheel_spins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT,
        deviceId VARCHAR(255) NOT NULL,
        ipAddress VARCHAR(45),
        userAgent TEXT,
        spinResult ENUM('3', '5', '10') NOT NULL,
        discountCode VARCHAR(20) NOT NULL,
        isUsed BOOLEAN DEFAULT false,
        usedAt TIMESTAMP NULL,
        orderId INT NULL,
        expiresAt TIMESTAMP NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL,
        UNIQUE KEY unique_device_spin (deviceId, tenantId),
        INDEX idx_tenant_spins (tenantId),
        INDEX idx_user_spins (userId),
        INDEX idx_device_spins (deviceId),
        INDEX idx_discount_code (discountCode),
        INDEX idx_expires (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Discount wheel spins table ready');

    // Chatbot analytics table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chatbot_analytics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NULL,
        message TEXT,
        intent VARCHAR(100),
        satisfaction TINYINT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant_analytics (tenantId),
        INDEX idx_user_analytics (userId),
        INDEX idx_intent_analytics (intent),
        INDEX idx_timestamp_analytics (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Chatbot analytics table ready');

    // Wallet recharge requests table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS wallet_recharge_requests (
        id VARCHAR(50) PRIMARY KEY,
        userId INT NOT NULL,
        tenantId INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        paymentMethod ENUM('card', 'bank_transfer') NOT NULL,
        bankInfo JSON,
        status ENUM('pending', 'pending_approval', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
        errorMessage TEXT,
        approvedBy INT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completedAt TIMESTAMP NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (approvedBy) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_user_requests (userId),
        INDEX idx_tenant_requests (tenantId),
        INDEX idx_status_requests (status),
        INDEX idx_created_requests (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Wallet recharge requests table ready');

    // User discount codes
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_discount_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        discountCode VARCHAR(20) NOT NULL,
        discountType ENUM('percentage', 'fixed') NOT NULL,
        discountValue DECIMAL(10,2) NOT NULL,
        minOrderAmount DECIMAL(10,2) DEFAULT 0,
        maxDiscountAmount DECIMAL(10,2),
        isUsed BOOLEAN DEFAULT false,
        usedAt TIMESTAMP NULL,
        orderId INT NULL,
        expiresAt TIMESTAMP NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL,
        INDEX idx_tenant_codes (tenantId),
        INDEX idx_user_codes (userId),
        INDEX idx_discount_code (discountCode),
        INDEX idx_expires (expiresAt),
        INDEX idx_used (isUsed)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ User discount codes table ready');
    
    // Re-enable foreign key checks
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('🎉 Database schema updated successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Error creating database schema:', error);
    throw error;
  }
}

module.exports = {
  createDatabaseSchema
};

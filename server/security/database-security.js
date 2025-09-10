const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * Veritabanı Güvenlik Modülü
 * Maksimum güvenlik için kapsamlı koruma sağlar
 */

class DatabaseSecurity {
  constructor() {
    this.auditLog = [];
    this.failedAttempts = new Map();
    this.blockedIPs = new Set();
    this.maxFailedAttempts = 5;
    this.blockDuration = 15 * 60 * 1000; // 15 dakika
  }

  /**
   * Güvenli veritabanı konfigürasyonu
   */
  getSecureDbConfig() {
    return {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'huglu_mobile',
      port: parseInt(process.env.DB_PORT) || 3306,
      connectionLimit: 10,
      acquireTimeout: 30000,
      timeout: 30000,
      queueLimit: 0,
      waitForConnections: true,
      maxIdle: 30000,
      idleTimeout: 30000,
      // SSL güvenliği
      ssl: {
        rejectUnauthorized: true,
        ca: process.env.DB_SSL_CA,
        cert: process.env.DB_SSL_CERT,
        key: process.env.DB_SSL_KEY
      },
      charset: 'utf8mb4',
      // Güvenlik ayarları
      multipleStatements: false,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      // Bağlantı güvenliği
      reconnect: true,
      reconnectDelay: 2000,
      maxReconnects: 3
    };
  }

  /**
   * SQL Injection koruması
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Tehlikeli karakterleri temizle
    return input
      .replace(/[';--]/g, '') // SQL injection karakterleri
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // XSS
      .replace(/javascript:/gi, '') // JavaScript
      .replace(/on\w+\s*=/gi, '') // Event handlers
      .trim();
  }

  /**
   * Parametreli sorgu doğrulaması
   */
  validateQuery(sql, params) {
    // Tehlikeli SQL komutlarını kontrol et
    const dangerousPatterns = [
      /DROP\s+TABLE/i,
      /DELETE\s+FROM/i,
      /UPDATE\s+.*\s+SET/i,
      /INSERT\s+INTO/i,
      /ALTER\s+TABLE/i,
      /CREATE\s+TABLE/i,
      /TRUNCATE/i,
      /EXEC\s*\(/i,
      /UNION\s+SELECT/i,
      /OR\s+1\s*=\s*1/i,
      /AND\s+1\s*=\s*1/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new Error('Potentially dangerous SQL query detected');
      }
    }

    // Parametre sayısını kontrol et
    const paramCount = (sql.match(/\?/g) || []).length;
    if (paramCount !== params.length) {
      throw new Error('Parameter count mismatch');
    }

    return true;
  }

  /**
   * Veri maskeleme (sensitive data için)
   */
  maskSensitiveData(data, fields = ['password', 'email', 'phone', 'ssn', 'creditCard']) {
    if (!data || typeof data !== 'object') return data;

    const masked = { ...data };
    
    fields.forEach(field => {
      if (masked[field]) {
        if (field === 'email') {
          const [username, domain] = masked[field].split('@');
          masked[field] = `${username.substring(0, 2)}***@${domain}`;
        } else if (field === 'phone') {
          masked[field] = masked[field].replace(/(\d{3})\d{4}(\d{3})/, '$1****$2');
        } else if (field === 'creditCard') {
          masked[field] = masked[field].replace(/(\d{4})\d{8}(\d{4})/, '$1********$2');
        } else {
          masked[field] = '***';
        }
      }
    });

    return masked;
  }

  /**
   * Audit log sistemi
   */
  logDatabaseAccess(userId, action, table, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: userId || 'anonymous',
      action,
      table,
      details: this.maskSensitiveData(details),
      ip: details.ip || 'unknown',
      userAgent: details.userAgent || 'unknown'
    };

    this.auditLog.push(logEntry);
    
    // Log dosyasına yaz (production'da)
    if (process.env.NODE_ENV === 'production') {
      console.log(`🔍 DB_AUDIT: ${JSON.stringify(logEntry)}`);
    }

    // Log boyutunu sınırla
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
  }

  /**
   * Brute force koruması
   */
  checkBruteForceProtection(ip, userId) {
    const key = `${ip}_${userId}`;
    const attempts = this.failedAttempts.get(key) || { count: 0, lastAttempt: 0 };
    
    const now = Date.now();
    const timeDiff = now - attempts.lastAttempt;
    
    // 15 dakika geçtiyse sıfırla
    if (timeDiff > this.blockDuration) {
      attempts.count = 0;
    }
    
    attempts.count++;
    attempts.lastAttempt = now;
    this.failedAttempts.set(key, attempts);
    
    if (attempts.count >= this.maxFailedAttempts) {
      this.blockedIPs.add(ip);
      this.logDatabaseAccess(userId, 'BRUTE_FORCE_BLOCKED', 'security', { ip, attempts: attempts.count });
      throw new Error('Too many failed attempts. IP blocked temporarily.');
    }
    
    return true;
  }

  /**
   * IP engelleme kontrolü
   */
  isIPBlocked(ip) {
    return this.blockedIPs.has(ip);
  }

  /**
   * Başarılı giriş sonrası sıfırlama
   */
  resetFailedAttempts(ip, userId) {
    const key = `${ip}_${userId}`;
    this.failedAttempts.delete(key);
    this.blockedIPs.delete(ip);
  }

  /**
   * Veri bütünlüğü kontrolü
   */
  validateDataIntegrity(data, schema) {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${field} must be ${rules.type}`);
        }
        
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must be no more than ${rules.maxLength} characters`);
        }
        
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} format is invalid`);
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Data validation failed: ${errors.join(', ')}`);
    }
    
    return true;
  }

  /**
   * Güvenli hash oluşturma
   */
  createSecureHash(data) {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Hash doğrulama
   */
  verifySecureHash(data, hash) {
    const [salt, hashValue] = hash.split(':');
    const testHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512').toString('hex');
    return testHash === hashValue;
  }

  /**
   * Güvenli rastgele token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Veritabanı bağlantı güvenliği
   */
  secureConnection(connection) {
    // Bağlantı timeout'u
    connection.timeout = 30000;
    
    // Query timeout'u
    connection.queryTimeout = 30000;
    
    // Bağlantı kapatma
    const originalEnd = connection.end;
    connection.end = function() {
      console.log('🔒 Database connection securely closed');
      return originalEnd.call(this);
    };
    
    return connection;
  }

  /**
   * Backup güvenliği
   */
  createSecureBackup(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
      timestamp,
      data: this.maskSensitiveData(data),
      checksum: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
    };
    
    return backupData;
  }

  /**
   * Güvenlik raporu
   */
  getSecurityReport() {
    return {
      totalAuditLogs: this.auditLog.length,
      blockedIPs: this.blockedIPs.size,
      failedAttempts: this.failedAttempts.size,
      last24Hours: this.auditLog.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        return logTime > dayAgo;
      }).length
    };
  }
}

module.exports = DatabaseSecurity;

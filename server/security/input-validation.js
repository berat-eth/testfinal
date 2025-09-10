/**
 * Giriş Doğrulama ve Sanitizasyon Modülü
 * Tüm kullanıcı girişlerini güvenli hale getirir
 */

class InputValidation {
  constructor() {
    this.patterns = {
      email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      phone: /^[\+]?[1-9][\d]{0,15}$/,
      password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      name: /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]{2,50}$/,
      address: /^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s\.,\-]{10,200}$/,
      birthDate: /^\d{4}-\d{2}-\d{2}$/,
      numeric: /^\d+$/,
      alphanumeric: /^[a-zA-Z0-9]+$/
    };
  }

  /**
   * Temel giriş sanitizasyonu
   */
  sanitize(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .trim()
      .replace(/[<>]/g, '') // HTML tag'leri
      .replace(/['";]/g, '') // SQL injection karakterleri
      .replace(/javascript:/gi, '') // JavaScript
      .replace(/on\w+\s*=/gi, '') // Event handlers
      .replace(/\s+/g, ' '); // Fazla boşlukları temizle
  }

  /**
   * Email doğrulama
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required and must be a string');
    }
    
    const sanitized = this.sanitize(email);
    
    if (!this.patterns.email.test(sanitized)) {
      throw new Error('Invalid email format');
    }
    
    if (sanitized.length > 254) {
      throw new Error('Email too long');
    }
    
    return sanitized.toLowerCase();
  }

  /**
   * Telefon doğrulama
   */
  validatePhone(phone) {
    if (!phone) return null;
    
    const sanitized = this.sanitize(phone).replace(/[\s\-\(\)]/g, '');
    
    if (!this.patterns.phone.test(sanitized)) {
      throw new Error('Invalid phone number format');
    }
    
    return sanitized;
  }

  /**
   * Şifre doğrulama
   */
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Password is required and must be a string');
    }
    
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    
    if (password.length > 128) {
      throw new Error('Password too long');
    }
    
    if (!this.patterns.password.test(password)) {
      throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }
    
    return password;
  }

  /**
   * İsim doğrulama
   */
  validateName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Name is required and must be a string');
    }
    
    const sanitized = this.sanitize(name);
    
    if (sanitized.length < 2) {
      throw new Error('Name must be at least 2 characters long');
    }
    
    if (sanitized.length > 50) {
      throw new Error('Name too long');
    }
    
    if (!this.patterns.name.test(sanitized)) {
      throw new Error('Name contains invalid characters');
    }
    
    return sanitized;
  }

  /**
   * Adres doğrulama
   */
  validateAddress(address) {
    if (!address) return null;
    
    const sanitized = this.sanitize(address);
    
    if (sanitized.length < 10) {
      throw new Error('Address must be at least 10 characters long');
    }
    
    if (sanitized.length > 200) {
      throw new Error('Address too long');
    }
    
    if (!this.patterns.address.test(sanitized)) {
      throw new Error('Address contains invalid characters');
    }
    
    return sanitized;
  }

  /**
   * Doğum tarihi doğrulama
   */
  validateBirthDate(birthDate) {
    if (!birthDate) return null;
    
    const sanitized = this.sanitize(birthDate);
    
    if (!this.patterns.birthDate.test(sanitized)) {
      throw new Error('Invalid birth date format. Use YYYY-MM-DD');
    }
    
    const date = new Date(sanitized);
    const now = new Date();
    const minDate = new Date(1900, 0, 1);
    
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    
    if (date > now) {
      throw new Error('Birth date cannot be in the future');
    }
    
    if (date < minDate) {
      throw new Error('Birth date too old');
    }
    
    return sanitized;
  }

  /**
   * Kullanıcı verisi doğrulama
   */
  validateUserData(userData) {
    const validated = {};
    
    if (userData.name) {
      validated.name = this.validateName(userData.name);
    }
    
    if (userData.email) {
      validated.email = this.validateEmail(userData.email);
    }
    
    if (userData.password) {
      validated.password = this.validatePassword(userData.password);
    }
    
    if (userData.phone) {
      validated.phone = this.validatePhone(userData.phone);
    }
    
    if (userData.address) {
      validated.address = this.validateAddress(userData.address);
    }
    
    if (userData.birthDate) {
      validated.birthDate = this.validateBirthDate(userData.birthDate);
    }
    
    return validated;
  }

  /**
   * SQL injection koruması
   */
  sanitizeForSQL(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/[';\-]/g, '') // SQL injection karakterleri
      .replace(/UNION/gi, '') // UNION attacks
      .replace(/SELECT/gi, '') // SELECT injection
      .replace(/INSERT/gi, '') // INSERT injection
      .replace(/UPDATE/gi, '') // UPDATE injection
      .replace(/DELETE/gi, '') // DELETE injection
      .replace(/DROP/gi, '') // DROP injection
      .replace(/ALTER/gi, '') // ALTER injection
      .replace(/EXEC/gi, '') // EXEC injection
      .replace(/SCRIPT/gi, '') // SCRIPT injection
      .trim();
  }

  /**
   * XSS koruması
   */
  sanitizeForXSS(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  /**
   * Dosya yükleme güvenliği
   */
  validateFileUpload(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only images are allowed');
    }
    
    if (file.size > maxSize) {
      throw new Error('File too large. Maximum size is 5MB');
    }
    
    return true;
  }

  /**
   * Rate limiting için IP doğrulama
   */
  validateIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      throw new Error('Invalid IP address');
    }
    
    return ip;
  }

  /**
   * JSON güvenliği
   */
  validateJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      
      // Circular reference kontrolü
      const seen = new WeakSet();
      const checkCircular = (obj) => {
        if (typeof obj === 'object' && obj !== null) {
          if (seen.has(obj)) {
            throw new Error('Circular reference detected');
          }
          seen.add(obj);
          Object.values(obj).forEach(checkCircular);
        }
      };
      
      checkCircular(parsed);
      return parsed;
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  }
}

module.exports = InputValidation;

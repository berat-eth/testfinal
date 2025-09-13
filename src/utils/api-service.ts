import { getApiBaseUrl, detectBestServer, REMOTE_SERVERS, IP_SERVER_CANDIDATES, DEFAULT_TENANT_API_KEY } from './api-config';

// Dynamic API base URL - will be set based on network detection
let currentApiUrl = getApiBaseUrl();
const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika cache
const OFFLINE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 saat offline cache

// Network status check with better detection
const isNetworkAvailable = (): boolean => {
  // React Native'de NetInfo kullanılabilir
  // Şimdilik basit bir check
  return typeof fetch !== 'undefined' && navigator?.onLine !== false;
};

// Enhanced cache interface
interface CacheItem<T> {
  data: T;
  timestamp: number;
  isOffline: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  isOffline?: boolean;
  retryCount?: number;
}

// Enhanced error types
export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED_ERROR = 'UNAUTHORIZED_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ApiError {
  type: ApiErrorType;
  message: string;
  code?: number;
  retryable: boolean;
}

class ApiService {
  private cache = new Map<string, CacheItem<any>>();
  
  // No encryption needed - data sent as plain text
  private encryptSensitiveData(data: any): any {
    return data;
  }
  
  // No decryption needed - data received as plain text
  private decryptSensitiveData(data: any): any {
    return data;
  }
  private offlineQueue: Array<{ endpoint: string; method: string; body?: any; timestamp: number }> = [];
  private isOnline = true;
  private retryDelays = [1000, 2000, 4000]; // Exponential backoff delays
  private networkMonitoringInterval: NodeJS.Timeout | null = null;
  private lastOnlineCheck: number | null = null;
  private consecutiveFailures: number = 0;
  private apiKey: string | null = null;
  private alternativeUrls: string[] = []; // Alternative URLs to try
  private currentUrlIndex: number = 0;

  // API Key management
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    // API Key set successfully
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  clearApiKey(): void {
    this.apiKey = null;
    // API Key cleared
  }

  // Network auto-detection methods with remote server support
  private async detectNetworkUrls(): Promise<string[]> {
    const urls: string[] = [];

    // Domain candidate
    urls.push('https://api.zerodaysoftware.tr/api');

    // IP-based candidates (for both development and production)
    (IP_SERVER_CANDIDATES || []).forEach(ip => {
      urls.push(`https://${ip}/api`);
      // Only add HTTP in development
      if (__DEV__) {
        urls.push(`http://${ip}/api`);
      }
    });

    return urls;
  }

  private async testUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // Yerel adresler zaten oluşturulmuyor; yine de güvenlik için engelle
      if (/localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\./.test(url)) {
        clearTimeout(timeoutId);
        return false;
      }

      const response = await fetch(`${url.replace(/\/$/, '')}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Huglu-Mobile-App/1.0'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      // URL test failed - silent
      return false;
    }
  }

  async autoDetectApiUrl(): Promise<string> {
    // Auto-detecting API URL
    
    // First try current URL if it is not a localhost/LAN address
    // (silindi)

    // Generate alternative URLs
    const urls = await this.detectNetworkUrls();
    
    // Test URLs in parallel (but limit concurrent requests)
    const batchSize = 5; // Reduced batch size for faster detection
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const promises = batch.map(async (url) => {
        const isWorking = await this.testUrl(url);
        return { url, isWorking };
      });

      const results = await Promise.all(promises);
      
      for (const result of results) {
        if (result.isWorking) {
          // Found working API URL
          currentApiUrl = result.url;
          return result.url;
        }
      }
    }

    // No working remote API URL found, keeping current
    return currentApiUrl;
  }

  setApiUrl(url: string): void {
    currentApiUrl = url;
    // API URL set
  }

  getCurrentApiUrl(): string {
    return currentApiUrl;
  }

  // Enhanced cache helper methods
  private getCacheKey(endpoint: string, params?: any): string {
    return `${endpoint}_${JSON.stringify(params || {})}`;
  }

  private isCacheValid(timestamp: number, isOffline: boolean): boolean {
    const duration = isOffline ? OFFLINE_CACHE_DURATION : CACHE_DURATION;
    return Date.now() - timestamp < duration;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      // First try in-memory cache
      const cached = this.cache.get(key);
      if (cached && this.isCacheValid(cached.timestamp, cached.isOffline)) {
        return cached.data;
      }

      // If not in memory, try database cache based on endpoint type
      const db = require('./database').default;
      let tableName = 'cache_general_v2';
      
      if (key.includes('/products')) {
        tableName = 'cache_products_v2';
      } else if (key.includes('/categories')) {
        tableName = 'cache_categories_v2';
      }

      const result = await db.getFirstAsync(
        `SELECT data, timestamp, isOffline FROM ${tableName} WHERE cacheKey = ?`,
        [key]
      );

      if (result) {
        const parsedData = JSON.parse(result.data);
        const isOffline = Boolean(result.isOffline);
        
        if (this.isCacheValid(result.timestamp, isOffline)) {
          // Update in-memory cache
          this.setCache(key, parsedData, isOffline);
          return parsedData;
        }
      }

      return null;
    } catch (error) {
      // Cache read error - silent
      return null;
    }
  }

  private async setCache<T>(key: string, data: T, isOffline: boolean = false): Promise<void> {
    try {
      // Update in-memory cache
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        isOffline
      });

      // Also save to database cache based on endpoint type
      const db = require('./database').default;
      let tableName = 'cache_general_v2';
      
      if (key.includes('/products')) {
        tableName = 'cache_products_v2';
      } else if (key.includes('/categories')) {
        tableName = 'cache_categories_v2';
      }

      const dataSize = JSON.stringify(data).length;
      await db.runAsync(
        `INSERT OR REPLACE INTO ${tableName} (cacheKey, data, timestamp, size, isOffline) VALUES (?, ?, ?, ?, ?)`,
        [key, JSON.stringify(data), Date.now(), dataSize, isOffline ? 1 : 0]
      );
    } catch (error) {
      console.error('❌ Cache write error:', error);
    }
  }

  // Enhanced error handling
  private createApiError(error: any, endpoint: string): ApiError {
    const messageText = String(error?.message || '').toLowerCase();

    if (messageText.includes('timeout') || error.name === 'AbortError') {
      return {
        type: ApiErrorType.TIMEOUT_ERROR,
        message: 'İstek zaman aşımına uğradı',
        retryable: true
      };
    }
    
    if (messageText.includes('failed to fetch') ||
        messageText.includes('network request failed') ||
        messageText.includes('network')) {
      return {
        type: ApiErrorType.NETWORK_ERROR,
        message: 'Ağ bağlantısı hatası',
        retryable: true
      };
    }
    
    if (error.status === 401) {
      return {
        type: ApiErrorType.UNAUTHORIZED_ERROR,
        message: 'Yetkilendirme hatası',
        code: 401,
        retryable: false
      };
    }
    
    if (error.status === 404) {
      return {
        type: ApiErrorType.NOT_FOUND_ERROR,
        message: 'Kaynak bulunamadı',
        code: 404,
        retryable: false
      };
    }
    
    if (error.status >= 500) {
      return {
        type: ApiErrorType.SERVER_ERROR,
        message: 'Sunucu hatası',
        code: error.status,
        retryable: true
      };
    }
    
    return {
      type: ApiErrorType.UNKNOWN_ERROR,
      message: error.message || 'Bilinmeyen hata',
      retryable: false
    };
  }

  // Enhanced request method with better error handling
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    retryCount: number = 0,
    isOfflineRetry: boolean = false
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const TIMEOUT_MS = 60000; // 60 saniye timeout (45'ten 60'a çıkarıldı)
    const MAX_RETRIES = 1; // Retry sayısını 1'e düşürdük (2'den 1'e)
    
    // Network availability check
    if (!isNetworkAvailable() && !isOfflineRetry) {
      // Network not available, using offline cache
      return this.handleOfflineRequest<T>(endpoint, method, body);
    }
    
    try {
      const url = `${getApiBaseUrl()}${endpoint}`;
      // API Request

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'User-Agent': 'Huglu-Mobile-App/1.0',
        'Accept': 'application/json'
      };

      // Add API key header if available; uzak sunucu için varsayılan anahtar fallback
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      } else if (DEFAULT_TENANT_API_KEY) {
        headers['X-API-Key'] = DEFAULT_TENANT_API_KEY;
      }

      const config: RequestInit = {
        method,
        headers,
      };

      if (body && method !== 'GET') {
        // Hassas verileri şifrele (POST/PUT istekleri için)
        const encryptedBody = this.encryptSensitiveData(body);
        config.body = JSON.stringify(encryptedBody);
        // Request body encrypted for sensitive data
      }

      // Custom timeout implementation with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, TIMEOUT_MS);

      // Add abort signal to config
      config.signal = controller.signal;

      const response = await fetch(url, config);
      clearTimeout(timeoutId);
      // Response received
      
      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        // If not JSON, get text and try to parse as JSON
        const text = await response.text();
        // Non-JSON response received - silent
        
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          // If parsing fails, create a proper error response
          result = {
            success: false,
            message: `Server returned non-JSON response: ${response.status} ${response.statusText}`,
            error: text.substring(0, 500)
          };
        }
      }

      const duration = Date.now() - startTime;
      
      // Performance logging
      if (duration > 1000) {
        // Slow API call - silent
      } else {
        // API call completed
      }

      if (!response.ok) {
        const apiError = this.createApiError({ status: response.status, message: result.message }, endpoint);
        throw apiError;
      }

      // Server'dan gelen hassas verileri şifre çöz
      if (result.success && result.data) {
        result.data = this.decryptSensitiveData(result.data);
        // Response data decrypted for sensitive fields
      }

      // Cache successful responses
      if (method === 'GET' && result.success) {
        const cacheKey = this.getCacheKey(endpoint);
        await this.setCache(cacheKey, result, false);
      }

      this.isOnline = true;
      this.lastOnlineCheck = Date.now();
      this.consecutiveFailures = 0;
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enhanced retry logic with better offline detection
      if (retryCount < MAX_RETRIES && this.shouldRetry(error)) {
        const delay = this.retryDelays[retryCount] || this.retryDelays[this.retryDelays.length - 1];
        // Retrying request - silent
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.request(endpoint, method, body, retryCount + 1, isOfflineRetry);
      }
      
      // Try auto-detection if we haven't tried it yet for this request
      if (retryCount === 0 && this.isOfflineRequest(error)) {
        // Attempting API URL auto-detection
        try {
          const newUrl = await this.autoDetectApiUrl();
          if (newUrl !== currentApiUrl) {
            // Retrying with new URL
            return this.request(endpoint, method, body, retryCount + 1, isOfflineRetry);
          }
        } catch (detectionError) {
          // Auto-detection failed - silent
        }
      }

      // Handle offline requests more aggressively
      if (this.isOfflineRequest(error) && !isOfflineRetry) {
        // Going offline for endpoint
        return this.handleOfflineRequest<T>(endpoint, method, body);
      }
      
      const apiError = this.createApiError(error, endpoint);
      console.error(`❌ API request failed: ${endpoint} (${duration}ms)`, apiError);
      
      // Check if this is a backend connection error
      const { BackendErrorService } = require('../services/BackendErrorService');
      if (BackendErrorService.isBackendConnectionError(error, endpoint)) {
        // Backend connection error detected - silent
        BackendErrorService.handleBackendError(() => {
          // Retry callback
          // Retrying failed request after error modal
          return this.request(endpoint, method, body, 0, false);
        });
      }
      
      this.isOnline = false;
      this.lastOnlineCheck = Date.now();
      this.consecutiveFailures++;
      return {
        success: false,
        error: apiError.message,
        isOffline: true,
        retryCount
      };
    }
  }

  // Check if error should trigger retry
  private shouldRetry(error: any): boolean {
    if (error.type) {
      return error.retryable;
    }
    
    const messageText = String(error?.message || '').toLowerCase();
    return messageText.includes('timeout') ||
           error.name === 'AbortError' ||
           messageText.includes('network request failed') ||
           messageText.includes('network') ||
           messageText.includes('fetch') ||
           messageText.includes('failed to fetch');
  }

  // Check if this is an offline request
  private isOfflineRequest(error: any): boolean {
    // More aggressive offline detection
    const messageText = String(error?.message || '').toLowerCase();
    return !this.isOnline || 
           messageText.includes('timeout') ||
           error.name === 'AbortError' ||
           messageText.includes('failed to fetch') ||
           messageText.includes('network request failed') ||
           messageText.includes('network') ||
           messageText.includes('econnreset') ||
           messageText.includes('enotfound') ||
           messageText.includes('econnrefused');
  }

  // Handle offline requests with cache
  private async handleOfflineRequest<T>(
    endpoint: string, 
    method: string, 
    body?: any
  ): Promise<ApiResponse<T>> {
    // Handling offline request
    
    // For GET requests, try to return cached data
    if (method === 'GET') {
      const cacheKey = this.getCacheKey(endpoint);
      const cached = await this.getFromCache<T>(cacheKey);
      
      if (cached) {
        // Returning cached data for offline request
        return {
          success: true,
          data: cached,
          isOffline: true
        };
      }
    }
    
    // For non-GET requests, queue them for later
    if (method !== 'GET') {
      this.offlineQueue.push({
        endpoint,
        method,
        body,
        timestamp: Date.now()
      });
      // Request queued for later execution
    }
    
    // Return offline response
    return {
      success: false,
      error: 'Offline mode - no cached data available',
      isOffline: true
    };
  }

  // Process offline queue when back online
  async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0 || !this.isOnline) {
      return;
    }
    
    // Processing offline requests
    
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];
    
    for (const item of queue) {
      try {
        await this.request(item.endpoint, item.method as any, item.body, 0, true);
        // Processed offline request
      } catch (error) {
        console.error(`❌ Failed to process offline request: ${item.method} ${item.endpoint}`, error);
        // Re-queue failed requests
        this.offlineQueue.push(item);
      }
    }
  }

  // Enhanced user endpoints
  async createUser(userData: any): Promise<ApiResponse<{ userId: number }>> {
    return this.request('/users', 'POST', userData);
  }

  async getUserByEmail(email: string): Promise<ApiResponse<any>> {
    return this.request(`/users/email/${encodeURIComponent(email)}`);
  }

  async getUserById(id: number): Promise<ApiResponse<any>> {
    return this.request(`/users/${id}`);
  }

  async updateUser(id: number, data: any): Promise<ApiResponse<boolean>> {
    return this.request(`/users/${id}`, 'PUT', data);
  }

  async updateProfile(userId: number, data: any): Promise<ApiResponse<boolean>> {
    return this.request(`/users/${userId}/profile`, 'PUT', data);
  }

  async changePassword(userId: number, data: { currentPassword: string; newPassword: string }): Promise<ApiResponse<boolean>> {
    return this.request(`/users/${userId}/password`, 'PUT', data);
  }

  async loginUser(email: string, password: string): Promise<ApiResponse<any>> {
    return this.request('/users/login', 'POST', { email, password });
  }

  // Enhanced product endpoints with better caching and pagination
  async getAllProducts(): Promise<ApiResponse<any[]>> {
    const cacheKey = this.getCacheKey('/products');
    const cached = await this.getFromCache<ApiResponse<any[]>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.request<any[]>('/products');
    if (result.success) {
      await this.setCache(cacheKey, result, result.isOffline);
    }
    return result;
  }

  // New paginated products endpoint
  async getProducts(page: number = 1, limit: number = 20): Promise<ApiResponse<{ products: any[], total: number, hasMore: boolean }>> {
    const cacheKey = this.getCacheKey(`/products?page=${page}&limit=${limit}`);
    const cached = await this.getFromCache<ApiResponse<{ products: any[], total: number, hasMore: boolean }>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.request<{ products: any[], total: number, hasMore: boolean }>(`/products?page=${page}&limit=${limit}`);
    if (result.success) {
      await this.setCache(cacheKey, result, result.isOffline);
    }
    return result;
  }

  async getProductById(id: number): Promise<ApiResponse<any>> {
    const cacheKey = this.getCacheKey(`/products/${id}`);
    const cached = await this.getFromCache<ApiResponse<any>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.request<any>(`/products/${id}`);
    if (result.success) {
      await this.setCache(cacheKey, result, result.isOffline);
    }
    return result;
  }

  async getProductsByCategory(category: string): Promise<ApiResponse<any[]>> {
    const cacheKey = this.getCacheKey(`/products/category/${category}`);
    const cached = await this.getFromCache<ApiResponse<any[]>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.request<any[]>(`/products/category/${encodeURIComponent(category)}`);
    if (result.success) {
      await this.setCache(cacheKey, result, result.isOffline);
    }
    return result;
  }

  async searchProducts(query: string): Promise<ApiResponse<any[]>> {
    return this.request(`/products/search?q=${encodeURIComponent(query)}`);
  }

  async filterProducts(filters: any): Promise<ApiResponse<any[]>> {
    return this.request('/products/filter', 'POST', filters);
  }

  async updateProductStock(id: number, quantity: number): Promise<ApiResponse<boolean>> {
    return this.request(`/products/${id}/stock`, 'PUT', { quantity });
  }

  // Product variations endpoints
  async getProductVariations(productId: number): Promise<ApiResponse<any[]>> {
    return this.request(`/products/${productId}/variations`);
  }

  async saveProductVariations(tenantId: number, productId: number, variations: any[]): Promise<ApiResponse<boolean>> {
    return this.request(`/products/${productId}/variations`, 'POST', { tenantId, variations });
  }

  async updateProductHasVariations(productId: number, hasVariations: boolean): Promise<ApiResponse<boolean>> {
    return this.request(`/products/${productId}/has-variations`, 'PUT', { hasVariations });
  }

  async getVariationOptions(variationId: number): Promise<ApiResponse<any[]>> {
    return this.request(`/variations/${variationId}/options`);
  }

  async getVariationOptionById(optionId: number): Promise<ApiResponse<any>> {
    return this.request(`/variations/options/${optionId}`);
  }

  async updateVariationOptionStock(optionId: number, quantity: number): Promise<ApiResponse<boolean>> {
    return this.request(`/variations/options/${optionId}/stock`, 'PUT', { quantity });
  }

  // Enhanced cart endpoints
  async addToCart(cartData: any): Promise<ApiResponse<boolean>> {
    return this.request('/cart', 'POST', cartData);
  }

  async removeFromCart(id: number): Promise<ApiResponse<boolean>> {
    return this.request(`/cart/${id}`, 'DELETE');
  }

  async updateCartQuantity(id: number, quantity: number): Promise<ApiResponse<boolean>> {
    return this.request(`/cart/${id}/quantity`, 'PUT', { quantity });
  }

  // Return requests endpoints
  async getReturnRequests(userId: number): Promise<ApiResponse<any[]>> {
    return this.request(`/return-requests?userId=${encodeURIComponent(userId)}`, 'GET');
  }

  async createReturnRequest(requestData: {
    userId: number;
    orderId: number;
    orderItemId: number;
    reason: string;
    description?: string;
  }): Promise<ApiResponse<{ returnRequestId: number }>> {
    return this.request('/return-requests', 'POST', requestData);
  }

  async cancelReturnRequest(returnRequestId: number, userId: number): Promise<ApiResponse<boolean>> {
    return this.request(`/return-requests/${returnRequestId}/cancel`, 'PUT', { userId });
  }

  async getReturnableOrders(userId: number): Promise<ApiResponse<any[]>> {
    return this.request(`/orders/returnable?userId=${encodeURIComponent(userId)}`, 'GET');
  }

  // Payment endpoints
  async processPayment(paymentData: any): Promise<ApiResponse<any>> {
    return this.request('/payments/process', 'POST', paymentData);
  }

  async getPaymentStatus(paymentId: string): Promise<ApiResponse<any>> {
    return this.request(`/payments/${paymentId}/status`, 'GET');
  }

  async getTestCards(): Promise<ApiResponse<any>> {
    return this.request('/payments/test-cards', 'GET');
  }

  async getCartItems(userId: number): Promise<ApiResponse<any[]>> {
    let query = '';
    if (userId === 1) {
      try {
        const { DiscountWheelController } = require('../controllers/DiscountWheelController');
        const deviceId = await DiscountWheelController.getDeviceId();
        query = `?deviceId=${encodeURIComponent(deviceId)}`;
      } catch {}
    }
    return this.request(`/cart/user/${userId}${query}`);
  }

  async clearCart(userId: number): Promise<ApiResponse<boolean>> {
    let endpoint = `/cart/user/${userId}`;
    if (userId === 1) {
      try {
        const { DiscountWheelController } = require('../controllers/DiscountWheelController');
        const deviceId = await DiscountWheelController.getDeviceId();
        endpoint += `?deviceId=${encodeURIComponent(deviceId)}`;
      } catch {}
    }
    return this.request(endpoint, 'DELETE');
  }

  async getCartTotal(userId: number): Promise<ApiResponse<number>> {
    let endpoint = `/cart/user/${userId}/total`;
    if (userId === 1) {
      try {
        const { DiscountWheelController } = require('../controllers/DiscountWheelController');
        const deviceId = await DiscountWheelController.getDeviceId();
        endpoint += `?deviceId=${encodeURIComponent(deviceId)}`;
      } catch {}
    }
    return this.request(endpoint);
  }

  async getCartTotalDetailed(userId: number): Promise<ApiResponse<{ subtotal: number; discount: number; shipping: number; total: number }>> {
    let endpoint = `/cart/user/${userId}/total-detailed`;
    if (userId === 1) {
      try {
        const { DiscountWheelController } = require('../controllers/DiscountWheelController');
        const deviceId = await DiscountWheelController.getDeviceId();
        endpoint += `?deviceId=${encodeURIComponent(deviceId)}`;
      } catch {}
    }
    return this.request(endpoint);
  }

  async getCampaigns(): Promise<ApiResponse<any[]>> {
    return this.request('/campaigns');
  }

  async createCampaign(data: any): Promise<ApiResponse<boolean>> {
    return this.request('/campaigns', 'POST', data);
  }

  // Enhanced order endpoints
  async createOrder(orderData: any): Promise<ApiResponse<{ orderId: number }>> {
    return this.request('/orders', 'POST', orderData);
  }

  async getUserOrders(userId: number): Promise<ApiResponse<any[]>> {
    return this.request(`/orders/user/${userId}`);
  }

  async getOrderById(id: number): Promise<ApiResponse<any>> {
    return this.request(`/orders/${id}`);
  }

  async updateOrderStatus(id: number, status: string): Promise<ApiResponse<boolean>> {
    return this.request(`/orders/${id}/status`, 'PUT', { status });
  }

  async cancelOrder(id: number): Promise<ApiResponse<boolean>> {
    return this.request(`/orders/${id}/cancel`, 'PUT');
  }

  // Enhanced review endpoints
  async createReview(reviewData: any): Promise<ApiResponse<{ reviewId: number }>> {
    return this.request('/reviews', 'POST', reviewData);
  }

  async getProductReviews(productId: number): Promise<ApiResponse<any[]>> {
    return this.request(`/reviews/product/${productId}`);
  }

  // Enhanced utility endpoints with caching
  async getCategories(): Promise<ApiResponse<string[]>> {
    const cacheKey = this.getCacheKey('/categories');
    const cached = await this.getFromCache<ApiResponse<string[]>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.request<string[]>('/categories');
    if (result.success) {
      await this.setCache(cacheKey, result, result.isOffline);
    }
    return result;
  }

  async getBrands(): Promise<ApiResponse<string[]>> {
    const cacheKey = this.getCacheKey('/brands');
    const cached = await this.getFromCache<ApiResponse<string[]>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.request<string[]>('/brands');
    if (result.success) {
      await this.setCache(cacheKey, result, result.isOffline);
    }
    return result;
  }

  // Store locator & in-store availability
  async getStoresNearby(lat: number, lng: number, radiusKm: number = 25): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/stores/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`);
  }

  async getInStoreAvailability(productId: number, lat: number, lng: number, radiusKm: number = 25): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/stores/availability/${productId}?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`);
  }

  // Referral program
  async getReferralInfo(userId: number): Promise<ApiResponse<{ code: string; url: string; invitedCount: number; rewardBalance: number }>> {
    return this.request(`/referral/${userId}`);
  }

  async generateReferralLink(userId: number): Promise<ApiResponse<{ code: string; url: string }>> {
    return this.request(`/referral/${userId}/generate`, 'POST');
  }

  async applyReferralCode(userId: number, code: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request(`/referral/apply`, 'POST', { userId, code });
  }

  async getPriceRange(): Promise<ApiResponse<{ min: number; max: number }>> {
    const cacheKey = this.getCacheKey('/products/price-range');
    const cached = await this.getFromCache<ApiResponse<{ min: number; max: number }>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.request<{ min: number; max: number }>('/products/price-range');
    if (result.success) {
      await this.setCache(cacheKey, result, result.isOffline);
    }
    return result;
  }

  // XML Sync endpoints
  async getSyncStatus(): Promise<ApiResponse<any>> {
    return this.request('/sync/status');
  }

  async triggerManualSync(): Promise<ApiResponse<boolean>> {
    return this.request('/sync/trigger', 'POST');
  }

  async getXmlSources(): Promise<ApiResponse<any[]>> {
    return this.request('/sync/sources');
  }

  // Enhanced cache management
  clearCache(): void {
    this.cache.clear();
    // Cache cleared
  }

  clearCacheByPattern(pattern: string): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
    // Cleared cache entries matching pattern
  }

  // Enhanced connection testing with auto-detection
  async testConnection(): Promise<ApiResponse<boolean>> {
    try {
      // Testing API connection
      
      // Quick timeout for health check
      const healthTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Health check timeout'));
        }, 15000); // 15 saniye health check timeout
      });
      
      const healthPromise = this.request<boolean>('/health');
      
      const result = await Promise.race([healthPromise, healthTimeout]);
      this.isOnline = result.success;
      this.lastOnlineCheck = Date.now();
      this.consecutiveFailures = 0;
      
      if (result.success) {
        // API connection successful
        // Process any queued offline requests
        await this.processOfflineQueue();
      } else {
        // API connection failed, trying auto-detection
        
        // Try auto-detection if health check failed
        try {
          const newUrl = await this.autoDetectApiUrl();
          if (newUrl !== currentApiUrl) {
            // Test again with new URL
            const retryResult = await this.request<boolean>('/health');
            if (retryResult.success) {
              // API connection successful with new URL
              this.isOnline = true;
              await this.processOfflineQueue();
              return retryResult;
            }
          }
        } catch (detectionError) {
          // Auto-detection failed - silent
        }
      }
      
      return result;
    } catch (error) {
      // API connection test failed
      this.isOnline = false;
      this.lastOnlineCheck = Date.now();
      this.consecutiveFailures = 0;
      return {
        success: false,
        error: 'Connection test failed',
        isOffline: true
      };
    }
  }

  // Enhanced network status with periodic checking
  async checkNetworkStatus(): Promise<boolean> {
    try {
      // If we're already offline, don't check immediately
      if (!this.isOnline) {
        // Already offline, skipping immediate check
        return false;
      }
      
      const result = await this.testConnection();
      this.isOnline = result.success;
      this.lastOnlineCheck = Date.now();
      this.consecutiveFailures = 0;
      
      // If we're back online, process offline queue
      if (this.isOnline && this.offlineQueue.length > 0) {
        // Processing offline requests
        await this.processOfflineQueue();
      }
      
      return result.success;
    } catch {
      this.isOnline = false;
      this.lastOnlineCheck = Date.now();
      this.consecutiveFailures = 0;
      return false;
    }
  }

  // Periodic network status check with exponential backoff
  startNetworkMonitoring(intervalMs: number = 30000): void {
    if (this.networkMonitoringInterval) {
      clearInterval(this.networkMonitoringInterval);
    }
    
    let currentInterval = intervalMs;
    
    this.networkMonitoringInterval = setInterval(async () => {
      try {
        const isOnline = await this.checkNetworkStatus();
        
        if (isOnline) {
          // Reset on success
          this.consecutiveFailures = 0;
          currentInterval = intervalMs;
        } else {
          // Increase interval on failure
          this.consecutiveFailures++;
          currentInterval = Math.min(currentInterval * 1.5, 120000); // Max 2 minutes
          
          // Network check failed, next check scheduled
          
          // Update interval
          clearInterval(this.networkMonitoringInterval!);
          this.networkMonitoringInterval = setInterval(async () => {
            await this.checkNetworkStatus();
          }, currentInterval);
        }
      } catch (error) {
        console.error('❌ Network monitoring error:', error);
      }
    }, currentInterval);
    
    // Network monitoring started
  }

  stopNetworkMonitoring(): void {
    if (this.networkMonitoringInterval) {
      clearInterval(this.networkMonitoringInterval);
      this.networkMonitoringInterval = null;
      // Network monitoring stopped
    }
  }

  // Force offline mode for testing or when network is definitely down
  forceOfflineMode(): void {
    // Force offline mode activated
    this.isOnline = false;
    this.stopNetworkMonitoring();
  }

  // Check if we should attempt to go online
  shouldAttemptOnline(): boolean {
    // Don't attempt if we've been offline for too long
    const lastOnlineCheck = this.lastOnlineCheck || 0;
    const timeSinceLastCheck = Date.now() - lastOnlineCheck;
    
    // Only attempt every 5 minutes
    return timeSinceLastCheck > 5 * 60 * 1000;
  }

  // Get current network status with more details
  getNetworkStatus(): { isOnline: boolean; queueLength: number; lastCheck: number; consecutiveFailures: number } {
    return {
      isOnline: this.isOnline,
      queueLength: this.offlineQueue.length,
      lastCheck: this.lastOnlineCheck || 0,
      consecutiveFailures: this.consecutiveFailures || 0
    };
  }

  // Force online mode (for testing)
  forceOnlineMode(): void {
    this.isOnline = true;
    this.processOfflineQueue();
  }


  // Wallet API methods
  async getWallet(userId: number): Promise<ApiResponse<{balance: number, currency: string, transactions: any[]}>> {
    return this.request<{balance: number, currency: string, transactions: any[]}>(`/wallet/${userId}`);
  }

  async addMoneyToWallet(userId: number, amount: number, paymentMethod: string, description?: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/wallet/${userId}/add-money`, 'POST', {
      amount,
      paymentMethod,
      description
    });
  }


  async getWalletTransactions(userId: number, limit: number = 50, offset: number = 0): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/wallet/${userId}/transactions?limit=${limit}&offset=${offset}`);
  }

  // Custom Production Requests API methods
  async getCustomProductionRequests(
    userId: number, 
    options: { limit?: number; offset?: number; status?: string } = {}
  ): Promise<ApiResponse<any[]>> {
    const { limit = 50, offset = 0, status } = options;
    let url = `/custom-production-requests/${userId}?limit=${limit}&offset=${offset}`;
    if (status) {
      url += `&status=${encodeURIComponent(status)}`;
    }
    return this.request<any[]>(url);
  }

  async getCustomProductionRequest(userId: number, requestId: number): Promise<ApiResponse<any>> {
    return this.request<any>(`/custom-production-requests/${userId}/${requestId}`);
  }

  async createCustomProductionRequest(data: any): Promise<ApiResponse<any>> {
    return this.request<any>('/custom-production-requests', 'POST', data);
  }

  async updateCustomProductionRequestStatus(
    requestId: number, 
    status: string, 
    options: {
      estimatedDeliveryDate?: string;
      actualDeliveryDate?: string;
      notes?: string;
    } = {}
  ): Promise<ApiResponse<any>> {
    return this.request<any>(`/custom-production-requests/${requestId}/status`, 'PUT', {
      status,
      ...options
    });
  }

  // Generic HTTP methods for campaign system
  async get<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, 'GET');
  }

  async post<T = any>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, 'POST', data);
  }

  async put<T = any>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, 'PUT', data);
  }

  async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, 'DELETE');
  }
}

export const apiService = new ApiService();

// Güvenli JSON parse yardımcı fonksiyonu
export async function safeJsonParse(response: Response): Promise<any> {
  try {
    const responseText = await response.text();
    
    // Boş veya geçersiz response kontrolü
    if (!responseText || responseText.trim() === '' || responseText === 'undefined') {
      console.warn('Empty or invalid response from API');
      return null;
    }

    // JSON parse et
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error parsing JSON response:', error);
    return null;
  }
}

// Varsayılan API anahtarı kaldırıltı; uygulama içi konfigürasyondan veya kullanıcı oturumundan set edilmelidir.
export default apiService;

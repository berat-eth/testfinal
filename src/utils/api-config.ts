// API Configuration for Remote Server
export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  environment: 'development' | 'staging' | 'production';
}

// Environment-based API configurations
export const API_CONFIGS: Record<string, ApiConfig> = {
  development: {
    baseUrl: 'http://213.142.159.135:3000/api',
    timeout: 30000,
    retryAttempts: 2,
    environment: 'development'
  },
  staging: {
    baseUrl: 'http://213.142.159.135:3000/api',
    timeout: 45000,
    retryAttempts: 3,
    environment: 'staging'
  },
  production: {
    baseUrl: 'http://213.142.159.135:3000/api',
    timeout: 30000, // 30 seconds for production
    retryAttempts: 5, // More retry attempts for production
    environment: 'production'
  }
};

// Remote server configurations
export const REMOTE_SERVERS = {
  primary: 'http://213.142.159.135:3000/api',
  backup: 'http://213.142.159.135:3000/api',
  local: 'http://213.142.159.135:3000/api'
};

// Not: X-API-Key gerektiğinde uygulama akışında güvenli şekilde set edilmelidir.
// Geçici çözüm: Uzak sunucu erişimi için varsayılan tenant API anahtarı.
// UYARI: Üretimde bu anahtar rotate edilmelidir.
export const DEFAULT_TENANT_API_KEY = 'huglu_f22635b61189c2cea13eec242465148d890fef5206ec8a1b0263bf279f4ba6ad';

// Optional IP address candidates for the backend. Fill with your server IPs.
// Examples: '95.173.182.10', '185.xxx.xxx.xxx'
export const IP_SERVER_CANDIDATES: string[] = [
  // Add known backend IPs here if available
  '213.142.159.135'
];

// Get current environment
export function getCurrentEnvironment(): string {
  if (__DEV__) {
    return 'development';
  }
  
  // For APK build, always use production
  return 'production';
}

// Check if we're in APK build (production build)
export function isApkBuild(): boolean {
  return !__DEV__ && typeof __DEV__ !== 'undefined';
}

// Get API configuration for current environment
export function getApiConfig(): ApiConfig {
  const environment = getCurrentEnvironment();
  return API_CONFIGS[environment];
}

// Get API base URL for current environment
export function getApiBaseUrl(): string {
  return getApiConfig().baseUrl;
}

// Manual server configuration
export function setRemoteServer(serverType: keyof typeof REMOTE_SERVERS): void {
  const config = getApiConfig();
  config.baseUrl = REMOTE_SERVERS[serverType];
  console.log(`🌐 API server changed to: ${config.baseUrl}`);
}

// Auto-detect best server
export async function detectBestServer(): Promise<string> {
  const servers = Object.values(REMOTE_SERVERS);
  
  // For APK builds, also include IP candidates
  if (isApkBuild() && IP_SERVER_CANDIDATES.length > 0) {
    IP_SERVER_CANDIDATES.forEach(ip => {
      servers.push(`http://${ip}:3000/api`);
    });
  }
  
  const testPromises = servers.map(async (url) => {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        return { url, responseTime, success: true };
      } else {
        return { url, responseTime, success: false };
      }
    } catch (error) {
      return { url, responseTime: Date.now() - startTime, success: false };
    }
  });

  const results = await Promise.all(testPromises);
  const workingServers = results.filter(r => r.success);
  
  if (workingServers.length > 0) {
    // Sort by response time and return the fastest
    workingServers.sort((a, b) => a.responseTime - b.responseTime);
    return workingServers[0].url;
  }
  
  // Fallback to primary server if no servers are working
  return REMOTE_SERVERS.primary;
}

// Configuration validation
export function validateApiConfig(config: ApiConfig): boolean {
  if (!config.baseUrl || !config.baseUrl.startsWith('http')) {
    console.error('❌ Invalid API base URL');
    return false;
  }
  
  if (config.timeout < 1000 || config.timeout > 120000) {
    console.error('❌ Invalid timeout value (should be between 1-120 seconds)');
    return false;
  }
  
  if (config.retryAttempts < 0 || config.retryAttempts > 5) {
    console.error('❌ Invalid retry attempts (should be between 0-5)');
    return false;
  }
  
  return true;
}

// Export default configuration
export default getApiConfig();

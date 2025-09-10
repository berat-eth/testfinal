import { IP_SERVER_CANDIDATES } from './api-config';
import apiService from './api-service';

/**
 * Network bağlantısını debug etmek için kullanılan fonksiyonlar
 */

export interface NetworkDebugResult {
  server: string;
  status: 'success' | 'error' | 'timeout';
  responseTime?: number;
  error?: string;
}

/**
 * Tüm sunucu adaylarını test eder ve sonuçları döndürür
 */
export async function debugNetworkConnectivity(): Promise<NetworkDebugResult[]> {
  console.log('🔍 Starting network connectivity debug...');
  
  const results: NetworkDebugResult[] = [];
  const candidates: string[] = ['https://api.zerodaysoftware.tr/api'];
  
  // IP adaylarını ekle
  if (IP_SERVER_CANDIDATES) {
    IP_SERVER_CANDIDATES.forEach(ip => {
      candidates.push(`https://${ip}/api`);
    });
  }

  // Her sunucuyu test et
  for (const server of candidates) {
    const result = await testServerConnection(server);
    results.push(result);
    
    // Sonucu konsola yazdır
    if (result.status === 'success') {
      console.log(`✅ ${server}: ${result.responseTime}ms`);
    } else {
      console.log(`❌ ${server}: ${result.error || 'Unknown error'}`);
    }
  }

  // En iyi sunucuyu bul ve ayarla
  const bestServer = results.find(r => r.status === 'success');
  if (bestServer) {
    console.log(`🏆 Best server found: ${bestServer.server}`);
    apiService.setApiUrl(bestServer.server);
  } else {
    console.warn('⚠️ No working servers found');
  }

  return results;
}

/**
 * Tek bir sunucu bağlantısını test eder
 */
async function testServerConnection(server: string): Promise<NetworkDebugResult> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout
    
    const response = await fetch(`${server.replace(/\/$/, '')}/health`, {
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
      return {
        server,
        status: 'success',
        responseTime
      };
    } else {
      return {
        server,
        status: 'error',
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        server,
        status: 'timeout',
        error: 'Request timeout'
      };
    }
    
    return {
      server,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Mevcut API servisinin durumunu kontrol eder
 */
export async function checkCurrentApiStatus(): Promise<{
  isConnected: boolean;
  responseTime?: number;
  error?: string;
}> {
  try {
    const startTime = Date.now();
    const response = await apiService.testConnection();
    const responseTime = Date.now() - startTime;
    
    return {
      isConnected: response.success && response.data === true,
      responseTime
    };
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Network debug sonuçlarını konsola yazdırır
 */
export function logNetworkDebugResults(results: NetworkDebugResult[]): void {
  console.log('\n📊 Network Debug Results:');
  console.log('========================');
  
  results.forEach(result => {
    const statusIcon = result.status === 'success' ? '✅' : '❌';
    const timeInfo = result.responseTime ? ` (${result.responseTime}ms)` : '';
    const errorInfo = result.error ? ` - ${result.error}` : '';
    
    console.log(`${statusIcon} ${result.server}${timeInfo}${errorInfo}`);
  });
  
  const successCount = results.filter(r => r.status === 'success').length;
  const totalCount = results.length;
  
  console.log(`\n📈 Summary: ${successCount}/${totalCount} servers working`);
}

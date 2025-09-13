import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import './src/utils/console-config';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import apiService from './src/utils/api-service';
import { AppProvider } from './src/contexts/AppContext';
import { initializeNetworkConfig } from './src/utils/network-config';
import { IP_SERVER_CANDIDATES } from './src/utils/api-config';
import { findBestServerForApk } from './src/utils/apk-config';

// TurboModule uyarılarını gizle
LogBox.ignoreLogs([
  'Module TurboModuleRegistry',
  'TurboModuleRegistry.getEnforcing(...)',
  '[runtime not ready]',
  'Sync error:',
  'Sync failed',
  'Simulated network failure',
]);

export default function App() {

  useEffect(() => {
    // Network'ü başlangıçta initialize et (SQLite kaldırıldı)
    const setupApp = async () => {
      try {

        // Production-ready API detection
        const quickTestOnce = async (): Promise<string | null> => {
          // For APK builds, use specialized server detection
          if (!__DEV__) {
            try {
              const bestServer = await findBestServerForApk();
              return bestServer;
            } catch (error) {
              console.error('❌ APK: Server detection failed:', error);
              // Fallback to domain-based detection
            }
          }
          
          const candidates: string[] = ['https://api.zerodaysoftware.tr/api'];
          
          // Add IP candidates for both development and production
          if (IP_SERVER_CANDIDATES) {
            IP_SERVER_CANDIDATES.forEach(ip => {
              candidates.push(`https://${ip}/api`);
            });
          }

          const tests = candidates.map(async (u) => {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000); // Increased timeout for production
              const resp = await fetch(`${u.replace(/\/$/, '')}/health`, { 
                method: 'GET', 
                signal: controller.signal,
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                }
              });
              clearTimeout(timeoutId);
              return resp.ok ? u : null;
            } catch {
              return null;
            }
          });

          const results = await Promise.all(tests);
          const found = results.find(Boolean) as string | undefined;
          return found || null;
        };

        let workingUrl: string | null = null;
        for (let attempt = 0; attempt < 3 && !workingUrl; attempt++) {
          const found = await quickTestOnce();
          if (found) {
            workingUrl = found.includes('/api') ? found : `${found}/api`;
            apiService.setApiUrl(workingUrl);
            break;
          }
        }

        // Uzak URL bulunamazsa yönlendirme yapma; uygulama yüklenmeye devam etsin
        
        // Initialize network configuration with auto-detection
        await initializeNetworkConfig();
        
        // Test backend connection; başarısız olsa bile yönlendirme yapma
        const health = await apiService.testConnection();

        // No periodic retries after redirect requirement
        return () => {};
      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        // App devam etsin, network hatası olsa bile
      }
    };

    const cleanupPromise = setupApp();
    return () => {
      // Ensure any async cleanup if provided
      Promise.resolve(cleanupPromise).catch(() => {});
    };
  }, []);

  // Yönlendirme sayacı ve WebView fallback kaldırıldı

  // Yönlendirme ekranı kaldırıldı

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
        <AppProvider>
          <AppNavigator />
        </AppProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

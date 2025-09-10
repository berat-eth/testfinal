import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  StatusBar,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../theme/colors';
import { Spacing } from '../theme/theme';

interface WebViewScreenProps {
  route?: {
    params?: {
      url?: string;
      title?: string;
    };
  };
  navigation?: any;
}

export const WebViewScreen: React.FC<any> = ({ route, navigation }) => {
  const { url = 'https://hugluoutdoor.com', title = 'Huglu Outdoor' } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const handleLoadStart = () => {
    setLoading(true);
    setError(false);
  };

  const handleLoadEnd = () => {
    setLoading(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
  };

  const goBack = () => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  };

  const goForward = () => {
    if (webViewRef.current && canGoForward) {
      webViewRef.current.goForward();
    }
  };

  const reload = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
      setError(false);
    }
  };

  const handleClose = () => {
    Alert.alert(
      'Sayfayı Kapat',
      'Web sayfasını kapatmak istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { 
          text: 'Kapat', 
          style: 'destructive',
          onPress: () => navigation?.goBack?.()
        },
      ]
    );
  };

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Icon name="error-outline" size={64} color={Colors.error} />
      <Text style={styles.errorTitle}>Sayfa Yüklenemedi</Text>
      <Text style={styles.errorMessage}>
        Web sayfası yüklenirken bir hata oluştu. İnternet bağlantınızı kontrol edin ve tekrar deneyin.
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={reload}>
        <Icon name="refresh" size={20} color={Colors.textOnPrimary} />
        <Text style={styles.retryButtonText}>Tekrar Dene</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
          <Icon name="close" size={24} color={Colors.textOnPrimary} />
        </TouchableOpacity>
        
        <View style={styles.headerTitle}>
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {title}
          </Text>
        </View>

        <TouchableOpacity style={styles.headerButton} onPress={reload}>
          <Icon name="refresh" size={24} color={Colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      {/* Navigation Bar */}
      <View style={styles.navigationBar}>
        <TouchableOpacity 
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          onPress={goBack}
          disabled={!canGoBack}
        >
          <Icon name="arrow-back" size={20} color={canGoBack ? Colors.primary : Colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          onPress={goForward}
          disabled={!canGoForward}
        >
          <Icon name="arrow-forward" size={20} color={canGoForward ? Colors.primary : Colors.textLight} />
        </TouchableOpacity>

        <View style={styles.urlContainer}>
          <Icon name="language" size={16} color={Colors.textLight} />
          <Text style={styles.urlText} numberOfLines={1}>
            {url}
          </Text>
        </View>
      </View>

      {/* WebView Content */}
      <View style={styles.webViewContainer}>
        {error ? (
          renderError()
        ) : (
          <>
            <WebView
              ref={webViewRef}
              source={{ uri: url }}
              style={styles.webView}
              onLoadStart={handleLoadStart}
              onLoadEnd={handleLoadEnd}
              onError={handleError}
              onNavigationStateChange={handleNavigationStateChange}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              scalesPageToFit={true}
              allowsBackForwardNavigationGestures={true}
              userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36 HugluOutdoorApp/1.0"
            />
            
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Sayfa yükleniyor...</Text>
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textOnPrimary,
    textAlign: 'center',
  },
  navigationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navButton: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  urlContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 20,
    marginLeft: Spacing.sm,
  },
  urlText: {
    fontSize: 12,
    color: Colors.textLight,
    marginLeft: Spacing.xs,
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 16,
    color: Colors.text,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  errorMessage: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 25,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textOnPrimary,
    marginLeft: Spacing.sm,
  },
});

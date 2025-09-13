import { userDataService } from './UserDataService';

export interface ProductVariation {
  color?: string;
  size?: string;
  model?: string;
  material?: string;
  pattern?: string;
  [key: string]: string | undefined;
}

export interface ProductActivityData {
  productId: number;
  productName: string;
  productPrice: number;
  productCategory: string;
  productBrand?: string;
  productImage?: string;
  variations?: ProductVariation;
  variationString?: string;
  discountAmount?: number;
  originalPrice?: number;
  finalPrice?: number;
}

export interface CartActivityData {
  productId: number;
  productName: string;
  productPrice: number;
  quantity: number;
  variations?: ProductVariation;
  variationString?: string;
  totalPrice: number;
  cartItemId?: string;
  discountAmount?: number;
  originalPrice?: number;
  finalPrice?: number;
  action: 'added' | 'removed' | 'updated' | 'cleared';
}

export interface OrderActivityData {
  orderId: string;
  orderNumber?: string;
  totalAmount: number;
  productCount: number;
  products: Array<{
    productId: number;
    productName: string;
    quantity: number;
    price: number;
    variations?: ProductVariation;
    variationString?: string;
  }>;
  paymentMethod?: string;
  paymentStatus?: 'pending' | 'completed' | 'failed' | 'refunded';
  orderStatus?: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  shippingAddress?: string;
  billingAddress?: string;
  action: 'started' | 'completed' | 'cancelled' | 'updated';
}

export interface SearchActivityData {
  searchTerm: string;
  searchCategory?: string;
  searchFilters?: { [key: string]: any };
  resultsCount: number;
  searchDuration?: number;
  clickedProductId?: number;
  clickedProductName?: string;
}

export interface NavigationActivityData {
  fromScreen: string;
  toScreen: string;
  navigationMethod: 'tab' | 'button' | 'link' | 'back' | 'gesture';
  timeSpent?: number;
  previousScreen?: string;
}

export interface ProfileActivityData {
  fieldChanged: string;
  oldValue?: string;
  newValue?: string;
  changeType: 'update' | 'add' | 'remove';
}

class DetailedActivityLogger {
  private static instance: DetailedActivityLogger;
  private userId: number | null = null;

  static getInstance(): DetailedActivityLogger {
    if (!DetailedActivityLogger.instance) {
      DetailedActivityLogger.instance = new DetailedActivityLogger();
    }
    return DetailedActivityLogger.instance;
  }

  setUserId(userId: number) {
    this.userId = userId;
  }

  private async logActivity(activityType: string, activityData: any) {
    if (!this.userId) {
      console.warn('⚠️ User ID not set for activity logging');
      return;
    }

    try {
      await userDataService.logUserActivity({
        userId: this.userId,
        activityType,
        activityData: {
          ...activityData,
          timestamp: new Date().toISOString(),
          sessionId: this.generateSessionId(),
          deviceInfo: this.getDeviceInfo()
        }
      });
    } catch (error) {
      console.error('❌ Detailed activity logging failed:', error);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDeviceInfo() {
    return {
      platform: 'mobile', // React Native için
      userAgent: 'HugluMobileApp/1.0',
      screenSize: 'mobile',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  // ÜRÜN AKTİVİTELERİ
  async logProductViewed(data: ProductActivityData) {
    await this.logActivity('product_viewed', {
      ...data,
      viewDuration: 0, // Bu değer daha sonra güncellenebilir
      viewSource: 'product_list' // veya 'search', 'recommendation', 'category'
    });
  }

  async logProductDetailViewed(data: ProductActivityData) {
    await this.logActivity('product_detail_viewed', {
      ...data,
      viewDuration: 0,
      viewSource: 'product_detail'
    });
  }

  async logProductImageZoomed(data: ProductActivityData, imageIndex: number) {
    await this.logActivity('product_image_zoomed', {
      ...data,
      imageIndex,
      zoomLevel: 'unknown' // Bu değer daha sonra güncellenebilir
    });
  }

  async logProductVariationSelected(data: ProductActivityData, selectedVariation: ProductVariation) {
    await this.logActivity('product_variation_selected', {
      ...data,
      selectedVariation,
      variationChange: true
    });
  }

  // SEPET AKTİVİTELERİ
  async logCartItemAdded(data: CartActivityData) {
    await this.logActivity('cart_item_added', {
      ...data,
      cartTotalBefore: 0, // Bu değer daha sonra güncellenebilir
      cartTotalAfter: 0,
      cartItemCount: 0
    });
  }

  async logCartItemRemoved(data: CartActivityData) {
    await this.logActivity('cart_item_removed', {
      ...data,
      cartTotalBefore: 0,
      cartTotalAfter: 0,
      cartItemCount: 0
    });
  }

  async logCartItemUpdated(data: CartActivityData) {
    await this.logActivity('cart_item_updated', {
      ...data,
      cartTotalBefore: 0,
      cartTotalAfter: 0,
      cartItemCount: 0
    });
  }

  async logCartViewed() {
    await this.logActivity('cart_viewed', {
      cartItemCount: 0,
      cartTotal: 0,
      isEmpty: true
    });
  }

  async logCartCleared() {
    await this.logActivity('cart_cleared', {
      clearedItemCount: 0,
      clearedTotal: 0
    });
  }

  // SİPARİŞ AKTİVİTELERİ
  async logOrderStarted(data: OrderActivityData) {
    await this.logActivity('order_started', {
      ...data,
      step: 'cart_review'
    });
  }

  async logOrderStepCompleted(step: string, data: any) {
    await this.logActivity('order_step_completed', {
      step,
      ...data,
      completedAt: new Date().toISOString()
    });
  }

  async logOrderCompleted(data: OrderActivityData) {
    await this.logActivity('order_completed', {
      ...data,
      completionTime: new Date().toISOString(),
      orderProcessDuration: 0 // Bu değer daha sonra hesaplanabilir
    });
  }

  async logOrderCancelled(data: OrderActivityData, reason?: string) {
    await this.logActivity('order_cancelled', {
      ...data,
      cancellationReason: reason,
      cancelledAt: new Date().toISOString()
    });
  }

  async logPaymentInitiated(data: OrderActivityData, paymentMethod: string) {
    await this.logActivity('payment_initiated', {
      ...data,
      paymentMethod,
      paymentAmount: data.totalAmount
    });
  }

  async logPaymentCompleted(data: OrderActivityData, paymentId: string) {
    await this.logActivity('payment_completed', {
      ...data,
      paymentId,
      paymentCompletedAt: new Date().toISOString()
    });
  }

  async logPaymentFailed(data: OrderActivityData, error: string) {
    await this.logActivity('payment_failed', {
      ...data,
      error,
      failedAt: new Date().toISOString()
    });
  }

  // ARAMA AKTİVİTELERİ
  async logSearchPerformed(data: SearchActivityData) {
    await this.logActivity('search_performed', {
      ...data,
      searchTimestamp: new Date().toISOString()
    });
  }

  async logSearchResultClicked(data: SearchActivityData) {
    await this.logActivity('search_result_clicked', {
      ...data,
      clickPosition: 0, // Bu değer daha sonra güncellenebilir
      clickTimestamp: new Date().toISOString()
    });
  }

  async logSearchFilterApplied(filterType: string, filterValue: any) {
    await this.logActivity('search_filter_applied', {
      filterType,
      filterValue,
      appliedAt: new Date().toISOString()
    });
  }

  // NAVİGASYON AKTİVİTELERİ
  async logScreenViewed(screenName: string, data?: any) {
    await this.logActivity('screen_viewed', {
      screenName,
      ...data,
      viewTimestamp: new Date().toISOString()
    });
  }

  async logNavigation(data: NavigationActivityData) {
    await this.logActivity('navigation', {
      ...data,
      navigationTimestamp: new Date().toISOString()
    });
  }

  // PROFİL AKTİVİTELERİ
  async logProfileUpdated(data: ProfileActivityData) {
    await this.logActivity('profile_updated', {
      ...data,
      updatedAt: new Date().toISOString()
    });
  }

  async logSettingsChanged(settingName: string, oldValue: any, newValue: any) {
    await this.logActivity('settings_changed', {
      settingName,
      oldValue,
      newValue,
      changedAt: new Date().toISOString()
    });
  }

  // KAMPANYA VE İNDİRİM AKTİVİTELERİ
  async logDiscountCodeApplied(code: string, discountAmount: number, orderId?: string) {
    await this.logActivity('discount_code_applied', {
      code,
      discountAmount,
      orderId,
      appliedAt: new Date().toISOString()
    });
  }

  async logDiscountCodeRemoved(code: string, orderId?: string) {
    await this.logActivity('discount_code_removed', {
      code,
      orderId,
      removedAt: new Date().toISOString()
    });
  }

  async logCampaignViewed(campaignId: string, campaignName: string) {
    await this.logActivity('campaign_viewed', {
      campaignId,
      campaignName,
      viewedAt: new Date().toISOString()
    });
  }

  // FAVORİ AKTİVİTELERİ
  async logProductFavorited(productId: number, productName: string) {
    await this.logActivity('product_favorited', {
      productId,
      productName,
      favoritedAt: new Date().toISOString()
    });
  }

  async logProductUnfavorited(productId: number, productName: string) {
    await this.logActivity('product_unfavorited', {
      productId,
      productName,
      unfavoritedAt: new Date().toISOString()
    });
  }

  // UYGULAMA AKTİVİTELERİ
  async logAppOpened() {
    await this.logActivity('app_opened', {
      openedAt: new Date().toISOString(),
      appVersion: '1.0.0'
    });
  }

  async logAppClosed() {
    await this.logActivity('app_closed', {
      closedAt: new Date().toISOString(),
      sessionDuration: 0 // Bu değer daha sonra hesaplanabilir
    });
  }

  async logErrorOccurred(error: string, screen: string, action?: string) {
    await this.logActivity('error_occurred', {
      error,
      screen,
      action,
      occurredAt: new Date().toISOString()
    });
  }
}

export const detailedActivityLogger = DetailedActivityLogger.getInstance();

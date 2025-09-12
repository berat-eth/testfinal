import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors, Gradients } from '../theme/colors';
import { Spacing, Shadows } from '../theme/theme';
import { ModernCard } from '../components/ui/ModernCard';
import { ModernButton } from '../components/ui/ModernButton';
import { Product } from '../utils/types';
import { ProductController } from '../controllers/ProductController';
import { CartController } from '../controllers/CartController';
import { UserController } from '../controllers/UserController';
import { CampaignController, Campaign } from '../controllers/CampaignController';
import { PersonalizationController, PersonalizedContent } from '../controllers/PersonalizationController';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { Chatbot } from '../components/Chatbot';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface HomeScreenProps {
  navigation: any;
}

const { width, height } = Dimensions.get('window');

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { updateCart } = useAppContext();
  const { t } = useLanguage();
  const { colors, isDark } = useTheme();
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [favoriteProducts, setFavoriteProducts] = useState<number[]>([]);
  const [popularProductsCounter, setPopularProductsCounter] = useState(0);
  const [personalizedContent, setPersonalizedContent] = useState<PersonalizedContent | null>(null);
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [countdownTimer, setCountdownTimer] = useState(20 * 60); // 20 dakika = 1200 saniye
  const scrollRef = useRef<ScrollView>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nowIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const COUNTDOWN_STORAGE_KEY = 'home_popular_countdown_remaining';
  const COUNTDOWN_SAVED_AT_KEY = 'home_popular_countdown_saved_at';

  // Modern slider data
  const sliderData = [
    {
      id: 1,
      title: 'Yeni Sezon',
      subtitle: 'Outdoor Koleksiyonu',
      description: '%50\'ye varan indirimler',
      image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
      gradient: Gradients.primary,
    },
    {
      id: 2,
      title: 'Kamp Sezonu',
      subtitle: 'Doğa ile Buluşun',
      description: 'En iyi kamp ekipmanları',
      image: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800',
      gradient: Gradients.ocean,
    },
    {
      id: 3,
      title: 'Avcılık',
      subtitle: 'Profesyonel Avcılık',
      description: 'Av sezonu için hazır olun',
      image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800',
      gradient: Gradients.purple,
    },
    {
      id: 4,
      title: 'Balıkçılık',
      subtitle: 'Su Sporları',
      description: 'Olta takımları ve aksesuarlar',
      image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
      gradient: Gradients.primary,
    },
  ];

  // Category icons mapping - using local assets
  const categoryIcons: { [key: string]: any } = {
    'Mont': require('../../assets/kategori_icon/mont.png'),
    'Pantolon': require('../../assets/kategori_icon/pantolon.png'),
    'Gömlek': require('../../assets/kategori_icon/gömlek.png'),
    'Hırka': require('../../assets/kategori_icon/hırka.png'),
    'Eşofmanlar': require('../../assets/kategori_icon/esofman.png'),
    'Bandana': require('../../assets/kategori_icon/bandana.png'),
    'Battaniye': require('../../assets/kategori_icon/battaniye.png'),
    'Kamp Ürünleri': require('../../assets/kategori_icon/camp ürünleri.png'),
    'Polar Bere': require('../../assets/kategori_icon/polar bere.png'),
    'Rüzgarlık': require('../../assets/kategori_icon/rüzgarlık.png'),
    'Şapka': require('../../assets/kategori_icon/şapka.png'),
    'Hoodie': require('../../assets/kategori_icon/hoodie_4696583.png'),
    'Mutfak Ürünleri': require('../../assets/kategori_icon/mutfsk ürünleri.png'),
    'Silah Aksesuar': require('../../assets/kategori_icon/silah aksuar.png'),
    'Silah Aksesuarları': require('../../assets/kategori_icon/silah aksuar.png'),
    'Tişört': require('../../assets/kategori_icon/tişört.png'),
    'T-Shirt': require('../../assets/kategori_icon/tişört.png'),
    'Sweatshirt': require('../../assets/kategori_icon/hoodie_4696583.png'),
    'Yelek': require('../../assets/kategori_icon/waistcoat_6229344.png'),
    'Yardımcı Giyim Ürünleri': require('../../assets/kategori_icon/aplike.png'),
    'Yağmurluk': require('../../assets/kategori_icon/yağmurluk.png'),
  };

  useEffect(() => {
    const init = async () => {
      await loadData();
      await loadFavorites();
      restoreCountdownAndStart();
    };
    const cleanupSlider = setupSliderTimer();
    init();
    return () => {
      cleanupSlider();
      // Persist current countdown on unmount
      AsyncStorage.setItem(COUNTDOWN_STORAGE_KEY, String(countdownTimer)).catch(() => {});
      AsyncStorage.setItem(COUNTDOWN_SAVED_AT_KEY, String(Date.now())).catch(() => {});
      stopCountdownTimer(); // Cleanup'ta timer'ı durdur
      if (nowIntervalRef.current) {
        clearInterval(nowIntervalRef.current);
        nowIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Scroll to current slide when currentSlide changes
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        x: currentSlide * width,
        animated: true,
      });
    }
  }, [currentSlide]);

  const setupSliderTimer = () => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % sliderData.length);
    }, 4000);
    return () => clearInterval(timer);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [allProductsResponse, cats] = await Promise.all([
        ProductController.getAllProducts(1, 1000), // Tüm ürünleri al (1000 limit)
        ProductController.getAllCategories(),
      ]);

      const allProducts = allProductsResponse?.products || [];
      if (allProducts && allProducts.length > 0) {
        // Önce popüler ürünleri yükle (rating'e göre sırala)
        const popularProducts = allProducts
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 6);
        
        // Yeni ürünleri popüler ürünlerle çakışmayacak şekilde seç
        const newProducts = getUniqueProducts(
          allProducts
            .sort((a, b) => {
              const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
              const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
              return dateB - dateA;
            }),
          popularProducts,
          6
        );

        setPopularProducts(popularProducts);
        setNewProducts(newProducts);
      } else {
        setPopularProducts([]);
        setNewProducts([]);
      }
      
      setCategories(Array.isArray(cats) ? cats : []);

      // Kampanyaları (login gerektirmeden) yükle
      try {
        const allCampaigns = await CampaignController.getCampaigns();
        setCampaigns(Array.isArray(allCampaigns) ? allCampaigns : []);
        // Sayaç için global bir now ticker başlat
        if (!nowIntervalRef.current) {
          nowIntervalRef.current = setInterval(() => setNowTs(Date.now()), 1000);
        }
      } catch (e) {
        console.error('Error loading campaigns:', e);
        setCampaigns([]);
      }

      // Kişiselleştirilmiş içerik ve kullanıcıya özel kampanyalar (giriş yapılmışsa)
      try {
        const isLoggedIn = await UserController.isLoggedIn();
        if (isLoggedIn) {
          const userId = await UserController.getCurrentUserId();
          const [personalizedContent, campaigns] = await Promise.all([
            PersonalizationController.generatePersonalizedContent(userId),
            CampaignController.getAvailableCampaigns(userId)
          ]);
          setPersonalizedContent(personalizedContent);
          setAvailableCampaigns(campaigns);
        } else {
          setPersonalizedContent(null);
          setAvailableCampaigns([]);
        }
      } catch (error) {
        console.error('Error loading personalized content:', error);
        setPersonalizedContent(null);
        setAvailableCampaigns([]);
      }
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshPopularProducts = async () => {
    try {
      const allProductsResponse = await ProductController.getAllProducts(1, 1000); // Tüm ürünleri al
      const allProducts = allProductsResponse?.products || [];
      if (allProducts && allProducts.length > 0) {
        // Yeni ürünlerle çakışmayacak şekilde random ürünler seç
        const randomProducts = getUniqueProducts(
          [...allProducts].sort(() => 0.5 - Math.random()),
          newProducts,
          6
        );
        
        setPopularProducts(randomProducts);
        setPopularProductsCounter(prev => prev + 1);
        // Timer'ı sıfırla
        const reset = 20 * 60;
        setCountdownTimer(reset);
        // Persist reset value immediately
        try {
          await AsyncStorage.setItem(COUNTDOWN_STORAGE_KEY, String(reset));
          await AsyncStorage.setItem(COUNTDOWN_SAVED_AT_KEY, String(Date.now()));
        } catch {}
      }
    } catch (error) {
      console.error('Error refreshing popular products:', error);
    }
  };

  const restoreCountdownAndStart = async () => {
    try {
      const [savedRemainingStr, savedAtStr] = await Promise.all([
        AsyncStorage.getItem(COUNTDOWN_STORAGE_KEY),
        AsyncStorage.getItem(COUNTDOWN_SAVED_AT_KEY),
      ]);
      const defaultRemaining = 20 * 60;
      if (savedRemainingStr && savedAtStr) {
        const savedRemaining = parseInt(savedRemainingStr, 10);
        const savedAt = parseInt(savedAtStr, 10);
        if (!isNaN(savedRemaining) && !isNaN(savedAt)) {
          const elapsed = Math.floor((Date.now() - savedAt) / 1000);
          const remaining = Math.max(1, savedRemaining - elapsed);
          setCountdownTimer(remaining);
          startCountdownTimer();
          return;
        }
      }
      // Fallback to default
      setCountdownTimer(defaultRemaining);
      startCountdownTimer();
    } catch {
      setCountdownTimer(20 * 60);
      startCountdownTimer();
    }
  };

  const startCountdownTimer = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdownTimer((prev) => {
        const next = prev <= 1 ? 20 * 60 : prev - 1;
        // Persist on every tick
        AsyncStorage.setItem(COUNTDOWN_STORAGE_KEY, String(next)).catch(() => {});
        AsyncStorage.setItem(COUNTDOWN_SAVED_AT_KEY, String(Date.now())).catch(() => {});
        if (prev <= 1) {
          // Timer bitti, popüler ürünleri yenile
          refreshPopularProducts();
        }
        return next;
      });
    }, 1000);
  };

  const stopCountdownTimer = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const formatCountdownTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatHMS = (totalSeconds: number) => {
    const sec = Math.max(0, totalSeconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Çakışmayı önleyen yardımcı fonksiyon
  const getUniqueProducts = (allProducts: Product[], excludeProducts: Product[], count: number): Product[] => {
    const excludeSkus = new Set(excludeProducts.map(p => p.externalId || p.id.toString()));
    const uniqueProducts = allProducts.filter(p => !excludeSkus.has(p.externalId || p.id.toString()));
    return uniqueProducts.slice(0, count);
  };

  const loadFavorites = async () => {
    try {
      const userId = await UserController.getCurrentUserId(); // Get current user ID
      const favorites = await UserController.getUserFavorites(userId);
      const favoriteIds = favorites.map((fav: any) => parseInt(fav.productId));
      setFavoriteProducts(favoriteIds);
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await loadFavorites();
    setRefreshing(false);
  };

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const handleCategoryPress = (category: string) => {
    navigation.navigate('ProductList', { category });
  };

  const handleAddToCart = async (product: Product) => {
    try {
      if (product.stock === 0) {
        Alert.alert('Uyarı', 'Bu ürün stokta yok.');
        return;
      }

      // Use CartController to add to cart
      const userId = await UserController.getCurrentUserId(); // Get current user ID
      const result = await CartController.addToCart(userId, product.id, 1);

      if (result.success) {
        // Global sepet state'ini güncelle
        try {
          const cartItems = await CartController.getCartItems(userId);
          const subtotal = CartController.calculateSubtotal(cartItems);
          const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);
          
          // Cart updated
          
          updateCart({
            items: cartItems,
            total: subtotal,
            itemCount,
            lastUpdated: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Error updating cart context:', error);
        }

        Alert.alert('Başarılı', result.message, [
          { text: 'Tamam' },
          { 
            text: 'Sepete Git', 
            onPress: () => navigation.navigate('Cart') 
          }
        ]);
      } else {
        Alert.alert('Hata', result.message);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      Alert.alert('Hata', 'Ürün sepete eklenirken bir hata oluştu');
    }
  };

  const handleToggleFavorite = async (product: Product) => {
    try {
      const userId = await UserController.getCurrentUserId(); // Get current user ID
      const isFavorite = favoriteProducts.includes(product.id);
      
      if (isFavorite) {
        const success = await UserController.removeFromFavorites(userId, product.id);
        if (success) {
          setFavoriteProducts(prev => prev.filter(id => id !== product.id));
          Alert.alert('Başarılı', 'Ürün favorilerden çıkarıldı');
        } else {
          Alert.alert('Hata', 'Ürün favorilerden çıkarılamadı');
        }
      } else {
        const success = await UserController.addToFavorites(userId, product.id, {
          name: product.name,
          price: product.price,
          image: product.image,
          images: product.images || [],
          brand: product.brand,
          description: product.description,
          category: product.category,
          stock: product.stock,
          rating: product.rating,
          reviewCount: product.reviewCount
        });
        if (success) {
          setFavoriteProducts(prev => [...prev, product.id]);
          Alert.alert('Başarılı', 'Ürün favorilere eklendi');
        } else {
          Alert.alert('Hata', 'Ürün favorilere eklenemedi');
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Hata', 'Favori işlemi sırasında bir hata oluştu');
    }
  };

  const handleOfferPress = async (offer: any) => {
    try {
      Alert.alert(
        offer.title,
        offer.description,
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Uygula', onPress: () => applyOffer(offer) }
        ]
      );
    } catch (error) {
      console.error('Error handling offer press:', error);
    }
  };

  const applyOffer = async (offer: any) => {
    // This would apply the offer to the user's cart or account
    Alert.alert('Başarılı', 'Kampanya uygulandı!');
  };

  const getOfferColor = (type: string): string => {
    const colors: Record<string, string> = {
      discount: '#28a745',
      free_shipping: '#17a2b8',
      bundle: '#6f42c1',
      loyalty: '#fd7e14',
      seasonal: '#20c997',
      birthday: '#e83e8c',
    };
    return colors[type] || '#007bff';
  };

  const getOfferIcon = (type: string): string => {
    const icons: Record<string, string> = {
      discount: 'local-offer',
      free_shipping: 'local-shipping',
      bundle: 'inventory',
      loyalty: 'star',
      seasonal: 'eco',
      birthday: 'cake',
    };
    return icons[type] || 'gift';
  };

  const renderHeroSlider = () => (
    <View style={styles.sliderContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const slide = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentSlide(slide);
        }}
        scrollEventThrottle={16}
      >
        {sliderData.map((slide) => (
          <View key={`slide-${slide.id}`} style={styles.slide}>
            <Image source={{ uri: slide.image }} style={styles.slideImage} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.slideOverlay}
            >
              <View style={styles.slideContent}>
                <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
                <Text style={styles.slideTitle}>{slide.title}</Text>
                <Text style={styles.slideDescription}>{slide.description}</Text>
                <ModernButton
                  title="Keşfet"
                  onPress={() => navigation.navigate('ProductList')}
                  variant="gradient"
                  size="medium"
                  style={{ marginTop: Spacing.md }}
                />
              </View>
            </LinearGradient>
          </View>
        ))}
      </ScrollView>
      <View style={styles.pagination}>
        {sliderData.map((_, index) => (
          <View
            key={`pagination-dot-${index}`}
            style={[
              styles.paginationDot,
              currentSlide === index && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );

  const renderCategories = () => (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Image 
            source={require('../../assets/categories-icon.png')} 
            style={styles.sectionIcon}
            resizeMode="contain"
          />
          <Text style={styles.sectionTitle}>Kategoriler</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('AllCategories')}>
          <Text style={styles.seeAll}>Tümü →</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContent}
      >
        {(categories || []).map((category, index) => {
          const iconSource = categoryIcons[category];
          return (
            <TouchableOpacity
              key={`category-${index}-${category}`}
              onPress={() => handleCategoryPress(category)}
              style={styles.categoryCard}
            >
              <View style={styles.categoryIconContainer}>
                {iconSource ? (
                  <Image
                    source={iconSource}
                    style={styles.categoryIcon}
                    resizeMode="contain"
                  />
                ) : (
                  <Icon
                    name="category"
                    size={28}
                    color={Colors.primary}
                  />
                )}
              </View>
              <Text style={styles.categoryName}>{category}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderProductCard = ({ item }: { item: Product }) => (
    <ModernCard
      onPress={() => handleProductPress(item)}
      style={styles.productCard}
      noPadding
    >
      <View style={styles.productImageContainer}>
        <Image 
          source={{ uri: item.image || 'https://via.placeholder.com/300x300?text=No+Image' }} 
          style={styles.productImage} 
        />
        {item.stock < 5 && item.stock > 0 && (
          <View style={styles.stockBadge}>
            <Text style={styles.stockBadgeText}>Son {item.stock} Ürün</Text>
          </View>
        )}
        <TouchableOpacity 
          style={styles.favoriteButton}
          onPress={() => handleToggleFavorite(item)}
        >
          <Icon 
            name={favoriteProducts.includes(item.id) ? "favorite" : "favorite-border"} 
            size={20} 
            color={favoriteProducts.includes(item.id) ? Colors.secondary : Colors.text} 
          />
        </TouchableOpacity>
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productBrand}>{item.brand}</Text>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.productFooter}>
          <View>
            <Text style={styles.productPrice}>
              {ProductController.formatPrice(item.price)}
            </Text>
            {item.rating > 0 && (
              <View style={styles.ratingContainer}>
                <Icon name="star" size={14} color={Colors.warning} />
                <Text style={styles.ratingText}>
                  {item.rating.toFixed(1)} ({item.reviewCount})
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity 
            style={styles.addToCartButton}
            onPress={() => handleAddToCart(item)}
          >
            <Icon name="add-shopping-cart" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </ModernCard>
  );

  const renderPopularProducts = () => (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <View>
            <Text style={styles.sectionTitle}>Popüler Ürünler</Text>
            <Text style={styles.sectionSubtitle}>En çok tercih edilenler</Text>
          </View>
          <View style={styles.countdownContainer}>
            <Icon name="timer" size={14} color={Colors.primary} />
            <Text style={styles.countdownText}>
              {formatCountdownTime(countdownTimer)}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Products')}>
          <Text style={styles.seeAll}>Tümü →</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={popularProducts}
        renderItem={renderProductCard}
        keyExtractor={(item) => `popular-${item.id}-${popularProductsCounter}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.productList}
        removeClippedSubviews={true}
        maxToRenderPerBatch={6}
        initialNumToRender={6}
        windowSize={10}
      />
    </View>
  );

  const renderNewProducts = () => (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Yeni Ürünler</Text>
          <Text style={styles.sectionSubtitle}>En son eklenenler</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Products')}>
          <Text style={styles.seeAll}>Tümü →</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={newProducts}
        renderItem={renderProductCard}
        keyExtractor={(item) => `new-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.productList}
        removeClippedSubviews={true}
        maxToRenderPerBatch={6}
        initialNumToRender={6}
        windowSize={10}
      />
    </View>
  );

  const renderCampaigns = () => {
    const activeCampaigns = (campaigns || []).filter(c => c.isActive && c.status === 'active');
    if (activeCampaigns.length === 0) return null;
    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Özel Teklifler</Text>
            <Text style={styles.sectionSubtitle}>Güncel kampanyalar</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.offerList}
        >
          {activeCampaigns.slice(0, 6).map((c) => (
            <View key={`camp-${c.id}`} style={[styles.offerCard, { backgroundColor: getOfferColor(c.type) }] }>
              <View style={styles.offerHeader}>
                <View style={styles.offerIcon}>
                  <Icon name={getOfferIcon(c.type)} size={20} color="white" />
                </View>
                <View style={styles.offerInfo}>
                  <Text style={styles.offerTitle} numberOfLines={2}>{c.name}</Text>
                  {!!c.description && (
                    <Text style={styles.offerDescription} numberOfLines={2}>{c.description}</Text>
                  )}
                </View>
              </View>
              {typeof c.discountValue === 'number' && c.discountValue > 0 && (
                <View style={styles.offerDiscount}>
                  <Text style={styles.discountText}>
                    {c.discountType === 'percentage' ? `%${c.discountValue} İndirim` : `${c.discountValue} TL İndirim`}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderFlashDeals = () => {
    const now = nowTs;
    const flash = (campaigns || []).filter(c => c.isActive && c.status === 'active' && c.endDate);
    if (flash.length === 0) return null;
    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Icon name="flash-on" size={18} color={Colors.secondary} />
            <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Flash İndirimler</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.offerList}
        >
          {flash.slice(0, 6).map(c => {
            const end = new Date(c.endDate as string).getTime();
            const remainSec = Math.max(0, Math.floor((end - now) / 1000));
            return (
              <View key={`flash-${c.id}`} style={[styles.offerCard, { backgroundColor: '#dc3545' }] }>
                <View style={styles.offerHeader}>
                  <View style={styles.offerIcon}>
                    <Icon name="bolt" size={20} color="white" />
                  </View>
                  <View style={styles.offerInfo}>
                    <Text style={styles.offerTitle} numberOfLines={2}>{c.name}</Text>
                    <Text style={styles.offerDescription} numberOfLines={2}>{c.description || 'Süre dolmadan yakalayın!'}</Text>
                  </View>
                </View>
                <View style={[styles.offerDiscount, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={styles.discountText}>Bitişe Kalan: {formatHMS(remainSec)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderPersonalizedOffers = () => {
    if (!personalizedContent || personalizedContent.personalizedOffers.length === 0) {
      return null;
    }

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>🎁 Size Özel Teklifler</Text>
            <Text style={styles.sectionSubtitle}>Kişiselleştirilmiş kampanyalar</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('PersonalizedOffers')}>
            <Text style={styles.seeAll}>Tümü →</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.offerList}
        >
          {personalizedContent.personalizedOffers.slice(0, 3).map((offer, index) => (
            <TouchableOpacity
              key={offer.id}
              style={[styles.offerCard, { backgroundColor: getOfferColor(offer.type) }]}
              onPress={() => handleOfferPress(offer)}
            >
              <View style={styles.offerHeader}>
                <View style={styles.offerIcon}>
                  <Icon name={getOfferIcon(offer.type)} size={20} color="white" />
                </View>
                <View style={styles.offerInfo}>
                  <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
                  <Text style={styles.offerDescription} numberOfLines={2}>{offer.description}</Text>
                </View>
              </View>
              
              {offer.discountAmount && (
                <View style={styles.offerDiscount}>
                  <Text style={styles.discountText}>
                    {offer.discountType === 'percentage' 
                      ? `%${offer.discountAmount} İndirim`
                      : `${offer.discountAmount} TL İndirim`
                    }
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };


  const renderRecommendedProducts = () => {
    if (!personalizedContent || personalizedContent.recommendedProducts.length === 0) {
      return null;
    }

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>⭐ Size Önerilen Ürünler</Text>
            <Text style={styles.sectionSubtitle}>Kişiselleştirilmiş öneriler</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('PersonalizedOffers')}>
            <Text style={styles.seeAll}>Tümü →</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          horizontal
          data={personalizedContent.recommendedProducts.slice(0, 6)}
          renderItem={renderProductCard}
          keyExtractor={(item) => `recommended-${item.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productList}
        />
      </View>
    );
  };


  if (loading) {
    return <LoadingIndicator />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {renderHeroSlider()}
        {renderCategories()}
        {renderFlashDeals()}
        {renderCampaigns()}
        {renderPersonalizedOffers()}
        {renderRecommendedProducts()}
        {renderPopularProducts()}
        {renderNewProducts()}
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
      
      {/* Chatbot */}
      <Chatbot navigation={navigation} />
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.secondary,
  },
  sliderContainer: {
    height: height * 0.35,
    marginBottom: Spacing.lg,
  },
  slide: {
    width,
    height: height * 0.35,
  },
  slideImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  slideOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  slideContent: {
    alignItems: 'flex-start',
  },
  slideSubtitle: {
    fontSize: 14,
    color: Colors.textOnPrimary,
    opacity: 0.9,
    marginBottom: Spacing.xs,
  },
  slideTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textOnPrimary,
    marginBottom: Spacing.xs,
  },
  slideDescription: {
    fontSize: 16,
    color: Colors.textOnPrimary,
    opacity: 0.9,
    marginBottom: Spacing.md,
  },
  pagination: {
    position: 'absolute',
    bottom: Spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    width: 24,
    backgroundColor: Colors.textOnPrimary,
  },
  sectionContainer: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sectionIcon: {
    width: 20,
    height: 20,
    tintColor: Colors.primary,
    marginRight: Spacing.sm,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: Spacing.md,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 4,
    fontFamily: 'monospace',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 2,
  },
  seeAll: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  categoriesContent: {
    paddingHorizontal: Spacing.lg,
  },
  categoryCard: {
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  categoryIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    ...Shadows.small,
  },
  categoryIcon: {
    width: 32,
    height: 32,
  },
  categoryName: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
  },
  productList: {
    paddingHorizontal: Spacing.lg,
  },
  productCard: {
    width: width * 0.45,
    marginRight: Spacing.md,
  },
  productImageContainer: {
    position: 'relative',
    height: 180,
    backgroundColor: Colors.surface,
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  stockBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stockBadgeText: {
    fontSize: 10,
    color: Colors.textOnPrimary,
    fontWeight: '600',
  },
  favoriteButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.small,
  },
  productInfo: {
    padding: Spacing.md,
  },
  productBrand: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productName: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: Spacing.sm,
    minHeight: 36,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    fontSize: 12,
    color: Colors.textLight,
    marginLeft: 4,
  },
  addToCartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.small,
  },
  offerList: {
    paddingHorizontal: Spacing.lg,
  },
  offerCard: {
    width: width * 0.8,
    marginRight: Spacing.md,
    padding: Spacing.lg,
    borderRadius: 12,
    ...Shadows.medium,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  offerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  offerInfo: {
    flex: 1,
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 2,
  },
  offerDescription: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  offerDiscount: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: Spacing.sm,
    borderRadius: 6,
    marginTop: Spacing.sm,
  },
  discountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },

});
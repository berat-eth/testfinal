import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  RefreshControl,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients } from '../theme/colors';
import { Spacing, Shadows } from '../theme/theme';
import { ModernProductCard } from '../components/ModernProductCard';
import { ModernButton } from '../components/ui/ModernButton';
import { Product } from '../utils/types';
import { ProductController } from '../controllers/ProductController';
import { CartController } from '../controllers/CartController';
import { UserController } from '../controllers/UserController';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { FilterModal } from '../components/FilterModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SearchBar } from '../components/SearchBar';
import { CampaignController, Campaign } from '../controllers/CampaignController';

interface ProductListScreenProps {
  navigation: any;
  route: any;
}

const { width } = Dimensions.get('window');

export const ProductListScreen: React.FC<ProductListScreenProps> = ({ navigation, route }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(route.params?.category || null);
  const [categories, setCategories] = useState<string[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'rating' | 'name'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: 0,
    maxPrice: 10000,
    brands: [] as string[],
    inStock: false,
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const nowIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showFlashDeals, setShowFlashDeals] = useState(false);
  
  // Pagination state
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalProducts, setTotalProducts] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadData();
    loadFavorites();
    loadCampaigns();

    if (!nowIntervalRef.current) {
      nowIntervalRef.current = setInterval(() => setNowTs(Date.now()), 1000);
    }

    return () => {
      if (nowIntervalRef.current) {
        clearInterval(nowIntervalRef.current);
        nowIntervalRef.current = null;
      }
    };
  }, [selectedCategory]);

  useEffect(() => {
    if (route.params?.searchQuery) {
      setSearchQuery(route.params.searchQuery);
    }
  }, [route.params?.searchQuery]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [products, searchQuery, sortBy, filters]);

  const loadData = async (page: number = 1, append: boolean = false) => {
    try {
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const [productsResult, allCategories] = await Promise.all([
        selectedCategory 
          ? ProductController.getProductsByCategory(selectedCategory)
          : ProductController.getAllProducts(1, 1000), // Tüm ürünleri tek seferde yükle
        ProductController.getAllCategories(),
      ]);
      
      if (selectedCategory) {
        // For category products, use legacy method
        const allProducts = Array.isArray(productsResult) ? productsResult : [];
        setProducts(allProducts);
        setFilteredProducts(allProducts);
        setTotalProducts(allProducts.length);
        setHasMore(false);
      } else {
        // For all products - load everything at once
        const { products: allProducts, total } = productsResult as any;
        const productsArray = Array.isArray(allProducts) ? allProducts : [];
        
        setProducts(productsArray);
        setFilteredProducts(productsArray);
        setTotalProducts(total || productsArray.length);
        setHasMore(false); // Tüm ürünler yüklendi, daha fazla yok
      }
      
      setCategories(Array.isArray(allCategories) ? allCategories : []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadCampaigns = async () => {
    try {
      const all = await CampaignController.getCampaigns();
      setCampaigns(Array.isArray(all) ? all : []);
    } catch (e) {
      console.error('Error loading campaigns:', e);
      setCampaigns([]);
    }
  };

  const isFlashCampaign = (c: Campaign) => {
    if (!c.isActive || c.status !== 'active' || !c.endDate) return false;
    const end = new Date(c.endDate).getTime();
    const remainMs = end - nowTs;
    return remainMs > 0 && remainMs <= 7 * 24 * 60 * 60 * 1000; // 1 hafta
  };

  const getFlashDealProducts = (): Product[] => {
    const flashCamps = (campaigns || []).filter(isFlashCampaign);
    const productIds = new Set<number>();
    for (const c of flashCamps) {
      if (Array.isArray(c.applicableProducts) && c.applicableProducts.length > 0) {
        c.applicableProducts.forEach(id => productIds.add(Number(id)));
      }
    }
    if (productIds.size === 0) return [];
    const pool = selectedCategory ? products : (filteredProducts.length ? filteredProducts : products);
    return pool.filter(p => productIds.has(p.id));
  };

  const formatHMS = (totalSeconds: number) => {
    const sec = Math.max(0, totalSeconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const renderFlashHeader = () => {
    const ends = (campaigns || [])
      .filter(isFlashCampaign)
      .map(c => new Date(c.endDate as string).getTime())
      .sort((a, b) => a - b);
    const soonestEnd = ends[0];
    const remainSec = soonestEnd ? Math.max(0, Math.floor((soonestEnd - nowTs) / 1000)) : 0;
    return (
      <View style={styles.flashHeader}>
        <View style={styles.flashTitleWrap}>
          <Icon name="flash-on" size={18} color={Colors.secondary} />
          <Text style={styles.flashTitle}>Flash İndirimler</Text>
        </View>
        <View style={styles.flashTimer}>
          <Icon name="timer" size={14} color={Colors.primary} />
          <Text style={styles.flashTimerText}>Bitiş: {formatHMS(remainSec)}</Text>
        </View>
      </View>
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setCurrentPageNum(1);
    setHasMore(true);
    await loadData(1, false);
    setRefreshing(false);
  };

  const loadMore = async () => {
    // Artık tüm ürünler tek seferde yükleniyor, loadMore gerekli değil
    return;
  };

  const applyFiltersAndSort = useCallback(() => {
    let filtered = [...products];

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((product) => {
        const inName = product.name?.toLowerCase().includes(q);
        const inBrand = product.brand?.toLowerCase().includes(q);
        const inExternalId = product.externalId?.toLowerCase().includes(q);
        const inVariationsSku = Array.isArray(product.variations)
          ? product.variations.some(v => Array.isArray(v.options) && v.options.some(opt => (opt.sku || '').toLowerCase().includes(q)))
          : false;
        return inName || inBrand || inExternalId || inVariationsSku;
      });
    }

    // Price filter
    filtered = filtered.filter(
      (product) => product.price >= filters.minPrice && product.price <= filters.maxPrice
    );

    // Brand filter
    if (filters.brands.length > 0) {
      filtered = filtered.filter((product) => filters.brands.includes(product.brand));
    }

    // Stock filter
    if (filters.inStock) {
      filtered = filtered.filter((product) => product.stock > 0);
    }

    // Sorting
    switch (sortBy) {
      case 'price-asc':
        filtered.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        filtered.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        filtered.sort((a, b) => b.rating - a.rating);
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    setFilteredProducts(filtered);
  }, [products, searchQuery, filters, sortBy]);

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
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

  const renderHeader = () => (
    <LinearGradient
      colors={[Colors.primary, Colors.primaryDark]}
      style={styles.headerGradient}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={Colors.textOnPrimary} />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Tüm Ürünler</Text>
          <Text style={styles.headerSubtitle}>{totalProducts} ürün mevcut</Text>
        </View>

        <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.filterButton}>
          <Icon name="tune" size={24} color={Colors.textOnPrimary} />
          {(filters.brands.length > 0 || filters.inStock) && (
            <View style={styles.filterBadge} />
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Ürün ara..."
          onSubmit={() => { /* filtreler otomatik tetikleniyor */ }}
        />
      </View>
    </LinearGradient>
  );

  const renderCategories = () => (
    <View style={styles.categoriesSection}>
      <View style={styles.categoriesHeader}>
        <View style={styles.categoriesTitleRow}>
          <View style={styles.categoriesTitleContainer}>
            <Image 
              source={require('../../assets/categories-icon.png')} 
              style={styles.categoriesIcon}
              resizeMode="contain"
            />
            <Text style={styles.categoriesTitle}>Kategoriler</Text>
          </View>
          <TouchableOpacity 
            onPress={() => navigation.navigate('AllCategories')}
            style={styles.seeAllButton}
          >
            <Text style={styles.seeAllText}>Tümü</Text>
            <Icon name="chevron-right" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
        style={styles.categoriesScrollView}
      >
        <TouchableOpacity
          style={[
            styles.categoryChip,
            !selectedCategory && styles.categoryChipActive,
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <View style={[
            styles.categoryChipContent,
            !selectedCategory && styles.categoryChipContentActive
          ]}>
            <Icon 
              name="apps" 
              size={18} 
              color={!selectedCategory ? Colors.textOnPrimary : Colors.text} 
            />
            <Text
              style={[
                styles.categoryChipText,
                !selectedCategory && styles.categoryChipTextActive,
              ]}
            >
              Tümü
            </Text>
          </View>
        </TouchableOpacity>
        {(categories || []).map((category, index) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryChip,
              selectedCategory === category && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <View style={[
              styles.categoryChipContent,
              selectedCategory === category && styles.categoryChipContentActive
            ]}>
              {getCategoryIcon(category) ? (
                <Image
                  source={getCategoryIcon(category)}
                  style={[
                    styles.categoryChipIcon,
                    { tintColor: selectedCategory === category ? Colors.textOnPrimary : Colors.text }
                  ]}
                  resizeMode="contain"
                />
              ) : (
                <Icon 
                  name="category" 
                  size={18} 
                  color={selectedCategory === category ? Colors.textOnPrimary : Colors.text} 
                />
              )}
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === category && styles.categoryChipTextActive,
                ]}
              >
                {category}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderSortAndView = () => (
    <View style={styles.sortViewContainer}>
      <View style={styles.resultInfo}>
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>
            {showFlashDeals ? getFlashDealProducts().length : filteredProducts.length} / {totalProducts} ürün
          </Text>
          <View style={styles.resultBadge}>
            <Text style={styles.resultBadgeText}>
              {showFlashDeals ? 'Flash İndirimler' : 'Tüm Ürünler'}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.toggleButton, showFlashDeals && styles.toggleButtonActive]}
          onPress={() => setShowFlashDeals(!showFlashDeals)}
        >
          <Icon name="flash-on" size={16} color={showFlashDeals ? Colors.textOnPrimary : Colors.text} />
          <Text style={[styles.toggleButtonText, showFlashDeals && styles.toggleButtonTextActive]}>
            {showFlashDeals ? 'Tümü' : 'Flash'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            const options = ['name', 'price-asc', 'price-desc', 'rating'] as const;
            const currentIndex = options.indexOf(sortBy);
            setSortBy(options[(currentIndex + 1) % options.length]);
          }}
        >
          <Icon name="sort" size={18} color={Colors.text} />
          <Text style={styles.sortButtonText}>
            {sortBy === 'name' && 'İsim'}
            {sortBy === 'price-asc' && 'Fiyat ↑'}
            {sortBy === 'price-desc' && 'Fiyat ↓'}
            {sortBy === 'rating' && 'Puan'}
          </Text>
        </TouchableOpacity>

        <View style={styles.viewModeContainer}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'grid' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('grid')}
          >
            <Icon
              name="grid-view"
              size={18}
              color={viewMode === 'grid' ? Colors.primary : Colors.textLight}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('list')}
          >
            <Icon
              name="view-list"
              size={18}
              color={viewMode === 'list' ? Colors.primary : Colors.textLight}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );



  const getCategoryIcon = (category: string) => {
    const iconMap: { [key: string]: any } = {
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
    return iconMap[category] || null;
  };

  const renderProduct = useCallback(({ item, index }: { item: Product; index: number }) => {
    if (viewMode === 'list') {
      return (
        <ModernProductCard
          product={item}
          onPress={() => handleProductPress(item)}
          onAddToCart={() => handleAddToCart(item)}
          onToggleFavorite={() => handleToggleFavorite(item)}
          isFavorite={favoriteProducts.includes(item.id)}
          variant="horizontal"
        />
      );
    }

    return (
      <View style={{ 
        width: '50%', 
        paddingLeft: index % 2 === 0 ? 0 : Spacing.xs,
        paddingRight: index % 2 === 0 ? Spacing.xs : 0,
      }}>
        <ModernProductCard
          product={item}
          onPress={() => handleProductPress(item)}
          onAddToCart={() => handleAddToCart(item)}
          onToggleFavorite={() => handleToggleFavorite(item)}
          isFavorite={favoriteProducts.includes(item.id)}
          variant="default"
          width={(width - Spacing.lg * 2 - Spacing.xs) / 2}
        />
      </View>
    );
  }, [viewMode, favoriteProducts, width]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="search-off" size={64} color={Colors.textMuted} />
      <Text style={styles.emptyStateTitle}>Ürün Bulunamadı</Text>
      <Text style={styles.emptyStateText}>
        Arama kriterlerinizi değiştirmeyi deneyin
      </Text>
      <ModernButton
        title="Filtreleri Temizle"
        onPress={() => {
          setSearchQuery('');
          setFilters({
            minPrice: 0,
            maxPrice: 10000,
            brands: [],
            inStock: false,
          });
        }}
        variant="outline"
        size="medium"
        style={{ marginTop: Spacing.lg }}
      />
    </View>
  );

  const renderFooter = () => {
    if (selectedCategory) return null;
    
    if (loadingMore) {
      return (
        <View style={styles.footerLoading}>
          <LoadingIndicator />
          <Text style={styles.footerLoadingText}>Daha fazla ürün yükleniyor...</Text>
        </View>
      );
    }
    
    if (products.length > 0) {
      return (
        <View style={styles.footerEnd}>
          <Text style={styles.footerEndText}>
            Tüm {totalProducts} ürün yüklendi
          </Text>
        </View>
      );
    }
    
    return null;
  };

  if (loading) {
    return <LoadingIndicator />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {renderHeader()}
      {renderCategories()}
      {renderSortAndView()}
      {showFlashDeals && renderFlashHeader()}
      <FlatList
        data={showFlashDeals ? getFlashDealProducts() : filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        numColumns={viewMode === 'grid' ? 2 : 1}
        key={viewMode}
        contentContainerStyle={[
          styles.productList,
          (showFlashDeals ? getFlashDealProducts() : filteredProducts).length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={showFlashDeals ? () => (
          <View style={styles.emptyState}>
            <Icon name="bolt" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyStateTitle}>Şu an flash indirim yok</Text>
            <Text style={styles.emptyStateText}>Kısa süre sonra tekrar kontrol edin</Text>
          </View>
        ) : renderEmptyState}
        ListFooterComponent={renderFooter}
        removeClippedSubviews={true}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={100}
        initialNumToRender={50}
        windowSize={15}
        getItemLayout={viewMode === 'grid' ? undefined : (data, index) => ({
          length: 120,
          offset: 120 * index,
          index,
        })}
      />

      {filterModalVisible && (
        <FilterModal
          visible={filterModalVisible}
          onClose={() => setFilterModalVisible(false)}
          onApply={(newFilters) => {
            setFilters({
              minPrice: newFilters.minPrice ?? 0,
              maxPrice: newFilters.maxPrice ?? 10000,
              brands: newFilters.brands ?? [],
              inStock: newFilters.inStock ?? false,
            });
            setFilterModalVisible(false);
          }}
          currentFilters={{
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            brands: filters.brands,
            inStock: filters.inStock,
          }}
          categories={categories}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textOnPrimary,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textOnPrimary,
    opacity: 0.8,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  backButton: {
    padding: Spacing.sm,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  filterButton: {
    padding: Spacing.sm,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.secondary,
  },
  categoriesSection: {
    backgroundColor: Colors.background,
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  categoriesHeader: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  categoriesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoriesTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoriesIcon: {
    width: 20,
    height: 20,
    tintColor: Colors.primary,
    marginRight: Spacing.sm,
  },
  categoriesScrollView: {
    paddingLeft: Spacing.lg,
  },
  categoriesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
    marginRight: 4,
  },
  categoriesContainer: {
    paddingHorizontal: Spacing.lg,
  },
  categoryChip: {
    marginRight: Spacing.sm,
    borderRadius: 25,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  categoryChipActive: {
    elevation: 4,
    shadowOpacity: 0.2,
  },
  categoryChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 80,
    justifyContent: 'center',
  },
  categoryChipContentActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipIcon: {
    width: 18,
    height: 18,
    marginRight: Spacing.xs,
  },
  categoryChipText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: Colors.textOnPrimary,
    fontWeight: '700',
  },
  sortViewContainer: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultInfo: {
    marginBottom: Spacing.sm,
  },
  resultCount: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  resultBadgeText: {
    color: Colors.textOnPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultCountText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sortButtonText: {
    fontSize: 14,
    color: Colors.text,
    marginLeft: Spacing.xs,
    fontWeight: '600',
  },
  viewModeContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewModeButton: {
    padding: Spacing.sm,
    borderRadius: 18,
  },
  viewModeButtonActive: {
    backgroundColor: Colors.primary,
  },
  productList: {
    padding: Spacing.md,
  },
  emptyList: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyStateText: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
  },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  footerLoadingText: {
    fontSize: 14,
    color: Colors.textLight,
    marginLeft: Spacing.sm,
  },
  footerEnd: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  footerEndText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  toggleButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    elevation: 2,
    shadowOpacity: 0.2,
  },
  toggleButtonText: {
    fontSize: 14,
    color: Colors.text,
    marginLeft: Spacing.xs,
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: Colors.textOnPrimary,
  },
  flashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  flashTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flashTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginLeft: 8,
  },
  flashTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flashTimerText: {
    marginLeft: 6,
    color: Colors.primary,
    fontWeight: '600',
  },
});
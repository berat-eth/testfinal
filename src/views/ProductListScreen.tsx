import React, { useState, useEffect, useRef } from 'react';
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
  StatusBar,
  TextInput,
  Alert,
  Image,
} from 'react-native';
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

  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadData();
    loadFavorites();
  }, [selectedCategory]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [products, searchQuery, sortBy, filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allProducts, allCategories] = await Promise.all([
        selectedCategory 
          ? ProductController.getProductsByCategory(selectedCategory)
          : ProductController.getAllProducts(),
        ProductController.getAllCategories(),
      ]);
      
      setProducts(Array.isArray(allProducts) ? allProducts : []);
      setCategories(Array.isArray(allCategories) ? allCategories : []);
      setFilteredProducts(Array.isArray(allProducts) ? allProducts : []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const applyFiltersAndSort = () => {
    let filtered = [...products];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product.brand?.toLowerCase().includes(searchQuery.toLowerCase())
      );
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
  };

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
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Icon name="arrow-back" size={24} color={Colors.text} />
      </TouchableOpacity>
      
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={Colors.textLight} style={styles.searchIcon} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Ürün ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={Colors.textMuted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={20} color={Colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.filterButton}>
        <Icon name="tune" size={24} color={Colors.text} />
        {(filters.brands.length > 0 || filters.inStock) && (
          <View style={styles.filterBadge} />
        )}
      </TouchableOpacity>
    </View>
  );

  const renderCategories = () => (
    <View style={styles.categoriesSection}>
      <LinearGradient
        colors={['rgba(26,26,46,0.05)', 'rgba(26,26,46,0.02)']}
        style={styles.categoriesGradient}
      >
        <View style={styles.categoriesHeader}>
          <Image 
            source={require('../../assets/categories-icon.png')} 
            style={{ width: 20, height: 20, tintColor: Colors.primary }}
            resizeMode="contain"
          />
          <Text style={styles.categoriesTitle}>Kategoriler</Text>
          <TouchableOpacity 
            onPress={() => navigation.navigate('AllCategories')}
            style={styles.seeAllButton}
          >
            <Text style={styles.seeAllText}>Tümü →</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          <TouchableOpacity
            style={[
              styles.categoryChip,
              !selectedCategory && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <LinearGradient
              colors={!selectedCategory ? Gradients.primary as [string, string] : ['transparent', 'transparent']}
              style={styles.categoryChipGradient}
            >
              <Icon 
                name="apps" 
                size={16} 
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
            </LinearGradient>
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
              <LinearGradient
                colors={selectedCategory === category ? Gradients.primary as [string, string] : ['transparent', 'transparent']}
                style={styles.categoryChipGradient}
              >
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
                    size={16} 
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
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>
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

  const renderSortAndView = () => (
    <View style={styles.sortViewContainer}>
      <View style={styles.resultCount}>
        <Text style={styles.resultCountText}>
          {filteredProducts.length} ürün bulundu
        </Text>
      </View>
      
      <View style={styles.sortViewButtons}>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            const options = ['name', 'price-asc', 'price-desc', 'rating'] as const;
            const currentIndex = options.indexOf(sortBy);
            setSortBy(options[(currentIndex + 1) % options.length]);
          }}
        >
          <Icon name="sort" size={20} color={Colors.text} />
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

  const renderProduct = ({ item, index }: { item: Product; index: number }) => {
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
  };

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

  if (loading) {
    return <LoadingIndicator />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      {renderHeader()}
      {renderCategories()}
      {renderSortAndView()}

      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={viewMode === 'grid' ? 2 : 1}
        key={viewMode}
        contentContainerStyle={[
          styles.productList,
          filteredProducts.length === 0 && styles.emptyList,
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
        ListEmptyComponent={renderEmptyState}
      />

      {filterModalVisible && (
        <FilterModal
          visible={filterModalVisible}
          onClose={() => setFilterModalVisible(false)}
          onApply={(newFilters) => {
            setFilters(newFilters);
            setFilterModalVisible(false);
          }}
          initialFilters={filters}
          products={products}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.sm,
    height: 44,
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
    marginBottom: Spacing.xs,
  },
  categoriesGradient: {
    paddingVertical: Spacing.md,
  },
  categoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  categoriesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  seeAllButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  categoriesContainer: {
    paddingHorizontal: Spacing.lg,
  },
  categoryChip: {
    marginRight: Spacing.md,
    borderRadius: 25,
    overflow: 'hidden',
    ...Shadows.small,
  },
  categoryChipActive: {
    ...Shadows.medium,
  },
  categoryChipGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 25,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  categoryChipIcon: {
    width: 16,
    height: 16,
  },
  categoryChipText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
    marginLeft: Spacing.sm,
  },
  categoryChipTextActive: {
    color: Colors.textOnPrimary,
    fontWeight: '700',
  },
  sortViewContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultCount: {
    flex: 1,
  },
  resultCountText: {
    fontSize: 14,
    color: Colors.textLight,
  },
  sortViewButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.background,
    marginRight: Spacing.sm,
  },
  sortButtonText: {
    fontSize: 13,
    color: Colors.text,
    marginLeft: 6,
    fontWeight: '500',
  },
  viewModeContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 2,
  },
  viewModeButton: {
    padding: 6,
    borderRadius: 6,
  },
  viewModeButtonActive: {
    backgroundColor: Colors.surface,
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
});
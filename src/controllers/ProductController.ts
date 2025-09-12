import { ProductModel, FilterOptions } from '../models/Product';
import { Product, ProductVariationOption } from '../utils/types';
import { XmlProductService, XmlProduct } from '../services/XmlProductService';
import { apiService } from '../utils/api-service';
import { CacheService, CacheTTL } from '../services/CacheService';

export class ProductController {
  // Enhanced product fetching with pagination and better offline support
  static async getAllProducts(page: number = 1, limit: number = 20): Promise<{ products: Product[], total: number, hasMore: boolean }> {
    try {
      // Try cache first for first page
      if (page === 1) {
        const cached = await CacheService.get<Product[]>('cache:products:all');
        if (cached && cached.length) {
          // Return first page from cache
          const paginatedProducts = cached.slice(0, limit);
          return {
            products: paginatedProducts,
            total: cached.length,
            hasMore: cached.length > limit
          };
        }
      }

      // Try API with pagination
      const response = await apiService.getProducts(page, limit);
      if (response.success && Array.isArray(response.data)) {
        const products = response.data.map((apiProduct: any) => this.mapApiProductToAppProduct(apiProduct));
        
        // Cache first page
        if (page === 1) {
          CacheService.set('cache:products:all', products, CacheTTL.MEDIUM).catch(() => {});
        }
        
        return {
          products,
          total: response.total || products.length,
          hasMore: response.hasMore || false
        };
      }
      
      // Fallback to XML service (only for first page)
      if (page === 1) {
        const xmlProducts = await XmlProductService.fetchProducts();
        const products = xmlProducts.map(xmlProduct => 
          XmlProductService.convertXmlProductToAppProduct(xmlProduct)
        );
        CacheService.set('cache:products:all', products, CacheTTL.SHORT).catch(() => {});
        
        const paginatedProducts = products.slice(0, limit);
        return {
          products: paginatedProducts,
          total: products.length,
          hasMore: products.length > limit
        };
      }
      
      return { products: [], total: 0, hasMore: false };
    } catch (error) {
      console.error('❌ ProductController - getAllProducts error:', error);
      return { products: [], total: 0, hasMore: false };
    }
  }

  // Legacy method for backward compatibility
  static async getAllProductsLegacy(): Promise<Product[]> {
    const result = await this.getAllProducts(1, 1000);
    return result.products;
  }

  static async getProductById(id: number): Promise<Product | null> {
    try {
      console.log(`🔄 Fetching product by ID: ${id}`);
      
      // Try API first
      const response = await apiService.getProductById(id);
      if (response.success && response.data) {
        console.log(`✅ API returned product: ${response.data.name}`);
        const product = this.mapApiProductToAppProduct(response.data);
        
        return product;
      }
      
      // Fallback to XML service
      console.log('🔄 API fallback to XML service');
      const xmlProducts = await XmlProductService.fetchProducts();
      const xmlProduct = xmlProducts.find(p => parseInt(p.UrunKartiID) === id);
      
      if (xmlProduct) {
        const product = XmlProductService.convertXmlProductToAppProduct(xmlProduct);
        return product;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ ProductController - getProductById error for ID ${id}:`, error);
      
      return null;
    }
  }

  static async getProductsByCategory(category: string): Promise<Product[]> {
    try {
      console.log(`🔄 Fetching products by category: ${category}`);
      
      // Try API first
      const response = await apiService.getProductsByCategory(category);
      if (response.success && response.data) {
        console.log(`✅ API returned ${response.data.length} products for category: ${category}`);
        const products = response.data.map((apiProduct: any) => this.mapApiProductToAppProduct(apiProduct));
        
        return products;
      }
      
      // Fallback to XML service
      console.log('🔄 API fallback to XML service');
      const xmlProducts = await XmlProductService.fetchProductsByCategory(category);
      const products = xmlProducts.map(xmlProduct => 
        XmlProductService.convertXmlProductToAppProduct(xmlProduct)
      );
      
      return products;
    } catch (error) {
      console.error(`❌ ProductController - getProductsByCategory error for category ${category}:`, error);
      
      // Return empty array as fallback
      return [];
    }
  }

  static async searchProducts(query: string): Promise<Product[]> {
    try {
      if (!query || query.trim().length < 2) {
        return [];
      }
      
      const trimmedQuery = query.trim();
      console.log(`🔍 Searching products with query: "${trimmedQuery}"`);
      
      // Try API first
      const response = await apiService.searchProducts(trimmedQuery);
      if (response.success && response.data) {
        console.log(`✅ API returned ${response.data.length} search results for: "${trimmedQuery}"`);
        const products = response.data.map((apiProduct: any) => this.mapApiProductToAppProduct(apiProduct));
        
        // Ek: Eğer sonuç yoksa ve sorgu stok kodu/sku'ya benziyorsa, local filtre uygula
        if (products.length === 0) {
          const looksLikeSku = /[a-z0-9\-_/]{3,}/i.test(trimmedQuery);
          if (looksLikeSku) {
            const all = await this.getAllProducts();
            const q = trimmedQuery.toLowerCase();
            const skuFiltered = all.filter(p => {
              const inExternalId = p.externalId?.toLowerCase().includes(q);
              const inVariationsSku = Array.isArray(p.variations)
                ? p.variations.some(v => Array.isArray(v.options) && v.options.some(opt => (opt.sku || '').toLowerCase().includes(q)))
                : false;
              return inExternalId || inVariationsSku;
            });
            return skuFiltered;
          }
        }
        return products;
      }
      
      // Fallback to XML service
      console.log('🔄 API fallback to XML service for search');
      const xmlProducts = await XmlProductService.searchProducts(trimmedQuery);
      const products = xmlProducts.map(xmlProduct => 
        XmlProductService.convertXmlProductToAppProduct(xmlProduct)
      );
      // XML sonucunda da stok kodu eşleşmesi ek filtre
      if (products.length === 0) {
        const all = await this.getAllProducts();
        const q = trimmedQuery.toLowerCase();
        const skuFiltered = all.filter(p => {
          const inExternalId = p.externalId?.toLowerCase().includes(q);
          const inVariationsSku = Array.isArray(p.variations)
            ? p.variations.some(v => Array.isArray(v.options) && v.options.some(opt => (opt.sku || '').toLowerCase().includes(q)))
            : false;
          return inExternalId || inVariationsSku;
        });
        return skuFiltered;
      }
      return products;
    } catch (error) {
      console.error(`❌ ProductController - searchProducts error for query "${query}":`, error);
      
      // Return empty array as fallback
      return [];
    }
  }

  static async filterProducts(filters: FilterOptions): Promise<Product[]> {
    try {
      console.log('🔍 Filtering products with filters:', filters);
      
      // Try API first
      const response = await apiService.filterProducts(filters);
      if (response.success && Array.isArray(response.data)) {
        console.log(`✅ API returned ${response.data.length} filtered products`);
        const products = response.data.map((apiProduct: any) => this.mapApiProductToAppProduct(apiProduct));
        return products;
      }
      
      // Fallback: get all products and filter locally
      console.log('🔄 API fallback to local filtering');
      const allProducts = await this.getAllProducts();
      
      let filteredProducts = allProducts;
      
      // Apply filters locally
      if (filters.category) {
        filteredProducts = filteredProducts.filter(p => p.category === filters.category);
      }
      
      if (filters.minPrice !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.price >= filters.minPrice!);
      }
      
      if (filters.maxPrice !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.price <= filters.maxPrice!);
      }
      
      if (filters.brands && filters.brands.length > 0) {
        filteredProducts = filteredProducts.filter(p => p.brand && filters.brands!.includes(p.brand));
      }
      
      if (filters.minRating !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.rating >= filters.minRating!);
      }
      
      if (filters.inStock) {
        filteredProducts = filteredProducts.filter(p => p.stock > 0);
      }
      
      // Apply sorting
      if (filters.sortBy) {
        filteredProducts = this.sortProducts(filteredProducts, filters.sortBy);
      }
      
      console.log(`✅ Local filtering returned ${filteredProducts.length} products`);
      return filteredProducts;
    } catch (error) {
      console.error('❌ ProductController - filterProducts error:', error);
      return [];
    }
  }

  static async getAllCategories(): Promise<string[]> {
    try {
      console.log('🔄 Fetching categories...');
      
      // Try cache first
      const cached = await CacheService.get<string[]>('cache:categories:all');
      if (cached && cached.length) {
        console.log(`🧠 Cache hit: ${cached.length} categories`);
        return cached;
      }

      // Try API
      const response = await apiService.getCategories();
      if (response.success && Array.isArray(response.data)) {
        console.log(`✅ API returned ${response.data.length} categories`);
        CacheService.set('cache:categories:all', response.data, CacheTTL.LONG).catch(() => {});
        return response.data;
      }
      
      // Fallback: get unique categories from all products
      console.log('🔄 API fallback to local category extraction');
      const allProducts = await this.getAllProducts();
      const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
      
      console.log(`✅ Found ${categories.length} unique categories`);
      const sorted = categories.sort();
      CacheService.set('cache:categories:all', sorted, CacheTTL.MEDIUM).catch(() => {});
      return sorted;
    } catch (error) {
      console.error('❌ ProductController - getAllCategories error:', error);
      return [];
    }
  }

  static async getProductsByCategory(category: string): Promise<Product[]> {
    try {
      console.log(`🔄 Fetching products for category: ${category}`);
      
      // Use filter method with category
      return await this.filterProducts({ category });
    } catch (error) {
      console.error('❌ ProductController - getProductsByCategory error:', error);
      return [];
    }
  }

  static async getCategories(): Promise<string[]> {
    try {
      console.log('🔄 Fetching categories...');
      
      // Try API first
      const response = await apiService.getCategories();
      if (response.success && Array.isArray(response.data)) {
        console.log(`✅ API returned ${response.data.length} categories`);
        return response.data;
      }
      
      // Fallback to XML service
      console.log('🔄 API fallback to XML service for categories');
      const categoryTrees = await XmlProductService.fetchCategories();
      const categories = Array.isArray(categoryTrees)
        ? categoryTrees.map(cat => cat.mainCategory)
        : [];
      return categories;
    } catch (error) {
      console.error('❌ ProductController - getCategories error:', error);
      
      // Return empty array as fallback
      return [];
    }
  }

  static async getCategoryTree(): Promise<{ mainCategory: string; subCategories: string[] }[]> {
    try {
      console.log('🔄 Fetching category tree...');
      
      // Try API first
      const response = await apiService.getCategories();
      if (response.success && response.data) {
        console.log(`✅ API returned ${response.data.length} categories for tree`);
        
        // Convert flat categories to tree structure
        const categoryMap = new Map<string, Set<string>>();
        
        // This is a simplified tree structure - you might want to enhance this
        // based on your actual category hierarchy
        response.data.forEach(category => {
          const parts = category.split('/');
          const mainCategory = parts[0] || category;
          const subCategory = parts[1] || '';
          
          if (!categoryMap.has(mainCategory)) {
            categoryMap.set(mainCategory, new Set());
          }
          
          if (subCategory) {
            categoryMap.get(mainCategory)!.add(subCategory);
          }
        });
        
        const tree = Array.from(categoryMap.entries()).map(([main, subs]) => ({
          mainCategory: main,
          subCategories: Array.from(subs)
        }));
        
        return tree;
      }
      
      // Fallback to XML service
      console.log('🔄 API fallback to XML service for category tree');
      return await XmlProductService.fetchCategories();
    } catch (error) {
      console.error('❌ ProductController - getCategoryTree error:', error);
      
      // Return empty array as fallback
      return [];
    }
  }

  static async getSubCategories(mainCategory: string): Promise<string[]> {
    try {
      const categoryTrees = await this.getCategoryTree();
      const category = categoryTrees.find(cat => cat.mainCategory === mainCategory);
      return category?.subCategories || [];
    } catch (error) {
      console.error(`❌ ProductController - getSubCategories error for category ${mainCategory}:`, error);
      return [];
    }
  }

  static async getBrands(): Promise<string[]> {
    try {
      console.log('🔄 Fetching brands...');
      
      // Try API first
      const response = await apiService.getBrands();
      if (response.success && response.data) {
        console.log(`✅ API returned ${response.data.length} brands`);
        
        return response.data;
      }
      
      // Fallback: extract brands from cached products
      console.log('🔄 API fallback to extracting brands from cached products');
      const allProducts = await this.getAllProducts();
      const brands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort();
      
      return brands;
    } catch (error) {
      console.error('❌ ProductController - getBrands error:', error);
      
      // Return empty array as fallback
      return [];
    }
  }

  static async getPriceRange(): Promise<{ min: number; max: number }> {
    try {
      console.log('🔄 Fetching price range...');
      
      // Try API first
      const response = await apiService.getPriceRange();
      if (response.success && response.data) {
        console.log(`✅ API returned price range: ${response.data.min} - ${response.data.max}`);
        
        return response.data;
      }
      
      // Fallback: calculate from cached products
      console.log('🔄 API fallback to calculating price range from cached products');
      const allProducts = await this.getAllProducts();
      
      if (allProducts.length === 0) {
        return { min: 0, max: 0 };
      }
      
      const prices = allProducts.map(p => p.price).filter(p => p > 0);
      const priceRange = {
        min: Math.min(...prices),
        max: Math.max(...prices)
      };
      
      console.log(`✅ Calculated price range: ${priceRange.min} - ${priceRange.max}`);
      
      return priceRange;
    } catch (error) {
      console.error('❌ ProductController - getPriceRange error:', error);
      
      // Return default price range as fallback
      return { min: 0, max: 0 };
    }
  }

  static async checkStock(
    productId: number, 
    quantity: number, 
    selectedVariations?: { [key: string]: ProductVariationOption }
  ): Promise<boolean> {
    try {
      const product = await this.getProductById(productId);
      if (!product) return false;

      if (selectedVariations && Object.keys(selectedVariations).length > 0) {
        // Check stock for specific variations
        const optionIds = Object.values(selectedVariations).map(option => option.id);
        const minStock = Math.min(...Object.values(selectedVariations).map(option => option.stock));
        return minStock >= quantity;
      } else {
        // Check base product stock
        return product.stock >= quantity;
      }
    } catch (error) {
      console.error(`❌ ProductController - checkStock error for product ${productId}:`, error);
      return false;
    }
  }

  static async getPopularProducts(): Promise<Product[]> {
    try {
      console.log('🔄 Fetching popular products...');
      
      const products = await this.getAllProducts();
      // Popüler ürünleri rating'e göre sırala ve ilk 6 tanesini al
      const popularProducts = products
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6);
      
      console.log(`✅ Found ${popularProducts.length} popular products`);
      return popularProducts;
    } catch (error) {
      console.error('❌ ProductController - getPopularProducts error:', error);
      return [];
    }
  }

  static async getNewProducts(): Promise<Product[]> {
    try {
      console.log('🔄 Fetching new products...');
      
      const products = await this.getAllProducts();
      // En yeni ürünleri lastUpdated'a göre sırala
      const newProducts = products
        .sort((a, b) => {
          const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
          const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 6);
      
      console.log(`✅ Found ${newProducts.length} new products`);
      return newProducts;
    } catch (error) {
      console.error('❌ ProductController - getNewProducts error:', error);
      return [];
    }
  }

  // Helper method for sorting products
  private static sortProducts(products: Product[], sortBy: string): Product[] {
    switch (sortBy) {
      case 'price_asc':
        return [...products].sort((a, b) => a.price - b.price);
      case 'price_desc':
        return [...products].sort((a, b) => b.price - a.price);
      case 'rating_desc':
        return [...products].sort((a, b) => b.rating - a.rating);
      case 'name_asc':
        return [...products].sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc':
        return [...products].sort((a, b) => b.name.localeCompare(a.name));
      default:
        return products;
    }
  }

  static formatPrice(price: number): string {
    const safe = Number(price);
    const value = Number.isFinite(safe) ? safe : 0;
    return `₺${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  }

  // Enhanced API product mapping with better error handling
  private static mapApiProductToAppProduct(apiProduct: any): Product {
    try {
      // Check if product has variations from API
      const hasVariations = apiProduct.hasVariations === true || 
                           (apiProduct.variations && Array.isArray(apiProduct.variations) && apiProduct.variations.length > 0);
      
      return {
        id: parseInt(apiProduct.id) || 0,
        name: apiProduct.name || 'Unknown Product',
        description: apiProduct.description || '',
        price: parseFloat(apiProduct.price) || 0,
        category: apiProduct.category || '',
        image: apiProduct.image || '',
        stock: parseInt(apiProduct.stock) || 0,
        brand: apiProduct.brand || '',
        rating: parseFloat(apiProduct.rating) || 0,
        reviewCount: parseInt(apiProduct.reviewCount) || 0,
        // Only include variations if they exist and have multiple options
        variations: hasVariations ? (apiProduct.variations || []) : [],
        hasVariations: hasVariations,
        lastUpdated: apiProduct.lastUpdated || new Date().toISOString(),
        externalId: apiProduct.externalId || apiProduct.id?.toString(),
        source: apiProduct.source || 'API'
      };
    } catch (error) {
      console.error('❌ Error mapping API product:', error, apiProduct);
      // Return a safe fallback product
      return {
        id: 0,
        name: 'Error Loading Product',
        description: 'This product could not be loaded properly',
        price: 0,
        category: 'Unknown',
        image: '',
        stock: 0,
        brand: 'Unknown',
        rating: 0,
        reviewCount: 0,
        variations: [],
        hasVariations: false,
        lastUpdated: new Date().toISOString(),
        externalId: 'error',
        source: 'Error'
      };
    }
  }
}
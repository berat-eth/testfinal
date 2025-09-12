// Test ProductController with the fix
const { ProductController } = require('./src/controllers/ProductController');

async function testProductController() {
  try {
    console.log('🔍 ProductController testi...\n');

    // Test with small limit first
    console.log('1️⃣ 20 ürün limit testi:');
    const result20 = await ProductController.getAllProducts(1, 20);
    console.log('✅ Başarılı:', result20.products.length > 0);
    console.log('📦 Dönen ürün sayısı:', result20.products.length);
    console.log('📊 Toplam ürün sayısı:', result20.total);
    console.log('🔄 Daha fazla var mı:', result20.hasMore);
    console.log('');

    // Test with large limit
    console.log('2️⃣ 1000 ürün limit testi:');
    const result1000 = await ProductController.getAllProducts(1, 1000);
    console.log('✅ Başarılı:', result1000.products.length > 0);
    console.log('📦 Dönen ürün sayısı:', result1000.products.length);
    console.log('📊 Toplam ürün sayısı:', result1000.total);
    console.log('🔄 Daha fazla var mı:', result1000.hasMore);
    console.log('');

    // Show first 5 products
    console.log('3️⃣ İlk 5 ürün:');
    result1000.products.slice(0, 5).forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - ${product.price} TL (${product.category})`);
    });

  } catch (error) {
    console.error('❌ Test hatası:', error.message);
    console.error('Stack:', error.stack);
  }
}

testProductController();

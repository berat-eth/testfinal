const axios = require('axios');

async function testAPI() {
  try {
    console.log('🔍 API endpoint\'lerini test ediyorum...\n');

    // 1. Tüm ürünleri çek (pagination ile)
    console.log('1️⃣ /api/products endpoint testi:');
    const productsResponse = await axios.get('http://localhost:3000/api/products?page=1&limit=20');
    console.log('✅ Başarılı:', productsResponse.data.success);
    console.log('📊 Toplam ürün sayısı:', productsResponse.data.data.total);
    console.log('📦 Dönen ürün sayısı:', productsResponse.data.data.products.length);
    console.log('🔄 Daha fazla var mı:', productsResponse.data.data.hasMore);
    console.log('');

    // 2. Kategoriye göre ürünleri çek
    console.log('2️⃣ /api/products/category/Kamp Ürünleri endpoint testi:');
    const categoryResponse = await axios.get('http://localhost:3000/api/products/category/Kamp Ürünleri');
    console.log('✅ Başarılı:', categoryResponse.data.success);
    console.log('📦 Kategori ürün sayısı:', categoryResponse.data.data.length);
    console.log('');

    // 3. Arama testi
    console.log('3️⃣ /api/products/search endpoint testi:');
    const searchResponse = await axios.get('http://localhost:3000/api/products/search?q=pantolon');
    console.log('✅ Başarılı:', searchResponse.data.success);
    console.log('🔍 Arama sonucu sayısı:', searchResponse.data.data.length);
    console.log('');

    // 4. İlk 5 ürünün detaylarını göster
    console.log('4️⃣ İlk 5 ürün detayları:');
    productsResponse.data.data.products.slice(0, 5).forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - ${product.price} TL (${product.category})`);
    });

  } catch (error) {
    console.error('❌ API test hatası:', error.message);
    if (error.response) {
      console.error('📊 Response status:', error.response.status);
      console.error('📄 Response data:', error.response.data);
    }
  }
}

testAPI();

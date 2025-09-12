const axios = require('axios');

async function testRemoteAPI() {
  const REMOTE_API_URL = 'http://213.142.159.135:3000/api';
  const API_KEY = 'huglu_f22635b61189c2cea13eec242465148d890fef5206ec8a1b0263bf279f4ba6ad';

  try {
    console.log('🌐 Uzak sunucu API endpoint\'lerini test ediyorum...\n');
    console.log(`🔗 API URL: ${REMOTE_API_URL}\n`);

    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    };

    // 1. Health check
    console.log('1️⃣ Health check:');
    try {
      const healthResponse = await axios.get(`${REMOTE_API_URL}/health`, { headers });
      console.log('✅ Sunucu çalışıyor:', healthResponse.data);
    } catch (error) {
      console.log('⚠️ Health endpoint bulunamadı, devam ediyorum...');
    }
    console.log('');

    // 2. Tüm ürünleri çek (pagination ile)
    console.log('2️⃣ /products endpoint testi:');
    const productsResponse = await axios.get(`${REMOTE_API_URL}/products?page=1&limit=20`, { headers });
    console.log('✅ Başarılı:', productsResponse.data.success);
    console.log('📊 Toplam ürün sayısı:', productsResponse.data.data.total);
    console.log('📦 Dönen ürün sayısı:', productsResponse.data.data.products.length);
    console.log('🔄 Daha fazla var mı:', productsResponse.data.data.hasMore);
    console.log('');

    // 3. Kategoriye göre ürünleri çek
    console.log('3️⃣ /products/category/Kamp Ürünleri endpoint testi:');
    const categoryResponse = await axios.get(`${REMOTE_API_URL}/products/category/Kamp Ürünleri`, { headers });
    console.log('✅ Başarılı:', categoryResponse.data.success);
    console.log('📦 Kategori ürün sayısı:', categoryResponse.data.data.length);
    console.log('');

    // 4. Arama testi
    console.log('4️⃣ /products/search endpoint testi:');
    const searchResponse = await axios.get(`${REMOTE_API_URL}/products/search?q=pantolon`, { headers });
    console.log('✅ Başarılı:', searchResponse.data.success);
    console.log('🔍 Arama sonucu sayısı:', searchResponse.data.data.length);
    console.log('');

    // 5. İlk 5 ürünün detaylarını göster
    console.log('5️⃣ İlk 5 ürün detayları:');
    productsResponse.data.data.products.slice(0, 5).forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - ${product.price} TL (${product.category})`);
    });

    console.log('\n✅ Tüm testler başarılı! Uzak sunucu çalışıyor.');

  } catch (error) {
    console.error('❌ API test hatası:', error.message);
    if (error.response) {
      console.error('📊 Response status:', error.response.status);
      console.error('📄 Response data:', error.response.data);
    }
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Bağlantı reddedildi - sunucu çalışmıyor olabilir');
    }
  }
}

testRemoteAPI();

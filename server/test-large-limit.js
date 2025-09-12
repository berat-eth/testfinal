const axios = require('axios');

async function testLargeLimit() {
  const REMOTE_API_URL = 'http://213.142.159.135:3000/api';
  const API_KEY = 'huglu_f22635b61189c2cea13eec242465148d890fef5206ec8a1b0263bf279f4ba6ad';

  try {
    console.log('🔍 Büyük limit ile API testi...\n');

    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    };

    // 1000 ürün limit ile test
    console.log('1️⃣ 1000 ürün limit testi:');
    const response = await axios.get(`${REMOTE_API_URL}/products?page=1&limit=1000`, { headers });
    console.log('✅ Başarılı:', response.data.success);
    console.log('📊 Toplam ürün sayısı:', response.data.data.total);
    console.log('📦 Dönen ürün sayısı:', response.data.data.products.length);
    console.log('🔄 Daha fazla var mı:', response.data.data.hasMore);
    console.log('');

    // İlk 10 ürünü listele
    console.log('2️⃣ İlk 10 ürün:');
    response.data.data.products.slice(0, 10).forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - ${product.price} TL (${product.category})`);
    });

    console.log('\n✅ Test tamamlandı!');

  } catch (error) {
    console.error('❌ Test hatası:', error.message);
    if (error.response) {
      console.error('📊 Response status:', error.response.status);
      console.error('📄 Response data:', error.response.data);
    }
  }
}

testLargeLimit();

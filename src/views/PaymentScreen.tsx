import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ProductController } from '../controllers/ProductController';

interface PaymentScreenProps {
  navigation: any;
  route: { params?: { totalAmount?: number } };
}

const PaymentScreen: React.FC<PaymentScreenProps> = ({ navigation, route }) => {
  const totalAmount = Number(route?.params?.totalAmount) || 0;
  const [method, setMethod] = useState<'credit_card' | 'eft'>('credit_card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [holder, setHolder] = useState('');

  const [iban, setIban] = useState('');
  const [sender, setSender] = useState('');

  const handlePay = () => {
    if (method === 'credit_card') {
      if (!cardNumber || cardNumber.replace(/\s/g, '').length < 16) return Alert.alert('Hata', 'Geçerli kart numarası girin');
      if (!expiry || !/^(0[1-9]|1[0-2])\/(\d{2})$/.test(expiry)) return Alert.alert('Hata', 'Geçerli son kullanma tarihi (AA/YY) girin');
      if (!cvv || cvv.length < 3) return Alert.alert('Hata', 'Geçerli CVV girin');
      if (!holder.trim()) return Alert.alert('Hata', 'Kart üzerindeki isim gerekli');
      
      // Güvenlik uyarısı
      Alert.alert(
        'Güvenlik Uyarısı',
        'Kredi kartı bilgileriniz sadece bu ödeme işlemi için kullanılacak ve kayıt edilmeyecektir. Devam etmek istiyor musunuz?',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Devam Et', onPress: () => processCardPayment() }
        ]
      );
    } else {
      if (!/^TR[0-9A-Z]{24}$/i.test(iban.replace(/\s/g, ''))) return Alert.alert('Hata', 'Geçerli IBAN girin (TR ile başlamalı)');
      if (!sender.trim()) return Alert.alert('Hata', 'Gönderen adı gerekli');
      
      Alert.alert('Bilgi', 'EFT/Havale bilgileri WhatsApp ile gönderildi. Onay bekleniyor.');
      navigation.goBack();
    }
  };

  const processCardPayment = () => {
    // Kart bilgileri işlendikten sonra temizleniyor
    console.log('🔄 Processing card payment - data will be discarded after processing');
    
    // Simüle edilmiş ödeme işlemi
    setTimeout(() => {
      // Kart bilgilerini temizle
      setCardNumber('');
      setExpiry('');
      setCvv('');
      setHolder('');
      
      Alert.alert('Başarılı', 'Ödeme işlemi tamamlandı. Kart bilgileriniz kayıt edilmedi.');
      navigation.goBack();
    }, 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Ödeme</Text>
        <Text style={styles.amount}>{ProductController.formatPrice(totalAmount)}</Text>
        
        {/* Güvenlik Uyarısı */}
        <View style={styles.securityWarning}>
          <Icon name="security" size={20} color="#10b981" />
          <Text style={styles.securityText}>
            Kredi kartı bilgileriniz güvenli şekilde işlenir ve kayıt edilmez
          </Text>
        </View>

        <View style={styles.methods}>
          <TouchableOpacity style={[styles.method, method === 'credit_card' && styles.methodSelected]} onPress={() => setMethod('credit_card')}>
            <Icon name="credit-card" size={22} color={method === 'credit_card' ? '#1A1A2E' : '#6b7280'} />
            <Text style={styles.methodText}>Kredi/Banka Kartı</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.method, method === 'eft' && styles.methodSelected]} onPress={() => setMethod('eft')}>
            <Icon name="account-balance" size={22} color={method === 'eft' ? '#1A1A2E' : '#6b7280'} />
            <Text style={styles.methodText}>EFT/Havale</Text>
          </TouchableOpacity>
        </View>

        {method === 'credit_card' ? (
          <View style={styles.cardForm}>
            <Text style={styles.label}>Kart Numarası</Text>
            <TextInput
              style={styles.input}
              value={cardNumber}
              onChangeText={(t) => setCardNumber(t.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim())}
              placeholder="1234 5678 9012 3456"
              keyboardType="numeric"
              maxLength={19}
            />
            <View style={styles.row}>
              <View style={[styles.col, { marginRight: 8 }]}> 
                <Text style={styles.label}>Son Kullanma (AA/YY)</Text>
                <TextInput
                  style={styles.input}
                  value={expiry}
                  onChangeText={(t) => setExpiry(t.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5))}
                  placeholder="12/29"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
              <View style={[styles.col, { marginLeft: 8 }]}> 
                <Text style={styles.label}>CVV</Text>
                <TextInput
                  style={styles.input}
                  value={cvv}
                  onChangeText={setCvv}
                  placeholder="123"
                  keyboardType="numeric"
                  maxLength={3}
                  secureTextEntry
                />
              </View>
            </View>
            <Text style={styles.label}>Kart Üzerindeki İsim</Text>
            <TextInput style={styles.input} value={holder} onChangeText={setHolder} placeholder="AD SOYAD" autoCapitalize="characters" />
          </View>
        ) : (
          <View style={styles.cardForm}>
            <Text style={styles.label}>IBAN</Text>
            <TextInput style={styles.input} value={iban} onChangeText={setIban} placeholder="TR.." autoCapitalize="characters" />
            <Text style={styles.label}>Gönderen Ad Soyad</Text>
            <TextInput style={styles.input} value={sender} onChangeText={setSender} placeholder="Ad Soyad" />
            <Text style={styles.info}>Ödemeyi belirtilen IBAN'a gönderdikten sonra dekontu destek ekibimize iletin.</Text>
          </View>
        )}

        <TouchableOpacity style={styles.payButton} onPress={handlePay}>
          <Text style={styles.payButtonText}>Ödemeyi Tamamla</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 6 },
  amount: { fontSize: 28, fontWeight: '800', color: '#1A1A2E', marginBottom: 16 },
  methods: { flexDirection: 'row', marginBottom: 12 },
  method: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginRight: 8, backgroundColor: 'white' },
  methodSelected: { borderColor: '#1A1A2E' },
  methodText: { marginLeft: 8, color: '#111827', fontWeight: '600' },
  cardForm: { backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#fff', marginBottom: 10 },
  row: { flexDirection: 'row' },
  col: { flex: 1 },
  info: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  payButton: { backgroundColor: '#1A1A2E', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  payButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  securityWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  securityText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#047857',
    fontWeight: '500',
  },
});

export default PaymentScreen;



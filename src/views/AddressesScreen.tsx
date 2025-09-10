import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  Modal,
  Dimensions,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { UserController } from '../controllers/UserController';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

interface AddressesScreenProps {
  navigation: any;
  route?: {
    params?: {
      selectMode?: boolean;
      onAddressSelected?: (address: Address) => void;
    };
  };
}

interface Address {
  id: number;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  state?: string; // This maps to district in the UI
  postalCode: string;
  isDefault: boolean;
  addressType?: string; // This maps to type in the UI
  country?: string;
}

export const AddressesScreen: React.FC<AddressesScreenProps> = ({ navigation, route }) => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    address: '',
    city: '',
    district: '',
    postalCode: '',
    type: 'home' as 'home' | 'work' | 'other',
  });

  // Get params from navigation
  const selectMode = route?.params?.selectMode || false;
  const onAddressSelected = route?.params?.onAddressSelected;

  useEffect(() => {
    loadUserAddresses();
  }, []);

  const loadUserAddresses = async () => {
    try {
      setLoading(true);
      const userId = await UserController.getCurrentUserId();
      console.log('🔍 Current user ID:', userId);
      
      if (userId && userId > 0) {
        setCurrentUserId(userId);
        const userAddresses = await UserController.getUserAddresses(userId);
        console.log('📍 Loaded addresses:', userAddresses.length);
        setAddresses(userAddresses);
      } else {
        console.warn('⚠️ No valid user ID found');
        setAddresses([]);
      }
    } catch (error) {
      console.error('❌ Error loading addresses:', error);
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  };

  const getAddressIcon = (type?: string) => {
    switch (type || 'shipping') {
      case 'home':
      case 'shipping':
        return '🏠';
      case 'work':
        return '🏢';
      case 'other':
        return '📍';
      default:
        return '🏠';
    }
  };

  const getAddressTypeText = (type?: string) => {
    switch (type || 'shipping') {
      case 'home':
      case 'shipping':
        return 'Ev';
      case 'work':
        return 'İş';
      case 'other':
        return 'Diğer';
      default:
        return 'Teslimat';
    }
  };

  const openAddModal = () => {
    setEditingAddress(null);
    setFormData({
      fullName: '',
      phone: '',
      address: '',
      city: '',
      district: '',
      postalCode: '',
      type: 'home',
    });
    setShowInlineForm(true);
  };

  const openEditModal = (address: Address) => {
    setEditingAddress(address);
    setFormData({
      fullName: address.fullName,
      phone: address.phone,
      address: address.address,
      city: address.city,
      district: address.state || '',
      postalCode: address.postalCode,
      type: (address.addressType === 'work' ? 'work' : address.addressType === 'other' ? 'other' : 'home') as 'home' | 'work' | 'other',
    });
    setShowInlineForm(true);
  };

  const handleSaveAddress = async () => {
    // Get current user ID
    const userId = currentUserId || await UserController.getCurrentUserId();
    console.log('💾 Saving address for user ID:', userId);
    
    if (!userId || userId <= 0) {
      Alert.alert('Hata', 'Kullanıcı bilgisi bulunamadı. Lütfen tekrar giriş yapın.');
      return;
    }

    if (!formData.fullName || !formData.phone || !formData.address || !formData.city) {
      Alert.alert('Hata', 'Lütfen tüm zorunlu alanları doldurun');
      return;
    }

    try {
      let success = false;
      
      if (editingAddress) {
        // Update existing address
        success = await UserController.updateUserAddress(editingAddress.id, {
          fullName: formData.fullName,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          district: formData.district,
          postalCode: formData.postalCode,
          isDefault: formData.type === 'home' // Home addresses are default
        });
        
        if (success) {
          Alert.alert('Başarılı', 'Adres güncellendi');
        }
      } else {
        // Add new address
        success = await UserController.addUserAddress(userId, {
          title: formData.type === 'home' ? 'Ev' : formData.type === 'work' ? 'İş' : 'Diğer',
          fullName: formData.fullName,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          district: formData.district,
          postalCode: formData.postalCode,
          isDefault: formData.type === 'home', // Home addresses are default
          type: formData.type
        });
        
        if (success) {
          Alert.alert('Başarılı', 'Adres eklendi');
        }
      }

      if (success) {
        setShowInlineForm(false);
        await loadUserAddresses(); // Reload addresses
      }
    } catch (error) {
      console.error('Error saving address:', error);
      Alert.alert('Hata', 'Adres kaydedilirken bir hata oluştu');
    }
  };

  const handleDeleteAddress = async (address: Address) => {
    Alert.alert(
      'Adresi Sil',
      'Bu adresi silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await UserController.deleteUserAddress(address.id);
              if (success) {
                Alert.alert('Başarılı', 'Adres silindi');
                await loadUserAddresses(); // Reload addresses
              }
            } catch (error) {
              console.error('Error deleting address:', error);
              Alert.alert('Hata', 'Adres silinirken bir hata oluştu');
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (address: Address) => {
    try {
      // Update all addresses to not default
      for (const addr of addresses) {
        if (addr.id !== address.id) {
          await UserController.updateUserAddress(addr.id, { ...addr, isDefault: false });
        }
      }
      
      // Set this address as default
      const success = await UserController.updateUserAddress(address.id, { ...address, isDefault: true });
      
      if (success) {
        Alert.alert('Başarılı', 'Varsayılan adres güncellendi');
        await loadUserAddresses(); // Reload addresses
      }
    } catch (error) {
      console.error('Error setting default address:', error);
      Alert.alert('Hata', 'Varsayılan adres ayarlanırken bir hata oluştu');
    }
  };

  const handleSelectAddress = (address: Address) => {
    if (selectMode && onAddressSelected) {
      // Save selected address to AsyncStorage for cart
      AsyncStorage.setItem('selected_delivery_address', JSON.stringify(address));
      // Wrap callback in a try-catch to prevent potential errors
      try {
        onAddressSelected(address);
      } catch (e) {
        console.error('Error in address selection callback:', e);
      }
      navigation.goBack();
    } else {
      setSelectedAddress(address);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Simple Header */}
      <SafeAreaView>
        <View style={styles.simpleHeader}>
          <TouchableOpacity 
            style={styles.simpleBackButton} 
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          
          <View style={styles.simpleHeaderCenter}>
            <Text style={styles.simpleHeaderTitle}>
              {selectMode ? 'Adres Seç' : 'Adreslerim'}
            </Text>
          </View>

          <TouchableOpacity style={styles.simpleAddButton} onPress={openAddModal}>
            <Icon name="add" size={20} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView 
        style={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {loading ? (
          <View style={styles.loadingContainer}>
            <LinearGradient
              colors={['#f8f9fa', '#e9ecef']}
              style={styles.loadingCard}
            >
              <Icon name="location-on" size={48} color="#6c757d" />
              <Text style={styles.loadingText}>Adresleriniz yükleniyor...</Text>
            </LinearGradient>
          </View>
        ) : addresses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.emptyCard}
            >
              <Icon name="add-location" size={64} color="#FFFFFF" />
              <Text style={styles.emptyTitle}>Henüz Adres Yok</Text>
              <Text style={styles.emptyDescription}>
                İlk adresinizi ekleyerek hızlı teslimat avantajından yararlanın
              </Text>
              <TouchableOpacity style={styles.emptyButton} onPress={openAddModal}>
                <Icon name="add" size={20} color="#667eea" />
                <Text style={styles.emptyButtonText}>İlk Adresimi Ekle</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        ) : (
          addresses.map((address, index) => (
            <TouchableOpacity
              key={address.id}
              style={[
                styles.simpleAddressCard,
                selectedAddress?.id === address.id && styles.selectedCard,
                address.isDefault && styles.defaultCard,
                { marginBottom: index === addresses.length - 1 ? 100 : 12 }
              ]}
              onPress={() => handleSelectAddress(address)}
              activeOpacity={0.7}
            >
              {/* Card Header */}
              <View style={styles.simpleCardHeader}>
                <View style={styles.addressInfo}>
                  <Text style={styles.simpleName}>{address.fullName}</Text>
                  <Text style={styles.simplePhone}>{address.phone}</Text>
                </View>
                
                <View style={styles.simpleActions}>
                  {address.isDefault && (
                    <View style={styles.simpleDefaultBadge}>
                      <Icon name="star" size={14} color="#ffc107" />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.simpleActionButton}
                    onPress={() => openEditModal(address)}
                  >
                    <Icon name="edit" size={18} color="#6c757d" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.simpleActionButton}
                    onPress={() => handleDeleteAddress(address)}
                  >
                    <Icon name="delete" size={18} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Address Details */}
              <View style={styles.simpleCardContent}>
                <Text style={styles.simpleAddress} numberOfLines={2}>
                  {address.address}
                </Text>
                <Text style={styles.simpleLocation}>
                  {address.state}, {address.city} {address.postalCode}
                </Text>
              </View>

              {/* Selection Indicator */}
              {selectMode && (
                <View style={styles.selectionIndicator}>
                  <Icon 
                    name={selectedAddress?.id === address.id ? "check-circle" : "radio-button-unchecked"} 
                    size={20} 
                    color={selectedAddress?.id === address.id ? "#28a745" : "#dee2e6"} 
                  />
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        {/* Debug Info */}
        {!loading && addresses.length === 0 && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugText}>Debug: Current User ID = {currentUserId}</Text>
            <Text style={styles.debugText}>Adres sayısı: {addresses.length}</Text>
            <TouchableOpacity 
              style={styles.debugButton}
              onPress={async () => {
                // Test user oluştur
                const testUserId = 1;
                await UserController.setUserPreference('user_id', testUserId);
                await loadUserAddresses();
              }}
            >
              <Text style={styles.debugButtonText}>Test Kullanıcısı Oluştur (ID: 1)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Inline Address Form */}
        {showInlineForm && (
          <View style={styles.inlineFormContainer}>
            <View style={styles.inlineFormHeader}>
              <Text style={styles.inlineFormTitle}>
                {editingAddress ? 'Adresi Düzenle' : 'Yeni Adres Ekle'}
              </Text>
              <TouchableOpacity 
                style={styles.inlineFormClose}
                onPress={() => setShowInlineForm(false)}
              >
                <Icon name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.simpleFormContainer}>
              <TextInput
                style={styles.simpleInput}
                placeholder="Ad Soyad"
                placeholderTextColor="#9ca3af"
                value={formData.fullName}
                onChangeText={(text) => setFormData({ ...formData, fullName: text })}
              />

              <TextInput
                style={styles.simpleInput}
                placeholder="Telefon Numarası"
                placeholderTextColor="#9ca3af"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                keyboardType="phone-pad"
              />
              
              <TextInput
                style={[styles.simpleInput, styles.simpleTextArea]}
                placeholder="Açık Adres"
                placeholderTextColor="#9ca3af"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={styles.simpleInputRow}>
                <TextInput
                  style={[styles.simpleInput, { flex: 1, marginRight: 6 }]}
                  placeholder="İl"
                  placeholderTextColor="#9ca3af"
                  value={formData.city}
                  onChangeText={(text) => setFormData({ ...formData, city: text })}
                />

                <TextInput
                  style={[styles.simpleInput, { flex: 1, marginLeft: 6 }]}
                  placeholder="İlçe"
                  placeholderTextColor="#9ca3af"
                  value={formData.district}
                  onChangeText={(text) => setFormData({ ...formData, district: text })}
                />
              </View>

              <TextInput
                style={styles.simpleInput}
                placeholder="Posta Kodu (isteğe bağlı)"
                placeholderTextColor="#9ca3af"
                value={formData.postalCode}
                onChangeText={(text) => setFormData({ ...formData, postalCode: text })}
                keyboardType="numeric"
              />

              {/* Simple Type Selection */}
              <View style={styles.simpleTypeSelection}>
                {[
                  { key: 'home', label: 'Ev' },
                  { key: 'work', label: 'İş' },
                  { key: 'other', label: 'Diğer' }
                ].map((typeOption) => (
                  <TouchableOpacity
                    key={typeOption.key}
                    style={[
                      styles.simpleTypeButton,
                      formData.type === typeOption.key && styles.simpleTypeButtonActive
                    ]}
                    onPress={() => setFormData({ ...formData, type: typeOption.key as any })}
                  >
                    <Text style={[
                      styles.simpleTypeButtonText,
                      formData.type === typeOption.key && styles.simpleTypeButtonTextActive
                    ]}>
                      {typeOption.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Form Buttons */}
              <View style={styles.inlineFormButtons}>
                <TouchableOpacity
                  style={styles.inlineCancelButton}
                  onPress={() => setShowInlineForm(false)}
                >
                  <Text style={styles.inlineCancelButtonText}>İptal</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.inlineSaveButton}
                  onPress={handleSaveAddress}
                >
                  <Text style={styles.inlineSaveButtonText}>
                    {editingAddress ? 'Güncelle' : 'Kaydet'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Address Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modernModalContent}>
            {/* Simple Modal Header */}
            <View style={styles.simpleModalHeader}>
              <TouchableOpacity 
                style={styles.simpleModalBackButton} 
                onPress={() => setIsModalVisible(false)}
              >
                <Icon name="close" size={24} color="#374151" />
              </TouchableOpacity>
              <Text style={styles.simpleModalTitle}>
                {editingAddress ? 'Adresi Düzenle' : 'Yeni Adres Ekle'}
              </Text>
              <View style={styles.modalHeaderSpacer} />
            </View>

            <ScrollView style={styles.simpleModalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.simpleFormContainer}>
                <TextInput
                  style={styles.simpleInput}
                  placeholder="Ad Soyad"
                  placeholderTextColor="#9ca3af"
                  value={formData.fullName}
                  onChangeText={(text) => setFormData({ ...formData, fullName: text })}
                />

                <TextInput
                  style={styles.simpleInput}
                  placeholder="Telefon Numarası"
                  placeholderTextColor="#9ca3af"
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text })}
                  keyboardType="phone-pad"
                />
                
                <TextInput
                  style={[styles.simpleInput, styles.simpleTextArea]}
                  placeholder="Açık Adres"
                  placeholderTextColor="#9ca3af"
                  value={formData.address}
                  onChangeText={(text) => setFormData({ ...formData, address: text })}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <View style={styles.simpleInputRow}>
                  <TextInput
                    style={[styles.simpleInput, { flex: 1, marginRight: 6 }]}
                    placeholder="İl"
                    placeholderTextColor="#9ca3af"
                    value={formData.city}
                    onChangeText={(text) => setFormData({ ...formData, city: text })}
                  />

                  <TextInput
                    style={[styles.simpleInput, { flex: 1, marginLeft: 6 }]}
                    placeholder="İlçe"
                    placeholderTextColor="#9ca3af"
                    value={formData.district}
                    onChangeText={(text) => setFormData({ ...formData, district: text })}
                  />
                </View>

                <TextInput
                  style={styles.simpleInput}
                  placeholder="Posta Kodu (isteğe bağlı)"
                  placeholderTextColor="#9ca3af"
                  value={formData.postalCode}
                  onChangeText={(text) => setFormData({ ...formData, postalCode: text })}
                  keyboardType="numeric"
                />

                {/* Simple Type Selection */}
                <View style={styles.simpleTypeSelection}>
                  {[
                    { key: 'home', label: 'Ev' },
                    { key: 'work', label: 'İş' },
                    { key: 'other', label: 'Diğer' }
                  ].map((typeOption) => (
                    <TouchableOpacity
                      key={typeOption.key}
                      style={[
                        styles.simpleTypeButton,
                        formData.type === typeOption.key && styles.simpleTypeButtonActive
                      ]}
                      onPress={() => setFormData({ ...formData, type: typeOption.key as any })}
                    >
                      <Text style={[
                        styles.simpleTypeButtonText,
                        formData.type === typeOption.key && styles.simpleTypeButtonTextActive
                      ]}>
                        {typeOption.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Simple Modal Footer */}
            <View style={styles.simpleModalFooter}>
              <TouchableOpacity
                style={styles.simpleCancelButton}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.simpleCancelButtonText}>İptal</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.simpleSaveButton}
                onPress={handleSaveAddress}
              >
                <Text style={styles.simpleSaveButtonText}>
                  {editingAddress ? 'Güncelle' : 'Kaydet'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  
  // Simple Header
  simpleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  simpleBackButton: {
    padding: 8,
  },
  simpleHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  simpleHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  simpleAddButton: {
    padding: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  
  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingCard: {
    padding: 40,
    borderRadius: 20,
    alignItems: 'center',
    width: width - 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 16,
    textAlign: 'center',
  },
  
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyCard: {
    padding: 40,
    borderRadius: 20,
    alignItems: 'center',
    width: width - 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 20,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 30,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
    marginLeft: 8,
  },
  
  // Simple Address Cards
  simpleAddressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedCard: {
    borderColor: '#10b981',
    borderWidth: 2,
  },
  defaultCard: {
    borderColor: '#fbbf24',
  },
  simpleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  addressInfo: {
    flex: 1,
  },
  simpleName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  simplePhone: {
    fontSize: 14,
    color: '#6b7280',
  },
  simpleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simpleDefaultBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  simpleActionButton: {
    padding: 6,
  },
  simpleCardContent: {
    marginBottom: 8,
  },
  simpleAddress: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
    lineHeight: 20,
  },
  simpleLocation: {
    fontSize: 13,
    color: '#9ca3af',
  },
  selectionIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modernModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.85,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  modalBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    flex: 1,
  },
  modalHeaderSpacer: {
    width: 36,
  },
  
  // Simple Modal Header
  simpleModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  simpleModalBackButton: {
    padding: 8,
  },
  simpleModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  
  modalBody: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  
  // Simple Form Styles
  simpleModalBody: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  simpleFormContainer: {
    padding: 20,
  },
  simpleInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  simpleTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  simpleInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  // Simple Type Selection
  simpleTypeSelection: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  simpleTypeButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  simpleTypeButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  simpleTypeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  simpleTypeButtonTextActive: {
    color: '#FFFFFF',
  },
  
  // Simple Modal Footer
  simpleModalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  simpleCancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  simpleCancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  simpleSaveButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  simpleSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  // Inline Form Styles
  inlineFormContainer: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 100,
  },
  inlineFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  inlineFormTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  inlineFormClose: {
    padding: 4,
  },
  inlineFormButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  inlineCancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  inlineCancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  inlineSaveButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  inlineSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  // Debug Styles
  debugContainer: {
    backgroundColor: '#fff3cd',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  debugText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 8,
  },
  debugButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  debugButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});

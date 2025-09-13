import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '../contexts/AppContext';
import { CampaignController, Campaign } from '../controllers/CampaignController';
import { PersonalizationController, PersonalizedContent } from '../controllers/PersonalizationController';
import { DiscountWheelController, DiscountCode } from '../controllers/DiscountWheelController';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { EmptyState } from '../components/EmptyState';
import DiscountWheel from '../components/DiscountWheel';

const { width } = Dimensions.get('window');

export default function MyCampaignsScreen() {
  const { user } = useAppContext();
  const [personalizedContent, setPersonalizedContent] = useState<PersonalizedContent | null>(null);
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDiscountWheel, setShowDiscountWheel] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const [content, campaigns, codes] = await Promise.all([
        PersonalizationController.generatePersonalizedContent(user.id),
        CampaignController.getAvailableCampaigns(user.id),
        DiscountWheelController.getUserDiscountCodes(user.id)
      ]);

      setPersonalizedContent(content);
      setAvailableCampaigns(campaigns);
      setDiscountCodes(codes);
    } catch (error) {
      console.error('Error loading campaigns data:', error);
      Alert.alert('Hata', 'Kampanya verileri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDiscountWheelComplete = (result: any) => {
    setShowDiscountWheel(false);
    // Refresh discount codes
    loadData();
    Alert.alert(
      'Tebrikler!',
      `%${result.spinResult} indirim kazandınız!\nKodunuz: ${result.discountCode}`,
      [{ text: 'Tamam' }]
    );
  };

  const renderCampaignCard = (campaign: Campaign) => (
    <View key={campaign.id} style={styles.campaignCard}>
      <View style={styles.campaignHeader}>
        <View style={styles.campaignIcon}>
          <Ionicons name="gift" size={24} color="white" />
        </View>
        <View style={styles.campaignInfo}>
          <Text style={styles.campaignTitle}>{campaign.name}</Text>
          <Text style={styles.campaignDescription}>{campaign.description}</Text>
        </View>
        <View style={[styles.campaignStatus, { backgroundColor: getStatusColor(campaign.status) }]}>
          <Text style={styles.statusText}>{getStatusText(campaign.status)}</Text>
        </View>
      </View>
      
      <View style={styles.campaignDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>İndirim:</Text>
          <Text style={styles.detailValue}>
            {campaign.discountValue}% İndirim
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Minimum Tutar:</Text>
          <Text style={styles.detailValue}>
            {campaign.minOrderAmount} TL
          </Text>
        </View>
        {campaign.endDate && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bitiş:</Text>
            <Text style={styles.detailValue}>
              {new Date(campaign.endDate).toLocaleDateString('tr-TR')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderDiscountCodeCard = (code: DiscountCode) => (
    <View key={code.id} style={styles.discountCard}>
      <View style={styles.discountHeader}>
        <View style={styles.discountIcon}>
          <Ionicons name="pricetag-outline" size={20} color="white" />
        </View>
        <View style={styles.discountInfo}>
          <Text style={styles.discountCode}>
            {DiscountWheelController.formatDiscountCode(code.discountCode)}
          </Text>
          <Text style={styles.discountValue}>
            {DiscountWheelController.getDiscountDisplay(code.discountValue, code.discountType)}
          </Text>
        </View>
        <View style={[styles.discountStatus, { 
          backgroundColor: code.isUsed ? '#dc3545' : '#28a745' 
        }]}>
          <Text style={styles.discountStatusText}>
            {code.isUsed ? 'Kullanıldı' : 'Aktif'}
          </Text>
        </View>
      </View>
      
      <View style={styles.discountDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Süre:</Text>
          <Text style={styles.detailValue}>
            {DiscountWheelController.getTimeRemaining(code.expiresAt)}
          </Text>
        </View>
        {code.minOrderAmount > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Min. Tutar:</Text>
            <Text style={styles.detailValue}>
              {code.minOrderAmount} TL
            </Text>
          </View>
        )}
        {code.isUsed && code.usedAt && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Kullanım:</Text>
            <Text style={styles.detailValue}>
              {new Date(code.usedAt).toLocaleDateString('tr-TR')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderPersonalizedOffer = (offer: any, index: number) => (
    <TouchableOpacity key={offer.id} style={styles.offerCard}>
      <LinearGradient
        colors={[getOfferColor(offer.type), getOfferColor(offer.type) + 'CC']}
        style={styles.offerGradient}
      >
        <View style={styles.offerContent}>
          <Ionicons name={getOfferIcon(offer.type)} size={24} color="white" />
          <View style={styles.offerText}>
            <Text style={styles.offerTitle}>{offer.title}</Text>
            <Text style={styles.offerDescription}>{offer.description}</Text>
          </View>
        </View>
        {offer.discountAmount && (
          <View style={styles.offerDiscount}>
            <Text style={styles.discountText}>
              %{offer.discountAmount} İndirim
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* İç başlık kaldırıldı; üst başlık navigator tarafından geliyor */}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Discount Wheel Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🎰 İndirim Çarkı</Text>
            <Text style={styles.sectionSubtitle}>Şansınızı deneyin!</Text>
          </View>
          <TouchableOpacity
            style={styles.wheelButton}
            onPress={() => setShowDiscountWheel(true)}
          >
            <LinearGradient
              colors={['#ff6b6b', '#ee5a24']}
              style={styles.wheelButtonGradient}
            >
              <Ionicons name="refresh" size={30} color="white" />
              <Text style={styles.wheelButtonText}>Çarkı Çevir</Text>
              <Text style={styles.wheelButtonSubtext}>%3, %5 veya %10 indirim kazan!</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Personalized Offers */}
        {personalizedContent?.personalizedOffers && personalizedContent.personalizedOffers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎁 Size Özel Teklifler</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.offersScroll}
            >
              {personalizedContent.personalizedOffers.map(renderPersonalizedOffer)}
            </ScrollView>
          </View>
        )}

        {/* Available Campaigns */}
        {availableCampaigns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎪 Aktif Kampanyalar</Text>
            {availableCampaigns.map(renderCampaignCard)}
          </View>
        )}

        {/* Discount Codes */}
        {discountCodes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏷️ İndirim Kodlarım</Text>
            {discountCodes.map(renderDiscountCodeCard)}
          </View>
        )}

        {/* Empty State */}
        {availableCampaigns.length === 0 && discountCodes.length === 0 && (
          <EmptyState
            title="Henüz Kampanya Yok"
            message="Size özel kampanyalar henüz hazır değil"
            icon="gift-outline"
          />
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Discount Wheel Modal */}
      <DiscountWheel
        visible={showDiscountWheel}
        onClose={() => setShowDiscountWheel(false)}
        onSpinComplete={handleDiscountWheelComplete}
      />
    </SafeAreaView>
  );
}

// Helper functions
const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    'active': '#28a745',
    'draft': '#ffc107',
    'paused': '#dc3545',
    'completed': '#6c757d',
    'cancelled': '#dc3545'
  };
  return colors[status] || '#6c757d';
};

const getStatusText = (status: string): string => {
  const texts: Record<string, string> = {
    'active': 'Aktif',
    'draft': 'Taslak',
    'paused': 'Duraklatıldı',
    'completed': 'Tamamlandı',
    'cancelled': 'İptal Edildi'
  };
  return texts[status] || status;
};

const getOfferColor = (type: string): string => {
  const colors: Record<string, string> = {
    'discount': '#28a745',
    'free_shipping': '#17a2b8',
    'bundle': '#6f42c1',
    'loyalty': '#fd7e14',
    'seasonal': '#20c997',
    'birthday': '#e83e8c'
  };
  return colors[type] || '#007bff';
};

const getOfferIcon = (type: string): string => {
  const icons: Record<string, string> = {
    'discount': 'local-offer',
    'free_shipping': 'local-shipping',
    'bundle': 'inventory',
    'loyalty': 'star',
    'seasonal': 'eco',
    'birthday': 'cake'
  };
  return icons[type] || 'card-giftcard';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  wheelButton: {
    marginHorizontal: 20,
    borderRadius: 15,
    overflow: 'hidden',
  },
  wheelButtonGradient: {
    padding: 20,
    alignItems: 'center',
  },
  wheelButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
  },
  wheelButtonSubtext: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginTop: 5,
  },
  offersScroll: {
    paddingLeft: 20,
  },
  offerCard: {
    width: width * 0.8,
    marginRight: 15,
    borderRadius: 12,
    overflow: 'hidden',
  },
  offerGradient: {
    padding: 15,
  },
  offerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  offerText: {
    flex: 1,
    marginLeft: 10,
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
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  discountText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  campaignCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  campaignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  campaignIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  campaignInfo: {
    flex: 1,
  },
  campaignTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  campaignDescription: {
    fontSize: 14,
    color: '#666',
  },
  campaignStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  campaignDetails: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  discountCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  discountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  discountIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#28a745',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  discountInfo: {
    flex: 1,
  },
  discountCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
    letterSpacing: 1,
  },
  discountValue: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '600',
  },
  discountStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  discountStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  discountDetails: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
  },
  bottomSpacer: {
    height: 20,
  },
});

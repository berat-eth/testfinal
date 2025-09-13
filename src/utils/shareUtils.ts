import { captureRef } from 'react-native-view-shot';
import { Platform, Alert } from 'react-native';
import { ProductShareCard } from '../components/ProductShareCard';
import { UserLevelController } from '../controllers/UserLevelController';
import { UserController } from '../controllers/UserController';

export interface ProductShareData {
  productName: string;
  productPrice: number;
  productImage?: string;
  productBrand?: string;
  productDescription?: string;
}

export interface CartShareData {
  cartItems: Array<{
    productName: string;
    price: number;
    quantity: number;
    image?: string;
  }>;
  totalAmount: number;
}

export class ShareUtils {
  // Ürün paylaşım kartını oluştur ve paylaş
  static async shareProduct(
    productData: ProductShareData,
    platform: string,
    onSuccess?: (platform: string, expGained: number) => void
  ): Promise<void> {
    try {
      const currentUser = await UserController.getCurrentUser();
      if (!currentUser) {
        Alert.alert('Hata', 'Paylaşım yapmak için giriş yapmanız gerekiyor.');
        return;
      }

      // Paylaşım metni oluştur
      const shareText = `🔥 ${productData.productName} - ${productData.productPrice} TL\n\nKamp malzemeleri için Huğlu Outdoor'u keşfet! 🏕️\n\n#Kamp #Outdoor #HuğluOutdoor`;
      const shareUrl = 'https://huglu.com';

      // Native share dialog'u kullan
      const { Share } = require('react-native');
      const result = await Share.share({
        message: `${shareText}\n\n${shareUrl}`,
        url: shareUrl,
        title: productData.productName,
      });

      if (result.action === Share.sharedAction) {
        // Paylaşım başarılı, EXP ekle
        const expResult = await UserLevelController.addSocialShareExp(currentUser.id.toString());
        
        if (expResult.success) {
          Alert.alert(
            '🎉 Paylaşım Başarılı!',
            `+25 EXP kazandınız!\n\n${expResult.message}`,
            [{ text: 'Harika!' }]
          );
          
          onSuccess?.(platform, 25);
        } else {
          Alert.alert('Paylaşım Başarılı!', 'Ürünü başarıyla paylaştınız.');
        }
      }
    } catch (error) {
      console.error('Error sharing product:', error);
      Alert.alert('Hata', 'Paylaşım sırasında bir hata oluştu.');
    }
  }

  // Sepet paylaşım kartını oluştur ve paylaş
  static async shareCart(
    cartData: CartShareData,
    platform: string,
    onSuccess?: (platform: string, expGained: number) => void
  ): Promise<void> {
    try {
      const currentUser = await UserController.getCurrentUser();
      if (!currentUser) {
        Alert.alert('Hata', 'Paylaşım yapmak için giriş yapmanız gerekiyor.');
        return;
      }

      // Sepet paylaşım metni oluştur
      const itemCount = cartData.cartItems.length;
      const itemNames = cartData.cartItems.slice(0, 3).map(item => item.productName).join(', ');
      const moreItems = itemCount > 3 ? ` ve ${itemCount - 3} ürün daha` : '';
      
      const shareText = `🛒 Sepetimi paylaşıyorum!\n\n${itemNames}${moreItems}\n\nToplam: ${cartData.totalAmount} TL\n\nKamp malzemeleri için Huğlu Outdoor'u keşfet! 🏕️\n\n#Kamp #Outdoor #HuğluOutdoor #Sepet`;
      const shareUrl = 'https://huglu.com/cart';

      // Native share dialog'u kullan
      const { Share } = require('react-native');
      const result = await Share.share({
        message: `${shareText}\n\n${shareUrl}`,
        url: shareUrl,
        title: 'Huğlu Outdoor Sepetim',
      });

      if (result.action === Share.sharedAction) {
        // Paylaşım başarılı, EXP ekle
        const expResult = await UserLevelController.addSocialShareExp(currentUser.id.toString());
        
        if (expResult.success) {
          Alert.alert(
            '🎉 Sepet Paylaşımı Başarılı!',
            `+25 EXP kazandınız!\n\n${expResult.message}`,
            [{ text: 'Harika!' }]
          );
          
          onSuccess?.(platform, 25);
        } else {
          Alert.alert('Paylaşım Başarılı!', 'Sepetinizi başarıyla paylaştınız.');
        }
      }
    } catch (error) {
      console.error('Error sharing cart:', error);
      Alert.alert('Hata', 'Paylaşım sırasında bir hata oluştu.');
    }
  }

  // Platform'a özel paylaşım URL'si oluştur
  static generatePlatformShareUrl(
    platform: string,
    shareText: string,
    shareUrl: string
  ): string {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);

    switch (platform) {
      case 'instagram':
        return `https://www.instagram.com/`;
      case 'facebook':
        return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`;
      case 'whatsapp':
        return `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
      case 'twitter':
        return `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
      default:
        return shareUrl;
    }
  }

  // Paylaşım kartı için renk paleti
  static getPlatformColors(platform: string) {
    const colors = {
      instagram: {
        primary: '#E4405F',
        gradient: ['#833AB4', '#FD1D1D', '#FCB045'],
      },
      facebook: {
        primary: '#1877F2',
        gradient: ['#1877F2', '#42A5F5'],
      },
      whatsapp: {
        primary: '#25D366',
        gradient: ['#25D366', '#128C7E'],
      },
      twitter: {
        primary: '#1DA1F2',
        gradient: ['#1DA1F2', '#0D8BD9'],
      },
    };
    return colors[platform as keyof typeof colors] || colors.instagram;
  }
}

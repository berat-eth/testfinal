import { getApiBaseUrl } from '../utils/api-config';
import { UserLevel, UserLevelProgress, ExpTransaction, UserLevelSystem } from '../models/UserLevel';

export class UserLevelController {
  private static baseUrl = `${getApiBaseUrl()}/user-level`;

  // Kullanıcının seviye bilgilerini getir
  static async getUserLevel(userId: string): Promise<UserLevelProgress | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Seviye bilgileri yüklenemedi');
      }

      const data = await response.json();
      return data.levelProgress || null;
    } catch (error) {
      console.error('Error fetching user level:', error);
      return null;
    }
  }

  // Kullanıcının EXP geçmişini getir
  static async getExpHistory(userId: string, page: number = 1, limit: number = 20): Promise<{
    transactions: ExpTransaction[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/${userId}/history?page=${page}&limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('EXP geçmişi yüklenemedi');
      }

      const data = await response.json();
      return {
        transactions: data.transactions || [],
        total: data.total || 0,
        hasMore: data.hasMore || false,
      };
    } catch (error) {
      console.error('Error fetching exp history:', error);
      return {
        transactions: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  // EXP kazan
  static async addExp(
    userId: string,
    source: string,
    amount: number,
    description: string,
    orderId?: string,
    productId?: string
  ): Promise<{ success: boolean; newLevel?: UserLevel; levelUp: boolean }> {
    try {
      const expGain = UserLevelSystem.calculateExpGain(source, amount);
      
      const response = await fetch(`${this.baseUrl}/${userId}/add-exp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source,
          amount: expGain,
          description,
          orderId,
          productId,
        }),
      });

      if (!response.ok) {
        throw new Error('EXP eklenemedi');
      }

      const data = await response.json();
      return {
        success: true,
        newLevel: data.newLevel,
        levelUp: data.levelUp || false,
      };
    } catch (error) {
      console.error('Error adding exp:', error);
      return {
        success: false,
        levelUp: false,
      };
    }
  }

  // Alışveriş sonrası EXP kazan
  static async addPurchaseExp(
    userId: string,
    orderId: string,
    orderTotal: number,
    productIds: string[]
  ): Promise<{ success: boolean; expGained: number; newLevel?: UserLevel; levelUp: boolean }> {
    try {
      const expGain = UserLevelSystem.calculateExpGain('purchase', 0, orderTotal);
      
      const response = await fetch(`${this.baseUrl}/${userId}/purchase-exp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          orderTotal,
          productIds,
          expGain,
        }),
      });

      if (!response.ok) {
        throw new Error('Alışveriş EXP\'si eklenemedi');
      }

      const data = await response.json();
      return {
        success: true,
        expGained: data.expGained || 0,
        newLevel: data.newLevel,
        levelUp: data.levelUp || false,
      };
    } catch (error) {
      console.error('Error adding purchase exp:', error);
      return {
        success: false,
        expGained: 0,
        levelUp: false,
      };
    }
  }

  // Davet sonrası EXP kazan
  static async addInvitationExp(
    userId: string,
    invitedUserId: string,
    invitedUserName: string
  ): Promise<{ success: boolean; expGained: number; newLevel?: UserLevel; levelUp: boolean }> {
    try {
      const expGain = UserLevelSystem.calculateExpGain('invitation', 0);
      
      const response = await fetch(`${this.baseUrl}/${userId}/invitation-exp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitedUserId,
          invitedUserName,
          expGain,
        }),
      });

      if (!response.ok) {
        throw new Error('Davet EXP\'si eklenemedi');
      }

      const data = await response.json();
      return {
        success: true,
        expGained: data.expGained || 0,
        newLevel: data.newLevel,
        levelUp: data.levelUp || false,
      };
    } catch (error) {
      console.error('Error adding invitation exp:', error);
      return {
        success: false,
        expGained: 0,
        levelUp: false,
      };
    }
  }

  // Sosyal paylaşım sonrası EXP kazan
  static async addSocialShareExp(
    userId: string,
    platform: string,
    productId?: string
  ): Promise<{ success: boolean; expGained: number; newLevel?: UserLevel; levelUp: boolean }> {
    try {
      const expGain = UserLevelSystem.calculateExpGain('social_share', 0);
      
      const response = await fetch(`${this.baseUrl}/${userId}/social-share-exp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform,
          productId,
          expGain,
        }),
      });

      if (!response.ok) {
        throw new Error('Sosyal paylaşım EXP\'si eklenemedi');
      }

      const data = await response.json();
      return {
        success: true,
        expGained: data.expGained || 0,
        newLevel: data.newLevel,
        levelUp: data.levelUp || false,
      };
    } catch (error) {
      console.error('Error adding social share exp:', error);
      return {
        success: false,
        expGained: 0,
        levelUp: false,
      };
    }
  }

  // Seviye atlama ödüllerini al
  static async claimLevelUpRewards(
    userId: string,
    levelId: string
  ): Promise<{ success: boolean; rewards: any[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/${userId}/claim-rewards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          levelId,
        }),
      });

      if (!response.ok) {
        throw new Error('Ödüller alınamadı');
      }

      const data = await response.json();
      return {
        success: true,
        rewards: data.rewards || [],
      };
    } catch (error) {
      console.error('Error claiming level up rewards:', error);
      return {
        success: false,
        rewards: [],
      };
    }
  }

  // Kullanıcının seviye istatistiklerini getir
  static async getLevelStats(userId: string): Promise<{
    totalExp: number;
    currentLevel: UserLevel;
    nextLevel: UserLevel | null;
    expToNextLevel: number;
    progressPercentage: number;
    totalPurchases: number;
    totalInvitations: number;
    totalSocialShares: number;
    levelUpCount: number;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/${userId}/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Seviye istatistikleri yüklenemedi');
      }

      const data = await response.json();
      return data.stats || {
        totalExp: 0,
        currentLevel: UserLevelSystem.getAllLevels()[0],
        nextLevel: null,
        expToNextLevel: 0,
        progressPercentage: 0,
        totalPurchases: 0,
        totalInvitations: 0,
        totalSocialShares: 0,
        levelUpCount: 0,
      };
    } catch (error) {
      console.error('Error fetching level stats:', error);
      return {
        totalExp: 0,
        currentLevel: UserLevelSystem.getAllLevels()[0],
        nextLevel: null,
        expToNextLevel: 0,
        progressPercentage: 0,
        totalPurchases: 0,
        totalInvitations: 0,
        totalSocialShares: 0,
        levelUpCount: 0,
      };
    }
  }

  // Tüm seviyeleri getir
  static getAllLevels(): UserLevel[] {
    return UserLevelSystem.getAllLevels();
  }

  // Seviye bilgilerini getir
  static getLevelInfo(levelId: string): UserLevel | null {
    return UserLevelSystem.getLevelInfo(levelId);
  }
}

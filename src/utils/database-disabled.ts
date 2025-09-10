// SQLite database disabled to prevent crashes
// All database operations will return empty results or success

// Mock database functions to prevent crashes
export const getDatabase = async () => {
  throw new Error('Local database disabled');
};

// Mock offline queue functions
export const addToOfflineQueue = async (endpoint: string, method: string, data?: any) => {
  console.log('ℹ️ Offline queue disabled - operation ignored:', method, endpoint);
  return Promise.resolve();
};

export const getOfflineQueue = async () => {
  console.log('ℹ️ Offline queue disabled - returning empty queue');
  return Promise.resolve([]);
};

export const removeFromOfflineQueue = async (id: number) => {
  console.log('ℹ️ Offline queue disabled - remove operation ignored:', id);
  return Promise.resolve();
};

// Mock database object
const db = {
  runAsync: async (sql: string, params: any[] = []) => {
    console.log('ℹ️ Database disabled - SQL ignored:', sql);
    return Promise.resolve({ changes: 0, lastInsertRowid: 0 });
  },
  getAllAsync: async (sql: string, params: any[] = []) => {
    console.log('ℹ️ Database disabled - returning empty results');
    return Promise.resolve([]);
  },
  getFirstAsync: async (sql: string, params: any[] = []) => {
    console.log('ℹ️ Database disabled - returning null');
    return Promise.resolve(null);
  },
  execAsync: async (sql: string) => {
    console.log('ℹ️ Database disabled - exec ignored:', sql);
    return Promise.resolve();
  },
  execSync: (sql: string) => {
    console.log('ℹ️ Database disabled - execSync ignored:', sql);
    return;
  },
  closeSync: () => {
    console.log('ℹ️ Database disabled - closeSync ignored');
    return;
  }
};

export default db;

export interface OfflineQueueItem {
  id: number;
  endpoint: string;
  method: string;
  data: any;
  timestamp: string;
}

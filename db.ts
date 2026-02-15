
const DB_NAME = 'NabilInventoryDB';
const DB_VERSION = 3; 
const DB_PREFIX = 'NabilInventory_';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error("Failed to open IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sales')) {
        db.createObjectStore('sales', { keyPath: 'id' });
      }
    };
  });
};

export const getAll = async <T>(storeName: string): Promise<T[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Error getting all from ${storeName}:`, err);
    return [];
  }
};

export const saveItem = async <T extends { id: string }>(storeName: string, item: T): Promise<void> => {
  try {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.put(item);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error(`Error saving to ${storeName}:`, err);
  }
};

export const deleteItem = async (storeName: string, id: string): Promise<void> => {
  try {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.delete(id);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`Successfully deleted ${id} from ${storeName}`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error(`Error deleting from ${storeName}:`, err);
    throw err;
  }
};

export const saveEarnings = (amount: number): void => {
  const safeAmount = isNaN(amount) ? 0 : amount;
  localStorage.setItem(DB_PREFIX + 'TOTAL_EARNINGS', safeAmount.toString());
};

export const getEarnings = (): number => {
  const val = localStorage.getItem(DB_PREFIX + 'TOTAL_EARNINGS');
  if (!val) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
};

export const syncToCloud = async (email: string, data: { categories: any[], products: any[], sales?: any[], earnings: number }): Promise<void> => {
  const cloudKey = `GLOBAL_CLOUD_DB_${email.toLowerCase()}`;
  const payload = { ...data, lastUpdated: Date.now() };
  localStorage.setItem(cloudKey, JSON.stringify(payload));
  return new Promise(resolve => setTimeout(resolve, 500));
};

export const fetchFromCloud = async (email: string): Promise<any | null> => {
  const cloudKey = `GLOBAL_CLOUD_DB_${email.toLowerCase()}`;
  const data = localStorage.getItem(cloudKey);
  return data ? JSON.parse(data) : null;
};

export const saveAppState = (state: any): void => {
  localStorage.setItem(DB_PREFIX + 'APP_STATE', JSON.stringify(state));
};

export const getAppState = (): any | null => {
  const state = localStorage.getItem(DB_PREFIX + 'APP_STATE');
  return state ? JSON.parse(state) : null;
};

export const saveUser = (user: any): void => {
  localStorage.setItem(DB_PREFIX + 'USER', JSON.stringify(user));
};

export const getUser = (): any | null => {
  const user = localStorage.getItem(DB_PREFIX + 'USER');
  return user ? JSON.parse(user) : null;
};

export const logout = (): void => {
  localStorage.removeItem(DB_PREFIX + 'USER');
};

export const overwriteLocalData = async (categories: any[], products: any[], earnings: number = 0, sales: any[] = []): Promise<void> => {
  const dbInstance = await openDB();
  const tx = dbInstance.transaction(['categories', 'products', 'sales'], 'readwrite');
  
  await new Promise<void>((resolve) => { tx.objectStore('categories').clear().onsuccess = () => resolve(); });
  await new Promise<void>((resolve) => { tx.objectStore('products').clear().onsuccess = () => resolve(); });
  await new Promise<void>((resolve) => { tx.objectStore('sales').clear().onsuccess = () => resolve(); });
  
  categories.forEach(c => tx.objectStore('categories').put(c));
  products.forEach(p => tx.objectStore('products').put(p));
  sales.forEach(s => tx.objectStore('sales').put(s));
  
  saveEarnings(earnings);
  
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
};

export const exportDataAsJSON = (data: any): void => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nabil_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


export interface Category {
  id: string;
  name: string;
  image: string; // Base64
}

export interface Product {
  id: string;
  name: string;
  price: string;
  quantity: number;
  categoryId: string;
  barcode: string;
  image: string; // Base64
}

export interface SaleRecord {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  quantity: number;
  soldAtPrice: number;
  timestamp: number;
}

export interface User {
  email: string;
  name: string;
  picture: string;
  lastSync?: number;
}

export type ViewState = 'HOME' | 'CATEGORY_DETAIL' | 'SEARCH' | 'ADD_PRODUCT' | 'ADD_CATEGORY' | 'SALE' | 'SALES_LOG';

export interface AppState {
  categories: Category[];
  products: Product[];
  currentCategoryId: string | null;
  currentView: ViewState;
  searchQuery: string;
  user: User | null;
}

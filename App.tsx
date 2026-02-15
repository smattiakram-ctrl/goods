
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, Search, Trash2, Edit, Camera, LayoutGrid, 
  SortAsc, PackageSearch, ShoppingCart, Tag, User as UserIcon, RefreshCw, CheckCircle, TrendingUp, Menu, History, Home, X, Percent, Clock
} from 'lucide-react';
import { Category, Product, ViewState, User, SaleRecord } from './types';
import * as db from './db';
import CategoryForm from './components/CategoryForm';
import ProductForm from './components/ProductForm';
import BarcodeScanner from './components/BarcodeScanner';
import SaleDialog from './components/SaleDialog';
import AuthModal from './components/AuthModal';

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('HOME');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSaleDialog, setShowSaleDialog] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoadedSuccessfully, setDataLoadedSuccessfully] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cats, prods, salesLog, earnings] = await Promise.all([
        db.getAll<Category>('categories'),
        db.getAll<Product>('products'),
        db.getAll<SaleRecord>('sales'),
        db.getEarnings()
      ]);
      
      setCategories(cats || []);
      setProducts(prods || []);
      setSales((salesLog || []).sort((a, b) => b.timestamp - a.timestamp));
      setTotalEarnings(earnings || 0);
      setDataLoadedSuccessfully(true);
    } catch (err) {
      console.error("Critical error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      await loadData();
      const savedUser = db.getUser();
      if (savedUser) setUser(savedUser);
      const savedState = db.getAppState();
      if (savedState && savedState.view) {
        setView(savedState.view);
        setSelectedCategoryId(savedState.selectedCategoryId || null);
        setSearchQuery(savedState.searchQuery || '');
      }
    }
    init();
  }, [loadData]);

  // المزامنة التلقائية المحمية
  useEffect(() => {
    if (user && !isLoading && dataLoadedSuccessfully) {
      const timer = setTimeout(async () => {
        try {
          await db.syncToCloud(user.email, { categories, products, earnings: totalEarnings, sales });
          setLastSyncStatus(new Date().toLocaleTimeString('ar-DZ'));
        } catch (e) {
          console.error("Auto-sync failed", e);
        }
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [categories, products, user, totalEarnings, sales, isLoading, dataLoadedSuccessfully]);

  useEffect(() => {
    if (dataLoadedSuccessfully) {
      db.saveAppState({ view, selectedCategoryId, searchQuery });
    }
  }, [view, selectedCategoryId, searchQuery, dataLoadedSuccessfully]);

  const totalInventoryValue = useMemo(() => {
    return products.reduce((sum, prod) => {
      const retailPriceStr = prod.price.split('/')[0];
      const cleanedPrice = retailPriceStr.replace(/[^\d.]/g, '');
      const price = parseFloat(cleanedPrice) || 0;
      return sum + (price * prod.quantity);
    }, 0);
  }, [products]);

  const handleAddCategory = async (cat: Category) => {
    await db.saveItem('categories', cat);
    setCategories(prev => {
      const exists = prev.find(p => p.id === cat.id);
      if (exists) return prev.map(p => p.id === cat.id ? cat : p);
      return [...prev, cat];
    });
    setShowCategoryForm(false);
    setEditingCategory(null);
  };

  const handleAddProduct = async (prod: Product) => {
    await db.saveItem('products', prod);
    setProducts(prev => {
      const exists = prev.find(p => p.id === prod.id);
      if (exists) return prev.map(p => p.id === prod.id ? prod : p);
      return [...prev, prod];
    });
    setShowProductForm(false);
    setEditingProduct(null);
  };

  const handleSale = async (productId: string, quantityToSell: number, soldAtPrice: number) => {
    try {
      const product = products.find(p => p.id === productId);
      if (!product) return;

      const saleRecord: SaleRecord = {
        id: Date.now().toString(),
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        quantity: quantityToSell,
        soldAtPrice: soldAtPrice,
        timestamp: Date.now()
      };

      // تسجيل العملية في قاعدة البيانات
      await db.saveItem('sales', saleRecord);
      
      // تحديث الأرباح
      const saleAmount = soldAtPrice * quantityToSell;
      const currentEarnings = isNaN(totalEarnings) ? 0 : totalEarnings;
      const newTotalEarnings = currentEarnings + saleAmount;
      
      db.saveEarnings(newTotalEarnings);
      setTotalEarnings(newTotalEarnings);
      setSales(prev => [saleRecord, ...prev]);

      // تحديث الكمية في المخزن
      const newQuantity = product.quantity - quantityToSell;
      if (newQuantity <= 0) {
        await db.deleteItem('products', product.id);
        setProducts(prev => prev.filter(p => p.id !== product.id));
      } else {
        const updatedProduct = { ...product, quantity: newQuantity };
        await db.saveItem('products', updatedProduct);
        setProducts(prev => prev.map(p => p.id === product.id ? updatedProduct : p));
      }
      
      setShowSaleDialog(false); // إغلاق الواجهة فوراً
    } catch (err) {
      console.error("Sale failed:", err);
      alert("حدث خطأ أثناء تسجيل عملية البيع.");
    }
  };

  const handleDeleteProduct = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm('هل أنت متأكد من حذف هذه السلعة نهائياً من المخزن؟')) {
      try {
        await db.deleteItem('products', id);
        setProducts(prev => prev.filter(p => p.id !== id));
      } catch (err) {
        console.error("Delete failed:", err);
        alert('فشل حذف السلعة، يرجى المحاولة مرة أخرى.');
      }
    }
  };

  const handleLogin = async (newUser: User) => {
    setUser(newUser);
    db.saveUser(newUser);
    const cloudData = await db.fetchFromCloud(newUser.email);
    if (cloudData) {
      if (confirm(`مرحباً ${newUser.name}! تم العثور على نسخة سحابية. هل تريد استعادتها؟`)) {
        await db.overwriteLocalData(cloudData.categories, cloudData.products, cloudData.earnings || 0, cloudData.sales || []);
        await loadData();
        alert('تمت استعادة البيانات بنجاح!');
      }
    }
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    db.logout();
    setUser(null);
    setShowAuthModal(false);
  };

  const handleManualSync = async () => {
    if (!user) { setShowAuthModal(true); return; }
    setIsSyncing(true);
    try {
      await db.syncToCloud(user.email, { categories, products, earnings: totalEarnings, sales });
      setLastSyncStatus(new Date().toLocaleTimeString('ar-DZ'));
      alert('تم الحفظ سحابياً بنجاح!');
    } catch (err) {
      alert('خطأ في المزامنة.');
    } finally { setIsSyncing(false); }
  };

  const handleImport = async (data: any) => {
    if (confirm('سيتم استبدال كافة البيانات الحالية. هل أنت متأكد؟')) {
      const newCategories = data.categories || [];
      const newProducts = data.products || [];
      const newSales = data.sales || [];
      const newEarnings = data.earnings || data.totalEarnings || 0;

      await db.overwriteLocalData(newCategories, newProducts, newEarnings, newSales);
      
      setCategories(newCategories);
      setProducts(newProducts);
      setSales(newSales);
      setTotalEarnings(newEarnings);
      
      alert('تم استعادة كافة السجلات بنجاح!');
    }
  };

  const filteredProducts = useMemo(() => {
    let list = products;
    if (view === 'CATEGORY_DETAIL' && selectedCategoryId) {
      list = list.filter(p => p.categoryId === selectedCategoryId);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(query) || p.barcode.toLowerCase().includes(query));
    }
    return [...list].sort((a, b) => sortOrder === 'ASC' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  }, [products, view, selectedCategoryId, searchQuery, sortOrder]);

  const resetEarnings = () => {
    if (confirm('هل تريد تصفير مجموع المبيعات وسجل العمليات؟')) {
      setTotalEarnings(0);
      setSales([]);
      db.saveEarnings(0);
      db.overwriteLocalData(categories, products, 0, []);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
        <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-black text-gray-800 tracking-tight">جاري استرجاع مخزنك...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={() => setIsSidebarOpen(false)}></div>
      )}
      <div className={`fixed top-0 right-0 h-full w-72 bg-white z-[70] shadow-2xl transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-8 h-full flex flex-col">
           <div className="flex items-center justify-between mb-10">
              <h2 className="text-2xl font-black text-blue-700 leading-none">القائمة</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-gray-50 rounded-full"><X className="w-5 h-5" /></button>
           </div>
           <nav className="flex-1 space-y-3">
              <button onClick={() => { setView('HOME'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${view === 'HOME' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-gray-600 hover:bg-gray-50'}`}>
                <Home className="w-6 h-6" /> المخزن الرئيسي
              </button>
              <button onClick={() => { setView('SALES_LOG'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${view === 'SALES_LOG' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'text-gray-600 hover:bg-gray-50'}`}>
                <History className="w-6 h-6" /> سجل المبيعات
              </button>
           </nav>
           <div className="pt-6 border-t border-gray-100">
              <div className="bg-blue-50 p-4 rounded-2xl mb-4 text-center">
                 <p className="text-[10px] text-blue-400 font-black mb-1 uppercase">مجموع الفائدة</p>
                 <p className="text-lg font-black text-blue-700 leading-tight">{totalEarnings.toLocaleString('fr-DZ')} د.ج</p>
              </div>
              <p className="text-center text-[10px] text-gray-300 font-bold">تطبيق نبيل v3.6 - مستقر</p>
           </div>
        </div>
      </div>

      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-600"><Menu className="w-6 h-6" /></button>
            <h1 className="text-xl font-black text-blue-700 tracking-wider">NABIL</h1>
          </div>
          <div className="flex-1 max-w-md relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" placeholder="ابحث في المخزن..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); if (view === 'HOME' && e.target.value) setView('SEARCH'); }} className="w-full pr-9 pl-4 py-2 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm font-bold" />
            <button onClick={() => setIsScanning(true)} className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-100 text-blue-600 rounded-lg"><Camera className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAuthModal(true)} className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${user ? 'bg-blue-50 ring-2 ring-blue-100' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {user ? <img src={user.picture} className="w-8 h-8 rounded-full" /> : <UserIcon className="w-5 h-5 text-gray-500" />}
            </button>
            <button onClick={() => setShowSaleDialog(true)} className="w-10 h-10 bg-orange-500 text-white rounded-xl shadow-lg hover:bg-orange-600 transition flex items-center justify-center"><ShoppingCart className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {view === 'SALES_LOG' ? (
          <div className="animate-in slide-in-from-left-4 duration-500">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                  <div className="bg-orange-100 p-3 rounded-2xl"><History className="w-6 h-6 text-orange-600" /></div>
                  <h2 className="text-2xl font-black text-gray-800 leading-none">سجل المبيعات</h2>
               </div>
               <button onClick={resetEarnings} className="text-xs bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold border border-red-100">تصفير السجل</button>
            </div>
            <div className="space-y-4">
               {sales.length === 0 ? <p className="text-center py-20 text-gray-400 font-bold">لم تقم بأي عملية بيع بعد</p> : sales.map(sale => (
                 <div key={sale.id} className="bg-white p-4 rounded-3xl shadow-sm border flex items-center justify-between group hover:border-orange-200 transition-all">
                    <div className="flex items-center gap-4">
                       <img src={sale.productImage} className="w-14 h-14 rounded-2xl object-cover border border-gray-100" />
                       <div>
                          <h4 className="font-black text-gray-800 leading-tight">{sale.productName}</h4>
                          <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1 mt-1"><Clock className="w-3 h-3" /> {new Date(sale.timestamp).toLocaleString('ar-DZ')}</span>
                       </div>
                    </div>
                    <div className="text-left">
                       <div className="font-black text-orange-600 text-lg">+{sale.soldAtPrice.toLocaleString('fr-DZ')} د.ج</div>
                       <div className="text-[10px] text-gray-400 font-bold">الكمية: {sale.quantity}</div>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-gradient-to-br from-orange-500 to-red-600 p-6 rounded-[2.5rem] text-white shadow-xl shadow-orange-100">
                <span className="text-orange-50 text-xs font-bold block mb-1 uppercase tracking-wider">مجموع الفائدة المحقق</span>
                <div className="text-4xl font-black">{totalEarnings.toLocaleString('fr-DZ')} <span className="text-lg">د.ج</span></div>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-center">
                <span className="text-gray-500 text-xs font-bold block mb-1 uppercase tracking-wider">قيمة المخزن الإجمالية</span>
                <p className="text-2xl font-black text-gray-800 leading-none">{totalInventoryValue.toLocaleString('fr-DZ')} <span className="text-sm">د.ج</span></p>
              </div>
            </div>

            <button onClick={() => { setEditingProduct(null); setShowProductForm(true); }} className="w-full py-6 bg-green-600 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-green-100 hover:bg-green-700 transition mb-8 flex items-center justify-center gap-3 active:scale-[0.98]">
              <Plus className="w-7 h-7" /> إضافة سلعة جديدة للمخزن
            </button>

            {view === 'HOME' && !searchQuery && (
              <div className="animate-in fade-in duration-500">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-black text-gray-800 flex items-center gap-2 leading-none"><LayoutGrid className="w-6 h-6 text-blue-600" /> تصنيفات السلع</h2>
                  <button onClick={() => { setEditingCategory(null); setShowCategoryForm(true); }} className="text-blue-600 text-sm font-black bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">+ إضافة نوع</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {categories.map(cat => (
                    <div key={cat.id} className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition cursor-pointer group" onClick={() => { setSelectedCategoryId(cat.id); setView('CATEGORY_DETAIL'); }}>
                      <img src={cat.image} className="aspect-square w-full object-cover group-hover:scale-110 transition duration-500" />
                      <div className="p-4 font-black text-gray-800 text-sm truncate text-center group-hover:text-blue-600 transition-colors">{cat.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(view === 'CATEGORY_DETAIL' || view === 'SEARCH') && (
              <div className="animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black text-gray-800 leading-none">{view === 'SEARCH' ? 'نتائج البحث' : categories.find(c => c.id === selectedCategoryId)?.name}</h2>
                    <span className="text-[10px] text-gray-400 font-bold mt-1">تم العثور على {filteredProducts.length} سلع</span>
                  </div>
                  <button onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')} className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-95 transition"><SortAsc className={`w-5 h-5 text-gray-600 ${sortOrder === 'DESC' ? 'rotate-180' : ''}`} /></button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredProducts.map(prod => {
                    const priceParts = prod.price.split('/');
                    const retailPrice = priceParts[0];
                    const wholesalePrice = priceParts.length > 1 ? priceParts[1].trim() : null;

                    return (
                      <div key={prod.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl transition-all duration-300">
                        <div className="aspect-square relative overflow-hidden bg-gray-50">
                          <img src={prod.image} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
                          <div className="absolute bottom-2 right-2 bg-blue-600 text-white text-[10px] px-3 py-1 rounded-full font-black shadow-lg shadow-blue-900/20">{prod.quantity} قطعة</div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <h4 className="font-black text-sm text-gray-800 truncate mb-2 leading-tight">{prod.name}</h4>
                          <div className="space-y-1.5 mb-4">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-blue-500 font-black uppercase tracking-tighter">سعر المفصل:</span>
                              <div className="text-blue-700 font-black text-base flex items-center gap-1 leading-none"><Tag className="w-3 h-3" />{retailPrice} <span className="text-[10px]">د.ج</span></div>
                            </div>
                            {wholesalePrice && (
                              <div className="flex flex-col pt-1 border-t border-gray-50">
                                <span className="text-[9px] text-green-500 font-black uppercase tracking-tighter">سعر الجملة:</span>
                                <div className="text-green-700 font-black text-base flex items-center gap-1 leading-none"><Percent className="w-2.5 h-2.5" />{wholesalePrice} <span className="text-[10px]">د.ج</span></div>
                              </div>
                            )}
                          </div>
                          <div className="mt-auto flex justify-between gap-2 pt-3 border-t border-gray-50">
                            <button onClick={() => { setEditingProduct(prod); setShowProductForm(true); }} className="p-2.5 text-blue-500 bg-blue-50 rounded-xl flex-1 flex justify-center hover:bg-blue-100 transition shadow-sm"><Edit className="w-4 h-4" /></button>
                            <button onClick={(e) => handleDeleteProduct(e, prod.id)} className="p-2.5 text-red-500 bg-red-50 rounded-xl flex-1 flex justify-center hover:bg-red-100 transition shadow-sm"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showCategoryForm && <CategoryForm onSave={handleAddCategory} onClose={() => setShowCategoryForm(false)} initialData={editingCategory || undefined} />}
      {showProductForm && <ProductForm categories={categories} onSave={handleAddProduct} onClose={() => setShowProductForm(false)} initialData={editingProduct || undefined} defaultCategoryId={selectedCategoryId || undefined} />}
      {isScanning && <BarcodeScanner onScan={(code) => { setView('SEARCH'); setSearchQuery(code); setIsScanning(false); }} onClose={() => setIsScanning(false)} />}
      {showSaleDialog && <SaleDialog products={products} onSale={handleSale} onClose={() => setShowSaleDialog(false)} />}
      {showAuthModal && <AuthModal user={user} onLogin={handleLogin} onLogout={handleLogout} onSync={handleManualSync} onClose={() => setShowAuthModal(false)} isSyncing={isSyncing} categories={categories} products={products} onImport={handleImport} />}
    </div>
  );
};

export default App;

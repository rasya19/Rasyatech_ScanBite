import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Coffee, 
  Milk, 
  Utensils, 
  Sparkles, 
  ShoppingCart, 
  Users, 
  Plus, 
  Minus, 
  Heart, 
  Bot, 
  UserPlus, 
  Trash2, 
  Check, 
  ArrowRight,
  ChevronRight,
  ChefHat,
  Database,
  Radio,
  Bell,
  Sliders,
  X,
  Lock,
  Clock
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { MenuItem, CartItem } from '../types';
import { MENU_ITEMS } from '../data';
import Aisommelier from '../components/Aisommelier';
import WelcomeAnimation from '../components/WelcomeAnimation';
import { supabase } from '../supabaseClient';

interface MenuProps {
  onNavigate: (page: string) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
}

export default function Menu({ onNavigate, cart, setCart }: MenuProps) {
  const formatPrice = (price: number) => {
    const currency = localStorage.getItem('scanbite_currency_symbol') || 'IDR';
    if (currency === 'JPY') {
      return `¥${price.toLocaleString('en-US')}`;
    } else if (currency === 'USD') {
      return `$${price.toLocaleString('en-US')}`;
    } else if (currency === 'SGD') {
      return `S$${price.toLocaleString('en-US')}`;
    } else if (currency === 'AUD') {
      return `A$${price.toLocaleString('en-US')}`;
    } else {
      return `Rp ${price.toLocaleString('id-ID')}`;
    }
  };

  // Page states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [customerName, setCustomerName] = useState(() => sessionStorage.getItem('scanbite_customer_name') || '');
  const [tableNumber, setTableNumber] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryTable = params.get('table');
      if (queryTable) {
        sessionStorage.setItem('scanbite_table', queryTable);
        return queryTable;
      }
    }
    return sessionStorage.getItem('scanbite_table') || '';
  });
  const [showAiChef, setShowAiChef] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Anti-collision session tracking states
  const [showOccupiedModal, setShowOccupiedModal] = useState(false);
  const [occupiedSessionId, setOccupiedSessionId] = useState('');
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

  // Supabase menu list integration
  const [menuList, setMenuList] = useState<MenuItem[]>(MENU_ITEMS);
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [isLiveDatabase, setIsLiveDatabase] = useState(false);

  // Split Bill Roommates
  const [roommates, setRoommates] = useState<string[]>([]);
  const [newRoommateName, setNewRoommateName] = useState('');
  const [showSimulator, setShowSimulator] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'menu' | 'cart'>('menu');
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [showWelcome, setShowWelcome] = useState(!localStorage.getItem('scanbite_welcomed'));
  
  // Timer for elapsed session
  useEffect(() => {
    const startTime = parseInt(localStorage.getItem('scanbite_session_start_time') || Date.now().toString());
    const interval = setInterval(() => {
        const delta = Date.now() - startTime;
        const minutes = Math.floor(delta / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((delta % 60000) / 1000).toString().padStart(2, '0');
        setElapsedTime(`${minutes}:${seconds}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Admin Hidden gesture states
  const [adminClicks, setAdminClicks] = useState<number>(0);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  
  // Broadcast logs / mini live feed
  const [liveActivityFeed, setLiveActivityFeed] = useState<string[]>([]);

  // Real-time order status tracking
  const [activeOrder, setActiveOrder] = useState<any>(null);

  const fetchActiveTableOrder = async () => {
    if (!supabase || !tableNumber) return;
    try {
      const cleanNum = tableNumber.replace('Meja ', '').trim();
      const sessionId = sessionStorage.getItem('scanbite_session_id');

      let queryResult = await supabase
        .from('sb_orders')
        .select('*')
        .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
        .eq('session_id', sessionId)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (queryResult.error) {
        console.error("fetchActiveTableOrder SELECT query with 'session_id' FAILED:", queryResult.error.message, queryResult.error);
        
        // Fallback 1: Query searching by "id" instead of "session_id"
        queryResult = await supabase
          .from('sb_orders')
          .select('*')
          .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
          .eq('id', sessionId)
          .in('status', ['pending', 'preparing', 'ready'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (queryResult.error) {
          console.error("fetchActiveTableOrder Fallback 1 query with 'id' FAILED:", queryResult.error.message, queryResult.error);
          
          // Fallback 2: Query without explicit session or id constraint, fallback to just table status and sort
          queryResult = await supabase
            .from('sb_orders')
            .select('*')
            .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
            .in('status', ['pending', 'preparing', 'ready'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (queryResult.error) {
            console.error("fetchActiveTableOrder Fallback 2 query FAILED:", queryResult.error.message, queryResult.error);
            
            // Fallback 3: Query without 'created_at' sort in case created_at is missing from the database
            queryResult = await supabase
              .from('sb_orders')
              .select('*')
              .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
              .in('status', ['pending', 'preparing', 'ready'])
              .order('id', { ascending: false })
              .limit(1);
              
            if (queryResult.error) {
              console.error("fetchActiveTableOrder Fallback 3 query without 'created_at' FAILED:", queryResult.error.message, queryResult.error);
            }
          }
        }
      }

      const { data, error } = queryResult;

      if (!error && data && data.length > 0) {
        setActiveOrder(data[0]);
      } else {
        // Fallback: read from local scanbite_orders cache for offline scenarios
        const localSaved = localStorage.getItem('scanbite_orders');
        if (localSaved) {
          const list = JSON.parse(localSaved);
          const actives = list.filter((o: any) => {
            const isMatchTable = o.table_number?.toString().replace('Meja ', '').trim() === cleanNum;
            const isMatchSession = o.session_id === sessionId || o.id === sessionId;
            return isMatchTable && isMatchSession && ['pending', 'preparing', 'ready'].includes(o.status);
          });
          if (actives.length > 0) {
            setActiveOrder(actives[actives.length - 1]);
            return;
          }
        }
        setActiveOrder(null);
      }
    } catch (err) {
      console.warn('Error fetching active table order for client side:', err);
    }
  };

  useEffect(() => {
    fetchActiveTableOrder();

    if (!supabase || !tableNumber) return;

    const ordersSubscription = supabase.channel('client-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sb_orders' }, () => {
        fetchActiveTableOrder();
      })
      .on('broadcast', { event: 'order_updated' }, () => {
        console.log("⚡ [BROADCAST ALERT] Instan update status pesanan terdeteksi!");
        fetchActiveTableOrder();
      })
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(ordersSubscription);
      }
    };
  }, [tableNumber]);

  // Trigger toast banner helper
  const triggerNotification = (text: string) => {
    setNotification(text);
    setLiveActivityFeed(prev => [text, ...prev.slice(0, 4)]);
    setTimeout(() => {
      setNotification((curr) => curr === text ? null : curr);
    }, 4500);
  };

  // Load client parameters on startup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryTable = params.get('table');
    const queryTenant = params.get('tenant');
    
    if (queryTable) {
      setTableNumber(queryTable);
      sessionStorage.setItem('scanbite_table', queryTable);
    }
    if (queryTenant) {
      localStorage.setItem('current_tenant', queryTenant);
    }

    const savedName = sessionStorage.getItem('scanbite_customer_name');
    const savedTable = sessionStorage.getItem('scanbite_table');
    if (savedName) setCustomerName(savedName);
    if (!queryTable && savedTable) setTableNumber(savedTable);
  }, []);

  // Check table occupied sessions to prevent customer data mix-up
  // Check table occupied sessions to prevent customer data mix-up
  const checkTableSession = async () => {
    if (!tableNumber) return;
    
    let mySessionId = sessionStorage.getItem('scanbite_session_id');
    const cleanNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');
    
    if (supabase) {
      try {
        // 1. Cek status meja di sb_tables terlebih dahulu
        const { data: tableData, error: tableError } = await supabase
          .from('sb_tables')
          .select('*')
          .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
          .maybeSingle();

        const tableStatus = tableData?.status || 'KOSONG';

        if (tableStatus === 'TERISI') {
          // 2. Jika status adalah TERISI, cari order aktif di sb_orders
          let queryResult = await supabase
            .from('sb_orders')
            .select('id, status, customer_name, table_number, order_items, payment_status')
            .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
            .neq('status', 'completed')
            .order('created_at', { ascending: false });

          if (queryResult.error) {
            console.error("checkTableSession sb_orders select with explicit columns FAILED:", queryResult.error.message, queryResult.error);
            
            // Fallback 1: select '*' which avoids error if payment_status or order_items is missing/mismatched in sb_orders
            queryResult = await supabase
              .from('sb_orders')
              .select('*')
              .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
              .neq('status', 'completed')
              .order('created_at', { ascending: false });

            if (queryResult.error) {
              console.error("checkTableSession sb_orders select '*' with 'created_at' FAILED:", queryResult.error.message, queryResult.error);
              
              // Fallback 2: select '*' and order by 'id' in case 'created_at' was the culprit of 400 Bad Request
              queryResult = await supabase
                .from('sb_orders')
                .select('*')
                .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
                .neq('status', 'completed')
                .order('id', { ascending: false });

              if (queryResult.error) {
                console.error("checkTableSession sb_orders Fallback 2 FAILED:", queryResult.error.message, queryResult.error);
              }
            }
          }

          const { data: activeOrders, error } = queryResult;
               
          if (!error && activeOrders && activeOrders.length > 0) {
            const latestOrder = activeOrders.find(o => o.payment_status !== 'paid');
            if (latestOrder) {
              const savedOrders = localStorage.getItem('scanbite_orders');
              let hasMatched = false;
              if (savedOrders) {
                const parsed = JSON.parse(savedOrders);
                hasMatched = parsed.some((o: any) => o.id === latestOrder.id);
              }
              
              if (!hasMatched) {
                // Ensure we don't block ourselves if our local session ID matches the active order ID
                if (mySessionId !== latestOrder.id) {
                  setOccupiedSessionId(latestOrder.id);
                  setShowOccupiedModal(true);
                  return;
                }
              }
            }
          }

          // Fallback / Extra Check: If no active order exists in sb_orders yet but table has an active session_id in sb_tables
          if (tableData?.session_id) {
            if (mySessionId !== tableData.session_id) {
              setOccupiedSessionId(tableData.session_id);
              setShowOccupiedModal(true);
              return;
            }
          }
        } else {
          // 3. Jika status KOSONG, mendaftarkan sesi baru dan mengubah status meja menjadi TERISI di sb_tables
          if (!mySessionId) {
            const freshSession = `sess-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            mySessionId = freshSession;
            sessionStorage.setItem('scanbite_session_id', freshSession);
          }
          await supabase
            .from('sb_tables')
            .update({ 
              status: 'TERISI',
              session_id: mySessionId,
              nama_pelanggan: customerName || 'Pelanggan Utama'
            })
            .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`);
        }
      } catch (err) {
        handleLocalSessionCheck(mySessionId);
      }
    } else {
      handleLocalSessionCheck(mySessionId);
    }
  };

  const handleLocalSessionCheck = (mySessionId: string | null) => {
    const savedOrders = localStorage.getItem('scanbite_orders');
    let hasActiveLocalOrder = false;
    let localSession = '';
    
    if (savedOrders) {
      const parsed = JSON.parse(savedOrders);
      const actives = parsed.filter((o: any) => o.tableNumber === tableNumber && o.status !== 'delivered');
      if (actives.length > 0) {
        hasActiveLocalOrder = true;
        localSession = actives[0].sessionId || `sess-old`;
      }
    }
    
    if (hasActiveLocalOrder && (!mySessionId || mySessionId !== localSession)) {
      setOccupiedSessionId(localSession);
      setShowOccupiedModal(true);
    } else {
      if (!mySessionId) {
        const freshSession = `sess-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        sessionStorage.setItem('scanbite_session_id', freshSession);
      }
    }
  };

  const handleConfirmNewCustomer = async () => {
    setCart([]);
    const brandNewSession = `sess-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    sessionStorage.setItem('scanbite_session_id', brandNewSession);
    setRoommates([]);
    setShowOccupiedModal(false);
    triggerNotification('🧹 Keranjang dikosongkan! Selamat datang di sesi pemesanan baru.');
  };

  const handleConfirmSameSession = async () => {
    if (occupiedSessionId) {
      sessionStorage.setItem('scanbite_session_id', occupiedSessionId);
      localStorage.setItem('scanbite_last_order_id', occupiedSessionId);

      // 4. Pastikan data order_id dari sesi yang sudah ada diambil dan menu itemnya di-restorasi ke cart
      if (supabase) {
        try {
          const { data: activeOrder, error } = await supabase
            .from('sb_orders')
            .select('*')
            .eq('id', occupiedSessionId)
            .maybeSingle();

          if (error) {
            console.error("handleConfirmSameSession fetch order from sb_orders FAILED:", error.message, error);
          }

          if (!error && activeOrder) {
            const items = activeOrder.order_items || [];
            if (items.length > 0) {
              const mappedCartItems: CartItem[] = items.map((it: any) => {
                const matchMenu = (menuList || MENU_ITEMS).find(
                  m => m.name.toLowerCase() === (it.item_name || it.name || '').toLowerCase()
                );
                return {
                  menuItemId: matchMenu?.id || `m${Math.floor(Math.random() * 10)}`,
                  user: it.ordered_by || it.orderedBy || 'Pelanggan',
                  quantity: Number(it.quantity) || 1
                };
              });

              setCart(mappedCartItems);
              localStorage.setItem('scanbite_cart', JSON.stringify(mappedCartItems));
            }
          }
        } catch (err: any) {
          console.warn('Gagal mensinkronisasikan item order lama:', err.message);
        }

        // Tuntut siaran langsung (instant broadcast) ke sirkuit realtime agar host menyadari kehadiran penyusup yang sah
        try {
          const cleanNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');
          const channel = supabase.channel(`table-${cleanNum}`);
          channel.send({
            type: 'broadcast',
            event: 'mate_joined',
            payload: { user: customerName }
          });
        } catch (broadcastErr) {
          console.warn('Failed to dispatch instant roommate join broadcast:', broadcastErr);
        }
      }
    }
    setShowOccupiedModal(false);
    triggerNotification('👥 Bergabung dengan sesi pesanan aktif meja.');
  };

  const handleResetCustomerSession = () => {
    // 🧼 Bersihkan semua sampah data meja dan nama pelanggan yang tersangkut
    localStorage.removeItem('customer_name');
    localStorage.removeItem('customer_table');
    localStorage.removeItem('nomor_meja');
    localStorage.removeItem('table_id');
    sessionStorage.removeItem('scanbite_customer_name');
    sessionStorage.removeItem('scanbite_table');
    sessionStorage.removeItem('scanbite_session_id');
    localStorage.removeItem('scanbite_orders');
    localStorage.removeItem('scanbite_tables');
    
    sessionStorage.clear();
    
    // 🔄 Reset state ke kondisi awal (sesuaikan dengan nama state login/view di file ini)
    setCustomerName('');
    setTableNumber('');
    setCart([]);
    
    if (typeof onNavigate === 'function') {
      onNavigate('menu');
    }
    
    // 🚀 Paksa stay di rute menu dengan session kosong untuk form input
    window.location.href = window.location.origin + '/menu';
  };

  // Pull settings regarding the current branding (merchant logo, cafe name)
  useEffect(() => {
    const fetchBrandingInMenu = async () => {
      if (!supabase) return;
      try {
        const activeTenant = localStorage.getItem('current_tenant') || 'scanbite_live';
        const { data } = await supabase
          .from('sb_settings')
          .select('*')
          .eq('kode_tenant', activeTenant)
          .maybeSingle();

        if (data) {
          if (data.cafe_name) {
            localStorage.setItem('scanbite_cafe_name', data.cafe_name);
          }
          if (data.logo_url) {
            localStorage.setItem('scanbite_merchant_logo', data.logo_url);
          }
        }
      } catch (err) {
        console.warn('Failed to load branding inside menu list:', err);
      }
    };
    fetchBrandingInMenu();
  }, []);

  useEffect(() => {
    checkTableSession();
  }, [tableNumber]);

  // Fetch from Supabase Table menus / menu_items with fallback data.ts
  useEffect(() => {
    async function fetchMenus() {
      if (!supabase) {
        console.log('Supabase credentials missing. Utilizing highly offline resilient MENU_ITEMS');
        return;
      }
      setLoadingMenus(true);
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Koneksi Supabase timeout setelah 5000ms')), 5000)
        );

        let data: any[] | null = null;
        let error: any = null;

        try {
          const queryPromise = supabase
            .from('sb_menus')
            .select('*');
          
          const response = await Promise.race([queryPromise, timeoutPromise]) as any;
          data = response.data;
          error = response.error;
        } catch (raceErr) {
          console.warn('First query timed out or failed:', raceErr);
          error = raceErr;
        }

        if (error || !data) {
          try {
            // Fallback table name setup with timeout too
            const fallbackPromise = supabase
              .from('menu_items')
              .select('*');
            
            const fallbackResponse = await Promise.race([fallbackPromise, timeoutPromise]) as any;
            if (fallbackResponse && !fallbackResponse.error && fallbackResponse.data) {
              data = fallbackResponse.data;
              error = null;
            } else {
              throw error || fallbackResponse.error || new Error('No data found');
            }
          } catch (raceErrFallback) {
            console.warn('Fallback query also timed out or failed:', raceErrFallback);
            throw error || raceErrFallback;
          }
        }

        if (data && data.length > 0) {
          // Dynamic client-side filtering for is_available, tersedia, etc. to prevent PostgreSQL missing column exceptions
          const filteredData = data.filter((item: any) => {
            const isAvail = item.is_available ?? item.isAvailable ?? item.tersedia ?? item.status_aktif ?? true;
            return isAvail === true || isAvail === 'true' || isAvail === 1 || isAvail === 'tersedia' || isAvail === 'Tersedia' || isAvail === 'aktif';
          });

          const mapped: MenuItem[] = filteredData.map((item: any) => ({
            id: item.id?.toString() || '',
            name: item.name || '',
            description: item.description || '',
            price: Number(item.price) || 0,
            category: item.category || 'coffee',
            image: item.image_url || item.image || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80',
            rating: Number(item.rating) || 4.8,
            isPopular: item.is_popular || item.isPopular || false
          }));
          setMenuList(mapped);
          setIsLiveDatabase(true);
          triggerNotification('🟢 Terhubung ke database menu langsung di Supabase cloud!');
        }
      } catch (err: any) {
        console.warn('Fallback to local dataset as direct Supabase menu fetching failed:', err.message);
      } finally {
        setLoadingMenus(false);
      }
    }
    fetchMenus();
  }, []);

  // Configure Supabase Real-Time Broadcast Channel based on tableNumber
  useEffect(() => {
    if (!supabase || !tableNumber) return;

    const cleanNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');
    const roomChannelName = `table-${cleanNum}`;

    // Connect to room channel according to restaurant table code
    const channel = supabase.channel(roomChannelName, {
      config: {
        broadcast: { self: false }
      }
    });

    channel
      .on('broadcast', { event: 'item_added' }, (payload: any) => {
        const { user, itemName, itemId } = payload.payload;
        
        triggerNotification(`⚡ ${user} memasukkan "${itemName}" ke keranjang meja.`);
        
        // Append item to state for shared multi-user checkout simulation
        setCart((prevCart) => {
          const existing = prevCart.find(
            (ci) => ci.menuItemId === itemId && ci.user === user
          );
          if (existing) {
            return prevCart.map((ci) => 
              ci.menuItemId === itemId && ci.user === user
                ? { ...ci, quantity: ci.quantity + 1 }
                : ci
            );
          }
          return [...prevCart, { menuItemId: itemId, user, quantity: 1 }];
        });
      })
      .on('broadcast', { event: 'mate_joined' }, (payload: any) => {
        const { user } = payload.payload;
        triggerNotification(`👥 ${user} telah memindai QR & bergabung di Meja ${cleanNum}!`);
        setRoommates(prev => prev.includes(user) ? prev : [...prev, user]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Announce entry
          channel.send({
            type: 'broadcast',
            event: 'mate_joined',
            payload: { user: customerName }
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [tableNumber, customerName]);

  // Handle Add Item to Cart
  const handleAddToCart = (item: MenuItem, targetUser: string = customerName) => {
    setCart((prevCart) => {
      const existing = prevCart.find(
        (ci) => ci.menuItemId === item.id && ci.user === targetUser
      );
      if (existing) {
        return prevCart.map((ci) => 
          ci.menuItemId === item.id && ci.user === targetUser
            ? { ...ci, quantity: ci.quantity + 1 }
            : ci
        );
      }
      return [...prevCart, { menuItemId: item.id, user: targetUser, quantity: 1 }];
    });

    // Send Broadcast to other diners if Supabase Channel is up
    if (supabase) {
      const cleanNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');
      const channel = supabase.channel(`table-${cleanNum}`);
      channel.send({
        type: 'broadcast',
        event: 'item_added',
        payload: { user: targetUser, itemName: item.name, itemId: item.id }
      });
    }

    triggerNotification(`✓ "${item.name}" ditambahkan atas nama ${targetUser}!`);
  };

  // Decrease item quantity
  const handleRemoveFromCart = (itemId: string, targetUser: string = customerName) => {
    setCart((prevCart) => {
      const existing = prevCart.find(
        (ci) => ci.menuItemId === itemId && ci.user === targetUser
      );
      if (!existing) return prevCart;
      
      if (existing.quantity === 1) {
        return prevCart.filter((ci) => !(ci.menuItemId === itemId && ci.user === targetUser));
      }
      return prevCart.map((ci) => 
        ci.menuItemId === itemId && ci.user === targetUser
          ? { ...ci, quantity: ci.quantity - 1 }
          : ci
      );
    });
  };

  // Estimate details
  const totalCartItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  
  const getSubtotalPrice = () => {
    return cart.reduce((acc, item) => {
      const menu = menuList.find((m) => m.id === item.menuItemId);
      return acc + (menu ? menu.price * item.quantity : 0);
    }, 0);
  };

  // Add Interactive Roommate local form
  const handleAddRoommate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoommateName.trim()) return;
    if (roommates.includes(newRoommateName.trim()) || newRoommateName.trim() === customerName) {
      triggerNotification('Nama tersebut sudah bergabung di meja Anda.');
      return;
    }
    const joined = newRoommateName.trim();
    setRoommates([...roommates, joined]);
    setNewRoommateName('');

    if (supabase) {
      const cleanNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');
      const channel = supabase.channel(`table-${cleanNum}`);
      channel.send({
        type: 'broadcast',
        event: 'mate_joined',
        payload: { user: joined }
      });
    }

    triggerNotification(`👥 ${joined} memindai QR Meja ${tableNumber} & bergabung.`);
  };

  // Simulate remote update
  const handleSimulateRoommateOrder = () => {
    if (roommates.length === 0) return;
    const randomFriend = roommates[Math.floor(Math.random() * roommates.length)];
    const randomMenu = menuList[Math.floor(Math.random() * menuList.length)];

    handleAddToCart(randomMenu, randomFriend);
  };

  // Handle 5-click hidden gesture on Table number component
  const handleTableClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 2000) {
      setAdminClicks(1);
    } else {
      const nextClicks = adminClicks + 1;
      setAdminClicks(nextClicks);
      if (nextClicks === 5) {
        setAdminClicks(0);
        setShowAdminPinModal(true);
        setAdminPinError(null);
        setAdminPinInput('');
      }
    }
    setLastClickTime(now);
  };

  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentAdminPin = localStorage.getItem('scanbite_admin_pin') || '1234';
    if (adminPinInput === currentAdminPin) {
      localStorage.setItem('scanbite_admin_verified', 'true');
      setShowAdminPinModal(false);
      setAdminPinInput('');
      onNavigate('admin');
    } else {
      setAdminPinError('Kode PIN salah. Silakan coba lagi.');
      setAdminPinInput('');
    }
  };

  // Tailwind tabs mapping specs: "Semua", "Makanan", "Minuman", "Snack"
  const FILTER_TABS = [
    { id: 'all', label: 'Semua', icon: Sparkles },
    { id: 'makanan', label: 'Makanan', icon: Utensils },
    { id: 'minuman', label: 'Minuman', icon: Coffee },
    { id: 'snack', label: 'Snack', icon: Milk },
  ];

  // Specific categorisation parser
  const getFilteredItems = () => {
    return menuList.filter((item) => {
      // 1. Search filter
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // 2. Category matching: "makanan" -> "food", "minuman" -> "coffee"/"non-coffee", "snack" -> "dessert"
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'makanan') return item.category === 'food';
      if (selectedCategory === 'minuman') return item.category === 'coffee' || item.category === 'non-coffee';
      if (selectedCategory === 'snack') return item.category === 'dessert';
      
      return true;
    });
  };

  const filteredItems = getFilteredItems();

  const renderCatalogSelector = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-4 bg-white border border-[#EBE3D5] rounded-3xl p-4.5 shadow-xs">
          {/* Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#B2A494] pointer-events-none font-sans">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Cari menu nikmat (contoh: Kopi, Wagyu, Croissant)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl text-xs font-medium placeholder-[#B2A494] text-[#2C2520] focus:outline-none focus:ring-1 focus:ring-[#8C6239] transition-all"
            />
          </div>

          {/* Slider Categories */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {FILTER_TABS.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id)}
                  type="button"
                  className={`py-2 px-4 rounded-xl text-xs font-black flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                    selectedCategory === tab.id
                      ? 'bg-[#8C6239] text-[#FDFBF7] shadow-sm shadow-[#8C6239]/20'
                      : 'bg-white text-[#5B4E44] border border-[#EBE3D5] hover:bg-[#FAF8F5]'
                  }`}
                >
                  <IconComponent className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <ChefHat className="w-4 h-4 text-[#8C6239]" />
              <span>Pilihan Hidangan Kafe</span>
            </h3>
            <span className="text-[11px] text-[#9E8775] font-extrabold">{filteredItems.length} Pilihan aktif</span>
          </div>

          {loadingMenus ? (
            <div className="bg-white border border-[#F1EADF] rounded-3xl p-10 text-center text-[#9E8775]">
              <div className="w-5 h-5 border-2 border-[#8C6239] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold font-sans">Menghubungkan ke database...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white border border-[#F1EADF] rounded-3xl p-12 text-center text-[#9E8775]">
              <p className="text-xs font-bold text-[#5B4E44]">Pencarian hidangan Anda tidak ditemukan.</p>
              <button 
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }} 
                type="button"
                className="text-xs text-[#8C6239] font-black underline mt-2 cursor-pointer"
              >
                Reset Pilihan
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredItems.map((item) => (
                <div 
                  key={item.id}
                  className="bg-white rounded-3xl border border-[#FAF2E8] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  {/* Upper photo */}
                  <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      className="w-full h-full object-cover select-none"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80';
                      }}
                    />
                    
                    {item.isPopular && (
                      <span className="absolute top-2 left-2 bg-[#8C6239] text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 font-sans">
                        <Sparkles className="w-3 h-3 fill-white text-white" /> POPULAR
                      </span>
                    )}

                    <span className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-xs text-[#8C6239] text-[11px] font-black px-2 py-0.5 rounded-lg shadow-xs font-mono">
                      {formatPrice(item.price)}
                    </span>
                  </div>

                  {/* Info & Add triggers */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-extrabold text-[#1C1612] text-xs uppercase tracking-tight mb-1 truncate">{item.name}</h4>
                      <p className="text-[10px] text-[#786455] leading-relaxed line-clamp-2">{item.description}</p>
                    </div>

                    {/* Room splits tags */}
                    <div className="mt-3.5 pt-2.5 border-t border-[#FAF8F5] flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[7.5px] text-[#9E8775] font-black uppercase tracking-wider mb-1 leading-none font-mono">Pesan Atas Nama:</p>
                        <div className="flex items-center gap-1 overflow-x-auto max-w-[120px] scrollbar-none py-0.5">
                          {/* Self user button */}
                          <button
                            type="button"
                            onClick={() => handleAddToCart(item, customerName)}
                            title={`Pesan untuk Anda (${customerName})`}
                            className="w-5.5 h-5.5 rounded-full bg-[#8C6239] text-[#FDFBF7] text-[9.5px] font-black flex items-center justify-center transition-all shadow-2xs shrink-0 select-none uppercase hover:brightness-110 cursor-pointer"
                          >
                            {customerName[0]}
                          </button>

                          {/* Diners buttons */}
                          {roommates.map((name, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleAddToCart(item, name)}
                              title={`Pesan untuk ${name}`}
                              className="w-5.5 h-5.5 rounded-full bg-[#FAF2E8] border border-[#EBE3D5] text-[#8C6239] text-[8.5px] font-bold flex items-center justify-center transition-all shrink-0 uppercase hover:bg-[#8C6239] hover:text-white cursor-pointer"
                            >
                              {name[0]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddToCart(item, customerName)}
                        className="px-2.5 py-1.5 bg-[#FAF2E8] text-[#8C6239] hover:bg-[#8C6239] hover:text-white rounded-lg text-[10.5px] font-black transition-all flex items-center gap-0.5 cursor-pointer shadow-3xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Pesan</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!customerName || !tableNumber) {
    return (
      <div className="flex flex-col min-h-screen w-full bg-[#FAF7F2] text-[#2C2520] font-sans antialiased overflow-y-auto px-4 py-8 relative">
        {/* Background Decorative Rings */}
        <div className="absolute top-[-100px] left-[-100px] w-64 h-64 rounded-full bg-[#FAF2E8] opacity-60 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-100px] right-[-100px] w-64 h-64 rounded-full bg-[#EBE3D5] opacity-50 blur-3xl pointer-events-none" />

        <div className="max-w-md mx-auto w-full bg-white/90 backdrop-blur-md rounded-3xl p-6 shadow-xl border border-white/60 mt-10 relative z-10">
          <div className="text-center mb-6">
            {localStorage.getItem('scanbite_merchant_logo') ? (
              <div className="inline-flex items-center justify-center p-0.5 bg-gradient-to-tr from-[#8C6239] to-amber-500 rounded-full mb-3 shadow-md hover:scale-105 transition-transform">
                <img 
                  src={localStorage.getItem('scanbite_merchant_logo') || ''} 
                  alt={localStorage.getItem('scanbite_cafe_name') || 'Merchant Logo'} 
                  className="w-16 h-16 rounded-full object-cover border-2 border-white"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center p-3 bg-[#EFE6D5] rounded-2xl mb-3 text-[#8C6239] shadow-inner">
                <Coffee className="w-8 h-8 stroke-[1.5]" />
              </div>
            )}
            <h1 className="text-2xl font-black text-[#1C1612] tracking-tight">
              {localStorage.getItem('scanbite_cafe_name') || 'Sesi Pemesanan Baru'}
            </h1>
            <p className="text-xs text-[#786455] font-semibold mt-1 uppercase tracking-widest">
              Akses Menu Mandiri • {localStorage.getItem('scanbite_cafe_name') ? 'Pemesanan Baru' : 'ScanBite'}
            </p>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const nameInput = (e.currentTarget.elements.namedItem('custName') as HTMLInputElement).value.trim();
              
              // Resolve table from the select element, or hidden input, or the state
              const tblElement = e.currentTarget.elements.namedItem('tblNum') as HTMLInputElement | HTMLSelectElement;
              const tableInput = (tblElement ? tblElement.value.trim() : '') || tableNumber || '';
              
              if (!nameInput) {
                setSessionError('Silakan masukkan nama lengkap Anda.');
                return;
              }
              if (nameInput.length < 2) {
                setSessionError('Nama terlalu pendek, silakan masukkan minimal 2 karakter.');
                return;
              }
              if (!tableInput) {
                setSessionError('Silakan pilih nomor meja Anda.');
                return;
              }

              sessionStorage.setItem('scanbite_customer_name', nameInput);
              sessionStorage.setItem('scanbite_table', tableInput);
              setCustomerName(nameInput);
              setTableNumber(tableInput);
              setSessionError(null);
              triggerNotification(`✨ Sesi aktif: Meja ${tableInput} - ${nameInput}`);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-[#5B4E44] uppercase tracking-wider mb-2">Nama Lengkap Anda</label>
              <input
                name="custName"
                type="text"
                required
                defaultValue={customerName}
                placeholder="Contoh: Budi Santoso"
                className="w-full px-4 py-3.5 bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl text-base font-medium placeholder-[#B2A494] text-[#1C1612] focus:outline-none focus:ring-2 focus:ring-[#8C6239] shadow-inner"
              />
            </div>

            {(() => {
              const hasUrlTable = typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('table');
              if (hasUrlTable && tableNumber) {
                return (
                  <div className="bg-[#FAF8F5] border-2 border-dashed border-[#8C6239]/20 rounded-2xl p-4 flex items-center justify-between shadow-2xs select-none">
                    <div>
                      <span className="block text-[10px] font-bold text-[#8C6239]/80 uppercase tracking-widest leading-none">Nomor Meja Terdeteksi</span>
                      <span className="text-lg font-black text-[#1C1612] mt-1 block">Meja {tableNumber}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 bg-[#8C6239]/10 text-[#8C6239] px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider font-mono">
                      <span>🔒 Locked (QR/URL)</span>
                    </div>
                    <input type="hidden" name="tblNum" value={tableNumber} />
                  </div>
                );
              }
              return (
                <div>
                  <label className="block text-xs font-bold text-[#5B4E44] uppercase tracking-wider mb-2">Nomor Meja</label>
                  <select
                    name="tblNum"
                    required
                    defaultValue={tableNumber}
                    className="w-full px-4 py-3.5 bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl text-base font-medium text-[#1C1612] focus:outline-none focus:ring-2 focus:ring-[#8C6239] shadow-inner"
                  >
                    <option value="">-- Pilih Nomor Meja --</option>
                    {['01', '03', '05', '08', '12', '18'].map(num => (
                      <option key={num} value={num}>Meja {num}</option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {sessionError && (
              <div className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 animate-fadeIn">
                ⚠️ {sessionError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-[#8C6239] hover:bg-[#6D4926] text-white py-4 px-6 rounded-2xl font-bold text-sm uppercase tracking-wide transition-all shadow-lg hover:scale-[1.01] cursor-pointer"
            >
              Lihat Menu & Mulai Pesanan
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#FDFBF7] text-[#2C2520] font-sans antialiased overflow-hidden">
      
      <AnimatePresence>
        {showWelcome && <WelcomeAnimation onComplete={() => {setShowWelcome(false); localStorage.setItem('scanbite_welcomed', 'true');}} />}
      </AnimatePresence>
      
      {/* Toast Broadcast Popup Notification with Warm Bistro Accents */}
      {notification && (
        <div id="toast-realtime-badge" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-fadeIn">
          <div className="bg-[#2C2520] text-[#FDFBF7] text-xs font-bold px-4 py-3 rounded-2xl shadow-xl border border-[#8C6239]/20 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping shrink-0" />
              <span>{notification}</span>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239]" />
          </div>
        </div>
      )}

      {/* Styled Modern Bistro Navigation & Welcome Card */}
      <header className="bg-white border-b border-[#F1EADF] sticky top-0 z-40 px-4 py-3 shadow-xs shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Diner State Display with hidden click interaction feedback to trigger Admin PIN */}
          <div 
            onClick={handleTableClick}
            className="flex items-center gap-3 cursor-pointer select-none active:scale-95 hover:bg-[#FAF8F5]/60 pr-2 rounded-2xl transition-all" 
            id="meja-aktif-indicator"
            title="Sesi Pemesanan"
          >
            {localStorage.getItem('scanbite_merchant_logo') ? (
              <img 
                src={localStorage.getItem('scanbite_merchant_logo') || ''} 
                alt="Logo Merchant kustom"
                className="w-10 h-10 rounded-2xl object-cover border border-[#FAF2E8] shadow-3xs shrink-0 hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-[#8C6239] text-white flex flex-col items-center justify-center shadow-xs shrink-0">
                <span className="text-[9px] font-bold uppercase tracking-tighter opacity-75">Meja</span>
                <span className="text-sm font-black -mt-1">{tableNumber}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5 ">
                <span className="text-[10px] uppercase font-bold text-[#8C6239] tracking-wider">
                  {localStorage.getItem('scanbite_merchant_logo') ? `Meja ${tableNumber}` : `Meja ${tableNumber}`}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#9E8775]">
                    <Clock className="w-3 h-3"/>
                    {elapsedTime}
                </span>
              </div>
              <h2 className="text-xs font-black text-[#2C2520] leading-none mt-0.5">Dinikmati oleh: <span className="text-[#8C6239] font-bold underline select-all">{customerName}</span></h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetCustomerSession}
              type="button"
              className="flex items-center gap-1 py-1.5 px-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-850 font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-3xs"
              title="Reset Sesi Pemesanan"
            >
              <span>Reset Sesi ❌</span>
            </button>

            <button
              onClick={() => setShowAiModal(true)}
              type="button"
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-850 font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-3xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Asisten AI Aktif 🟢</span>
            </button>
          </div>
          
        </div>
      </header>

      {/* Database Connection Status Ribbon */}
      <div className="bg-[#FAF2E8]/45 px-4 py-1.5 border-b border-[#FAF2E8] shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] font-bold text-[#786455]">
          <span className="flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-[#8C6239]" />
            <span>Database: {isLiveDatabase ? 'Supabase cloud (Aktif)' : 'Lokal resilient (Sandbox)'}</span>
          </span>
          <span className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
            <span>QR Channel: table-{tableNumber}</span>
          </span>
        </div>
      </div>

      {/* Real-time Visual Order Progress Indicator (Syncs with Admin Updates) */}
      {activeOrder && (
        <div id="client-live-menu-order-tracker" className="mx-4 mt-3 bg-gradient-to-r from-[#2C2520] to-[#1C1612] text-white rounded-2xl p-4 shadow-lg border border-[#8C6239]/40 relative overflow-hidden animate-slideUp shrink-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#8C6239]/15 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center border border-orange-500/20 shrink-0">
                <ChefHat className="w-3.5 h-3.5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-widest">Status Pesanan Anda • Status Pesanan</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <p className="text-[9px] text-gray-400 font-mono">ID: #{activeOrder.id?.slice(0, 8)}...</p>
              </div>
            </div>
            
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-[#8C6239] text-white font-sans tracking-wider">
              {activeOrder.status === 'pending' && 'Diterima • Pending'}
              {activeOrder.status === 'preparing' && 'Diproses • Preparing'}
              {activeOrder.status === 'ready' && 'Siap Saji • Ready'}
              {activeOrder.status === 'delivered' && 'Disajikan • Delivered'}
              {activeOrder.status === 'completed' && 'Selesai • Completed'}
            </span>
          </div>

          <div className="space-y-1.5 select-none text-[#FDFBF7]">
            <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-amber-300 transition-all duration-1000 ease-out"
                style={{ 
                  width: activeOrder.status === 'pending' ? '25%' : 
                         activeOrder.status === 'preparing' ? '55%' : 
                         activeOrder.status === 'ready' ? '80%' : '100%' 
                }}
              />
            </div>
            
            <div className="grid grid-cols-4 text-[9px] font-extrabold text-[#B2A494] leading-tight">
              <div className={`text-left ${activeOrder.status === 'pending' || activeOrder.status === 'preparing' || activeOrder.status === 'ready' || activeOrder.status === 'delivered' || activeOrder.status === 'completed' ? 'text-amber-500 font-black' : ''}`}>
                <span>Diterima</span>
                <span className="block text-[7.5px] text-gray-500 font-normal">Pending</span>
              </div>
              <div className={`text-center ${activeOrder.status === 'preparing' || activeOrder.status === 'ready' || activeOrder.status === 'delivered' || activeOrder.status === 'completed' ? 'text-amber-300 font-black' : ''}`}>
                <span>Dimasak</span>
                <span className="block text-[7.5px] text-gray-500 font-normal">Preparing</span>
              </div>
              <div className={`text-center ${activeOrder.status === 'ready' || activeOrder.status === 'delivered' || activeOrder.status === 'completed' ? 'text-amber-300 font-black' : ''}`}>
                <span>Siap Saji</span>
                <span className="block text-[7.5px] text-gray-500 font-normal">Ready!</span>
              </div>
              <div className={`text-right ${activeOrder.status === 'delivered' || activeOrder.status === 'completed' ? 'text-emerald-400 font-black animate-pulse' : ''}`}>
                <span>Diantar</span>
                <span className="block text-[7.5px] text-gray-500 font-normal">Delivered</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Segmented Tab Selector for Mobile Viewport Isolation */}
      <div className="bg-white border-b border-[#FAF2E8] px-4 py-2 shrink-0">
        <div className="flex bg-[#FAF8F5] p-1 rounded-2xl border border-[#FAF2E8]">
          <button
            type="button"
            onClick={() => setActiveTab('menu')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'menu'
                ? 'bg-[#8C6239] text-[#FDFBF7] shadow-sm'
                : 'text-[#5B4E44] hover:bg-[#FAF2E8]/40'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>Pilihan Hidangan</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cart')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
              activeTab === 'cart'
                ? 'bg-[#8C6239] text-[#FDFBF7] shadow-sm'
                : 'text-[#5B4E44] hover:bg-[#FAF2E8]/40'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Keranjang & Meja</span>
            {totalCartItems > 0 && (
              <span className="absolute top-1.5 right-4 bg-orange-500 text-white border border-white text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce">
                {totalCartItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Container Layout */}
      <main className="flex-1 flex flex-col w-full overflow-hidden bg-[#FDFBF7]">
        {/* KOLOM KIRI: Hidangan (Renders Catalog) */}
        {activeTab === 'menu' && (
          <div className="w-full flex-1 flex flex-col h-full overflow-y-auto p-4 space-y-5 border-r border-[#FAF2E8] pb-28 animate-fadeIn text-left">
            {/* Catalog Selector */}
            {renderCatalogSelector()}
            
            {/* Column Branding Footer */}
            <div className="pt-6 mt-auto border-t border-[#FAF2E8]/60 text-center text-[10px] text-[#9E8775]/90 font-sans shrink-0 animate-fadeIn">
              <p className="font-semibold">© 2026 {localStorage.getItem('scanbite_cafe_name') || 'ScanBite Bistro'}. All rights reserved.</p>
              <p className="opacity-75 mt-0.5 animate-pulse">Powered by RasyaTech | Vibe Modern • Digital Jukebox • Real-time Split Billing</p>
            </div>
          </div>
        )}

        {/* KOLOM KANAN: Sesi dan Keranjang Meja */}
        {activeTab === 'cart' && (
          <div className="w-full flex-1 flex flex-col h-full overflow-y-auto p-4 space-y-5 pb-28 bg-[#FAF8F5] animate-fadeIn">
            
            {/* Section 2: Active Shared Room & Friend Ordering Simulator */}
            <div className="bg-white rounded-3xl p-5 border border-[#EBE3D5] shadow-xs">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#8C6239] flex items-center justify-center border border-[#FAF2E8]">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-[#1C1612] text-xs uppercase tracking-wider">Meja {tableNumber} Shared Room</h3>
                    <p className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1 leading-none mt-0.5 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> PWA Real-time Sync
                    </p>
                  </div>
                </div>
              </div>

              {/* Roommate details list */}
              <div className="space-y-2">
                <div className="bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#8C6239]" />
                    <span className="text-xs font-black text-[#2C2520]">{customerName} (Anda)</span>
                  </div>
                  <span className="text-[8px] bg-[#8C6239]/10 text-[#8C6239] px-2 py-0.5 rounded-full font-black uppercase tracking-wider font-mono">Host</span>
                </div>

                {roommates.map((name, idx) => {
                  const companionQtySum = cart
                    .filter((ci) => ci.user === name)
                    .reduce((acc, ci) => acc + ci.quantity, 0);

                  return (
                    <div key={idx} className="bg-white border border-[#F1EADF] rounded-xl px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#9E8775]" />
                        <span className="text-xs font-bold text-[#5B4E44]">{name}</span>
                      </div>
                      {companionQtySum > 0 ? (
                        <span className="text-[9.5px] font-black text-[#8C6239] bg-[#FAF2E8] px-2 py-0.5 rounded-md font-mono">
                          {companionQtySum} Item
                        </span>
                      ) : (
                        <span className="text-[8.5px] text-[#9E8775] italic">Sedang memilih...</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Collapsible Simulator Box */}
              <div className="border border-amber-200/55 bg-amber-50/20 rounded-2xl p-2.5 mt-3.5 select-none text-left">
                <button
                  type="button"
                  onClick={() => setShowSimulator(!showSimulator)}
                  className="w-full flex items-center justify-between text-[10px] font-black text-[#8C6239] uppercase tracking-wider cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 font-sans">
                    <Sliders className="w-3.5 h-3.5 text-[#8C6239]" />
                    <span>Simulasi Testing</span>
                  </span>
                  <span className="text-[9px] bg-white border border-amber-200/40 px-1.5 py-0.5 rounded-md leading-none font-mono font-black">
                    {showSimulator ? 'TUTUP ✕' : 'BUKA ⚙️'}
                  </span>
                </button>
                
                {showSimulator && (
                  <div className="mt-3.5 pt-3 border-t border-amber-200/40 space-y-3 animate-fadeIn">
                    {/* Simulate remote roommate order button */}
                    {roommates.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSimulateRoommateOrder}
                        className="w-full bg-white hover:bg-[#FAF8F5] border border-dashed border-[#8C6239] text-[#8C6239] py-1.5 px-3 rounded-xl font-black text-[9.5px] flex items-center justify-center gap-1 transition-all uppercase tracking-wider shadow-3xs cursor-pointer font-sans"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Simulasi Teman Memesan</span>
                      </button>
                    )}

                    {/* Quick roommate join input */}
                    <form onSubmit={handleAddRoommate} className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Nama kawan..."
                        required
                        value={newRoommateName}
                        onChange={(e) => setNewRoommateName(e.target.value)}
                        className="flex-1 bg-white border border-[#EBE3D5] rounded-xl px-2.5 py-2 text-xs placeholder-[#B2A494] focus:outline-none focus:ring-1 focus:ring-[#8C6239] font-sans"
                      />
                      <button
                        type="submit"
                        className="bg-[#FAF2E8] text-[#8C6239] hover:bg-[#8C6239] hover:text-white border border-[#EBE3D5] font-black rounded-xl px-3 transition-all text-xs cursor-pointer font-sans"
                      >
                        Gabung
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Shared Sessional Cart List details with checkout trigger */}
            <div className="bg-[#FAF2E8]/40 border border-[#FAF2E8]/90 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-[#8C6239] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <ShoppingCart className="w-4 h-4" />
                  <span>Detail Keranjang Meja-{tableNumber}</span>
                </h4>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowClearCartConfirm(true)}
                      className="text-[10px] text-rose-600 hover:text-rose-700 font-extrabold flex items-center gap-1 bg-rose-50 hover:bg-rose-105 px-2 py-0.5 rounded-lg transition-all cursor-pointer shadow-3xs"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Kosongkan</span>
                    </button>
                  )}
                  <span className="text-[10px] text-[#2C2520] font-black bg-white border border-[#F1EADF] px-2 py-0.5 rounded-md font-mono">
                    {totalCartItems} Item
                  </span>
                </div>
              </div>

              {cart.length === 0 ? (
                <p className="text-xs text-[#9E8775] italic leading-relaxed">
                  Keranjang meja Anda kosong. Pilih hidangan legendaris di atas untuk diakumulasikan!
                </p>
              ) : (
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {cart.map((item, idx) => {
                    const menu = menuList.find((m) => m.id === item.menuItemId);
                    if (!menu) return null;
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-[#FAF2E8] last:border-b-0">
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="font-black text-[#2C2520] truncate">{menu.name}</p>
                          <p className="text-[9.5px] text-[#9E8775] font-bold">Oleh: <span className="text-[#8C6239] font-black uppercase">{item.user}</span></p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={() => handleRemoveFromCart(item.menuItemId, item.user)}
                            className="w-5 h-5 bg-[#FAF2E8] text-[#8C6239] hover:bg-[#8C6239] hover:text-white rounded-lg flex items-center justify-center font-black cursor-pointer"
                          >
                            -
                          </button>
                          <span className="font-black text-[#2C2520] min-w-4 text-center font-mono">{item.quantity}</span>
                          <button 
                            onClick={() => handleAddToCart(menu, item.user)}
                            className="w-5 h-5 bg-[#FAF2E8] text-[#8C6239] hover:bg-[#8C6239] hover:text-white rounded-lg flex items-center justify-center font-black cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {cart.length > 0 && (
                <div className="pt-3.5 border-t border-[#EBE3D5] space-y-3">
                  <div className="flex items-center justify-between text-xs font-black text-[#2C2520]">
                    <span>Total Tagihan Meja ({totalCartItems} Item)</span>
                    <span className="text-[#8C6239] text-sm font-mono font-black">{formatPrice(getSubtotalPrice())}</span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => onNavigate('checkout')}
                    className="w-full bg-[#8C6239] hover:bg-[#6D4926] text-white py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    <span>Review Tagihan & Lakukan Checkout</span>
                    <ArrowRight className="w-4 h-4 animate-pulse" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Active Live Log Feed */}
            {liveActivityFeed.length > 0 && (
              <div className="bg-white rounded-3xl p-4 border border-[#EBE3D5] text-left">
                <h4 className="text-[9px] font-black uppercase tracking-wider text-[#9E8775] mb-2 flex items-center gap-1 font-mono">
                  <Bell className="w-3 h-3 text-amber-500 animate-bounce" />
                  <span>Live Feed Aktivitas Meja</span>
                </h4>
                <div className="space-y-1 max-h-[85px] overflow-y-auto">
                  {liveActivityFeed.map((feed, idx) => (
                    <p key={idx} className="text-[10px] text-[#5B4E44] leading-snug truncate border-l-2 border-[#8C6239] pl-1.5 font-medium">
                      {feed}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Column Branding Footer */}
            <div className="pt-6 mt-auto text-center text-[10px] text-[#9E8775]/90 font-sans shrink-0 animate-fadeIn">
              <p className="font-semibold">© 2026 {localStorage.getItem('scanbite_cafe_name') || 'ScanBite Bistro'}. All rights reserved.</p>
              <p className="opacity-75 mt-0.5 animate-pulse">Powered by RasyaTech | Vibe Modern • Digital Jukebox • Real-time Split Billing</p>
            </div>

          </div>
        )}
      </main>

      {/* Elegant Floating Cart Button conforming to specifications for mobile scroll access */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7]/95 to-transparent z-40 lg:hidden animate-slideUp">
          <div className="max-w-4xl mx-auto">
            <div 
              id="floating-checkout-cart"
              className="bg-gradient-to-r from-[#2C2520] to-[#1C1612] text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between gap-4 border border-[#8C6239]/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-[#8C6239] rounded-2xl flex items-center justify-center relative shadow-md">
                  <ShoppingCart className="w-5.5 h-5.5 text-[#FDFBF7]" />
                  <span className="absolute -top-1.5 -right-1.5 bg-orange-500 border-2 border-[#2C2520] text-white text-[9.5px] font-black w-5.5 h-5.5 rounded-full flex items-center justify-center">
                    {totalCartItems}
                  </span>
                </div>
                <div>
                  <p className="text-[8px] text-[#9E8775] font-black uppercase tracking-wider leading-none">Subtotal Belanja</p>
                  <p className="text-sm font-black text-[#FDFBF7] mt-0.5 font-mono">{formatPrice(getSubtotalPrice())}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('checkout')}
                className="bg-[#8C6239] hover:bg-[#6D4926] text-white py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 group transition-all"
              >
                <span>Lihat Check</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHAT ASISTEN AI SOMMELIER */}
      {showAiModal && (
        <div id="ai-chat-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2520]/75 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-[#FAF2E8] overflow-hidden shadow-2xl animate-scaleIn flex flex-col max-h-[85vh]">
            <div className="bg-[#8C6239] px-5 py-4 flex items-center justify-between text-[#FDFBF7] select-none shrink-0 font-sans">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-amber-300 animate-pulse" />
                <div>
                  <h3 className="font-black text-xs uppercase tracking-wider">Asisten AI Meja {tableNumber}</h3>
                  <p className="text-[10px] text-amber-100/80 font-medium">Teman Bersantap & Jukebox Joki Anda</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowAiModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-[#FAF8F5] p-2.5">
              <Aisommelier 
                onClose={() => setShowAiModal(false)} 
                activeMenu={menuList} 
                cart={cart}
                setCart={setCart}
                tableNumber={tableNumber}
                setTableNumber={setTableNumber}
                customerName={customerName}
                triggerNotification={triggerNotification}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRM KOSONGKAN KERANJANG */}
      {showClearCartConfirm && (
        <div id="clear-cart-confirm-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2520]/75 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#FAF2E8] p-6 space-y-5 shadow-2xl animate-scaleIn text-center">
            <div className="space-y-2">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-sm font-black text-rose-950 uppercase tracking-widest">Kosongkan Keranjang?</h3>
              <p className="text-xs text-[#786455] leading-relaxed">
                Apakah Anda yakin ingin menghapus semua item dari keranjang Anda? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowClearCartConfirm(false)}
                className="flex-1 bg-gray-50 hover:bg-gray-100 text-[#5B4E44] border border-gray-200 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setCart([]);
                  setShowClearCartConfirm(false);
                  triggerNotification('🧹 Keranjang berhasil dikosongkan!');
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shadow-xs"
              >
                Ya, Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VALIDASI ANTI-BENTROK DYNAMIC SESSION */}
      {showOccupiedModal && (
        <div id="session-anti-collision-popup" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2520]/75 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#FAF2E8] p-6 space-y-5 shadow-2xl animate-scaleIn">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-100">
                <Users className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-sm font-black text-[#1C1612] uppercase tracking-wider">Deteksi Meja Aktif</h3>
              <p className="text-xs text-[#786455] leading-relaxed">
                Sistem mendeteksi bahwa <span className="font-extrabold text-[#8C6239]">Meja {tableNumber}</span> saat ini masih digunakan oleh pelanggan aktif sebelumnya.
              </p>
            </div>

            <div className="bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl p-4 text-center space-y-1">
              <span className="text-[9px] text-gray-400 font-extrabold block uppercase tracking-wider">Pertanyaan Validasi</span>
              <p className="text-xs font-black text-[#2C2520]">Apakah Anda pelanggan baru di meja ini?</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmSameSession}
                className="flex-1 bg-gray-50 hover:bg-gray-100 text-[#5B4E44] border border-gray-200 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Tidak, Gabung Sesi
              </button>
              <button
                type="button"
                onClick={handleConfirmNewCustomer}
                className="flex-1 bg-[#8C6239] hover:bg-[#6D4926] text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shadow-xs"
              >
                Ya, Pelanggan Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PIN ADMIN TERSEMBUNYI (HIDDEN GESTURE TRIGGERED) */}
      {showAdminPinModal && (
        <div id="admin-pin-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2520]/80 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#FAF2E8] p-6 space-y-5 shadow-2xl animate-scaleIn text-center">
            <div className="space-y-2">
              <div className="w-12 h-12 bg-[#FAF2E8] text-[#8C6239] rounded-2xl flex items-center justify-center mx-auto border border-[#EBE3D5]">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-[#1C1612] uppercase tracking-wider">Akses Operator Kafe</h3>
              <p className="text-[11px] text-[#786455] leading-relaxed">
                Silakan masukkan 4-digit Kode PIN Operator atau Kasir untuk mengakses dashboard.
              </p>
            </div>

            <form onSubmit={handleAdminPinSubmit} className="space-y-4">
              <input
                type="password"
                maxLength={4}
                value={adminPinInput}
                onChange={(e) => setAdminPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                autoFocus
                className="w-full text-center tracking-[1em] text-lg bg-[#FAF8F5] text-[#8C6239] font-black py-2.5 px-4 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent font-mono"
              />

              {adminPinError && (
                <p className="text-[10px] text-rose-600 font-extrabold tracking-wide mb-1">{adminPinError}</p>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminPinModal(false);
                    setAdminPinInput('');
                    setAdminPinError(null);
                  }}
                  className="flex-1 bg-[#FAF8F5] text-[#8C6239] hover:bg-[#FAF2E8] border border-[#EBE3D5] py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#8C6239] hover:bg-[#6D4926] text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shadow-xs"
                >
                  Konfirmasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

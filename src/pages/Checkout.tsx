import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  CreditCard, 
  Music, 
  Music2,
  Users, 
  CheckCircle2, 
  Search, 
  Vote, 
  AlertCircle,
  PartyPopper,
  FileText,
  Download,
  X,
  Sparkles,
  Volume2,
  Gift,
  ChefHat
} from 'lucide-react';
import { CartItem, JukeboxTrack, UserBill } from '../types';
import { supabase } from '../supabaseClient';
import { MENU_ITEMS } from '../data';
import { DigitalReceipt } from '../components/DigitalReceipt';

interface CheckoutProps {
  onNavigate: (page: string) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
}

// Global helper for one collective table-cart price computation
const computeBillsFromCart = (cart: CartItem[], menuItemsList: any[]) => {
  const items: any[] = [];
  
  cart.forEach((item) => {
    const menu = menuItemsList?.find((m) => m.id?.toString() === item.menuItemId?.toString());
    const price = menu ? menu.price : 25000;
    const name = menu ? menu.name : `Menu #${item.menuItemId}`;

    items.push({
      name,
      price,
      quantity: item.quantity,
      total: price * item.quantity
    });
  });

  if (items.length === 0) return [];

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const taxRate = Number(localStorage.getItem('scanbite_tax_percent') || '10') / 100;
  const serviceRate = Number(localStorage.getItem('scanbite_service_charge_percent') || '5') / 100;
  const taxAndService = Math.round(subtotal * (taxRate + serviceRate));
  const grandTotal = subtotal + taxAndService;
  
  return [{
    name: 'Tagihan Meja',
    items,
    subtotal,
    taxAndService,
    grandTotal,
    isPaid: false
  }];
};

function getDynamicDenominations(totalAmount: number): number[] {
  const rounded = Math.ceil(totalAmount);
  // Button 1: Uang Pas
  const btn1 = rounded;
  
  // Button 2: Pecahan bulat terdekat di atas Total Tagihan
  let btn2 = rounded;
  if (rounded <= 10000) {
    btn2 = Math.ceil(rounded / 1000) * 1000;
    if (btn2 === btn1) btn2 += 1000;
  } else if (rounded <= 50000) {
    btn2 = Math.ceil(rounded / 5000) * 5000;
    if (btn2 === btn1) btn2 += 5000;
  } else if (rounded <= 100000) {
    btn2 = Math.ceil(rounded / 10000) * 10000;
    if (btn2 === btn1) btn2 += 10000;
  } else if (rounded <= 200000) {
    btn2 = Math.ceil(rounded / 20000) * 20000;
    if (btn2 === btn1) btn2 += 20000;
  } else {
    btn2 = Math.ceil(rounded / 50000) * 50000;
    if (btn2 === btn1) btn2 += 50000;
  }

  // Button 3: Pecahan besar di atasnya lagi
  let btn3 = btn2;
  if (btn2 < 20000) {
    btn3 = 20000;
  } else if (btn2 < 50000) {
    btn3 = 50000;
  } else if (btn2 < 100000) {
    btn3 = 100000;
  } else if (btn2 < 200000) {
    btn3 = 200000;
  } else if (btn2 < 350000) {
    btn3 = 300000;
  } else if (btn2 < 500000) {
    btn3 = 500000;
  } else {
    btn3 = btn2 + 100000;
  }

  // If by chance btn3 <= btn2, we force it higher
  if (btn3 <= btn2) {
    btn3 = btn2 + 50000;
  }

  return [btn1, btn2, btn3];
}

interface JukeboxReceipt {
  trackTitle: string;
  artistName: string;
  tableNumber: string;
  requestTime: string;
  status: string;
  trxId: string;
}

export default function Checkout({ onNavigate, cart, setCart }: CheckoutProps) {
  const [lang, setLang] = useState<'id' | 'en'>(() => {
    return (localStorage.getItem('scanbite_lang') as 'id' | 'en') || 'id';
  });

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

  const changeLang = (newLang: 'id' | 'en') => {
    setLang(newLang);
    localStorage.setItem('scanbite_lang', newLang);
  };

  const t = {
    id: {
      back: 'Kembali',
      headerTitle: 'BILLING & JUKEBOX DETAIL',
      headerSub: 'Tagihan Meja Sederhana',
      table: 'Meja',
      unpaidGrandTotal: 'Total Belum Lunas',
      groupBilling: 'Tagihan Kolektif Meja',
      groupBillingSub: 'Semua hidangan digabung menjadi satu pesanan untuk meja ini',
      cartEmpty: 'Keranjang belanja kosong',
      cartEmptySub: 'Silakan klik pesan menu santapan di halaman depan terlebih dahulu.',
      paid: 'LUNAS',
      payOwn: 'Bayar Tagihan Meja',
      treatAll: 'Bayar Tagihan Meja',
      treatAllSub: 'Bayar seluruh tagihan meja dalam satu pembayaran',
      treatButton: 'Bayar',
      jukeboxTitle: 'Bistro Smart Sound',
      jukeboxSub: 'Smart Jukebox Spotify',
      jukeboxDesc: 'Mainkan lagu piringan hitam pilihan Anda secara live di sound-system kafe kami. Masukkan kata kunci pencarian lagu dan klik request!',
      jukeboxPlaceholder: 'Ketik judul lagu atau penyanyi (Tulus, Kahitna...)',
      searchLabel: 'Mencari lagu di iTunes...',
      notFound: 'Lagu tidak ditemukan. Silakan gunakan judul lain!',
      jukeboxQueue: 'Antrean Lagu Kafe',
      jukeboxLiveSync: 'Live Sync',
      emptyQueue: 'Tidak ada lagu dalam antrean.',
      upvote: 'Upvote',
      payModalTitle: 'Pindai QRIS Billing',
      payModalSub: 'Melakukan pembayaran atas nama',
      payModalTotal: 'Jumlah yang harus di-transfer',
      cancel: 'Tutup Batalkan',
      confirmPaid: 'Konfirmasi Lunas',
      treatModalTitle: 'Pembayaran Tagihan Meja',
      treatModalDesc: 'Melunasi seluruh pembayaran hidangan meja ini.',
      treatModalSub: 'Total Tagihan Gabungan Se-Meja',
      successTitle: 'Status Pesanan',
      successSub: 'Terima kasih! Pesanan Anda sedang diproses oleh Kasir. Silakan tunjukkan layar ini ke kasir untuk pembayaran.',
      successQueueTitle: 'Status Playlist Kafe',
      successQueueDesc: 'Lagu Anda sedang mengantre di pemutar utama kafe!',
      repeatOrder: 'Ulangi Order / Pesan Hidangan Lain',
      emailReceiptPlaceholder: 'Masukkan alamat email Anda',
      emailReceiptSubmit: 'Kirim Nota',
      emailReceiptSuccess: 'Nota berhasil dikirim!',
      emailReceiptLabel: 'Kirim Struk Digital (Opsional)',
    },
    en: {
      back: 'Back',
      headerTitle: 'BILLING & JUKEBOX DETAIL',
      headerSub: 'Simple Table Billing',
      table: 'Table',
      unpaidGrandTotal: 'Unpaid Grand Total',
      groupBilling: 'Collective Table Billing',
      groupBillingSub: 'All dishes are combined into one order for this table',
      cartEmpty: 'Shopping cart is empty',
      cartEmptySub: 'Please select and order dishes from the home menu first.',
      paid: 'PAID',
      payOwn: 'Pay Table Bill',
      treatAll: 'Pay Table Bill',
      treatAllSub: 'Cover all unpaid bills at once in a single transaction',
      treatButton: 'Treat',
      jukeboxTitle: 'Bistro Smart Sound',
      jukeboxSub: 'Smart Jukebox Spotify',
      jukeboxDesc: 'Play your vinyl records of choice live on our cafe sound system. Enter search keyword and click request!',
      jukeboxPlaceholder: 'Type track title or artist name (Tulus, Kahitna...)',
      searchLabel: 'Searching tracks on iTunes...',
      notFound: 'Tracks not found. Please try another search!',
      jukeboxQueue: 'Cafe Music Queue',
      jukeboxLiveSync: 'Live Sync',
      emptyQueue: 'No songs in queue.',
      upvote: 'Upvote',
      payModalTitle: 'Scan QRIS Billing',
      payModalSub: 'Processing payment for',
      payModalTotal: 'Amount to Transfer',
      cancel: 'Close & Cancel',
      confirmPaid: 'Confirm Paid',
      treatModalTitle: 'Treat Table QRIS',
      treatModalDesc: 'Treating all pending dishes for XYZ simultaneously.',
      treatModalSub: 'Total Combined Table Bill',
      successTitle: 'Order Status',
      successSub: 'Thank you! Your order is being processed by the Cashier. Please show this screen to the cashier for payment.',
      successQueueTitle: 'Cafe Music Playlist Status',
      successQueueDesc: 'Your chosen song is now queued on the main player!',
      repeatOrder: 'Repeat Order / Order Another Dish',
      emailReceiptPlaceholder: 'Enter your email address',
      emailReceiptSubmit: 'Send Receipt',
      emailReceiptSuccess: 'Receipt successfully queued!',
      emailReceiptLabel: 'Send Digital Receipt (Optional)',
    }
  };

  const [customerName, setCustomerName] = useState('Pelanggan');
  const [tableNumber, setTableNumber] = useState<string>(() => {
    let saved = localStorage.getItem('scanbite_table') || '';
    if (!saved || saved === '-' || saved === '05' || saved === '0') {
      try {
        const localOrders = localStorage.getItem('scanbite_orders');
        if (localOrders) {
          const list = JSON.parse(localOrders);
          if (Array.isArray(list) && list.length > 0) {
            const latest = list[list.length - 1];
            if (latest && latest.table_number) {
              saved = latest.table_number.toString();
            }
          }
        }
      } catch (_) {}
    }
    if (!saved || saved === '-' || saved === '05' || saved === '0') {
      try {
        const tableDetails = localStorage.getItem('scanbite_tables_details');
        if (tableDetails) {
          const details = JSON.parse(tableDetails);
          if (Array.isArray(details) && details.length > 0) {
            const active = details.find(t => t.status !== 'KOSONG');
            if (active && active.nomor_meja_id) {
              saved = active.nomor_meja_id;
            }
          }
        }
      } catch (_) {}
    }
    const sanitized = saved ? saved.replace('Meja ', '').trim() : '';
    return (!sanitized || sanitized === '-' || sanitized === '00' || sanitized === '0') 
      ? (localStorage.getItem('scanbite_table') || '05').replace('Meja ', '').trim().padStart(2, '0') 
      : sanitized.padStart(2, '0');
  });
  const [supabaseTableData, setSupabaseTableData] = useState<any>(null);
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [pendingPaymentAction, setPendingPaymentAction] = useState<(() => void) | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<any | null>(null);
  const [cafeName] = useState(() => localStorage.getItem('scanbite_cafe_name') || 'ScanBite Bistro');
  const [bills, setBills] = useState<UserBill[]>(() => {
    return computeBillsFromCart(cart, MENU_ITEMS);
  });
  const [paymentModalUser, setPaymentModalUser] = useState<UserBill | null>(null);
  const [showTreatAllModal, setShowTreatAllModal] = useState(false);
  const [checkoutCompleted, setCheckoutCompleted] = useState<boolean>(() => {
    const savedCart = localStorage.getItem('scanbite_cart');
    let hasCartItems = false;
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          hasCartItems = true;
        }
      } catch (_) {}
    }
    if (hasCartItems) {
      localStorage.removeItem('scanbite_checkout_completed');
      localStorage.removeItem('scanbite_completed_order_details');
      return false;
    }
    return localStorage.getItem('scanbite_checkout_completed') === 'true';
  });
  const [completedOrderDetails, setCompletedOrderDetails] = useState<any>(() => {
    const savedCart = localStorage.getItem('scanbite_cart');
    let hasCartItems = false;
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          hasCartItems = true;
        }
      } catch (_) {}
    }
    if (hasCartItems) {
      return null;
    }
    const saved = localStorage.getItem('scanbite_completed_order_details');
    return saved ? JSON.parse(saved) : null;
  });
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Cash / Tunai Opsi Pembayaran states
  const [payMethod, setPayMethod] = useState<'qris' | 'cash'>('qris');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashInput, setCashInput] = useState<string>('');

  // Reset cash states when modal closes or opens or payment method transitions
  useEffect(() => {
    const activeTotal = paymentModalUser?.grandTotal || totalUnpaidGrandTotal || 0;
    if (payMethod === 'cash') {
      setCashAmount(activeTotal);
      setCashInput(activeTotal.toString());
    } else {
      setCashAmount(0);
      setCashInput('');
    }
  }, [paymentModalUser, showTreatAllModal, payMethod]);

  // Email Receipt state variables
  const [emailInput, setEmailInput] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(() => {
    return localStorage.getItem('scanbite_last_order_id') || null;
  });

  // Real-time order status tracking
  const [activeOrder, setActiveOrder] = useState<any>(null);

  const fetchActiveTableOrder = async () => {
    if (!supabase || !tableNumber) return;
    try {
      const cleanNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');
      let query = supabase.from('sb_orders').select('*');
      
      // Look up any active/uncompleted session order for this table first so that both users see the same live order!
      query = query
        .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
        .in('status', ['pending', 'preparing', 'ready', 'delivered'])
        .order('created_at', { ascending: false });
      
      const { data, error } = await query.limit(1);

      if (!error && data && data.length > 0) {
        setActiveOrder(data[0]);
        // Align on the same order ID for real-time split billing cooperation
        if (data[0].id && data[0].id !== lastOrderId) {
          setLastOrderId(data[0].id);
          localStorage.setItem('scanbite_last_order_id', data[0].id);
        }
      } else {
        // Fallback or read from local scanbite_orders cache for offline testability
        const localSaved = localStorage.getItem('scanbite_orders');
        if (localSaved) {
          const list = JSON.parse(localSaved);
          const actives = list.filter((o: any) => {
            const isMatchTable = o.table_number?.toString().replace('Meja ', '').trim() === cleanNum;
            const isMatchId = lastOrderId ? o.id === lastOrderId : true;
            return isMatchTable && isMatchId && ['pending', 'preparing', 'ready', 'delivered'].includes(o.status);
          });
          if (actives.length > 0) {
            setActiveOrder(actives[actives.length - 1]);
            return;
          }
        }
        setActiveOrder(null);
      }
    } catch (err) {
      console.warn('Error inside Checkout active order tracking:', err);
    }
  };

  useEffect(() => {
    fetchActiveTableOrder();

    if (!supabase || !tableNumber) return;

    const cleanTableNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');

    // BENAR: Dengarkan SEMUA perubahan di meja/sesi yang sama dengan filter table_number agar seluruh rekan semeja menerima update pembayaran
    const ordersSubscription = supabase.channel(`table-payment-${cleanTableNum}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'sb_orders',
        filter: `table_number=eq.${cleanTableNum}`
      }, (payload) => {
        console.log("⚡ [REALTIME UPDATE] Deteksi perubahan order/payment meja:", payload);
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
  }, [tableNumber, lastOrderId]);

  // Live table session status tracking
  const fetchSupabaseTableData = async () => {
    if (!supabase || !tableNumber) return;
    try {
      const cleanNum = tableNumber.replace('Meja ', '').trim().padStart(2, '0');
      const { data, error } = await supabase
        .from('sb_tables')
        .select('*')
        .or(`table_number.eq."Meja ${cleanNum}",table_number.eq."${cleanNum}"`)
        .maybeSingle();
      
      if (!error && data) {
        setSupabaseTableData(data);
      } else {
        setSupabaseTableData({ status: 'TERISI', table_number: tableNumber });
      }
    } catch (err) {
      console.warn('Error inside fetchSupabaseTableData checkout:', err);
    }
  };

  useEffect(() => {
    fetchSupabaseTableData();

    if (!supabase || !tableNumber) return;

    const tablesSubscription = supabase.channel('checkout-tables-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sb_tables' }, () => {
        fetchSupabaseTableData();
      })
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(tablesSubscription);
      }
    };
  }, [tableNumber]);

  // Ripple Animation click handlers
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  // Jukebox State
  const [jukeboxQueue, setJukeboxQueue] = useState<JukeboxTrack[]>([]);
  const [jukeboxSearch, setJukeboxSearch] = useState('');
  const [jukeboxManualTitle, setJukeboxManualTitle] = useState('');
  const [jukeboxManualArtist, setJukeboxManualArtist] = useState('');
  const [jukeboxNotification, setJukeboxNotification] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<JukeboxReceipt | null>(null);
  const [filteredSongs, setFilteredSongs] = useState<{ title: string; artist: string; duration: string; artworkUrl?: string; youtubeId?: string; spotifyUri?: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [jukeboxProvider, setJukeboxProvider] = useState<'spotify' | 'youtube'>('spotify');

  // Ref for auto-scroll Jukebox List
  const jukeboxListRef = useRef<HTMLDivElement>(null);

  // Trigger click ripple wave
  const handleButtonClickWithRipple = (e: React.MouseEvent<HTMLButtonElement | HTMLSpanElement>, callback: () => void) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { id: Date.now(), x, y };

    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 850);

    // Call actual process logic
    callback();
  };

  // 1. Ambil Sesi & Hitung Tagihan dari Supabase / State
  useEffect(() => {
    const savedName = localStorage.getItem('scanbite_customer_name') || 'Pelanggan';
    setCustomerName(savedName);
    
    let savedTable = localStorage.getItem('scanbite_table') || '';
    if (!savedTable || savedTable === '-' || savedTable === '05' || savedTable === '0') {
      try {
        const localOrders = localStorage.getItem('scanbite_orders');
        if (localOrders) {
          const list = JSON.parse(localOrders);
          if (Array.isArray(list) && list.length > 0) {
            const latest = list[list.length - 1];
            if (latest && latest.table_number) {
              savedTable = latest.table_number.toString();
            }
          }
        }
      } catch (_) {}
    }
    if (!savedTable || savedTable === '-' || savedTable === '05' || savedTable === '0') {
      try {
        const tableDetails = localStorage.getItem('scanbite_tables_details');
        if (tableDetails) {
          const details = JSON.parse(tableDetails);
          if (Array.isArray(details) && details.length > 0) {
            const active = details.find(t => t.status !== 'KOSONG');
            if (active && active.nomor_meja_id) {
              savedTable = active.nomor_meja_id;
            }
          }
        }
      } catch (_) {}
    }
    const sanitizedTable = (savedTable || localStorage.getItem('scanbite_table') || '05').replace('Meja ', '').trim();
    const finalTableNum = (!sanitizedTable || sanitizedTable === '-' || sanitizedTable === '00' || sanitizedTable === '0') ? '05' : sanitizedTable.padStart(2, '0');
    setTableNumber(finalTableNum);

    if (cart.length === 0) return;

    // Immediately pre-render using local cache (MENU_ITEMS) so there's absolutely NO blank screens during Supabase load
    const cachedBills = computeBillsFromCart(cart, MENU_ITEMS);
    setBills(cachedBills);

    // Ambil data menu asli untuk komputasi harga yang valid (mencegah manipulasi client)
    const fetchMenuAndCompute = async () => {
      try {
        let menuItems: any[] = [];
        if (supabase) {
          // 5s timeout Promise
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Koneksi Supabase timeout setelah 5000ms')), 5000)
          );

          try {
            const queryPromise = supabase.from('sb_menus').select('*');
            const response = await Promise.race([queryPromise, timeoutPromise]) as any;
            
            const { data, error } = response;
            if (!error && data && data.length > 0) {
              menuItems = data;
            } else {
              // fallback table nama 'menu_items' with 5s timeout
              const fallbackPromise = supabase.from('menu_items').select('*');
              const fallbackResponse = await Promise.race([fallbackPromise, timeoutPromise]) as any;
              
              if (fallbackResponse && fallbackResponse.data) {
                menuItems = fallbackResponse.data;
              }
            }
          } catch (raceErr: any) {
            console.warn('Database query timed out or failed in Checkout. Retaining local cache.', raceErr);
          }
        }

        // Fallback static jika data menu tidak ada di supabase
        if (menuItems.length === 0) {
          menuItems = MENU_ITEMS;
        }

        setBills(computeBillsFromCart(cart, menuItems));
      } catch (err: any) {
        console.warn('Silent fallback inside Checkout fetchMenuAndCompute:', err.message);
        // Fallback is already loaded as CachedBills on start, so we do not overwrite bills with empty
      }
    };

    fetchMenuAndCompute();
  }, [cart]);

  // 2. Jukebox Sync & Realtime Subscriptions
  const fetchJukeboxTracks = async () => {
    if (!supabase) {
      // Offline fallback jukebox
      const saved = localStorage.getItem('scanbite_jukebox_queue');
      if (saved) {
        setJukeboxQueue(JSON.parse(saved));
      } else {
        const offlineQueue: JukeboxTrack[] = [
          {
            id: '1',
            title: 'Kopi Dangdut',
            artist: 'Fahmy Shahab',
            requestedBy: 'Meja 05',
            votes: 6,
            duration: '3:45',
            isPlaying: true
          },
          {
            id: '2',
            title: 'Gajah',
            artist: 'Tulus',
            requestedBy: 'Meja 03',
            votes: 3,
            duration: '4:12',
            isPlaying: false
          }
        ];
        setJukeboxQueue(offlineQueue);
        localStorage.setItem('scanbite_jukebox_queue', JSON.stringify(offlineQueue));
      }
      return;
    }

    try {
      const activeTenant = localStorage.getItem('current_tenant') || 'scanbite_live';
      const { data, error } = await supabase
        .from('sb_song_requests')
        .select('*')
        .eq('tenant_id', activeTenant)
        .order('created_at', { ascending: true });
      
      if (!error && data) {
        const mappedTracks: JukeboxTrack[] = data.map((t: any, idx: number) => ({
          id: t.id,
          title: t.title || t.track_title,
          artist: t.artist || t.artist_name,
          requestedBy: t.nomor_meja || t.table_number || `Meja ${tableNumber}`,
          votes: Number(t.votes) || 1,
          duration: t.duration || '3:30',
          artworkUrl: t.artwork_url || t.image_url || '',
          youtubeId: t.youtube_id || '',
          spotifyUri: t.spotify_uri || '',
          isPlaying: t.status === 'played'
        }));

        // Sort queue: playing stays first, others sorted by votes down
        const isPlaying = mappedTracks.filter((t) => t.isPlaying);
        const remaining = mappedTracks.filter((t) => !t.isPlaying);
        remaining.sort((a, b) => b.votes - a.votes);

        setJukeboxQueue([...isPlaying, ...remaining]);
      }
    } catch (err: any) {
      console.warn('Realtime fetch error details: ', err.message);
    }
  };

  useEffect(() => {
    fetchJukeboxTracks();

    if (!supabase) return;

    // Realtime changes listener for live order + jukebox upvotes sync sekafe
    const liveSub = supabase.channel('jukebox-global-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sb_song_requests' }, () => {
        fetchJukeboxTracks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(liveSub);
    };
  }, [tableNumber]);

  // Auto Scroll logic when queue updates
  useEffect(() => {
    if (jukeboxListRef.current) {
      jukeboxListRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [jukeboxQueue]);

  // 3. Submit one collective table bill.
  const handlePayBill = async (userName: string) => {
    const userChange = payMethod === 'cash' ? Math.max(0, cashAmount - (paymentModalUser?.grandTotal || 0)) : 0;
    
    // Flag this user bill in main state
    setBills((prev) => 
      prev.map((b) => b.name === userName ? { 
        ...b, 
        isPaid: true,
        payMethod: payMethod,
        cashAmount: payMethod === 'cash' ? cashAmount : 0,
        changeAmount: userChange
      } : b)
    );
    setPaymentModalUser(null);
    
    const updatedBills = bills.map((b) => b.name === userName ? { 
      ...b, 
      isPaid: true,
      payMethod: payMethod,
      cashAmount: payMethod === 'cash' ? cashAmount : 0,
      changeAmount: userChange
    } : b);
    
    await registerCompletedOrder(updatedBills);
  };

  // 4. Legacy one-click full-table payment handler
  const handlePayAllBills = async () => {
    const totalVal = totalUnpaidGrandTotal;
    const userChange = payMethod === 'cash' ? Math.max(0, cashAmount - totalVal) : 0;

    // Mark ALL bills as paid simultaneously
    const updatedBills = bills.map((b) => ({ 
      ...b, 
      isPaid: true,
      payMethod: payMethod,
      cashAmount: payMethod === 'cash' ? cashAmount : 0,
      changeAmount: userChange
    }));
    setBills(updatedBills);
    setShowTreatAllModal(false);
    
    // Synchronize to Supabase immediately
    await registerCompletedOrder(updatedBills, customerName || 'Pelanggan');
  };

  const triggerPayBillConfirmation = (userBill: UserBill) => {
    const calculatedChange = payMethod === 'cash' ? Math.max(0, cashAmount - userBill.grandTotal) : 0;
    setPaymentSummary({
      tableNumber: tableNumber,
      items: userBill.items.map(i => ({ name: i.name, quantity: i.quantity, total: i.total })),
      totalAmount: userBill.grandTotal,
      label: `Pembayaran Tagihan Meja ${tableNumber}`,
      method: payMethod === 'qris' ? 'QRIS / E-Wallet' : `Tunai / Cash (Uang: ${formatPrice(cashAmount)}, Kembali: ${formatPrice(calculatedChange)})`
    });
    setPendingPaymentAction(() => () => {
      handlePayBill(userBill.name);
    });
    setShowPaymentConfirmModal(true);
  };

  const triggerPayAllBillsConfirmation = () => {
    const calculatedChange = payMethod === 'cash' ? Math.max(0, cashAmount - totalUnpaidGrandTotal) : 0;
    
    const allItems: any[] = [];
    bills.filter(b => !b.isPaid).forEach(b => {
      b.items.forEach(i => {
        const existing = allItems.find(x => x.name === i.name);
        if (existing) {
          existing.quantity += i.quantity;
          existing.total += i.total;
        } else {
          allItems.push({ name: i.name, quantity: i.quantity, total: i.total });
        }
      });
    });

    setPaymentSummary({
      tableNumber: tableNumber,
      items: allItems,
      totalAmount: totalUnpaidGrandTotal,
      label: `Pembayaran Tagihan Meja ${tableNumber}`,
      method: payMethod === 'qris' ? 'QRIS / E-Wallet' : `Tunai / Cash (Uang: ${formatPrice(cashAmount)}, Kembali: ${formatPrice(calculatedChange)})`
    });
    setPendingPaymentAction(() => () => {
      handlePayAllBills();
    });
    setShowPaymentConfirmModal(true);
  };

  /**
   * Fungsi placeholder untuk melakukan sinkronisasi data transaksi ke database cloud Supabase.
   * Dirancang khusus untuk diintegrasikan dengan Supabase client di masa mendatang.
   */
  async function syncToSupabase(dataTransaksi: any): Promise<boolean> {
    try {
      if (!supabase) {
        console.warn('⚠️ Client Supabase belum terkonfigurasi atau tidak aktif.');
        return false;
      }

      // Payload Sanitization & Standard English Column Mapping
      let cleanTableNumber = (dataTransaksi.table_number || '').toString().replace('Meja ', '').trim();
      if (!cleanTableNumber || cleanTableNumber === '-' || cleanTableNumber === '00' || cleanTableNumber === '0') {
        cleanTableNumber = '05';
      } else {
        cleanTableNumber = cleanTableNumber.padStart(2, '0');
      }
      const cleanCustomerName = dataTransaksi.customer_name || 'Pelanggan';
      
      const rawItems = dataTransaksi.items || [];
      const mappedItems = rawItems.map((it: any) => ({
        item_name: it.name || '',
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        ordered_by: it.orderedBy || it.ordered_by || cleanCustomerName
      }));

      // Final Payload with null checks and dynamic payment method
      const finalPayload = {
        id: dataTransaksi.id,
        table_number: cleanTableNumber,
        customer_name: cleanCustomerName,
        total_price: Number(dataTransaksi.total_price) || 0,
        payment_method: dataTransaksi.payment_method, // Dynamic from state via dataTransaksi
        status: 'pending',
        order_items: mappedItems,
        song_title: dataTransaksi.song_title || null
      };

      // Null check before sending to prevent Bad Request
      if (!finalPayload.table_number || !finalPayload.customer_name || finalPayload.total_price <= 0) {
        console.warn('❌ Pelanggaran integritas data: Payload pesanan tidak lengkap.', finalPayload);
        return false;
      }

      console.log('🔄 Sinkronisasi cloud Supabase (English-Standard Schema):', finalPayload.id);

      const { data: insertedOrder, error } = await supabase
        .from('sb_orders')
        .insert([finalPayload])
        .select();

      if (error) {
        console.error('❌ Supabase insert error:', error.message);
        throw error;
      }

      console.log('✅ Sinkronisasi checkout berhasil.');
      await supabase
        .from('sb_tables')
        .update({ status: 'TERISI', session_id: null, nama_pelanggan: cleanCustomerName })
        .or(`table_number.eq."Meja ${cleanTableNumber}",table_number.eq."${cleanTableNumber}"`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('scanbite-sync'));
      }

      // Update status transaksi di IndexedDB lokal menjadi 'synced'
      try {
        const request = indexedDB.open('scanbite_db', 1);
        request.onsuccess = (event: any) => {
          const db = event.target.result;
          if (db.objectStoreNames.contains('transaksi')) {
            const tx = db.transaction('transaksi', 'readwrite');
            const store = tx.objectStore('transaksi');
            const getReq = store.get(dataTransaksi.id);
            getReq.onsuccess = () => {
              const currentRecord = getReq.result;
              if (currentRecord) {
                currentRecord.sync_status = 'synced';
                currentRecord.status = 'synced';
                store.put(currentRecord);
              }
            };
          }
        };
      } catch (idbErr) {
        console.error('⚠️ IndexedDB error:', idbErr);
      }

      return true;
    } catch (err: any) {
      console.error('❌ Gagal sinkronisasi data transaksi ke Supabase:', err);
      return false;
    }
  }

  // 1. FUNGSI PRINT TRIGGER (window.print() with backup/manual triggers)
  const handlePrintReceipt = (orderData: any, settings: any) => {
    // Safety check to prevent blank receipt/crash if data is not loaded yet
    if (!orderData || !orderData.items || orderData.items.length === 0) {
      console.warn('Cannot print receipt: orderData or items are missing');
      return;
    }
    
    console.log('Printing receipt automatically/manually for:', orderData.id, settings?.cafe_name);
    try {
      setTimeout(() => {
        window.print();
      }, 250);
    } catch (e) {
      console.warn('Printer connection or iframe restrictions blocked standard trigger:', e);
    }
  };

  // Helper function to insert verified order details into database (Supabase or Local)
  const registerCompletedOrder = async (finalBillsState: UserBill[], nameOverrider?: string) => {
    setIsSubmittingOrder(true);
    try {
      const totalOrderValue = finalBillsState.reduce((sum, b) => sum + b.grandTotal, 0);

      const cashPayments = finalBillsState.filter(b => b.isPaid && b.payMethod === 'cash');
      const qrisPayments = finalBillsState.filter(b => b.isPaid && b.payMethod === 'qris');
      
      let customerNameSummary = nameOverrider || customerName || 'Pelanggan';
      let overallPayMethod = payMethod;
      
      if (cashPayments.length > 0 && qrisPayments.length > 0) {
        const cashDetails = cashPayments.map(b => `Kembali Rp ${b.changeAmount?.toLocaleString('id-ID')}`).join(', ');
        customerNameSummary = `${customerNameSummary} (${cashDetails})`;
        overallPayMethod = 'cash';
      } else if (cashPayments.length > 0) {
        const cashDetails = cashPayments.map(b => `Kembali Rp ${b.changeAmount?.toLocaleString('id-ID')}`).join(', ');
        customerNameSummary = `${customerNameSummary} (${cashDetails})`;
        overallPayMethod = 'cash';
      } else if (qrisPayments.length > 0) {
        customerNameSummary = `${customerNameSummary} (QRIS)`;
        overallPayMethod = 'qris';
      }

      const generatedId = `ord-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const dataTransaksi = {
        id: generatedId,
        table_number: tableNumber,
        customer_name: customerNameSummary,
        payment_method: overallPayMethod,
        items: finalBillsState.flatMap(b => {
          const detailPayStr = b.payMethod === 'cash' 
            ? `Tunai (Kembali Rp ${b.changeAmount?.toLocaleString('id-ID')})` 
            : `QRIS`;
          return b.items.map(it => ({ 
            name: it.name, 
            price: it.price, 
            quantity: it.quantity, 
            orderedBy: `${customerName || 'Pelanggan'} (${detailPayStr})` 
          }));
        }),
        total_price: totalOrderValue,
        song_title: activeReceipt?.trackTitle ? activeReceipt.trackTitle.trim() : null,
        status: 'pending' as const,
        sync_status: 'pending' as 'pending' | 'synced',
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        created_at: new Date().toISOString()
      };

      // Tulis langsung ke localStorage (Persistence layer lokal)
      const saved = localStorage.getItem('scanbite_orders');
      const currentList = saved ? JSON.parse(saved) : [];
      currentList.push(dataTransaksi);
      localStorage.setItem('scanbite_orders', JSON.stringify(currentList));

      // Ambil store settings untuk dynamic header café name
      const storeSettings = {
        cafe_name: localStorage.getItem('scanbite_cafe_name') || 'ScanBite Bistro & Cafe'
      };

      // Set state detail transaksi lengkap termasuk info cash/kembalian untuk printer struk & modal
      const parsedPaid = overallPayMethod === 'qris' ? totalOrderValue : (cashAmount || totalOrderValue);
      const parsedChange = overallPayMethod === 'qris' ? 0 : Math.max(0, parsedPaid - totalOrderValue);

      const totalSubtotal = finalBillsState.reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.total, 0), 0);
      const taxRate = Number(localStorage.getItem('scanbite_tax_percent') || '10') / 100;
      const serviceRate = Number(localStorage.getItem('scanbite_service_charge_percent') || '5') / 100;
      const totalTax = Math.round(totalSubtotal * taxRate);
      const totalService = Math.round(totalSubtotal * serviceRate);

      const completeOrderInfo = {
        ...dataTransaksi,
        payment_method: overallPayMethod,
        payment_method_label: overallPayMethod === 'qris' ? 'QRIS / E-Wallet' : 'Tunai / Cash',
        amountPaid: parsedPaid,
        changeAmount: parsedChange,
        splitBills: [],
        tax: totalTax,
        service: totalService,
        table_status: supabaseTableData?.status || 'TERISI'
      };

      setCompletedOrderDetails(completeOrderInfo);
      localStorage.setItem('scanbite_completed_order_details', JSON.stringify(completeOrderInfo));

      // Update state screen checkout
      setLastOrderId(generatedId);
      localStorage.setItem('scanbite_last_order_id', generatedId);
      
      setCheckoutCompleted(true);
      localStorage.setItem('scanbite_checkout_completed', 'true');

      // Clear the active customer cart
      if (typeof setCart === 'function') {
        setCart([]);
      }
      localStorage.removeItem('scanbite_cart');

      console.log(`💾 [Offline-First] Transaksi ${generatedId} berhasil diamankan di lokal dengan sync_status: pending.`);

      // 2. Hubungi/Picu proses sinkronisasi cloud secara asinkron (Cloud-Sync)
      try {
        const isSynced = await syncToSupabase(dataTransaksi);
        if (isSynced) {
          // 4. Jika sukses sinkronisasi ke cloud, ubah `sync_status` dari 'pending' menjadi 'synced'
          const savedList = localStorage.getItem('scanbite_orders');
          if (savedList) {
            const parsed = JSON.parse(savedList);
            const updated = parsed.map((o: any) => 
              o.id === generatedId ? { ...o, sync_status: 'synced' } : o
            );
            localStorage.setItem('scanbite_orders', JSON.stringify(updated));
            console.log(`✅ [Cloud-Sync] Transaksi ${generatedId} berstatus sinkron cloud: 'synced'`);
          }
        }
      } catch (syncErr: any) {
        console.warn('⚠️ Gagal sinkronisasi otomatis ke cloud. Data tersimpan lokal (Offline-First):', syncErr.message);
      }

    } catch (err: any) {
      setDbError(err.message || 'Gagal meregistrasi pesanan transaksi.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsSavingEmail(true);
    try {
      if (supabase && lastOrderId) {
        const { error } = await supabase
          .from('sb_orders')
          .update({ customer_email: emailInput })
          .eq('id', lastOrderId);
        
        if (error) {
          // Fallback if customer_email doesn't exist
          await supabase
            .from('sb_orders')
            .update({ email: emailInput })
            .eq('id', lastOrderId);
        }
      }
      localStorage.setItem(`email_receipt_${lastOrderId || 'offline'}`, emailInput);
      setEmailSaved(true);
    } catch (err: any) {
      console.warn('Silent email save: ', err.message);
      setEmailSaved(true); // Treat as saved for smooth UI
    } finally {
      setIsSavingEmail(false);
    }
  };

  // 5. Request Lagu Jukebox
  const handleRequestSong = async (song: { title: string; artist: string; duration: string; artworkUrl?: string; youtubeId?: string; spotifyUri?: string }) => {
    const trxId = `JB-${Math.floor(100000 + Math.random() * 900000)}`;
    const requestTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!supabase) {
      console.warn("Koneksi database Supabase tidak ditemukan! Menjalankan simulasi antrean lagu.");
      const saved = localStorage.getItem('scanbite_jukebox_queue');
      const currentQueue = saved ? JSON.parse(saved) : [];
      const newTrack: JukeboxTrack = {
        id: `offline-${Math.random()}`,
        title: song.title,
        artist: song.artist,
        requestedBy: `Meja ${tableNumber || '05'}`,
        votes: 1,
        duration: song.duration,
        isPlaying: currentQueue.length === 0,
        artworkUrl: song.artworkUrl || '',
        youtubeId: song.youtubeId || '',
        spotifyUri: song.spotifyUri || ''
      };
      const updatedQueue = [...currentQueue, newTrack];
      
      const isPlaying = updatedQueue.filter((t) => t.isPlaying);
      const remaining = updatedQueue.filter((t) => !t.isPlaying);
      remaining.sort((a, b) => b.votes - a.votes);
      const finalQueue = [...isPlaying, ...remaining];

      setJukeboxQueue(finalQueue);
      localStorage.setItem('scanbite_jukebox_queue', JSON.stringify(finalQueue));
      setJukeboxSearch('');
      setJukeboxNotification(`🎵 Lagu berhasil masuk antrean kafe!`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('scanbite-sync'));
      }
      setTimeout(() => setJukeboxNotification(null), 3500);
      return;
    }

    try {
      const activeTenant = localStorage.getItem('current_tenant') || 'scanbite_live';
      const payload = {
        title: song.title,
        artist: song.artist,
        table_number: tableNumber || '05',
        tenant_id: activeTenant,
        duration: song.duration || '3:30',
        artwork_url: song.artworkUrl || '',
        youtube_id: song.youtubeId || '',
        spotify_uri: song.spotifyUri || ''
      };
      console.log("🔍 [AUDIT JUKEBOX INSERT Checkout] Mengirim payload ke Supabase:", payload);

      const { data, error } = await supabase
        .from('sb_song_requests')
        .insert([payload])
        .select();

      if (error) {
        console.error("❌ [AUDIT JUKEBOX INSERT Checkout ERROR] Gagal melakukan insert:", error);
        throw new Error(error.message);
      } else {
        console.log("✅ [AUDIT JUKEBOX INSERT Checkout SUCCESS] Berhasil tersimpan di Supabase:", data);
      }

      await fetchJukeboxTracks();
      setJukeboxSearch('');
      setJukeboxNotification(`🎵 Lagu berhasil masuk antrean kafe!`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('scanbite-sync'));
      }

      // Set Receipt Info for Export
      setActiveReceipt({
        trackTitle: song.title,
        artistName: song.artist,
        tableNumber: tableNumber,
        requestTime,
        status: 'Dalam Antrean Kafe',
        trxId
      });

      setTimeout(() => setJukeboxNotification(null), 3500);
    } catch (err: any) {
      console.error("Error inserting song request to Supabase table:", err);
      const errorMessage = err.message || '';
      const isFetchError = errorMessage.includes('Failed to fetch') || err.name === 'TypeError' || errorMessage.toLowerCase().includes('fetch');

      if (isFetchError) {
        // Safe Offline fallback gracefully to prevent breaking flow
        console.warn('CORS or Network drop blocked Supabase outbound connections. Falling back to simulated live sync...');
        const saved = localStorage.getItem('scanbite_jukebox_queue');
        const currentQueue = saved ? JSON.parse(saved) : [];
        const newTrack: JukeboxTrack = {
          id: `offline-${Math.random()}`,
          title: song.title,
          artist: song.artist,
          requestedBy: `Meja ${tableNumber || '05'}`,
          votes: 1,
          duration: song.duration,
          isPlaying: currentQueue.length === 0
        };
        const updatedQueue = [...currentQueue, newTrack];

        const isPlaying = updatedQueue.filter((t) => t.isPlaying);
        const remaining = updatedQueue.filter((t) => !t.isPlaying);
        remaining.sort((a, b) => b.votes - a.votes);
        const finalQueue = [...isPlaying, ...remaining];

        setJukeboxQueue(finalQueue);
        localStorage.setItem('scanbite_jukebox_queue', JSON.stringify(finalQueue));
        setJukeboxSearch('');
        setJukeboxNotification(`🎵 Lagu berhasil masuk antrean kafe!`);

        // Set Receipt Info for Export
        setActiveReceipt({
          trackTitle: song.title,
          artistName: song.artist,
          tableNumber: tableNumber,
          requestTime,
          status: 'Dalam Antrean Kafe',
          trxId
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scanbite-sync'));
        }

        setTimeout(() => setJukeboxNotification(null), 3500);
      } else {
        setJukeboxNotification(`❌ Gagal request lagu: ${err.message || 'Error koneksi'}`);
        setTimeout(() => setJukeboxNotification(null), 4000);
      }
    }
  };

  // Upvote Jukebox track
  const handleVoteSong = async (trackId: string) => {
    if (supabase) {
      try {
        // Increment votes counter in DB sb_song_requests
        const match = jukeboxQueue.find(t => t.id === trackId);
        if (match) {
          const { error } = await supabase
            .from('sb_song_requests')
            .update({ votes: (match.votes || 1) + 1 })
            .eq('id', trackId);

          if (error) throw error;
          await fetchJukeboxTracks();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('scanbite-sync'));
          }
        }
      } catch (err: any) {
        console.warn('Voting error: ', err.message);
      }
    } else {
      setJukeboxQueue((prev) => {
        const updated = prev.map((t) => 
          t.id === trackId ? { ...t, votes: t.votes + 1 } : t
        );
        const isPlaying = updated.filter((t) => t.isPlaying);
        const remaining = updated.filter((t) => !t.isPlaying);
        remaining.sort((a, b) => b.votes - a.votes);
        const finalQueue = [...isPlaying, ...remaining];
        localStorage.setItem('scanbite_jukebox_queue', JSON.stringify(finalQueue));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scanbite-sync'));
        }
        return finalQueue;
      });
    }
  };

  // Export receipt as text file dowload
  const handleDownloadReceipt = (receipt: JukeboxReceipt) => {
    const textLines = [
      "==========================================",
      "             SCANBITE SMART KAFE          ",
      "           STRUK DIGITAL REQUEST          ",
      "==========================================",
      `ID Transaksi : ${receipt.trxId}`,
      `Waktu Cetak  : ${receipt.requestTime}`,
      `No. Meja     : Meja ${receipt.tableNumber}`,
      "------------------------------------------",
      `Judul Lagu   : ${receipt.trackTitle}`,
      `Artis        : ${receipt.artistName}`,
      "------------------------------------------",
      `Status       : ${receipt.status}`,
      `Akses        : Smart Jukebox Player`,
      "------------------------------------------",
      "      Terima kasih memeriahkan suasana!   ",
      "   Lagu Anda otomatis mengantre di audio  ",
      "=========================================="
    ].join('\n');

    const blob = new Blob([textLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Struk_Jukebox_${receipt.trackTitle.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleResetOrder = () => {
    localStorage.removeItem('scanbite_cart');
    localStorage.removeItem('scanbite_checkout_completed');
    localStorage.removeItem('scanbite_last_order_id');
    localStorage.removeItem('scanbite_completed_order_details');
    setCart([]);
    setCheckoutCompleted(false);
    setLastOrderId(null);
    setCompletedOrderDetails(null);
    onNavigate('menu');
  };

  const handleResetCustomerSession = () => {
    // 🧼 Bersihkan semua sampah data meja dan nama pelanggan yang tersangkut
    localStorage.removeItem('customer_name');
    localStorage.removeItem('customer_table');
    localStorage.removeItem('nomor_meja');
    localStorage.removeItem('table_id');
    localStorage.removeItem('scanbite_customer_name');
    localStorage.removeItem('scanbite_table');
    localStorage.removeItem('scanbite_session_id');
    localStorage.removeItem('scanbite_orders');
    localStorage.removeItem('scanbite_tables');
    localStorage.removeItem('scanbite_cart');
    localStorage.removeItem('scanbite_checkout_completed');
    localStorage.removeItem('scanbite_last_order_id');
    localStorage.removeItem('scanbite_completed_order_details');
    
    sessionStorage.clear();
    setCart([]);
    setCheckoutCompleted(false);
    setLastOrderId(null);
    setCompletedOrderDetails(null);
    
    onNavigate('menu');
    
    // 🚀 Paksa stay di rute menu dengan session kosong untuk form input
    window.location.href = window.location.origin + '/menu';
  };

  // 6. Online Jukebox Realtime API Proxy Search on input or provider change (Debounced: 500ms)
  useEffect(() => {
    if (!jukeboxSearch.trim()) {
      setFilteredSongs([]);
      return;
    }

    setIsSearching(true);
    const delayTimer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/jukebox/search?q=${encodeURIComponent(jukeboxSearch)}&provider=${jukeboxProvider}`
        );
        
        let data: any = null;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            data = await response.json();
          }
        } catch (_) {}

        if (data && data.results) {
          setFilteredSongs(data.results);
        } else {
          setFilteredSongs([]);
        }
      } catch (err) {
        // Silenced fallback to avoid polluting the developer terminal console log outputs
        // console.warn('Jukebox Core API Proxy Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayTimer);
  }, [jukeboxSearch, jukeboxProvider]);

  const unpaidBills = bills.filter((b) => !b.isPaid);
  const totalUnpaidGrandTotal = unpaidBills.reduce((sum, b) => sum + b.grandTotal, 0);

  return (
    <div className="min-h-screen h-auto bg-[#FDFBF7] text-[#2C2520] font-sans antialiased pb-[150px] relative">
      
      {/* Custom CSS for actual water wave click ripple effect and printer formatting */}
      <style>{`
        @keyframes ripple-wave {
          0% {
            transform: scale(0);
            opacity: 0.8;
          }
          100% {
            transform: scale(4);
            opacity: 0;
          }
        }
        .animate-ripple {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.45);
          pointer-events: none;
          animation: ripple-wave 0.85s ease-out forwards;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }
          #receipt-print-area, #receipt-print-area * {
            visibility: visible !important;
          }
          #receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 58mm;
            padding: 2mm;
            font-family: 'Courier New', Courier, monospace;
            font-size: 10px;
            color: #000000;
            line-height: 1.3;
            background-color: #ffffff;
            margin: 0;
          }
          /* Ensure headers/footers/margins set by browsers print-job don't block the layout */
          @page {
            size: auto;
            margin: 0mm;
          }
        }
        @media screen {
          #receipt-print-area {
            display: none !important;
          }
        }
      `}</style>

      {/* RIPPLE CONTAINER OVERLAY ON SCREEN (Optionally displays active click indicators) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-40">
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="animate-ripple"
            style={{
              left: ripple.x - 20,
              top: ripple.y - 20,
              width: '40px',
              height: '40px',
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="bg-white border-b border-[#F1EADF] px-4 py-4.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button 
            type="button"
            onClick={() => onNavigate('menu')} 
            className="flex items-center gap-1.5 text-xs font-black text-[#8C6239] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t[lang].back}</span>
          </button>
          <div className="text-center">
            <h2 className="text-xs font-black text-[#1C1612] uppercase tracking-widest">{t[lang].headerTitle}</h2>
            <p className="text-[10px] text-[#9E8775] font-bold">{t[lang].headerSub}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center bg-gray-100 rounded-xl p-0.5 border border-[#FAF2E8] shrink-0">
              <button
                type="button"
                onClick={() => changeLang('id')}
                className={`text-[9.5px] px-2.5 py-1.5 rounded-lg font-black transition-all ${
                  lang === 'id' 
                    ? 'bg-[#8C6239] text-[#FDFBF7] shadow-3xs' 
                    : 'text-[#5B4E44] hover:bg-gray-200/60'
                }`}
              >
                ID
              </button>
              <button
                type="button"
                onClick={() => changeLang('en')}
                className={`text-[9.5px] px-2.5 py-1.5 rounded-lg font-black transition-all ${
                  lang === 'en' 
                    ? 'bg-[#8C6239] text-[#FDFBF7] shadow-3xs' 
                    : 'text-[#5B4E44] hover:bg-gray-200/60'
                }`}
              >
                EN
              </button>
            </div>
            <span className="text-xs bg-[#8C6239] text-[#FDFBF7] px-3 py-1 rounded-xl font-black">
              {t[lang].table} {tableNumber} {supabaseTableData ? `(${supabaseTableData.status})` : ''}
            </span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-2xl mx-auto px-4 mt-6 space-y-6">
        
        {dbError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dbError}</span>
          </div>
        )}

        {/* SECTION 1: SPLIT BILL VIEW */}
        <div className="bg-white rounded-3xl p-5 border border-[#EBE3D5] shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#FAF8F5]">
            <div className="w-9 h-9 rounded-xl bg-[#8C6239]/10 text-[#8C6239] flex items-center justify-center">
              <Users className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-extrabold text-[#1C1612] text-sm">{t[lang].groupBilling}</h3>
              <p className="text-[10px] text-[#9E8775] font-semibold">{t[lang].groupBillingSub}</p>
            </div>
          </div>

          {/* GLOBAL PAYMENT METHOD SELECTOR UTAMA */}
          {bills.length > 0 && (
            <div className="bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl p-4 space-y-2 animate-fadeIn">
              <span className="text-[10px] uppercase font-black text-[#8C6239] tracking-wider block">PILIH METODE PEMBAYARAN UTAMA</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayMethod('qris')}
                  className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all cursor-pointer text-xs font-bold font-sans ${
                    payMethod === 'qris'
                      ? 'bg-[#8C6239] text-[#FDFBF7] border-[#8C6239] shadow-sm'
                      : 'bg-white text-[#5B4E44] border-[#EBE3D5] hover:bg-gray-50'
                  }`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span>E-Wallet / QRIS Digital</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod('cash')}
                  className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-bold font-sans ${
                    payMethod === 'cash'
                      ? 'bg-[#8C6239] text-[#FDFBF7] border-[#8C6239] shadow-sm'
                      : 'bg-white text-[#5B4E44] border-[#EBE3D5] hover:bg-gray-50'
                  }`}
                >
                  <span className="text-sm">💵</span>
                  <span>Uang Tunai / Cash</span>
                </button>
              </div>
            </div>
          )}

          {bills.length === 0 ? (
            <div className="p-8 text-center text-[#9E8775]">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-xs font-bold text-[#2C2520]">{t[lang].cartEmpty}</p>
              <p className="text-[11px] mt-1">{t[lang].cartEmptySub}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bills.map((userBill, uIdx) => (
                <div 
                  key={uIdx} 
                  className={`border rounded-2xl p-4 transition-all relative overflow-hidden ${
                    userBill.isPaid 
                      ? 'bg-emerald-50/40 border-emerald-200' 
                      : 'bg-[#FAF8F5] border-[#EBE3D5]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${userBill.isPaid ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <h4 className="font-extrabold text-[#1C1612] text-xs uppercase tracking-wider">Tagihan Meja {tableNumber}</h4>
                    </div>
                    {userBill.isPaid ? (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-3xs">
                        ✓ {t[lang].paid}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleButtonClickWithRipple(e, () => setPaymentModalUser(userBill))}
                        className="relative overflow-hidden bg-[#8C6239] text-[#FDFBF7] text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-xl flex items-center gap-1 shadow-xs transition-colors hover:bg-[#724f2b]"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{t[lang].payOwn}</span>
                      </button>
                    )}
                  </div>

                  {/* List breakdown */}
                  <div className="space-y-2 pt-2.5 border-t border-dashed border-[#FAF2E8]">
                    {userBill.items.map((item, iIdx) => (
                      <div key={iIdx} className="flex justify-between text-xs text-[#5B4E44]">
                        <span className="font-medium">{item.name} <strong className="text-[#8C6239] font-bold">x{item.quantity}</strong></span>
                        <span className="font-mono text-[11px]">{formatPrice(item.total)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#FAF2E8] flex items-center justify-between text-[11px]">
                    <span className="text-gray-400 font-medium">
                      Subtotal {formatPrice(userBill.subtotal)} + Pajak ({Number(localStorage.getItem('scanbite_tax_percent') || '10') + Number(localStorage.getItem('scanbite_service_charge_percent') || '5')}%)
                    </span>
                    <span className="font-extrabold text-[#2C2520]">
                      Total: {formatPrice(userBill.grandTotal)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Hidden for normal flow: checkout is now one collective bill. */}
              {unpaidBills.length > 1 && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4.5 mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-3xs relative overflow-hidden transition-all hover:bg-amber-50/95">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#8C6239]/10 text-[#8C6239] flex items-center justify-center border border-[#8C6239]/20">
                      <Gift className="w-5 h-5 text-[#8C6239]" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider">{t[lang].treatAll}</h4>
                      <p className="text-[10px] text-[#9E8775] font-semibold">{t[lang].treatAllSub}</p>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={(e) => handleButtonClickWithRipple(e, () => setShowTreatAllModal(true))}
                    className="relative overflow-hidden w-full sm:w-auto bg-[#8C6239] hover:bg-[#724f2b] text-white text-[11px] font-black uppercase tracking-widest px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
                  >
                    <Gift className="w-4 h-4 text-amber-300 animate-pulse" />
                    <span>{t[lang].treatButton} {formatPrice(totalUnpaidGrandTotal)}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 2: DIGITAL JUKEBOX SUITE */}
        {cart.length > 0 && (
          <div className="bg-[#1D1713] text-[#FDFBF7] rounded-3xl p-5 border border-white/5 shadow-xl space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-widest">Bistro Smart Sound</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <h3 className="font-extrabold text-xs text-white">Smart Jukebox Spotify</h3>
                </div>
              </div>
              <Volume2 className="w-4.5 h-4.5 text-amber-500/70 animate-pulse" />
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Mainkan lagu piringan hitam pilihan Anda secara live di sound-system kafe kami. Ketik judul lagu dan nama penyanyinya di bawah!
            </p>

            {/* Form Manual Jukebox */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wider mb-1">Judul Lagu</label>
                  <input
                    type="text"
                    placeholder="Contoh: Kopi Dangdut, Gajah"
                    value={jukeboxManualTitle}
                    onChange={(e) => setJukeboxManualTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs font-semibold placeholder-gray-500 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wider mb-1">Penyanyi / Band</label>
                  <input
                    type="text"
                    placeholder="Contoh: Tulus, Fahmy Shahab"
                    value={jukeboxManualArtist}
                    onChange={(e) => setJukeboxManualArtist(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs font-semibold placeholder-gray-500 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (!jukeboxManualTitle.trim()) {
                    setJukeboxNotification('❌ Harap isi judul lagu terlebih dahulu!');
                    setTimeout(() => setJukeboxNotification(null), 3500);
                    return;
                  }
                  const tVal = jukeboxManualTitle.trim();
                  const aVal = jukeboxManualArtist.trim() || 'No Artist';
                  await handleRequestSong({ title: tVal, artist: aVal, duration: '3:30' });
                  setJukeboxManualTitle('');
                  setJukeboxManualArtist('');
                }}
                className="w-full bg-amber-500 hover:bg-amber-600 text-[#1C1612] font-black uppercase text-[11px] tracking-widest py-3 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <Music className="w-4 h-4" />
                <span>Kirim Request Lagu</span>
              </button>

              {jukeboxNotification && (
                <p className="text-xs text-emerald-400 italic font-bold tracking-wide animate-pulse text-center">
                  {jukeboxNotification}
                </p>
              )}
            </div>

            {/* List Queue Jukebox with auto-scroll ref */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                <span>Antrean Lagu Kafe</span>
                <span className="text-amber-500 text-[10px] font-black tracking-widest uppercase">Live Sync</span>
              </div>

              {/* Scrollable track queue box */}
              <div 
                ref={jukeboxListRef}
                className="bg-white/5 border border-white/5 rounded-2xl divide-y divide-white/5 max-h-56 overflow-y-auto scrollbar-thin"
              >
                {jukeboxQueue.length === 0 ? (
                  <p className="p-4 text-center text-xs text-gray-500 italic">Tidak ada lagu dalam antrean.</p>
                ) : (
                  jukeboxQueue.map((track, tIdx) => (
                    <div key={track.id} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {track.isPlaying ? (
                          <div className="flex items-end gap-0.5 h-4.5" title="Sedang diputar">
                            <span className="w-0.5 bg-amber-500 h-2.5 animate-[pulse_1s_infinite_ease-in-out]" />
                            <span className="w-0.5 bg-amber-500 h-4 animate-[pulse_0.7s_infinite_ease-in-out_0.2s]" />
                            <span className="w-0.5 bg-amber-500 h-1.5 animate-[pulse_0.5s_infinite_ease-in-out_0.1s]" />
                            <span className="w-0.5 bg-amber-500 h-3 animate-[pulse_0.8s_infinite_ease-in-out_0.3s]" />
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500 font-mono w-4">{tIdx + 1}</span>
                        )}

                        <div className="min-w-0">
                          <p className="text-xs font-black truncate text-white flex items-center gap-1.5">
                            {track.title}
                            {track.isPlaying && <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 rounded font-black">PLAYING</span>}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">{track.artist} • <span className="text-amber-500 font-semibold">{track.requestedBy}</span></p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-gray-400 pr-1">{track.duration}</span>
                        {!track.isPlaying && (
                          <button
                            type="button"
                            onClick={() => handleVoteSong(track.id)}
                            className="bg-white/10 hover:bg-white/15 text-white text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <Vote className="w-3.5 h-3.5 text-amber-500" />
                            <span>{track.votes} Upvote</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* QRIS PEMBAYARAN BOX MODAL */}
      {paymentModalUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 border border-[#F1EADF] shadow-2xl text-center space-y-4">
            
            <div className="flex justify-between items-center pb-2 border-b border-[#FAF8F5]">
              <span className="text-xs font-black text-[#8C6239] uppercase tracking-wide font-sans">
                {payMethod === 'qris' ? 'Pindai QRIS Billing' : 'Pembayaran Pembelian Tunai'}
              </span>
              <button 
                type="button"
                onClick={() => setPaymentModalUser(null)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <p className="text-xs text-[#786455] leading-relaxed">
              Melakukan pembayaran untuk <strong className="text-[#8C6239] font-black uppercase">Meja {tableNumber}</strong>
            </p>

            {/* Opsi Metode Pembayaran (Tabs) */}
            <div className="grid grid-cols-2 gap-2 bg-[#FAF8F5] p-1 rounded-xl border border-[#EBE3D5] text-xs font-bold mb-3">
              <button
                type="button"
                onClick={() => setPayMethod('qris')}
                className={`py-2 rounded-lg transition-all ${
                  payMethod === 'qris'
                    ? 'bg-[#8C6239] text-white shadow-sm'
                    : 'text-[#5B4E44] hover:bg-gray-150'
                }`}
              >
                QRIS / E-Wallet
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMethod('cash');
                  const totalVal = paymentModalUser.grandTotal;
                  setCashAmount(totalVal);
                  setCashInput(totalVal.toString());
                }}
                className={`py-2 rounded-lg transition-all ${
                  payMethod === 'cash'
                    ? 'bg-[#8C6239] text-white shadow-sm'
                    : 'text-[#5B4E44] hover:bg-gray-150'
                }`}
              >
                Tunai / Cash
              </button>
            </div>

            {payMethod === 'qris' ? (
              <>
                {/* QRIS Code box */}
                <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-[#EBE3D5] inline-block shadow-inner mx-auto w-full">
                  <div className="relative w-44 h-44 bg-white border border-[#EBE3D5] rounded-xl flex items-center justify-center p-2 mx-auto shadow-xs">
                    {/* Simulated QR Code blocks */}
                    <div className="grid grid-cols-5 gap-1.5 w-full h-full opacity-85">
                      {Array.from({ length: 25 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`rounded-xs ${
                            i % 4 === 0 || i < 4 || (i > 15 && i < 20) ? 'bg-[#2C2520]' : 'bg-gray-150'
                          }`} 
                        />
                      ))}
                    </div>
                    <div className="absolute inset-x-0 inset-y-0 m-auto w-11 h-11 bg-white rounded-xl flex flex-col items-center justify-center border border-[#EBE3D5] shadow-md text-[9px] font-black uppercase text-[#8C6239] tracking-tighter">
                      <span>QRIS</span>
                      <span className="text-[5px] text-gray-500 font-mono">ScanBite</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#8C6239] font-black mt-3 tracking-widest">NMID: ID20348729103</p>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <span className="text-[9px] text-[#8C6239] font-bold uppercase tracking-wider">Jumlah yang harus di-transfer</span>
                  <p className="text-lg font-black text-[#2C2520]">{formatPrice(paymentModalUser.grandTotal)}</p>
                </div>
              </>
            ) : (
              <div className="space-y-4 text-left">
                {/* Cash Options */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">
                    Pilih Pecahan Uang Cepat (Shortcut)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {getDynamicDenominations(paymentModalUser.grandTotal).map((denom, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCashAmount(denom);
                          setCashInput(denom.toString());
                        }}
                        className={`py-2 px-1 text-[10.5px] font-black rounded-xl border transition-all ${
                          cashAmount === denom
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-white border-[#EBE3D5] text-[#5B4E44] hover:bg-gray-50'
                        }`}
                      >
                        {idx === 0 ? 'Uang Pas' : formatPrice(denom)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">
                    Nominal Tunai yang Diterima (Manual)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-[#8C6239]">Rp</span>
                    <input
                      type="number"
                      value={cashInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCashInput(val);
                        setCashAmount(parseFloat(val) || 0);
                      }}
                      className="w-full text-xs font-bold pl-8 pr-3.5 py-2.5 bg-[#FAF8F5] text-[#2C2520] rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-[#FAF8F5] p-3 rounded-2xl border border-[#EBE3D5]">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#786455] block">Total Tagihan</span>
                    <span className="text-sm font-black text-[#2C2520]">{formatPrice(paymentModalUser.grandTotal)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#786455] block">Kembalian</span>
                    {cashAmount < paymentModalUser.grandTotal ? (
                      <span className="text-sm font-black text-red-600 block animate-pulse">Uang Kurang!</span>
                    ) : (
                      <span className="text-sm font-black text-emerald-700 block">{formatPrice(cashAmount - paymentModalUser.grandTotal)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pay buttons with explicit water dynamic ripple animations */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPaymentModalUser(null)}
                className="border border-[#EBE3D5] hover:bg-gray-50 text-[#5B4E44] text-xs font-bold py-3.5 rounded-xl transition-all"
              >
                Tutup Batalkan
              </button>

              <button
                type="button"
                disabled={payMethod === 'cash' && cashAmount < paymentModalUser.grandTotal}
                onClick={(e) => handleButtonClickWithRipple(e, () => triggerPayBillConfirmation(paymentModalUser))}
                className={`relative overflow-hidden text-[#FDFBF7] text-xs font-black uppercase tracking-wider py-3.5 rounded-xl transition-colors shadow-md focus:outline-none ${
                  payMethod === 'cash' && cashAmount < paymentModalUser.grandTotal
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10'
                }`}
              >
                {/* Embedded ripple trigger inside button DOM */}
                <span className="relative z-10 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Konfirmasi Lunas</span>
                </span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL TRAKTIR SEMUA KAWAN SE-MEJA */}
      {showTreatAllModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 border border-[#F1EADF] shadow-2xl text-center space-y-4">
            
            <div className="flex justify-between items-center pb-2 border-b border-[#FAF8F5]">
              <div className="flex items-center gap-1 text-[#8C6239]">
                <Gift className="w-4.5 h-4.5" />
                <span className="text-xs font-black uppercase tracking-wide">
                  {payMethod === 'qris' ? 'Pembayaran QRIS' : 'Pembayaran Tunai / Cash'}
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setShowTreatAllModal(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <p className="text-xs text-[#786455] leading-relaxed">
              Melunasi seluruh tagihan hidangan untuk Meja <strong>{tableNumber}</strong>.
            </p>

            {/* Opsi Metode Pembayaran (Tabs) */}
            <div className="grid grid-cols-2 gap-2 bg-[#FAF8F5] p-1 rounded-xl border border-[#EBE3D5] text-xs font-bold mb-3">
              <button
                type="button"
                onClick={() => setPayMethod('qris')}
                className={`py-2 rounded-lg transition-all ${
                  payMethod === 'qris'
                    ? 'bg-[#8C6239] text-white shadow-sm'
                    : 'text-[#5B4E44] hover:bg-gray-150'
                }`}
              >
                QRIS / E-Wallet
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMethod('cash');
                  const totalVal = totalUnpaidGrandTotal;
                  setCashAmount(totalVal);
                  setCashInput(totalVal.toString());
                }}
                className={`py-2 rounded-lg transition-all ${
                  payMethod === 'cash'
                    ? 'bg-[#8C6239] text-white shadow-sm'
                    : 'text-[#5B4E44] hover:bg-gray-150'
                }`}
              >
                Tunai / Cash
              </button>
            </div>

            {payMethod === 'qris' ? (
              <>
                {/* QRIS Code box */}
                <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-[#EBE3D5] inline-block shadow-inner mx-auto w-full">
                  <div className="relative w-44 h-44 bg-white border border-[#EBE3D5] rounded-xl flex items-center justify-center p-2 mx-auto shadow-xs">
                    {/* Simulated QR Code blocks with elegant distribution */}
                    <div className="grid grid-cols-5 gap-1.5 w-full h-full opacity-85">
                      {Array.from({ length: 25 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`rounded-xs ${
                            i % 3 === 0 || i < 5 || (i > 15 && i < 22) ? 'bg-[#2C2520]' : 'bg-gray-150'
                          }`} 
                        />
                      ))}
                    </div>
                    <div className="absolute inset-x-0 inset-y-0 m-auto w-11 h-11 bg-white rounded-xl flex flex-col items-center justify-center border border-[#EBE3D5] shadow-md text-[9px] font-black uppercase text-[#8C6239] tracking-tighter">
                      <span>QRIS</span>
                      <span className="text-[5px] text-gray-500 font-mono">ScanBite</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#8C6239] font-black mt-3 tracking-widest">NMID: ID20348729103</p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-0.5 animate-fadeIn">
                  <span className="text-[9px] text-[#8C6239] font-bold uppercase tracking-wider block">Total Tagihan Gabungan Se-Meja</span>
                  <p className="text-lg font-black text-[#2C2520]">{formatPrice(totalUnpaidGrandTotal)}</p>
                  <p className="text-[9px] text-gray-400">Seluruh makanan terkirim sekaligus ke dapur utama</p>
                </div>
              </>
            ) : (
              <div className="space-y-4 text-left animate-fadeIn">
                {/* Cash Options */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">
                    Pilih Pecahan Uang Cepat (Shortcut)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {getDynamicDenominations(totalUnpaidGrandTotal).map((denom, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCashAmount(denom);
                          setCashInput(denom.toString());
                        }}
                        className={`py-2 px-1 text-[10.5px] font-black rounded-xl border transition-all ${
                          cashAmount === denom
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-white border-[#EBE3D5] text-[#5B4E44] hover:bg-gray-50'
                        }`}
                      >
                        {idx === 0 ? 'Uang Pas' : formatPrice(denom)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">
                    Nominal Tunai yang Diterima (Manual)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-[#8C6239]">Rp</span>
                    <input
                      type="number"
                      value={cashInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCashInput(val);
                        setCashAmount(parseFloat(val) || 0);
                      }}
                      className="w-full text-xs font-bold pl-8 pr-3.5 py-2.5 bg-[#FAF8F5] text-[#2C2520] rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-[#FAF8F5] p-3 rounded-2xl border border-[#EBE3D5]">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#786455] block">Total Tagihan</span>
                    <span className="text-sm font-black text-[#2C2520]">{formatPrice(totalUnpaidGrandTotal)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#786455] block">Kembalian</span>
                    {cashAmount < totalUnpaidGrandTotal ? (
                      <span className="text-sm font-black text-red-600 block animate-pulse">Uang Kurang!</span>
                    ) : (
                      <span className="text-sm font-black text-emerald-700 block">{formatPrice(cashAmount - totalUnpaidGrandTotal)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pay buttons with explicit water dynamic ripple animations */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowTreatAllModal(false)}
                className="border border-[#EBE3D5] hover:bg-gray-50 text-[#5B4E44] text-xs font-bold py-3.5 rounded-xl transition-all focus:outline-none"
              >
                Batalkan
              </button>

              <button
                type="button"
                disabled={payMethod === 'cash' && cashAmount < totalUnpaidGrandTotal}
                onClick={(e) => handleButtonClickWithRipple(e, () => triggerPayAllBillsConfirmation())}
                className={`relative overflow-hidden text-[#FDFBF7] text-xs font-black uppercase tracking-wider py-3.5 rounded-xl transition-colors shadow-md focus:outline-none ${
                  payMethod === 'cash' && cashAmount < totalUnpaidGrandTotal
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-[#059669]/10'
                }`}
              >
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Bayar Lunas</span>
                </span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE FINALIZING PAYMENT */}
      {showPaymentConfirmModal && paymentSummary && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 border border-[#F1EADF] shadow-2xl text-center space-y-4 animate-scaleUp">
            
            <div className="flex justify-between items-center pb-2 border-b border-[#FAF8F5]">
              <span className="text-xs font-black text-[#8C6239] uppercase tracking-wide">
                Konfirmasi Pembayaran
              </span>
              <button 
                type="button"
                onClick={() => {
                  setShowPaymentConfirmModal(false);
                  setPendingPaymentAction(null);
                  setPaymentSummary(null);
                }}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="text-center space-y-1">
              <span className="text-[10px] bg-[#8C6239]/10 text-[#8C6239] px-3 py-1 rounded-full font-black uppercase tracking-widest leading-none block w-max mx-auto mb-2">
                Meja {paymentSummary.tableNumber}
              </span>
              <h4 className="text-sm font-extrabold text-[#1C1612]">Verifikasi Detail Pesanan</h4>
              <p className="text-[11px] text-[#786455]">{paymentSummary.label}</p>
            </div>

            {/* Order Items Summary List */}
            <div className="bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl p-4 text-left max-h-48 overflow-y-auto space-y-2">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-[#9E8775] block border-b border-[#FAF2E8] pb-1">RINGKASAN PESANAN</span>
              {paymentSummary.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-xs text-[#5B4E44] font-medium py-0.5">
                  <span>{item.name} <strong className="text-[#8C6239]">x{item.quantity}</strong></span>
                  <span className="font-mono">{formatPrice(item.total)}</span>
                </div>
              ))}
            </div>

            {/* Payment Method & Grand Total Details */}
            <div className="p-3 bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl text-left space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#786455] font-semibold">Metode Pembayaran:</span>
                <span className="font-extrabold text-[#2C2520]">{paymentSummary.method}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-[#EBE3D5]/60 pt-1.5">
                <span className="text-[#786455] font-semibold">Total Transfer:</span>
                <span className="text-sm font-black text-emerald-800">{formatPrice(paymentSummary.totalAmount)}</span>
              </div>
            </div>

            {/* Confirm Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentConfirmModal(false);
                  setPendingPaymentAction(null);
                  setPaymentSummary(null);
                }}
                className="border border-[#EBE3D5] hover:bg-gray-55 text-[#5B4E44] text-xs font-bold py-3.5 rounded-xl transition-all cursor-pointer"
              >
                Batalkan
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (pendingPaymentAction) {
                    await pendingPaymentAction();
                  }
                  setShowPaymentConfirmModal(false);
                  setPendingPaymentAction(null);
                  setPaymentSummary(null);
                }}
                className="relative overflow-hidden bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Ya, Konfirmasi</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* JUKEBOX DIGITAL RECEIPT MODAL PRINTING */}
      {activeReceipt && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 border border-[#8C6239]/20 shadow-2xl space-y-4 relative overflow-hidden animate-scaleUp">
            
            {/* Top Close */}
            <button 
              onClick={() => setActiveReceipt(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <X className="w-4.5 h-4.5" />
            </button>

            <div className="text-center pt-2">
              <div className="w-11 h-11 bg-amber-100 text-[#8C6239] border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-2.5">
                <FileText className="w-5 h-5 animate-pulse" />
              </div>
              <h4 className="text-xs font-black uppercase text-[#8C6239] tracking-widest">Digital Jukebox Receipt</h4>
              <p className="text-[9px] text-gray-400 uppercase font-semibold">Smart Playlist Cafe System</p>
            </div>

            {/* Bistro receipt visualization */}
            <div className="border border-[#EBE3D5] rounded-2xl p-4 bg-[#FAF8F5] text-xs space-y-3 font-mono text-[#5B4E44] border-dashed">
              <div className="flex justify-between border-b pb-2 border-dashed border-[#EBE3D5] text-[10px]">
                <span>No. Receipt: #{activeReceipt.trxId}</span>
                <span>Meja {activeReceipt.tableNumber}</span>
              </div>

              <div className="space-y-1.5 py-1">
                <p className="font-extrabold text-[#2C2520] text-center text-xs tracking-tighter uppercase">"{activeReceipt.trackTitle}"</p>
                <p className="text-[10px] text-[#8C6239] text-center font-bold">Oleh: {activeReceipt.artistName}</p>
              </div>

              <div className="border-t border-dashed border-[#EBE3D5] pt-2 flex justify-between text-[11px] font-bold">
                <span>Waktu Request:</span>
                <span>{activeReceipt.requestTime} WITA</span>
              </div>

              <div className="flex justify-between text-[11px] font-bold text-emerald-700">
                <span>Status Antrean:</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  {activeReceipt.status}
                </span>
              </div>
            </div>

            {/* Buttons for action */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="border border-[#EBE3D5] hover:bg-gray-50 text-[11px] font-bold py-3 rounded-xl transition-all"
              >
                Tutupan
              </button>
              <button
                type="button"
                onClick={() => handleDownloadReceipt(activeReceipt)}
                className="bg-[#8C6239] hover:bg-[#724f2b] text-[#FDFBF7] text-[11px] font-black uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Struk</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CHECKOUT ALL LUNAS SUCCESS SCREEN */}
      {checkoutCompleted && (
        <div className="fixed inset-0 bg-[#FDFBF7] z-50 flex flex-col items-center justify-center p-6 text-center animate-fadeIn overflow-y-auto">
          <div className="max-w-md space-y-5 my-8">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner border border-emerald-200 animate-bounce">
              <PartyPopper className="w-10 h-10" />
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] bg-emerald-600/10 text-emerald-700 font-extrabold px-3 py-1 rounded-full uppercase tracking-widest">{lang === 'id' ? 'Status Pesanan' : 'Order Status'}</span>
              <h2 className="text-2xl font-black text-[#1C1612] leading-tight">{t[lang].successTitle}</h2>
              <p className="text-xs text-[#786455] max-w-sm mx-auto leading-relaxed">
                {t[lang].successSub}
              </p>
            </div>

            {/* LIVE ORDER COOKING/PREPARATION PROGRESS CARD */}
            {(activeOrder || completedOrderDetails) && (() => {
              const orderData = activeOrder || completedOrderDetails;
              const displayStatus = orderData.status || 'pending';
              
              return (
                <div id="client-live-checkout-order-tracker" className="bg-gradient-to-r from-[#2C2520] to-[#1C1612] text-white border border-[#8C6239]/40 rounded-3xl p-5 text-left shadow-lg space-y-4 animate-scaleIn">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                     <div className="flex items-center gap-2">
                       <span className="flex items-center justify-center w-7 h-7 bg-amber-500/10 border border-amber-500/25 rounded-md text-amber-500 shrink-0">
                         <ChefHat className="w-4 h-4 text-amber-400 animate-bounce" />
                       </span>
                       <div>
                         <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest block">Live Status Pesanan • Chef Tracking</span>
                         <span className="text-[9px] text-gray-400 font-mono">OrderID: #{orderData.id?.slice(0, 8)}...</span>
                       </div>
                     </div>
                     
                     <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-[#8C6239] text-white font-sans tracking-wider">
                       {displayStatus === 'pending' && (lang === 'id' ? 'Diterima • Pending' : 'Received • Pending')}
                       {displayStatus === 'preparing' && (lang === 'id' ? 'Diproses • Preparing' : 'Cooking • Preparing')}
                       {displayStatus === 'ready' && (lang === 'id' ? 'Siap Saji • Ready' : 'Ready for Serving')}
                       {displayStatus === 'delivered' && (lang === 'id' ? 'Disajikan • Delivered' : 'Served • Delivered')}
                       {displayStatus === 'completed' && (lang === 'id' ? 'Selesai • Completed' : 'Completed')}
                     </span>
                  </div>

                  <p className="text-[10.5px] text-gray-300 leading-normal font-sans">
                     {displayStatus === 'pending' && (lang === 'id' 
                       ? 'Pesanan Anda telah diterima oleh bagian kasir & sedang menunggu antrean dapur.' 
                       : 'Your order has been received by the cashier and is waiting for the kitchen queue.')}
                     {displayStatus === 'preparing' && (lang === 'id' 
                       ? 'Koki legendaris kami sedang meracik hidangan lezat pesanan Anda di area dapur utama!' 
                       : 'Our legendary chefs are currently preparing your delicious dishes in the main kitchen area!')}
                     {displayStatus === 'ready' && (lang === 'id' 
                       ? 'Hore! Hidangan Anda sudah matang sempurna dan siap diantarkan pelayan ke meja Anda!' 
                       : 'Hooray! Your dishes are perfectly cooked and ready to be delivered to your table by our servers!')}
                     {displayStatus === 'delivered' && (lang === 'id' 
                       ? 'Selamat menikmati hidangan lezat buah karya kafe kami secara nikmat!' 
                       : 'Please enjoy your masterfully crafted dishes from our cafe!')}
                     {displayStatus === 'completed' && (lang === 'id' 
                       ? 'Selamat menikmati hidangan lezat buah karya kafe kami secara nikmat!' 
                       : 'Please enjoy your masterfully crafted dishes from our cafe!')}
                  </p>

                  {/* Visual Progress percentage */}
                  <div className="space-y-2 select-none">
                     <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
                       <div 
                         className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-amber-300 transition-all duration-1000 ease-out"
                         style={{ 
                           width: displayStatus === 'pending' ? '25%' : 
                                  displayStatus === 'preparing' ? '55%' : 
                                  displayStatus === 'ready' ? '80%' : '100%' 
                         }}
                       />
                     </div>
                     
                     <div className="grid grid-cols-4 text-[9px] font-extrabold text-[#B2A494] space-x-1 sm:space-x-2 leading-none">
                       <div className={`text-left ${displayStatus === 'pending' || displayStatus === 'preparing' || displayStatus === 'ready' || displayStatus === 'delivered' || displayStatus === 'completed' ? 'text-amber-500' : ''}`}>
                         <span>{lang === 'id' ? 'Diterima' : 'Received'}</span>
                         <span className="block text-[7.5px] text-gray-500 font-normal mt-0.5">Pending</span>
                       </div>
                       <div className={`text-center ${displayStatus === 'preparing' || displayStatus === 'ready' || displayStatus === 'delivered' || displayStatus === 'completed' ? 'text-amber-400 font-black' : ''}`}>
                         <span>{lang === 'id' ? 'Dimasak' : 'Cooking'}</span>
                         <span className="block text-[7.5px] text-gray-500 font-normal mt-0.5">Preparing</span>
                       </div>
                       <div className={`text-center ${displayStatus === 'ready' || displayStatus === 'delivered' || displayStatus === 'completed' ? 'text-amber-400 font-black' : ''}`}>
                         <span>{lang === 'id' ? 'Siap Saji' : 'Ready'}</span>
                         <span className="block text-[7.5px] text-gray-500 font-normal mt-0.5">Ready!</span>
                       </div>
                       <div className={`text-right ${displayStatus === 'delivered' || displayStatus === 'completed' ? 'text-emerald-400 font-black animate-pulse' : ''}`}>
                         <span>{lang === 'id' ? 'Diantar' : 'Served'}</span>
                         <span className="block text-[7.5px] text-gray-500 font-normal mt-0.5">Delivered</span>
                       </div>
                     </div>
                  </div>
                </div>
              );
            })()}

            {/* EMAIL RECEIPT INPUT */}
            <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 text-left shadow-xs space-y-3.5">
              <span className="text-[9px] bg-amber-100 text-[#8C6239] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {t[lang].emailReceiptLabel}
              </span>
              <p className="text-[11px] text-[#786455] leading-relaxed">
                {lang === 'id' 
                  ? 'Masukkan email Anda di bawah untuk mengirimkan struk pembayaran digital otomatis ke inbox Anda.' 
                  : 'Enter your email below to automatically send the digital invoice and receipt directly to your inbox.'}
              </p>
              
              {emailSaved ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs font-bold text-center flex items-center justify-center gap-1.5 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{t[lang].emailReceiptSuccess} {emailInput}</span>
                </div>
              ) : (
                <form onSubmit={handleEmailSubmit} className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder={t[lang].emailReceiptPlaceholder}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="flex-1 bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-3.5 py-2.5 text-xs text-gray-950 font-bold focus:outline-none focus:ring-1 focus:ring-[#8C6239] placeholder-gray-405"
                  />
                  <button
                    type="submit"
                    disabled={isSavingEmail}
                    className="bg-[#8C6239] hover:bg-[#724f2b] text-white text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-colors shrink-0"
                  >
                    {isSavingEmail ? '...' : t[lang].emailReceiptSubmit}
                  </button>
                </form>
              )}
            </div>

            {/* INTERACTIVE DIGITAL JUKEBOX REQUEST CONSOLE */}
            <div className="bg-[#1D1713] text-[#FDFBF7] rounded-3xl p-5 border border-white/5 text-left shadow-xl space-y-4 animate-scaleUp">
              
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                    <Music className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-amber-500 font-extrabold uppercase tracking-widest">Bistro Smart Sound</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <h3 className="font-extrabold text-xs text-white">Digital Jukebox</h3>
                  </div>
                </div>
              </div>

              <p className="text-[10.5px] text-gray-400 leading-relaxed">
                {lang === 'id' 
                  ? 'Sebagai apresiasi pemesanan Anda, silakan request 1 lagu gratis untuk diputar langsung di sound system kafe kami!'
                  : 'As our appreciation for your order, please request 1 free song to play directly on our cafe sound system!'}
              </p>

              {/* Jukebox Search Input inside checkout success */}
              <div className="space-y-3 relative z-30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wider mb-1">Judul Lagu</label>
                    <input
                      type="text"
                      placeholder="Contoh: Kopi Dangdut, Gajah"
                      value={jukeboxManualTitle}
                      onChange={(e) => setJukeboxManualTitle(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs font-semibold placeholder-gray-500 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 font-extrabold uppercase tracking-wider mb-1">Penyanyi / Band</label>
                    <input
                      type="text"
                      placeholder="Contoh: Tulus, Fahmy Shahab"
                      value={jukeboxManualArtist}
                      onChange={(e) => setJukeboxManualArtist(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-xs font-semibold placeholder-gray-500 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!jukeboxManualTitle.trim()) {
                      setJukeboxNotification('❌ Harap isi judul lagu terlebih dahulu!');
                      setTimeout(() => setJukeboxNotification(null), 3500);
                      return;
                    }
                    const tVal = jukeboxManualTitle.trim();
                    const aVal = jukeboxManualArtist.trim() || 'No Artist';
                    await handleRequestSong({ title: tVal, artist: aVal, duration: '3:30' });
                    setJukeboxManualTitle('');
                    setJukeboxManualArtist('');
                  }}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-[#1C1612] font-black uppercase text-[11px] tracking-widest py-3 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <Music className="w-4 h-4" />
                  <span>Kirim Request Lagu</span>
                </button>

                {jukeboxNotification && (
                  <p className="text-xs text-emerald-400 italic font-bold tracking-wide animate-pulse text-center">
                    {jukeboxNotification}
                  </p>
                )}
              </div>

              {/* Realtime Jukebox Playlist Monitor within success section */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between text-[11px] text-gray-400 font-bold">
                  <span>Antrean Lagu Kafe ({jukeboxQueue.length})</span>
                  <span className="text-amber-500 text-[9px] font-black tracking-wider uppercase">Live System</span>
                </div>

                <div className="bg-white/5 border border-white/5 rounded-2xl divide-y divide-white/5 max-h-36 overflow-y-auto scrollbar-thin">
                  {jukeboxQueue.length === 0 ? (
                    <div className="py-6 text-center text-[11px] text-gray-500 italic">
                      Belum ada lagu diputar. Request punyamu di atas!
                    </div>
                  ) : (
                    jukeboxQueue.map((track, tIdx) => (
                      <div key={track.id || tIdx} className="p-2.5 flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {track.artworkUrl ? (
                            <img 
                              src={track.artworkUrl} 
                              alt="Cover" 
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-md object-cover bg-white/10 shrink-0 border border-white/10" 
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-md bg-white/5 text-amber-500 flex items-center justify-center border border-white/10 shrink-0">
                              <Music className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <div className="truncate">
                            <span className="text-[10.5px] font-bold text-white flex items-center gap-1">
                              {track.isPlaying && (
                                <span className="flex items-end gap-0.5 h-3 shrink-0" title="Playing">
                                  <span className="w-0.5 bg-emerald-500 h-1.5 animate-[pulse_1s_infinite_ease-in-out]" />
                                  <span className="w-0.5 bg-emerald-500 h-3 animate-[pulse_0.7s_infinite_ease-in-out_0.2s]" />
                                  <span className="w-0.5 bg-emerald-500 h-2 animate-[pulse_0.8s_infinite_ease-in-out_0.4s]" />
                                </span>
                              )}
                              <span className="truncate leading-tight">{track.title}</span>
                            </span>
                            <span className="text-[9.5px] text-gray-400 block truncate leading-tight mt-0.5">
                              {track.artist} • <span className="text-amber-500/80 font-semibold">{track.requestedBy}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] font-mono text-gray-500">{track.duration}</span>
                          {!track.isPlaying && (
                            <button
                              type="button"
                              onClick={() => handleVoteSong(track.id)}
                              className="bg-white/10 hover:bg-white/15 text-white text-[9.5px] font-extrabold px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors border border-white/10"
                            >
                              <Vote className="w-3 h-3 text-amber-500" />
                              <span>{track.votes}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Active User Requested Receipt Details (Shows up after request) */}
              {activeReceipt && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1.5">
                  <div className="flex items-center justify-between border-b border-amber-500/10 pb-1.5">
                    <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider">Tiket Request Jukebox Anda</span>
                    <span className="text-[9px] text-gray-400 font-mono">#{activeReceipt.trxId}</span>
                  </div>
                  <div className="text-[11px] leading-tight text-[#FAF8F5] space-y-1">
                    <p>🎶 <span className="font-bold text-amber-400">{activeReceipt.trackTitle}</span> - {activeReceipt.artistName}</p>
                    <p>🕒 Request pukul {activeReceipt.requestTime} • Meja {activeReceipt.tableNumber || tableNumber}</p>
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold pt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Antrean Terkirim ke Kasir & Barista!
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* VISIBLE DIGITAL RECEIPT PREVIEW REMOVED PER REQUIREMENT (KASIR YANG BERKUASA) */}

            <div className="pb-2 pt-1 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleResetOrder}
                className="w-full bg-[#8C6239] hover:bg-[#6D4926] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-wide transition-all shadow-md cursor-pointer"
              >
                {t[lang].repeatOrder}
              </button>
              
              <button
                type="button"
                onClick={handleResetCustomerSession}
                className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-850 py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-wide transition-all cursor-pointer"
              >
                {lang === 'id' ? '❌ Keluar & Reset Sesi Meja (Selesai)' : '❌ Exit & Reset Table Session (Done)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL PRINT AREA REMOVED (KASIR YANG BERKUASA) */}

      {/* Footer Branding */}
      <footer className="absolute bottom-6 left-0 right-0 text-center text-xs text-[#9E8775] font-sans z-30 px-4">
        <p>© 2026 {cafeName}. All rights reserved.</p>
        <p className="text-[10px] text-[#B2A494] mt-0.5 font-normal">Powered by RasyaTech | Vibe Modern • Digital Jukebox • Table Ordering</p>
      </footer>

    </div>
  );
}

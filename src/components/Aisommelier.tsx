import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  Trash2, 
  X, 
  Coffee, 
  BrainCircuit, 
  Check, 
  CreditCard, 
  Coins, 
  Music, 
  HelpCircle, 
  Timer, 
  ShoppingCart, 
  RotateCcw,
  BellRing
} from 'lucide-react';
import OrderStatus from './OrderStatus';
import { MenuItem, CartItem } from '../types';
import { supabase } from '../supabaseClient';

interface AisommelierProps {
  onClose: () => void;
  activeMenu: MenuItem[];
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  tableNumber: string;
  setTableNumber: (num: string) => void;
  customerName: string;
  triggerNotification: (text: string) => void;
}

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: Date;
  isInteractive?: boolean;
}

export default function Aisommelier({ 
  onClose, 
  activeMenu, 
  cart, 
  setCart, 
  tableNumber, 
  setTableNumber, 
  customerName, 
  triggerNotification 
}: AisommelierProps) {
  
  // Anti-collision & step state identifiers
  const [sessionStep, setSessionStep] = useState<'WELCOME' | 'CHOOSE_MENU' | 'PAYMENT' | 'REQUEST_SONG'>('WELCOME');
  const [tempTableNumber, setTempTableNumber] = useState(tableNumber);
  const [isEditingTable, setIsEditingTable] = useState(false);
  const [cashChangeSelection, setCashChangeSelection] = useState<string | null>(null);
  const [paymentOption, setPaymentOption] = useState<'CASHLESS' | 'CASH' | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Jukebox state
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [songsCount, setSongsCount] = useState<number>(() => {
    const saved = localStorage.getItem(`scanbite_songs_${tableNumber}`);
    return saved ? parseInt(saved, 10) : 0;
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-init',
      sender: 'ai',
      text: `Halo ${customerName}! Selamat datang di **ScanBite**. Saya adalah asisten virtual ramah Anda hari ini.\n\nSebelum Anda memulai pesanan hidangan lezat kami, mohon konfirmasi terlebih dahulu: **Apakah Anda saat ini duduk di Meja ${tableNumber}?**`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Keep template table synced with props
  useEffect(() => {
    setTempTableNumber(tableNumber);
  }, [tableNumber]);

  // Formula exact match Checkout 15% Tax & Service
  const getSubtotal = () => {
    return cart.reduce((sum, item) => {
      const menu = activeMenu.find(m => m.id === item.menuItemId);
      const price = menu ? menu.price : 0;
      return sum + (price * item.quantity);
    }, 0);
  };
  const getTaxAndService = () => {
    return Math.round(getSubtotal() * 0.15);
  };
  const getGrandTotal = () => {
    return getSubtotal() + getTaxAndService();
  };

  // Helper to append messages dynamically
  const addMessage = (sender: 'ai' | 'user', text: string, isInteractive = false) => {
    const newMsg: Message = {
      id: `${sender}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sender,
      text,
      timestamp: new Date(),
      isInteractive
    };
    setMessages(prev => [...prev, newMsg]);
  };

  // Step 1: Confirmed table number action
  const handleConfirmTable = (confirmed: boolean, chosenNum = tableNumber) => {
    if (confirmed) {
      addMessage('user', `Ya, betul saya duduk di Meja ${chosenNum}.`);
      setTableNumber(chosenNum);
      localStorage.setItem('scanbite_table', chosenNum);
      
      setTimeout(() => {
        addMessage('ai', `Selesai dikonfirmasi! Meja Anda adalah **Meja ${chosenNum}**.\n\nSilakan pilih menu kesukaan Anda dari daftar menu kami di halaman sebelah kiri, lalu tekan tombol **Selesai Memilih** di bawah kolom panduan saya ini untuk bergeser ke opsi pembayaran.`);
        setSessionStep('CHOOSE_MENU');
      }, 700);
    } else {
      setIsEditingTable(true);
    }
  };

  const handleSaveCustomTable = () => {
    if (!tempTableNumber.trim()) return;
    setIsEditingTable(false);
    handleConfirmTable(true, tempTableNumber);
  };

  // Step 3: Register verified order database/localStorage simulation
  const registerOrderFromAi = async (payMethod: string, payStatus: string) => {
    const totalOrderValue = getGrandTotal();
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const mappedItems = cart.map(c => {
      const menu = activeMenu.find(m => m.id === c.menuItemId);
      return {
        name: menu ? menu.name : 'Unknown Item',
        price: menu ? menu.price : 0,
        quantity: c.quantity,
        orderedBy: customerName
      };
    });

    // Build standard CafeOrder payload
    const newOrderObj = {
      id: `ord-${Math.floor(1000 + Math.random() * 9000)}`,
      tableNumber: tableNumber,
      customerName: customerName,
      items: mappedItems,
      totalPrice: totalOrderValue,
      status: 'pending' as const,
      paymentMethod: payMethod,
      paymentStatus: payStatus,
      createdAt: timestampStr
    };

    if (supabase && supabase.auth) {
      try {
        const activeTenant = localStorage.getItem('current_tenant') || 'scanbite_live';
        const dbItems = mappedItems.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          orderedBy: customerName
        }));

        const { data: newOrder, error: orderError } = await supabase
          .from('sb_orders')
          .insert([{
            id: newOrderObj.id,
            tenant_id: activeTenant,
            table_number: tableNumber,
            customer_name: customerName,
            total_price: totalOrderValue,
            status: 'pending',
            order_items: dbItems,
            payment_method: payMethod
          }])
          .select()
          .maybeSingle();
      } catch (err) {
        console.warn("AI automatic order registration on Supabase failed:", err);
      }
    }

    // Fallback localStorage sync to ensure active sync on simple sandbox mode
    const saved = localStorage.getItem('scanbite_orders');
    let updatedOrders = [];
    if (saved) {
      try {
        updatedOrders = JSON.parse(saved);
      } catch (e) {}
    }
    updatedOrders.push(newOrderObj);
    localStorage.setItem('scanbite_orders', JSON.stringify(updatedOrders));

    // Success notifications
    triggerNotification(`📢 Pesanan atas nama ${customerName} berhasil direkam!`);
  };

  // Step 3a: Pure Cashless Simulate Action
  const handleSelectCashless = async () => {
    addMessage('user', 'Saya ingin membayar menggunakan Cashless QRIS/E-Wallet.');
    setPaymentOption('CASHLESS');
    setIsProcessingPayment(true);

    setTimeout(async () => {
      await registerOrderFromAi('cashless', 'paid');
      setIsProcessingPayment(false);
      
      addMessage('ai', `🎉 **PEMBAYARAN CASHLESS BERHASIL INSTAN!**\n\nSistem kami mendeteksi dana QRIS Anda lunas terbayar. Pesanan Anda telah langsung diteruskan ke mesin barista & dapur kafe untuk segera dimasak.\n\nSambil menunggu, mari pilih playlist musik kesukaan Anda menggunakan fitur jukebox di bawah ini!`);
      // Clear cart
      setCart([]);
      setSessionStep('REQUEST_SONG');
    }, 1800);
  };

  // Step 3b: Pre-Cash Choice Trigger
  const handleSelectCash = () => {
    addMessage('user', 'Saya ingin membayar Cash secara langsung ke Kasir.');
    setPaymentOption('CASH');
    
    setTimeout(() => {
      addMessage('ai', `Baik, pembayaran tunai dipilih. **Apakah Anda memerlukan uang kembalian?**\n\nMohon tentukan pecahan Anda untuk memudahkan Kasir kami membawa uang kembalian.`);
    }, 500);
  };

  // Step 3b: Confirm cash with specific change choice
  const handleConfirmCashWithChange = async (option: string) => {
    addMessage('user', `Kembalian: ${option}`);
    setCashChangeSelection(option);
    setIsProcessingPayment(true);

    setTimeout(async () => {
      // Unpaid cash registers a "Menunggu Kasir" flag in admin panel
      await registerOrderFromAi('cash', 'unpaid');
      setIsProcessingPayment(false);
      
      addMessage('ai', `🔔 **PESANAN TERKIRIM & MENUNGGU KASIR!**\n\nStaf Kasir ScanBite kami saat ini sedang berjalan menuju **Meja ${tableNumber}** membawa uang kembalian/mengecek pembayaran Anda (${option}).\n\nStatus di layar Anda saat ini: **Menunggu Kasir Menjemput Uang**.\n\nSembari menunggu staf tiba dan menu Anda dimasak, silakan request 2 lagu terbaik Anda lewat menu jukebox kami di bawah!`);
      // Clear cart
      setCart([]);
      setSessionStep('REQUEST_SONG');
    }, 1200);
  };

  // Step 4: Music Jukebox submission
  const handleRequestSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!songTitle.trim() || !songArtist.trim()) return;
    if (songsCount >= 2) {
      triggerNotification('❌ Batas maksimal request lagu Anda sudah tercapai (Maksimal 2 lagu per meja).');
      return;
    }

    try {
      if (supabase) {
        const activeTenant = localStorage.getItem('current_tenant') || 'scanbite_live';
        const payload = {
          title: songTitle.trim(),
          artist: songArtist.trim() || 'Guest',
          table_number: tableNumber || '05',
          tenant_id: activeTenant,
          duration: '3:30',
          artwork_url: '',
          youtube_id: '',
          spotify_uri: ''
        };
        console.log("🔍 [AUDIT JUKEBOX INSERT Aisommelier] Mengirim payload ke Supabase:", payload);

        const { data, error } = await supabase
          .from('sb_song_requests')
          .insert([payload])
          .select();

        if (error) {
          console.error("❌ [AUDIT JUKEBOX INSERT Aisommelier ERROR] Gagal melakukan insert:", error);
        } else {
          console.log("✅ [AUDIT JUKEBOX INSERT Aisommelier SUCCESS] Berhasil tersimpan di Supabase:", data);
        }
      }

      const increment = songsCount + 1;
      setSongsCount(increment);
      localStorage.setItem(`scanbite_songs_${tableNumber}`, increment.toString());

      triggerNotification('🎵 Suksess! Musik favorit Anda dikirim ke antrean kafe.');
      addMessage('ai', `🎵 **Lagu Terkirim!**\n\n"${songTitle.trim()} - ${songArtist.trim()}" berhasil ditambahkan ke playlist antrean bistro kami!\n\n(${increment}/2 lagu telah direquest dari Meja Anda).`);
      
      // Clear inputs
      setSongTitle('');
      setSongArtist('');
    } catch (err) {
      console.warn("Jukebox request error:", err);
      // Fallback
      const increment = songsCount + 1;
      setSongsCount(increment);
      localStorage.setItem(`scanbite_songs_${tableNumber}`, increment.toString());
      addMessage('ai', `🎵 (Simulasi Offline) Lagu "${songTitle.trim()} - ${songArtist.trim()}" telah masuk antrean playlist kafe!`);
      setSongTitle('');
      setSongArtist('');
    }
  };

  // Step 5: Check Food Status Action
  const handleCheckFoodStatus = async () => {
    addMessage('user', 'Tolong cek status masakan hidangan saya.');
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      // Query localStorage or simulated order states
      const saved = localStorage.getItem('scanbite_orders');
      let activeOrderFound = false;
      let orderStatus: 'pending' | 'preparing' | 'delivered' = 'pending';

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const currentTableOrders = parsed.filter((o: any) => o.tableNumber === tableNumber);
          if (currentTableOrders.length > 0) {
            // Take the latest order
            const latest = currentTableOrders[currentTableOrders.length - 1];
            activeOrderFound = true;
            orderStatus = latest.status;
          }
        } catch (e) {}
      }

      if (activeOrderFound) {
        if (orderStatus === 'delivered') {
          addMessage('ai', `🍲 **Hore!** Pesanan Anda untuk Meja ${tableNumber} saat ini sudah bergeser ke status **Siap Disajikan / Diantarkan**. Silakan nikmati hidangan lezat Anda dengan suka cita!`);
        } else {
          addMessage('ai', `🍳 **Sedang Dimasak!** Pesanan Anda sedang diracik dengan penuh ketelitian oleh barista & chef kami di dapur ScanBite. Kami akan segera menyajikannya panas-panas segera!`);
        }
      } else {
        addMessage('ai', `Waduh, saya belum menemukan pesanan aktif yang terdaftar atas Meja ${tableNumber} saat ini. Silakan tambahkan hidangan ke keranjang belanja Anda dan lunasi terlebih dahulu.`);
      }
    }, 1000);
  };

  // Human conversational text query parser using endpoint / falling back intelligently
  const handleCustomSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    addMessage('user', userText);
    setLoading(true);

    // Context check for food status triggers
    const lower = userText.toLowerCase();
    if (lower.includes('status') || lower.includes('makan') || lower.includes('pesan') || lower.includes('masak')) {
      setTimeout(() => {
        setLoading(false);
        handleCheckFoodStatus();
      }, 700);
      return;
    }

    try {
      const response = await fetch('/api/sommelier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userText,
          activeMenu: activeMenu,
          budgetMax: 150000
        })
      });

      if (!response.ok) throw new Error('Query error');

      const data = await response.json();
      addMessage('ai', data.text || 'Maaf saya sedang kebingungan mencari info kopi terbaik. Namun ada classic latte yang luar biasa untuk Anda!');
    } catch (err) {
      // Local human fallback responses matching cafe vibes
      setTimeout(() => {
        let fallbackReply = `Tentu! Di kafe **ScanBite**, hidangan paling legendaris kami adalah **Es Kopi Susu Aren Klasik** dipadukan dengan **Almond Crispy Croissant** gurih nan renyah.`;
        if (lower.includes('kopi') || lower.includes('minum')) {
          fallbackReply = `Rekomendasi kopi terlaris pagi ini adalah **Salted Caramel Hazelnut Coffee** dingin dengan cita rasa manis gurih yang menyegarkan dahaga Anda!`;
        } else if (lower.includes('makana') || lower.includes('lapar') || lower.includes('kenyang')) {
          fallbackReply = `Untuk hidangan berat mumpuni, silakan jajal **Masterpiece Wagyu Bistro** saus lada hitam premium kami yang sangat empuk dan digilai pelanggan setia!`;
        }
        addMessage('ai', fallbackReply);
        setLoading(false);
      }, 800);
    } finally {
      setLoading(false);
    }
  };

  // Instant navigation tool inside AI chat helper
  const handleResetChatFlow = () => {
    setSessionStep('WELCOME');
    setPaymentOption(null);
    setCashChangeSelection(null);
    setMessages([
      {
        id: 'welcome-init',
        sender: 'ai',
        text: `Halo ${customerName}! Alur asisten kita reset kembali. Mohon konfirmasi: **Apakah Anda duduk di Meja ${tableNumber}?**`,
        timestamp: new Date()
      }
    ]);
  };

  return (
    <div className="flex flex-col h-[520px] bg-white rounded-3xl border border-[#EBE3D5] shadow-2xl overflow-hidden animate-slideUp">
      {/* Dynamic Header */}
      <div className="bg-[#8C6239] text-white px-5 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
            <Sparkles className="w-5 h-5 fill-white text-white animate-pulse" />
          </div>
          <div>
            <h4 className="font-black text-xs tracking-wider uppercase leading-none">Pelayan Virtual AI</h4>
            <p className="text-[9.5px] text-[#EFE6D5] mt-1 flex items-center gap-1.5 font-mono uppercase tracking-widest font-bold">
              {supabase ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  <span>Scanbite Online</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <span>Mode Lokal</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionStep !== 'WELCOME' && (
            <button 
              type="button"
              onClick={handleResetChatFlow}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-[#EFE6D5] hover:text-white cursor-pointer"
              title="Reset Alur Belanja"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-all cursor-pointer animate-pulse"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Feed Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FAF8F5]">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex items-start gap-2.5 max-w-[88%] ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
          >
            <div className={`p-1.5 rounded-xl shrink-0 ${msg.sender === 'user' ? 'bg-[#FAF2E8] text-[#8C6239]' : 'bg-[#EFE6D5] text-[#5B4E44]'}`}>
              {msg.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
              msg.sender === 'user' 
                ? 'bg-[#8C6239] text-white rounded-tr-none' 
                : 'bg-white text-[#2C2520] border border-[#F1EADF] rounded-tl-none'
            }`}>
              <p className="whitespace-pre-line tracking-wide">
                {msg.text.split('**').map((chunk, idx) => {
                  if (idx % 2 === 1) {
                    return <strong key={idx} className={msg.sender === 'user' ? "text-amber-200 font-extrabold" : "text-[#8C6239] font-extrabold"}>{chunk}</strong>;
                  }
                  return chunk;
                })}
              </p>
              <span className={`block text-[8.5px] mt-1 text-right font-mono ${msg.sender === 'user' ? 'text-white/60' : 'text-gray-400'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {/* Loading Bubble */}
        {loading && (
          <div className="flex items-center gap-2 max-w-[80%] mr-auto animate-pulse">
            <div className="p-2 rounded-xl bg-[#EFE6D5] text-[#5B4E44]">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-white border border-[#F1EADF] rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce" />
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* STEP LOGIC INTERACTIVE DOCKET PANELS (Injected Above Text Input) */}
      <div className="px-4 py-3 bg-[#FAF2E8]/45 border-t border-[#F1EADF] space-y-3">
        
        {/* Step 1: Welcome Confirm Table */}
        {sessionStep === 'WELCOME' && !isEditingTable && (
          <div className="space-y-2">
            <span className="text-[8px] font-black text-[#9E8775]/95 uppercase tracking-wider block text-center font-mono">Verifikasi Lokasi Duduk</span>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => handleConfirmTable(false)}
                className="py-2 px-3.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-xs font-bold text-gray-700 transition-colors cursor-pointer text-center flex-1"
              >
                Bukan Meja {tableNumber}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmTable(true)}
                className="py-2 px-4 rounded-xl bg-[#8C6239] hover:bg-[#6D4926] text-white text-xs font-black uppercase tracking-wider transition-colors cursor-pointer text-center flex-1 shadow-3xs"
              >
                Ya, Betul Meja {tableNumber}
              </button>
            </div>
          </div>
        )}

        {sessionStep === 'WELCOME' && isEditingTable && (
          <div className="space-y-2">
            <span className="text-[8px] font-black text-[#8C6239] uppercase tracking-wider block text-center font-mono">Ubah Nomor Meja</span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: 08"
                maxLength={3}
                value={tempTableNumber}
                onChange={(e) => setTempTableNumber(e.target.value)}
                className="w-20 bg-white border border-[#EBE3D5] rounded-xl px-2.5 py-1.5 text-xs text-center font-mono font-black uppercase focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
              />
              <button
                type="button"
                onClick={handleSaveCustomTable}
                className="flex-1 py-1.5 px-3.5 bg-[#8C6239] hover:bg-[#6D4926] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                Konfirmasi Meja Baru
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Choose Menu with Real-time Cart Summary & Split-Bill Formula preview */}
        {sessionStep === 'CHOOSE_MENU' && (
          <div className="bg-white border border-[#FAF2E8] rounded-2xl p-3.5 space-y-2.5 shadow-3xs animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-black text-[#8C6239] uppercase tracking-wider font-mono flex items-center gap-1">
                <ShoppingCart className="w-3.5 h-3.5 text-amber-600" />
                Keranjang Aktif Sesi
              </span>
              <span className="text-[8.5px] font-black text-gray-400 font-mono">
                {cart.length} Jenis Menu
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-2 text-[10px] text-gray-400 font-medium">
                Keranjang masih kosong. Tambahkan kopi, hidangan renyah, atau dessert di kiri!
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-24 overflow-y-auto space-y-1.5 border-b border-gray-100 pb-2">
                  {cart.map((item, idx) => {
                    const menu = activeMenu.find(m => m.id === item.menuItemId);
                    const itemName = menu ? menu.name : 'Unknown Item';
                    const itemPrice = menu ? menu.price : 0;
                    return (
                      <div key={idx} className="flex justify-between items-center text-[11px] text-[#2C2520]">
                        <span className="font-extrabold text-[#8C6239]">{item.quantity}x <span className="text-gray-700 font-bold">{itemName}</span></span>
                        <span className="font-medium font-mono text-gray-500">Rp {(itemPrice * item.quantity).toLocaleString('id-ID')}</span>
                      </div>
                    );
                  })}
                </div>
                
                {/* 15% Tax formulation */}
                <div className="flex justify-between items-center text-[10.5px] text-gray-500">
                  <span>Subtotal + Jasa Layanan & Pajak (15%):</span>
                  <span className="font-mono font-bold">Rp {getGrandTotal().toLocaleString('id-ID')}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                const isTooShort = customerName.trim().length < 2;
                const hasSpecialChar = /[^a-zA-Z0-9\s]/.test(customerName);

                if (isTooShort || hasSpecialChar) {
                  addMessage('user', 'Saya sudah selesai memilih resep. Total pesanan saya siap dibayar.');
                  let warnMsg = '⚠️ **Validasi Nama Gagal!**\n\nSistem mendeteksi nama pelanggan tidak valid:';
                  if (isTooShort) {
                    warnMsg += '\n- Nama terlalu pendek (minimal 2 huruf/karakter).';
                  }
                  if (hasSpecialChar) {
                    warnMsg += '\n- Nama mengandung karakter spesial atau simbol.';
                  }
                  warnMsg += '\n\nSilakan ubah nama Anda terlebih dahulu di halaman utama (Home) agar pesanan dapat direkam dengan benar oleh pihak kasir dan pelayan kami.';
                  addMessage('ai', warnMsg);
                  return;
                }

                setSessionStep('PAYMENT');
                addMessage('user', 'Saya sudah selesai memilih resep. Total pesanan saya siap dibayar.');
                addMessage('ai', `Sempurna! Rincian total pesanan Anda untuk Meja ${tableNumber} adalah sebesar **Rp ${getGrandTotal().toLocaleString('id-ID')}** (sudah mencakup pajak/layanan).\n\nSilakan pilih salah satu Opsi Pembayaran di bawah untuk menyelesaikan sesi Anda.`);
              }}
              className="w-full py-2 bg-[#8C6239] hover:bg-[#6D4926] disabled:bg-gray-200 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-3xs"
            >
              <span>SELESAI MEMILIH & BAYAR</span>
            </button>
          </div>
        )}

        {/* Step 3: Two Payment Options inside Chat stream */}
        {sessionStep === 'PAYMENT' && !paymentOption && (
          <div className="space-y-2">
            <span className="text-[8.5px] font-black text-[#8C6239] uppercase tracking-wider block text-center font-mono">Pilih Metode Pembayaran Meja</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSelectCashless}
                className="py-3 px-2 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-transform hover:scale-[1.02] shadow-sm cursor-pointer"
              >
                <CreditCard className="w-5 h-5 text-emerald-100" />
                <span className="text-[10px] font-black uppercase tracking-wider leading-none">A. CASHLESS</span>
                <span className="text-[7.5px] text-emerald-150 leading-none">QRIS / E-Money</span>
              </button>
              <button
                type="button"
                onClick={handleSelectCash}
                className="py-3 px-2 bg-gradient-to-br from-amber-600 to-[#8C6239] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-transform hover:scale-[1.02] shadow-sm cursor-pointer"
              >
                <Coins className="w-5 h-5 text-amber-100" />
                <span className="text-[10px] font-black uppercase tracking-wider leading-none">B. BAYAR CASH</span>
                <span className="text-[7.5px] text-amber-150 leading-none">Tunai di Meja</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3b: Cash Payment Kembalian Prompt */}
        {sessionStep === 'PAYMENT' && paymentOption === 'CASH' && !cashChangeSelection && (
          <div className="space-y-1.5 bg-white border border-amber-200 rounded-2xl p-3 animate-fadeIn">
            <span className="text-[8px] font-black text-[#5B4E44] uppercase tracking-wider block text-center font-mono">Denominasi Kembalian Kasir</span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleConfirmCashWithChange('Uang Pas')}
                className="py-2 bg-amber-50 hover:bg-amber-100 text-[#8C6239] border border-amber-200 rounded-xl text-[9.5px] font-black"
              >
                Uang Pas
              </button>
              <button
                type="button"
                onClick={() => handleConfirmCashWithChange('Pecahan Rp 50.000')}
                className="py-2 bg-amber-50 hover:bg-amber-100 text-[#8C6239] border border-amber-200 rounded-xl text-[9.5px] font-black"
              >
                Rp 50.000
              </button>
              <button
                type="button"
                onClick={() => handleConfirmCashWithChange('Pecahan Rp 100.000')}
                className="py-2 bg-amber-50 hover:bg-amber-100 text-[#8C6239] border border-amber-200 rounded-xl text-[9.5px] font-black"
              >
                Rp 100.000
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Cashless checkout processing loading */}
        {isProcessingPayment && (
          <div className="flex flex-col items-center py-2 gap-2 text-center">
            <div className="w-5 h-5 rounded-full border-2 border-amber-600 border-t-transparent animate-spin" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest animate-pulse">Menghubungkan ke Mesin Kasir / Saluran Pembayaran...</span>
          </div>
        )}

        {/* Step 4: Song Request Jukebox (Limits: Max 2 Songs per table) */}
        {sessionStep === 'REQUEST_SONG' && (
          <form onSubmit={handleRequestSong} className="bg-[#FAF8F5] border border-[#FAF2E8] rounded-2xl p-3 space-y-3.5 shadow-3xs animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-black text-[#8C6239] uppercase tracking-wider font-mono flex items-center gap-1">
                <Music className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                Jukebox Song Request
              </span>
              <span className={`text-[8.5px] font-bold font-mono px-2 py-0.5 rounded-md ${songsCount >= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                {songsCount}/2 Lagu Direquest Meja
              </span>
            </div>

            {songsCount < 2 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Judul Lagu..."
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    className="bg-white border border-[#EBE3D5] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#8C6239] text-[#2C2520] placeholder-gray-400 font-medium"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Penyanyi / Artis..."
                    value={songArtist}
                    onChange={(e) => setSongArtist(e.target.value)}
                    className="bg-white border border-[#EBE3D5] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#8C6239] text-[#2C2520] placeholder-gray-400 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-[#8C6239] hover:bg-[#6D4926] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <BellRing className="w-3.5 h-3.5 text-yellow-300" />
                  <span>KIRIM REQUEST LAGU</span>
                </button>
              </div>
            ) : (
              <div className="text-center text-[10px] py-1.5 bg-red-50 text-red-800 rounded-xl font-bold uppercase tracking-wider">
                Batas maksimal 2 request lagu telah tercapai untuk sesi ini!
              </div>
            )}
          </form>
        )}
        
        {/* Step 4a: Order Status Feed */}
        {sessionStep === 'REQUEST_SONG' && (
          <OrderStatus />
        )}

        {/* Global state utility: Check cooking status loop button */}
        {(sessionStep === 'CHOOSE_MENU' || sessionStep === 'PAYMENT' || sessionStep === 'REQUEST_SONG') && (
          <div className="flex gap-1.5 justify-center">
            <button
              type="button"
              onClick={handleCheckFoodStatus}
              className="py-1.5 px-3 rounded-full border border-orange-200 hover:bg-orange-50 bg-white shadow-3xs text-[9.5px] font-black uppercase tracking-wider text-orange-850 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Timer className="w-3.5 h-3.5 text-orange-500" />
              <span>🍳 Cek Status Masakan Hidangan</span>
            </button>
          </div>
        )}

      </div>

      {/* Manual message text form input */}
      <form onSubmit={handleCustomSend} className="p-3 bg-white border-t border-[#F1EADF] flex gap-2">
        <input
          type="text"
          className="flex-1 bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:bg-white text-[#2C2520] placeholder-[#B2A494]"
          placeholder="Ketik pertanyaan untuk Sommelier AI / Resep spesifik..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="bg-[#8C6239] hover:bg-[#6D4926] disabled:bg-gray-200 text-white rounded-xl px-4 flex items-center justify-center transition-all shadow-sm shrink-0 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

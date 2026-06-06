import { QRCodeCanvas } from 'qrcode.react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  Database, 
  ChefHat, 
  CheckCircle, 
  Plus, 
  ListOrdered,
  Sparkles,
  RefreshCw,
  Play,
  Music,
  Check,
  Volume2,
  VolumeX,
  AlertCircle,
  QrCode,
  Save,
  Calendar,
  DollarSign,
  TrendingUp,
  Download,
  Printer,
  Lock,
  Unlock,
  LogOut,
  ChevronRight,
  Search,
  Pencil,
  Settings,
  Percent,
  Trash2
} from 'lucide-react';
import { CafeOrder, JukeboxTrack } from '../types';
import { supabase } from '../supabaseClient';
import CategoryManagement from '../components/CategoryManagement';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { DigitalReceipt } from '../components/DigitalReceipt';

// Live real-time ticking pending countdown timer with urgency color-alerts
const PendingCountdownTimer: React.FC<{ order: CafeOrder }> = ({ order }) => {
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  useEffect(() => {
    const calculateElapsed = () => {
      let createdTimeMs = 0;
      if (order.createdAtDate) {
        createdTimeMs = new Date(order.createdAtDate).getTime();
      } else if ((order as any).created_at) {
        createdTimeMs = new Date((order as any).created_at).getTime();
      } else if (order.createdAt) {
        const parts = order.createdAt.split(':');
        if (parts.length >= 2) {
          const d = new Date();
          d.setHours(parseInt(parts[0], 10));
          d.setMinutes(parseInt(parts[1], 10));
          d.setSeconds(0);
          createdTimeMs = d.getTime();
        }
      }

      if (createdTimeMs <= 0) {
        return 0;
      }

      const diffSec = Math.floor((Date.now() - createdTimeMs) / 1000);
      return Math.max(0, diffSec);
    };

    setSecondsElapsed(calculateElapsed());

    const timer = setInterval(() => {
      setSecondsElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(timer);
  }, [order]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    
    // Warn styling at 5m (yellow), Alert styling at 10m (flashing red)
    let colorClass = "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (m >= 10) {
      colorClass = "text-red-700 bg-red-100 border-red-300 animate-pulse font-black";
    } else if (m >= 5) {
      colorClass = "text-amber-800 bg-amber-50 border-amber-200 font-bold animate-pulse";
    }

    return (
      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[9.5px] font-semibold font-mono ${colorClass}`} title="Waktu tunggu antrean pending">
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        <span>Menunggu: {m}m {s}s</span>
      </div>
    );
  };

  return formatElapsed(secondsElapsed);
};

// Helper function to extract and format cash change alerts from an order
function getCashChangeAlerts(order: any): string[] {
  const alerts: string[] = [];
  
  if (order.customerName) {
    const parenthesizedMatches = order.customerName.match(/\(([^)]*(?:Kembali|Kembalian|change|bawa kembalian)[^)]*)\)/gi);
    if (parenthesizedMatches) {
      parenthesizedMatches.forEach((m: string) => {
        const clean = m.slice(1, -1).trim();
        if (!alerts.includes(clean)) alerts.push(clean);
      });
    } else if (order.customerName.toLowerCase().includes('bawa kembalian') || order.customerName.toLowerCase().includes('kembali')) {
      // If we contain the keyword but not necessarily parenthesized
      alerts.push(order.customerName);
    }
  }
  
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item: any) => {
      if (item.orderedBy && (item.orderedBy.toLowerCase().includes('kembali') || item.orderedBy.toLowerCase().includes('kembalian') || item.orderedBy.toLowerCase().includes('change'))) {
        const rawOrderedBy = item.orderedBy;
        const match = rawOrderedBy.match(/^([^(]+)\s*\((.+)\)$/);
        if (match) {
          const namePart = match[1].trim();
          const detailPart = match[2].trim();
          // Extract nested parens if present, e.g. "Tunai (Kembali Rp 10.000)" -> "Tunai, Kembali Rp 10.000"
          const cleanDetail = detailPart.replace(/\(([^)]+)\)/g, '$1').replace(/\)$/, '');
          const alertStr = `${namePart}: ${cleanDetail}`;
          if (!alerts.includes(alertStr)) {
            alerts.push(alertStr);
          }
        } else {
          if (!alerts.includes(rawOrderedBy)) {
            alerts.push(rawOrderedBy);
          }
        }
      }
    });
  }
  
  return alerts;
}

interface AdminProps {
  onNavigate: (page: string) => void;
}

export default function Admin({ onNavigate }: AdminProps) {
  // Authentication & Session persistent state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('scanbite_admin_verified') === 'true';
  });
  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const isProduction = typeof window !== 'undefined' && (
    window.location.hostname.includes('vercel.app') || 
    window.location.hostname.includes('ais-pre-') || 
    window.location.hostname.includes('.run.app') ||
    (import.meta as any).env?.PROD
  );

  // Tabs Navigation Selector
  const [activeTab, setActiveTab] = useState<'orders' | 'completed_history' | 'menu_management' | 'jukebox_controller' | 'qr_generator'>('orders');

  
  // States of synced database records
  const [orders, setOrders] = useState<CafeOrder[]>([]);
  const [jukeboxQueue, setJukeboxQueue] = useState<JukeboxTrack[]>([]);
  const [inlinePlayerTrack, setInlinePlayerTrack] = useState<JukeboxTrack | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLiveDatabase, setIsLiveDatabase] = useState(!!supabase);
  const [dbError, setDbError] = useState<string | null>(null);
  const [customQrisNmid, setCustomQrisNmid] = useState(localStorage.getItem('scanbite_qris_string') || 'ID1030438189');
  
  // QR Generator State
  const [qrTableNumber, setQrTableNumber] = useState('05');

  // Audio & Notification Ref
  const prevPendingCountRef = useRef<number>(0);
  const prevJukeboxLengthRef = useRef<number>(0);
  const prevOrdersCountRef = useRef<number>(0);

  // Toast Toaster Notifications
  const [adminToast, setAdminToast] = useState<string | null>(null);

  // Active receipt for thermal print preview modal
  const [activeReceipt, setActiveReceipt] = useState<CafeOrder | null>(null);

  // Upload state & Forms state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'completed' | 'error'>('idle');
  const [submittingMenu, setSubmittingMenu] = useState(false);

  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('25000');
  const [newMenuDesc, setNewMenuDesc] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState<'coffee' | 'non-coffee' | 'food' | 'dessert'>('coffee');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isPopular, setIsPopular] = useState(false);
  const [newMenuStock, setNewMenuStock] = useState('15');

  // Unified lists
  const [allMenus, setAllMenus] = useState<any[]>([]);
  const [fetchingMenus, setFetchingMenus] = useState(false);

  // History date filters
  const [historyTableFilter, setHistoryTableFilter] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Dynamic outlet states
  const [outletBranch, setOutletBranch] = useState<'Pusat' | 'Shibuya' | 'Sydney'>(() => {
    return (localStorage.getItem('scanbite_outlet_branch') as any) || 'Pusat';
  });
  const [currencySymbol, setCurrencySymbol] = useState<'IDR' | 'USD' | 'JPY' | 'SGD' | 'AUD'>(() => {
    return (localStorage.getItem('scanbite_currency_symbol') as any) || 'IDR';
  });

  // Cafe Profile & Identity States
  const [cafeName, setCafeName] = useState<string>(() => {
    return localStorage.getItem('scanbite_cafe_name') || 'ScanBite Bistro';
  });
  const [cafeAddress, setCafeAddress] = useState<string>(() => {
    return localStorage.getItem('scanbite_cafe_address') || 'Jl. Dieng Raya No. 45, Wonosobo';
  });
  const [cafePhone, setCafePhone] = useState<string>(() => {
    return localStorage.getItem('scanbite_cafe_phone') || '+62 812-3456-7890';
  });
  const [cafeReceiptFooter, setCafeReceiptFooter] = useState<string>(() => {
    return localStorage.getItem('scanbite_cafe_receipt_footer') || 'Terima kasih atas kunjungan Anda. Silakan scan QR lagi untuk pesanan berikutnya!';
  });
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    return localStorage.getItem('scanbite_admin_email') || 'bistro@scanbite.com';
  });

  // Global Localization (Bahasa / Inggris)
  const [langApp, setLangApp] = useState<'id' | 'en'>(() => {
    return (localStorage.getItem('scanbite_lang') as 'id' | 'en') || 'id';
  });

  // Taxation & Service Fee Settings
  const [taxPercent, setTaxPercent] = useState<number>(() => {
    return Number(localStorage.getItem('scanbite_tax_percent') || '10');
  });
  const [servicePercent, setServicePercent] = useState<number>(() => {
    return Number(localStorage.getItem('scanbite_service_charge_percent') || '5');
  });

  // Store Security PIN management states
  const [oldPinInput, setOldPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [pinFormError, setPinFormError] = useState<string | null>(null);

  // Active Multi-Tenant Code state
  const [currentTenant, setCurrentTenant] = useState<string>(() => {
    const stored = localStorage.getItem('current_tenant');
    if (!stored) {
      localStorage.setItem('current_tenant', 'scanbite_live');
      return 'scanbite_live';
    }
    return stored;
  });

  // Live Table grid monitoring statuses
  const [tablesList, setTablesList] = useState<string[]>([]);
  const [isTablesEmpty, setIsTablesEmpty] = useState<boolean>(false);
  const [tablesData, setTablesData] = useState<any[]>([]);
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [newTableNum, setNewTableNum] = useState('');

  // Merchant logo state and management hooks
  const [merchantLogo, setMerchantLogo] = useState<string>(() => {
    return localStorage.getItem('scanbite_merchant_logo') || '';
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Instantly handle logo image selection & create local preview
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const url = URL.createObjectURL(file);
      setLogoPreview(url);
    }
  };

  const cleanLogoPreview = () => {
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoPreview(null);
    setLogoFile(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const handleUpdateLogo = async () => {
    if (!logoFile) return;
    setIsSavingLogo(true);
    try {
      let finalLogoUrl = '';

      // Upload to Supabase Storage if database is alive
      if (supabase) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `merchant-logo-${Date.now()}.${fileExt}`;
        const filePath = `store/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('menu-images')
          .upload(filePath, logoFile, {
            cacheControl: '3600',
            upsert: true
          });

        if (!uploadErr) {
          const { data: publicData } = supabase.storage
            .from('menu-images')
            .getPublicUrl(filePath);

          if (publicData?.publicUrl) {
            finalLogoUrl = publicData.publicUrl;
          }
        } else {
          console.warn('Storage upload failed, falling back to base64 encoding: ', uploadErr.message);
        }
      }

      // Base64 file reader fallback for sandbox persistence
      if (!finalLogoUrl) {
        finalLogoUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(logoFile);
        });
      }

      setMerchantLogo(finalLogoUrl);
      localStorage.setItem('scanbite_merchant_logo', finalLogoUrl);
      
      // Attempt syncing to shop configurations if potential custom table exists
      try {
        if (supabase) {
          await supabase.from('settings').upsert([
            { key: 'merchant_logo', value: finalLogoUrl }
          ]);
        }
      } catch (err) {
        // Silent block - fallback is fully handled by localStorage
      }

      triggerNotification('🟢 Sukses memperbarui Logo Merchant Scanbite!');
      cleanLogoPreview();
    } catch (err: any) {
      console.error('Failed to submit brand logo:', err);
      triggerNotification('❌ Gagal mengunggah logo baru.');
    } finally {
      setIsSavingLogo(false);
    }
  };

  // Memory leak prevention
  useEffect(() => {
    return () => {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  // Fetch and sync store settings from Supabase if alive
  const fetchStoreSettings = useCallback(async () => {
    if (!supabase) return;
    try {
      const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
      console.log('📡 Mencoba mengambil pengaturan toko dari Supabase untuk tenant:', activeTenant);
      const { data, error } = await supabase
        .from('sb_settings')
        .select('*')
        .eq('kode_tenant', activeTenant)
        .maybeSingle();

      if (error) {
        console.error('❌ Kesalahan saat mengambil pengaturan toko dari Supabase:', error);
        return;
      }

      if (data) {
        console.log('☁️ Pengaturan toko berhasil dimuat dari Supabase:', data);
        if (data.cafe_name) {
          setCafeName(data.cafe_name);
          localStorage.setItem('scanbite_cafe_name', data.cafe_name);
        }
        if (data.admin_pin) {
          localStorage.setItem('scanbite_admin_pin', data.admin_pin);
        }
        if (data.currency_code) {
          setCurrencySymbol(data.currency_code as any);
          localStorage.setItem('scanbite_currency', data.currency_code);
          localStorage.setItem('scanbite_currency_symbol', data.currency_code);
        }
        if (data.logo_url) {
          setMerchantLogo(data.logo_url);
          localStorage.setItem('scanbite_merchant_logo', data.logo_url);
        }
        if (data.app_language) {
          setLangApp(data.app_language);
          localStorage.setItem('scanbite_lang', data.app_language);
        }
      }
    } catch (err) {
      console.error('❌ Gagal sinkronisasi pembacaan pengaturan toko dari Supabase:', err);
    }
  }, [currentTenant]);

  // Pre-load and initialize store settings from localStorage on first mount
  useEffect(() => {
    // 1. Initialise 'scanbite_admin_pin' (default '1234')
    const storedPin = localStorage.getItem('scanbite_admin_pin');
    if (!storedPin) {
      localStorage.setItem('scanbite_admin_pin', '1234');
    }

    // 2. Initialise 'scanbite_cafe_name'
    const storedCafeName = localStorage.getItem('scanbite_cafe_name');
    if (!storedCafeName) {
      localStorage.setItem('scanbite_cafe_name', 'ScanBite Bistro');
      setCafeName('ScanBite Bistro');
    } else {
      setCafeName(storedCafeName);
    }

    // 3. Initialise 'scanbite_currency' & 'scanbite_currency_symbol' (default 'IDR')
    const storedCurrency = localStorage.getItem('scanbite_currency') || localStorage.getItem('scanbite_currency_symbol') || 'IDR';
    localStorage.setItem('scanbite_currency', storedCurrency);
    localStorage.setItem('scanbite_currency_symbol', storedCurrency);
    setCurrencySymbol(storedCurrency as any);

    // Initialise 'scanbite_admin_email'
    const storedEmail = localStorage.getItem('scanbite_admin_email');
    if (!storedEmail) {
      localStorage.setItem('scanbite_admin_email', 'bistro@scanbite.com');
      setAdminEmail('bistro@scanbite.com');
    } else {
      setAdminEmail(storedEmail);
    }

    fetchStoreSettings();
  }, [currentTenant, fetchStoreSettings]);

  // Submit and update entire store settings, validating security PIN
  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinFormError(null);

    // Ambil nilai PIN yang sedang aktif langsung dari LocalStorage sebelum melakukan komparasi
    const currentActivePin = localStorage.getItem('scanbite_admin_pin') || '1234';

    // Check if the user is attempting to update the security PIN
    if (oldPinInput || newPinInput || confirmNewPinInput) {
      if (oldPinInput !== currentActivePin) {
        setPinFormError('PIN Lama salah/tidak sesuai!');
        return;
      }
      if (!/^\d{4}$/.test(newPinInput)) {
        setPinFormError('PIN Baru harus berupa 4-digit angka numeric!');
        return;
      }
      if (newPinInput !== confirmNewPinInput) {
        setPinFormError('Konfirmasi PIN Baru tidak sesuai!');
        return;
      }

      // Simpan nilai PIN baru tersebut ke LocalStorage dengan key 'scanbite_admin_pin'
      localStorage.setItem('scanbite_admin_pin', newPinInput);
      
      // Reset form inputnya menjadi string kosong
      setOldPinInput('');
      setNewPinInput('');
      setConfirmNewPinInput('');
    }

    // Pastikan data nama cafe, mata uang, email, dan logo juga ikut tersimpan sempurna ke LocalStorage di dalam fungsi yang sama
    localStorage.setItem('scanbite_cafe_name', cafeName);
    localStorage.setItem('scanbite_admin_email', adminEmail);
    localStorage.setItem('scanbite_cafe_address', cafeAddress);
    localStorage.setItem('scanbite_cafe_phone', cafePhone);
    localStorage.setItem('scanbite_cafe_receipt_footer', cafeReceiptFooter);
    
    localStorage.setItem('scanbite_currency', currencySymbol);
    localStorage.setItem('scanbite_currency_symbol', currencySymbol);

    if (merchantLogo) {
      localStorage.setItem('scanbite_merchant_logo', merchantLogo);
    }

    // Cloud syncing with Supabase - upsert to table 'sb_settings'
    if (supabase) {
      try {
        const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
        const pinToSync = localStorage.getItem('scanbite_admin_pin') || '1234';
        const payload = {
          kode_tenant: activeTenant,
          cafe_name: cafeName,
          admin_pin: pinToSync,
          currency_code: currencySymbol,
          app_language: langApp,
          logo_url: merchantLogo || null
        };

        console.log('🔄 Melakukan upsert pengaturan toko ke Supabase...', payload);
        const { error: upsertErr } = await supabase
          .from('sb_settings')
          .upsert([payload])
          .eq('kode_tenant', activeTenant);

        if (upsertErr) {
          console.error('❌ Terjadi kesalahan saat mensinkronkan pengaturan toko ke Supabase:', upsertErr);
        } else {
          console.log('✅ Berhasil menyimpan pengaturan toko ke Supabase!');
        }
      } catch (err) {
        console.error('❌ Gagal sinkronisasi penyimpanan pengaturan toko ke Supabase:', err);
      }
    }

    triggerNotification('🟢 Sukses memperbarui PIN Otorisasi & Pengaturan Toko!');
    alert("Pengaturan Berhasil Disimpan!");
  };

  // Provide aliases for robustness
  const handleUpdatePassword = handleUpdateSettings;
  const handleUpdate = handleUpdateSettings;
  const handleSubmit = handleUpdateSettings;

  const triggerNotification = (msg: string) => {
    setAdminToast(msg);
    setTimeout(() => {
      setAdminToast((curr) => curr === msg ? null : curr);
    }, 3500);
  };

  // Tactile PIN Input buttons click handler
  const handleKeyPress = (num: string) => {
    setLoginError(null);
    if (pinInput.length < 4) {
      setPinInput(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPinInput('');
  };

  // Direct login submit for manual keying/non-keypad entries
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentAdminPin = localStorage.getItem('scanbite_admin_pin') || '1234';
    if (pinInput === currentAdminPin) {
      setIsAuthenticated(true);
      localStorage.setItem('scanbite_admin_verified', 'true');
      setPinInput('');
      setLoginError(null);
      triggerNotification('🔓 Sesi Kasir Terbuka! Selamat bekerja.');
    } else {
      setLoginError('Kode PIN salah. Silakan coba lagi.');
      setPinInput('');
    }
  };

  // Auto-verify when 4 digits are entered via numeric keyboard
  useEffect(() => {
    if (pinInput.length === 4) {
      const currentAdminPin = localStorage.getItem('scanbite_admin_pin') || '1234';
      if (pinInput === currentAdminPin) {
        setIsAuthenticated(true);
        localStorage.setItem('scanbite_admin_verified', 'true');
        setPinInput('');
        setLoginError(null);
        triggerNotification('🔓 Akses Diberikan. Selamat datang, Kasir!');
      } else {
        setLoginError('Kode PIN salah. Silakan coba lagi.');
        setPinInput('');
      }
    }
  }, [pinInput]);

  const handleLogOut = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('scanbite_admin_verified');
    triggerNotification('🔒 Sesi kasir sukses diakhiri.');
  };

  // Synthesize elegant kitchen bell to warn the chef/barista of new incoming order
  const playKitchenChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      
      // Chime Sound 1: Ding
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.7);

      // Chime Sound 2: Dong
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12); // A5
      gain2.gain.setValueAtTime(0, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.12, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.9);
    } catch (err) {
      console.warn('Browser AudioContext was locked or blocked by safety policy:', err);
    }
  };

  // Synthesize a high-pitched melodic chime when a customer requests a song
  const playSongRequestChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      
      // Chime Note 1: High E5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      // Chime Note 2: Higher A5 after short delay
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.08, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.55);
    } catch (err) {
      console.warn('Browser AudioContext was locked or blocked by safety policy:', err);
    }
  };

  // 1. Ambil & Susun Rincian Pesanan
  const fetchOrders = async () => {
    if (!supabase) {
      // offline fallback
      const saved = localStorage.getItem('scanbite_orders');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setOrders(parsed);
          } else if (parsed) {
            setOrders([parsed]);
          } else {
            setOrders([]);
          }
        } catch (e) {
          setOrders([]);
        }
      } else {
        const defaultSeeds: CafeOrder[] = [
          {
            id: 'ord-1025',
            tableNumber: '03',
            customerName: 'Yusuf Ismanto',
            items: [
              { name: 'Classic Cafe Latte Melt', price: 29000, quantity: 2, orderedBy: 'Yusuf' },
              { name: 'Cinnamon Toast Fluffy', price: 25000, quantity: 1, orderedBy: 'Yusuf' }
            ],
            totalPrice: 83000,
            status: 'pending',
            createdAt: '18:02',
            paymentMethod: 'cash',
            paymentStatus: 'unpaid',
            sessionId: 'sess-03'
          },
          {
            id: 'ord-1026',
            tableNumber: '05',
            customerName: 'Rian Prasetya',
            items: [
              { name: 'Beef Wellington Slices', price: 95000, quantity: 1, orderedBy: 'Rian' }
            ],
            totalPrice: 109250,
            status: 'preparing',
            createdAt: '17:55',
            paymentMethod: 'cash',
            paymentStatus: 'unpaid',
            sessionId: 'sess-05'
          }
        ];
        setOrders(defaultSeeds);
        localStorage.setItem('scanbite_orders', JSON.stringify(defaultSeeds));
      }
      return;
    }

    setLoading(true);
    setDbError(null);
    try {
      const { data: dbOrders, error: ordersError } = await supabase
        .from('sb_orders')
        .select('*')
        .order('id', { ascending: false });

      if (ordersError) throw ordersError;

      if (dbOrders) {
        // Fix for 'orders.map is not a function' error: protect data type before setting state
        let ordersData: any[] = [];
        if (Array.isArray(dbOrders)) {
          ordersData = dbOrders;
        } else if (dbOrders) {
          ordersData = [dbOrders];
        }

        let menusList: any[] = [];
        const { data: dbMenus } = await supabase.from('sb_menus').select('id, name, price');
        if (dbMenus) {
          menusList = dbMenus;
        } else {
          const { data: fallbackMenus } = await supabase.from('menu_items').select('id, name, price');
          if (fallbackMenus) menusList = fallbackMenus;
        }

        const mapped: CafeOrder[] = ordersData.map((ord: any) => {
          // Attempt extraction of items from multiple possible JSON columns in sb_orders
          let orderItemsArray: any[] = [];
          
          let parsedItems: any = ord.items || ord.order_items || ord.item_pesanan;
          if (typeof parsedItems === 'string') {
            try {
              parsedItems = JSON.parse(parsedItems);
            } catch (je) {
              parsedItems = null;
            }
          }
          
          if (Array.isArray(parsedItems)) {
            orderItemsArray = parsedItems;
          }

          const itemsList = orderItemsArray.map((item: any) => {
            const matchMenu = menusList.find(m => m.id?.toString() === item.menu_id?.toString() || m.name === (item.item_name || item.name || item.menu_name));
            return {
              name: item.item_name || item.name || item.menu_name || (matchMenu ? matchMenu.name : `Menu ID #${item.menu_id}`),
              price: item.price || (matchMenu ? Number(matchMenu.price) : 25000),
              quantity: Number(item.quantity) || 1,
              orderedBy: item.customer_name || item.ordered_by || item.orderedBy || ord.customer_name || 'Pelanggan Meja'
            };
          });

          return {
            id: ord.id.toString(),
            tableNumber: ord.table_number || '05',
            customerName: ord.customer_name || itemsList[0]?.orderedBy || 'Pelanggan',
            items: itemsList,
            totalPrice: Number(ord.total_price) || itemsList.reduce((sum, i) => sum + (i.price * i.quantity), 0),
            status: ord.status === 'menunggu' ? 'pending' : (ord.status as 'pending' | 'preparing' | 'delivered'),
            paymentMethod: ord.payment_method || 'cash',
            paymentStatus: ord.payment_status || 'unpaid',
            sessionId: ord.session_id || `sess-${ord.table_number}`,
            createdAt: new Date(ord.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAtDate: ord.created_at ? new Date(ord.created_at) : new Date()
          };
        });

        setOrders(mapped);
        setIsLiveDatabase(true);
      }
    } catch (err: any) {
      console.warn('Fallback local admin state active: ', err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Jukebox Sync Queue
  const fetchJukeboxQueue = async () => {
    if (!supabase) {
      const saved = localStorage.getItem('scanbite_jukebox_queue');
      if (saved) {
        setJukeboxQueue(JSON.parse(saved));
      } else {
        setJukeboxQueue([]);
      }
      return;
    }

    try {
      const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
      const { data, error } = await supabase
        .from('sb_song_requests')
        .select('*')
        .eq('tenant_id', activeTenant)
        .order('created_at', { ascending: true });

      if (error) throw error;

      console.log("🔍 [AUDIT JUKEBOX READ Admin.tsx] Data mentah dari Supabase sb_song_requests:", data);

      if (data) {
        const mapped: JukeboxTrack[] = data.map((t: any, idx: number) => ({
          id: t.id,
          title: t.song_title || t.title || t.track_title,
          artist: t.artist || t.artist_name,
          requestedBy: t.table_number || 'Kafe',
          votes: Number(t.votes) || 1,
          duration: t.duration || '3:30',
          artworkUrl: t.artwork_url || t.image_url || '',
          youtubeId: t.youtube_id || '',
          spotifyUri: t.spotify_uri || '',
          isPlaying: t.status === 'played'
        }));

        const isPlaying = mapped.filter((t) => t.isPlaying);
        const remaining = mapped.filter((t) => !t.isPlaying);
        remaining.sort((a, b) => b.votes - a.votes);

        const finalQueue = [...isPlaying, ...remaining];
        setJukeboxQueue(finalQueue);
        localStorage.setItem('scanbite_jukebox_queue', JSON.stringify(finalQueue));
        setIsLiveDatabase(true);
      }
    } catch (err: any) {
      console.warn('Sync rejected jukebox: ', err.message);
    }
  };

  const fetchTables = async () => {
    let activeTables: string[] = [];
    let liveDbTables: any[] | null = null;

    if (supabase) {
      try {
        const activeTenant = localStorage.getItem('current_tenant') || 'scanbite_live';
        const { data: dbTables, error } = await supabase
          .from('sb_tables')
          .select('*')
          .eq('tenant_id', activeTenant);

        if (!error && dbTables) {
          liveDbTables = dbTables;
          activeTables = dbTables
            .map((t: any) => t.table_number?.toString().padStart(2, '0'))
            .filter(Boolean)
            .sort((a, b) => parseInt(a) - parseInt(b));
          
          setIsTablesEmpty(activeTables.length === 0);
          localStorage.setItem('scanbite_tables', JSON.stringify(activeTables));
        }
      } catch (err: any) {
        console.warn('Could not query live sb_tables from Supabase:', err.message);
      }
    }
    
    setTablesList(activeTables);

    const baseDetails = activeTables.map(num => {
      const dbRow = liveDbTables?.find(t => {
        const tNum = (t.table_number || t.nomor_meja || t.nomor_meja_id || t.id || '').toString().replace('Meja ', '').trim().padStart(2, '0');
        return tNum === num;
      });
      return {
        nomor_meja_id: num,
        nomor_meja: `Meja ${num}`,
        status: dbRow?.status || 'KOSONG',
        session_id: null,
        nama_pelanggan: '-'
      };
    });

    if (!supabase) {
      const savedDetails = localStorage.getItem('scanbite_tables_details');
      if (savedDetails) {
        try {
          const parsed = JSON.parse(savedDetails);
          const alignedDetails = activeTables.map(num => {
            const existing = parsed.find((p: any) => p.nomor_meja_id === num);
            return existing || {
              nomor_meja_id: num,
              nomor_meja: `Meja ${num}`,
              status: 'KOSONG',
              session_id: null,
              nama_pelanggan: '-'
            };
          });
          setTablesData(alignedDetails);
          return;
        } catch (_) {}
      }
      setTablesData(baseDetails);
      return;
    }

    try {
      // Fetch orders to display table information correctly (overlaying orders on top of actual table status)
      const { data: ordersData, error } = await supabase
        .from('sb_orders')
        .select('*')
        .neq('status', 'completed');

      if (!error && ordersData) {
        const computedDetails = activeTables.map(num => {
          const dbRow = liveDbTables?.find(t => {
            const tNum = (t.table_number || t.nomor_meja || t.nomor_meja_id || t.id || '').toString().replace('Meja ', '').trim().padStart(2, '0');
            return tNum === num;
          });

          const tableOrders = ordersData.filter(o => {
            const mVal = (o.table_number || '').toString();
            return mVal.includes(num) || mVal.includes(parseInt(num).toString());
          });

          // Active order has payment_status !== 'paid'
          const activeOrder = tableOrders.find(o => o.payment_status !== 'paid' && o.status !== 'completed');

          const isTerisiInDb = dbRow?.status === 'TERISI';

          let finalStatus = 'KOSONG';
          if (activeOrder) {
            finalStatus = activeOrder.status === 'pending' ? 'MELAYANI' : 'SEDANG MAKAN';
          } else if (isTerisiInDb) {
            finalStatus = 'TERISI';
          }

          return {
            nomor_meja_id: num,
            nomor_meja: `Meja ${num}`,
            status: finalStatus,
            session_id: activeOrder?.id || null,
            nama_pelanggan: activeOrder?.customer_name || '-'
          };
        });

        setTablesData(computedDetails);
        localStorage.setItem('scanbite_tables_details', JSON.stringify(computedDetails));
      } else {
        setTablesData(baseDetails);
      }
    } catch (e: any) {
      console.warn('Error fetching tables dynamically from orders:', e.message);
      setTablesData(baseDetails);
    }
  };

  const initializeTables = async () => {
    if (!supabase) return;
    const initialTables = ['01', '03', '05', '08', '12', '18'];
    const activeTenant = localStorage.getItem('current_tenant') || 'scanbite_live';
    
    setLoading(true);
    try {
        const payload = initialTables.map(num => ({
            tenant_id: activeTenant,
            table_number: num,
            status: 'KOSONG'
        }));
        const { error } = await supabase.from('sb_tables').insert(payload);
        if (error) throw error;
        triggerNotification('🟢 Meja berhasil diinisialisasi!');
        setIsTablesEmpty(false);
        fetchTables();
    } catch (err: any) {
        console.error('❌ Gagal inisialisasi meja:', err);
        triggerNotification('❌ Gagal inisialisasi meja.');
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteTable = async (tableNum: string) => {
    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus Meja ${tableNum} dari sistem?`);
    if (!confirmDelete) return;

    const formattedNum = tableNum.padStart(2, '0');
    const updatedList = tablesList.filter(t => t !== formattedNum);
    setTablesList(updatedList);
    localStorage.setItem('scanbite_tables', JSON.stringify(updatedList));

    const updatedDetails = tablesData.filter(t => t.nomor_meja_id !== formattedNum);
    setTablesData(updatedDetails);
    localStorage.setItem('scanbite_tables_details', JSON.stringify(updatedDetails));

    if (supabase) {
      try {
        const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
        // Try deleting matching multiple potential schemas
        const possibleColumns = ['table_number', 'nomor_meja', 'nomor_meja_id', 'id'];
        for (const col of possibleColumns) {
          try {
            const { error: delErr } = await supabase
              .from('sb_tables')
              .delete()
              .eq('tenant_id', activeTenant)
              .eq(col, formattedNum);
            
            if (!delErr) {
              console.log(`✅ Table deleted in Supabase matching column ${col}`);
              break;
            }
          } catch (_) {}
        }
        triggerNotification(`🟢 Meja ${formattedNum} berhasil dihapus dari database!`);
      } catch (err: any) {
        console.warn('Database delete table exception: ', err.message);
      }
    } else {
      triggerNotification(`✓ Simulasi: Meja ${formattedNum} berhasil dihapus offline!`);
    }

    fetchTables();
  };

  const handleKosongkanMeja = async (tableNum: string, orderId?: string) => {
    let finalTableNum = tableNum;
    
    if (tableNum.includes('sess-') || tableNum.length > 4 || isNaN(Number(tableNum.replace('Meja ', '').trim()))) {
      const matchedOrder = orders.find(o => o.id === tableNum || o.sessionId === tableNum);
      if (matchedOrder) {
        finalTableNum = matchedOrder.tableNumber;
      } else {
        const matchedTable = tablesData.find(t => t.session_id === tableNum);
        if (matchedTable) {
          finalTableNum = matchedTable.nomor_meja_id;
        }
      }
    }
    
    const formattedMeja = finalTableNum.replace('Meja ', '').trim().padStart(2, '0');
    
    if (supabase) {
      try {
        // 1. Update orders status and payment status in Supabase so they are fully resolved
        if (orderId && !orderId.startsWith('sess-')) {
          await supabase.from('sb_orders').update({ status: 'completed', payment_status: 'paid' }).eq('id', orderId);
        } else {
          // If we only have table number or fake ID, complete all active & non-completed orders for this table
          const normalNum = parseInt(formattedMeja).toString();
          await supabase.from('sb_orders').update({ status: 'completed', payment_status: 'paid' })
            .or(`table_number.eq."${formattedMeja}",table_number.eq."${normalNum}",table_number.eq."Meja ${formattedMeja}",table_number.eq."Meja ${normalNum}"`)
            .neq('status', 'completed');
        }

        // 2. IMPORTANT: Update the table status in Supabase sb_tables safely across potential column schemas
        const normalMejaNum = parseInt(formattedMeja).toString();
        const possibleColumns = ['table_number', 'nomor_meja', 'nomor_meja_id', 'id'];
        for (const col of possibleColumns) {
          try {
            const { error: updErr } = await supabase
              .from('sb_tables')
              .update({ status: 'KOSONG' })
              .or(`${col}.eq."${formattedMeja}",${col}.eq."${normalMejaNum}",${col}.eq."Meja ${formattedMeja}",${col}.eq."Meja ${normalMejaNum}"`);
            
            if (!updErr) {
              console.log(`✅ Table status updated in sb_tables matching column ${col}`);
              break;
            }
          } catch (_) {}
        }

        // 3. Send custom instant broadcast to client-orders-live and checkout-orders-live channels
        const channel1 = supabase.channel('client-orders-live');
        channel1.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel1.send({
              type: 'broadcast',
              event: 'order_updated',
              payload: { tableNumber: formattedMeja, status: 'completed' }
            });
          }
        });

        const channel2 = supabase.channel('checkout-orders-live');
        channel2.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel2.send({
              type: 'broadcast',
              event: 'order_updated',
              payload: { tableNumber: formattedMeja, status: 'completed' }
            });
          }
        });
          
      } catch (err) {
        console.warn('Error clearing table in Supabase:', err);
      }
    }

    // Update local state for orders and table status
    setOrders(prev => prev.map(o => 
      (o.id === orderId || (o.tableNumber === formattedMeja && o.status !== 'completed'))
        ? { ...o, status: 'completed', paymentStatus: 'paid' }
        : o
    ));

    const savedOrders = localStorage.getItem('scanbite_orders');
    if (savedOrders) {
      try {
        const parsed = JSON.parse(savedOrders);
        const updated = parsed.map((o: any) => 
          (o.id === orderId || (o.table_number === formattedMeja && o.status !== 'completed'))
            ? { ...o, status: 'completed', payment_status: 'paid' }
            : o
        );
        localStorage.setItem('scanbite_orders', JSON.stringify(updated));
      } catch (e) {}
    }

    setTablesData(prev => prev.map(t => 
      t.nomor_meja_id === formattedMeja
        ? { ...t, status: 'KOSONG', session_id: null, nama_pelanggan: '-' }
        : t
    ));
    
    triggerNotification(`🟢 Meja ${formattedMeja} dibersihkan!`);
    await fetchTables();
    await fetchOrders();
  };

  const handleConfirmQrisPayment = async (sessionId: string) => {
    await handleConfirmCashPayment(sessionId);
  };

  const handleConfirmCashPayment = async (sessionId: string) => {
    // 1. Update orders locally (localStorage & State state)
    const savedOrders = localStorage.getItem('scanbite_orders');
    if (savedOrders) {
      try {
        const parsed = JSON.parse(savedOrders);
        const updated = parsed.map((o: any) => 
          (o.sessionId === sessionId || o.session_id === sessionId || o.id === sessionId) 
            ? { ...o, paymentStatus: 'paid' } 
            : o
        );
        localStorage.setItem('scanbite_orders', JSON.stringify(updated));
      } catch (e) {
        console.warn('Error parsing saved orders for cash confirmation:', e);
      }
    }

    setOrders(prevOrders => 
      prevOrders.map(o => 
        (o.sessionId === sessionId || o.id === sessionId || o.session_id === sessionId) 
          ? { ...o, paymentStatus: 'paid' } 
          : o
      )
    );

    // Set high-level active receipt preview for kasir after confirmation
    const updatedOrder = orders.find(o => o.id === sessionId || o.sessionId === sessionId || o.session_id === sessionId);
    if (updatedOrder) {
      setActiveReceipt({
        ...updatedOrder,
        paymentStatus: 'paid'
      });
    }

    // 2. Locate table number related to this session to update its visual status to SEDANG MAKAN
    let tableNumToUpdate = '';
    const matchedTableBySession = tablesData.find(t => t.session_id === sessionId);
    if (matchedTableBySession) {
      tableNumToUpdate = matchedTableBySession.nomor_meja_id;
    } else {
      const matchedOrder = orders.find(o => o.sessionId === sessionId || o.id === sessionId);
      if (matchedOrder) {
        tableNumToUpdate = matchedOrder.tableNumber;
      }
    }

    if (tableNumToUpdate) {
      setTablesData(prev => 
        prev.map(t => 
          t.nomor_meja_id === tableNumToUpdate 
            ? { ...t, status: 'SEDANG MAKAN' } 
            : t
        )
      );

      const savedDetails = localStorage.getItem('scanbite_tables_details');
      if (savedDetails) {
        try {
          const parsed = JSON.parse(savedDetails);
          const updated = parsed.map((t: any) => 
            t.nomor_meja_id === tableNumToUpdate 
              ? { ...t, status: 'SEDANG MAKAN' } 
              : t
          );
          localStorage.setItem('scanbite_tables_details', JSON.stringify(updated));
        } catch (e) {
          console.warn('Error updating local storage details for cash confirmation:', e);
        }
      }
    }

    // 3. Keep in touch with Supabase DB
    if (supabase) {
      try {
        const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
        // Secure transaction lookup using pure transaction ID or optional tenant filter fallback
        try {
          await supabase
            .from('sb_orders')
            .update({ status: 'preparing' })
            .eq('id', sessionId)
            .eq('tenant_id', activeTenant);
        } catch (_) {
          await supabase
            .from('sb_orders')
            .update({ status: 'preparing' })
            .eq('id', sessionId);
        }

        triggerNotification(`🟢 Sukses konfirmasi pembayaran cash untuk Sesi ${sessionId}!`);
      } catch (err: any) {
        console.warn('Database update cash confirmation error:', err.message);
      }
    } else {
      triggerNotification(`✓ Simulasi: Pembayaran Cash Sesi ${sessionId} Lunas! Meja #${tableNumToUpdate || 'Bistro'} disetel ke SEDANG MAKAN.`);
    }

    fetchTables();
    fetchOrders();
  };

  // Realtime subscription logic
  useEffect(() => {
    if (!isAuthenticated) return; // Only fetch if authenticated

    fetchOrders();
    fetchJukeboxQueue();
    fetchTables();

    if (!supabase) return;

    const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';

    const liveChannel = supabase.channel('dashboard-synced')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sb_orders' }, (payload: any) => {
        console.log("⚡ [REALTIME ALERT] Perubahan terdeteksi di tabel sb_orders:", payload);
        const rowTenant = payload.new?.tenant_id || payload.old?.tenant_id;
        if (!rowTenant || rowTenant === activeTenant) {
          fetchOrders();
          fetchTables();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sb_song_requests' }, (payload: any) => {
        console.log("⚡ [REALTIME ALERT] Perubahan terdeteksi di tabel sb_song_requests:", payload);
        const rowTenant = payload.new?.tenant_id || payload.old?.tenant_id;
        if (!rowTenant || rowTenant === activeTenant) {
          fetchJukeboxQueue();
          fetchTables();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jukebox_queue' }, (payload: any) => {
        console.log("⚡ [REALTIME ALERT] Perubahan terdeteksi di tabel jukebox_queue:", payload);
        const rowTenant = payload.new?.tenant_id || payload.old?.tenant_id;
        if (!rowTenant || rowTenant === activeTenant) {
          fetchJukeboxQueue();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jukebox_tracks' }, (payload: any) => {
        console.log("⚡ [REALTIME ALERT] Perubahan terdeteksi di tabel jukebox_tracks:", payload);
        const rowTenant = payload.new?.tenant_id || payload.old?.tenant_id;
        if (!rowTenant || rowTenant === activeTenant) {
          fetchJukeboxQueue();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks' }, (payload: any) => {
        console.log("⚡ [REALTIME ALERT] Perubahan terdeteksi di tabel tracks:", payload);
        const rowTenant = payload.new?.tenant_id || payload.old?.tenant_id;
        if (!rowTenant || rowTenant === activeTenant) {
          fetchJukeboxQueue();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, (payload: any) => {
        console.log("⚡ [REALTIME ALERT] Perubahan terdeteksi di tabel songs:", payload);
        const rowTenant = payload.new?.tenant_id || payload.old?.tenant_id;
        if (!rowTenant || rowTenant === activeTenant) {
          fetchJukeboxQueue();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sb_tables' }, (payload: any) => {
        console.log("⚡ [REALTIME ALERT] Perubahan terdeteksi di tabel sb_tables:", payload);
        const rowTenant = payload.new?.tenant_id || payload.old?.tenant_id;
        if (!rowTenant || rowTenant === activeTenant) {
          fetchTables();
        }
      })
      .subscribe((status, err) => {
        console.log(`🔌 [REALTIME STATUS] Koneksi realtime dashboard-synced: ${status}`, err || '');
      });

    return () => {
      supabase.removeChannel(liveChannel);
    };
  }, [isAuthenticated, currentTenant]);

  // Synchronite via domestic custom-event trigger
  useEffect(() => {
    const handleDomesticSync = () => {
      fetchOrders();
      fetchTables();
      fetchJukeboxQueue();
    };
    window.addEventListener('scanbite-sync', handleDomesticSync);
    return () => {
      window.removeEventListener('scanbite-sync', handleDomesticSync);
    };
  }, []);

  // Robust fallback polling to guarantee sync even if Supabase Realtime WebSocket drops or has latency
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      fetchOrders();
      fetchJukeboxQueue();
      fetchTables();
    }, 10000); // 10 seconds interval
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Unified Order / Ticket Alert Realtime Notification Listener
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const currentPendingCount = orders.filter(o => o.status === 'pending').length;
    
    // Check if total order count OR pending counts have increased to ring the physical chime
    const totalCountIncreased = orders.length > prevOrdersCountRef.current;
    const pendingCountIncreased = currentPendingCount > prevPendingCountRef.current;

    if (totalCountIncreased || pendingCountIncreased) {
      // Avoid firing on initial empty load
      if (prevOrdersCountRef.current > 0 || prevPendingCountRef.current > 0) {
        playKitchenChime();
        triggerNotification('🔔 Ada pesanan baru masuk! Silakan periksa antrean pesanan/dapur.');
      }
    }

    prevOrdersCountRef.current = orders.length;
    prevPendingCountRef.current = currentPendingCount;
  }, [orders, isAuthenticated]);

  // Jukebox Song Requests Alert Realtime Notification Listener
  useEffect(() => {
    if (!isAuthenticated) return;

    if (jukeboxQueue.length > prevJukeboxLengthRef.current) {
      // Avoid firing on initial load
      if (prevJukeboxLengthRef.current > 0) {
        playSongRequestChime();
        const latestSong = jukeboxQueue[jukeboxQueue.length - 1];
        if (latestSong) {
          triggerNotification(`🎵 Request Lagu Baru: "${latestSong.title}" - ${latestSong.artist} dari Meja #${latestSong.requestedBy}!`);
        } else {
          triggerNotification('🎵 Seseorang baru saja merequest lagu baru di jukebox!');
        }
      }
    }

    prevJukeboxLengthRef.current = jukeboxQueue.length;
  }, [jukeboxQueue, isAuthenticated]);

  const fetchAllMenus = async () => {
    if (!supabase) {
      // load fallback
      const { MENU_ITEMS } = await import('../data');
      const seeded = MENU_ITEMS.map((item, idx) => ({
        ...item,
        stock_quantity: item.isPopular ? 3 : (12 + (idx % 3) * 6)
      }));
      setAllMenus(seeded);
      return;
    }

    setFetchingMenus(true);
    try {
      let { data, error } = await supabase
        .from('sb_menus')
        .select('*');

      if (error) {
        const fallbackRes = await supabase
          .from('menu_items')
          .select('*');
        if (!fallbackRes.error && fallbackRes.data) {
          data = fallbackRes.data;
        } else {
          throw error;
        }
      }

      if (data) {
        const mapped = data.map((item: any) => ({
          id: item.id?.toString() || '',
          name: item.name || '',
          description: item.description || '',
          price: Number(item.price) || 0,
          category: item.category || 'coffee',
          image: item.image_url || item.image || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80',
          rating: Number(item.rating) || 4.8,
          isAvailable: item.is_available ?? item.isAvailable ?? true,
          isPopular: item.is_popular ?? item.isPopular ?? false,
          stock_quantity: Number(item.stock_quantity ?? item.stock ?? 15)
        }));
        setAllMenus(mapped);
      }
    } catch (err: any) {
      console.warn('Fallback menu error: ', err.message);
    } finally {
      setFetchingMenus(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllMenus();
    }
  }, [isAuthenticated]);

  // Update status pesanan
  const handleUpdateOrderStatus = async (orderId: string, currentStatus: string) => {
    let nextStatus: string = 'preparing';
    if (currentStatus === 'pending') {
      nextStatus = 'preparing';
    } else if (currentStatus === 'preparing') {
      nextStatus = 'ready';
    } else if (currentStatus === 'ready') {
      nextStatus = 'delivered';
    }

    if (supabase) {
      try {
        const { error } = await supabase
          .from('sb_orders')
          .update({ status: nextStatus })
          .eq('id', orderId);

        if (error) throw error;
        
        // Custom broadcast to instantly alert customers
        const channel1 = supabase.channel('client-orders-live');
        channel1.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel1.send({
              type: 'broadcast',
              event: 'order_updated',
              payload: { orderId, status: nextStatus }
            });
          }
        });

        const channel2 = supabase.channel('checkout-orders-live');
        channel2.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel2.send({
              type: 'broadcast',
              event: 'order_updated',
              payload: { orderId, status: nextStatus }
            });
          }
        });

        triggerNotification(`🟢 Status pesanan #${orderId} diubah ke ${nextStatus.toUpperCase()}`);
        fetchOrders();
      } catch (err: any) {
        alert(`Gagal query update: ${err.message}`);
      }
    } else {
      setOrders((prev) => {
        const updated = prev.map((ord) => 
          ord.id === orderId ? { ...ord, status: nextStatus } : ord
        );
        localStorage.setItem('scanbite_orders', JSON.stringify(updated));
        return updated;
      });
      triggerNotification(`✓ Simulasi: Status pesanan #${orderId} diubah ke ${nextStatus.toUpperCase()}`);
    }
  };

  // Bulk archive or delete completed / finalized orders
  const handleClearAllCompletedOrders = async () => {
    const confirmClear = window.confirm(
      'Apakah Anda yakin ingin menghapus seluruh riwayat pesanan yang telah selesai disajikan? Tindakan ini tidak dapat dibatalkan.'
    );
    if (!confirmClear) return;

    if (supabase) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('sb_orders')
          .delete()
          .in('status', ['delivered', 'completed']);

        if (error) throw error;
        triggerNotification('✓ Berhasil menghapus seluruh riwayat pesanan selesai dari Supabase Cloud.');
        fetchOrders();
      } catch (err: any) {
        alert(`Gagal menghapus data dari Supabase: ${err.message}`);
      } finally {
        setLoading(false);
      }
    } else {
      // Offline Simulation context
      const updatedOrders = orders.filter(
        (o) => o.status !== 'delivered' && o.status !== 'completed'
      );
      setOrders(updatedOrders);
      localStorage.setItem('scanbite_orders', JSON.stringify(updatedOrders));
      triggerNotification('✓ Berhasil menghapus seluruh riwayat pesanan selesai dari UI Cache Lokal.');
    }
  };

  // Controller Jukebox Play & Delete
  const handlePlayInCafe = (track: JukeboxTrack) => {
    setInlinePlayerTrack(track);
    const url = `https://open.spotify.com/search/${encodeURIComponent(track.title + ' ' + track.artist)}`;
    window.open(url, '_blank');
    triggerNotification(`🎵 Membuka Spotify Player pencarian: "${track.title}"`);
    handlePlayJukeboxTrack(track.id);
  };

  const handlePlayInCafeYt = (track: JukeboxTrack) => {
    setInlinePlayerTrack(track);
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + ' ' + track.artist)}`;
    window.open(url, '_blank');
    triggerNotification(`🎥 Membuka YouTube Player pencarian: "${track.title}"`);
    handlePlayJukeboxTrack(track.id);
  };

  const handlePlayJukeboxTrack = async (trackId: string) => {
    const trackObj = jukeboxQueue.find(t => t.id === trackId);
    if (trackObj) {
      setInlinePlayerTrack(trackObj);
    }

    if (supabase) {
      try {
        const { error } = await supabase
          .from('sb_song_requests')
          .update({ status: 'played' })
          .eq('id', trackId);

        if (error) {
          console.warn('Safe catch: status might not exist on sb_song_requests:', error.message);
        }
        triggerNotification('🎵 Memutar track live di audio kafe!');
        fetchJukeboxQueue();
      } catch (err: any) {
        console.warn('Fail play track error (logged):', err.message);
        triggerNotification('🎵 Memutar track live di audio kafe!');
      }
    } else {
      setJukeboxQueue(prev => prev.map(t => t.id === trackId ? { ...t, isPlaying: true } : { ...t, isPlaying: false }));
      triggerNotification('✓ Simulasi: Memutar lagu.');
    }
  };

  const handleDeleteJukeboxTrack = async (trackId: string) => {
    if (inlinePlayerTrack && inlinePlayerTrack.id === trackId) {
      setInlinePlayerTrack(null);
    }

    if (supabase) {
      try {
        const { error } = await supabase
          .from('sb_song_requests')
          .delete()
          .eq('id', trackId);

        if (error) throw error;
        triggerNotification('🗑️ Lagu diselesaikan & dikeluarkan dari playlist!');
        fetchJukeboxQueue();
      } catch (err: any) {
        alert(`Gagal hapus track jukebox: ${err.message}`);
      }
    } else {
      setJukeboxQueue(prev => prev.filter(t => t.id !== trackId));
      const saved = localStorage.getItem('scanbite_jukebox_queue');
      if (saved) {
        const remains = JSON.parse(saved).filter((song: any) => song.id !== trackId);
        localStorage.setItem('scanbite_jukebox_queue', JSON.stringify(remains));
      }
      triggerNotification('✓ Simulasi: Lagu dihapus dari antrean.');
    }
  };

  // Penanganan image upload drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setUploadStatus('idle');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setUploadStatus('idle');
    }
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenuName.trim()) {
      alert('Isi nama hidangan terlebih dahulu!');
      return;
    }

    setSubmittingMenu(true);
    let finalImageUrl = 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80';

    try {
      if (supabase && selectedFile) {
        setUploadStatus('uploading');
        setUploadProgress(40);

        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `menu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${fileExt}`;
        const filePath = `photos/${fileName}`;

        setUploadProgress(70);
        const { error: uploadErr } = await supabase.storage
          .from('menu-images')
          .upload(filePath, selectedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (!uploadErr) {
          const { data: publicData } = supabase.storage
            .from('menu-images')
            .getPublicUrl(filePath);
          
          if (publicData?.publicUrl) {
            finalImageUrl = publicData.publicUrl;
          }
        }
        setUploadProgress(100);
        setUploadStatus('completed');
      } else if (selectedFile) {
        // local mockup sequence simulation
        setUploadStatus('uploading');
        setUploadProgress(50);
        await new Promise(r => setTimeout(r, 450));
        setUploadProgress(100);
        setUploadStatus('completed');
        finalImageUrl = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80';
      }

      // insert row into database
      const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
      
      if (supabase) {
        // Multi-attempt strategy to cover schema variations on the sb_menus or menu_items tables
        const attempts = [
          // Attempt 1: Full-set of standard and advanced columns
          {
            name: newMenuName,
            price: Number(newMenuPrice),
            description: newMenuDesc || 'Sajian masakan premium buatan daku.',
            category: newMenuCategory,
            image_url: finalImageUrl,
            image: finalImageUrl,
            is_available: isAvailable,
            is_popular: isPopular,
            stock_quantity: Number(newMenuStock),
            tenant_id: activeTenant
          },
          // Attempt 2: Basic columns with both image attributes and description
          {
            name: newMenuName,
            price: Number(newMenuPrice),
            description: newMenuDesc || 'Sajian masakan premium buatan daku.',
            category: newMenuCategory,
            image_url: finalImageUrl,
            image: finalImageUrl,
            tenant_id: activeTenant
          },
          // Attempt 3: Minimum schema format A (image_url)
          {
            name: newMenuName,
            price: Number(newMenuPrice),
            category: newMenuCategory,
            image_url: finalImageUrl,
            tenant_id: activeTenant
          },
          // Attempt 4: Minimum schema format B (image only)
          {
            name: newMenuName,
            price: Number(newMenuPrice),
            category: newMenuCategory,
            image: finalImageUrl,
            tenant_id: activeTenant
          }
        ];

        let insertSuccess = false;
        let lastInsertError: any = null;

        // Try sb_menus first
        for (const row of attempts) {
          try {
            const { error: insertErr } = await supabase.from('sb_menus').insert([row]);
            if (!insertErr) {
              insertSuccess = true;
              break;
            } else {
              lastInsertError = insertErr;
              console.warn('sb_menus insert attempt failed, trying next attempt in list:', insertErr.message);
            }
          } catch (e) {
            console.warn('sb_menus insert attempt threw exception:', e);
          }
        }

        // If sb_menus failed, try menu_items fallback table
        if (!insertSuccess) {
          console.warn('All sb_menus attempts failed, trying fallback table menu_items...');
          for (const row of attempts) {
            try {
              const { error: insertErr } = await supabase.from('menu_items').insert([row]);
              if (!insertErr) {
                insertSuccess = true;
                break;
              } else {
                lastInsertError = insertErr;
                console.warn('menu_items insert attempt failed, trying next:', insertErr.message);
              }
            } catch (e) {
              console.warn('menu_items insert attempt threw exception:', e);
            }
          }
        }

        if (!insertSuccess) {
          throw lastInsertError || new Error('Gagal menyimpan menu ke database cloud setelah beberapa percobaan.');
        }

        triggerNotification(`🟢 Sukses menambah menu "${newMenuName}" ke Supabase!`);
        fetchAllMenus();
      } else {
        // Offline custom addition
        const simulatedNewObj = {
          id: `m-${Date.now()}`,
          name: newMenuName,
          price: Number(newMenuPrice),
          description: newMenuDesc || 'Sajian masakan premium buatan daku.',
          category: newMenuCategory,
          image: finalImageUrl,
          rating: 4.8,
          isAvailable: isAvailable,
          isPopular: isPopular,
          stock_quantity: Number(newMenuStock)
        };
        setAllMenus((prev) => [simulatedNewObj, ...prev]);
        triggerNotification(`✓ Simulasi: Menu "${newMenuName}" berhasil disimpan!`);
      }

      // Clear Form panel
      setNewMenuName('');
      setNewMenuPrice('25000');
      setNewMenuDesc('');
      setNewMenuStock('15');
      setSelectedFile(null);
      setPreviewUrl(null);
      setUploadStatus('idle');

    } catch (err: any) {
      const errorMessage = err.message || '';
      const isNetworkError = errorMessage.includes('Failed to fetch') || err.name === 'TypeError' || errorMessage.toLowerCase().includes('fetch');
      if (isNetworkError) {
        alert("Koneksi internet bermasalah, gagal terhubung ke server database. Silakan periksa jaringan Anda.");
      } else {
        alert(`Gagal simpan: ${err.message}`);
      }
      setUploadStatus('error');
    } finally {
      setSubmittingMenu(false);
    }
  };

  // QRIS Saving Handler
  const handleSaveQrisString = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('scanbite_qris_string', customQrisNmid);
    triggerNotification('✓ NMID QRIS Berhasil Diperbarui di sistem!');
  };

  // QR Downloader & Printing Simulator
  const handleDownloadQr = () => {
    const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&color=2c2520&data=${encodeURIComponent(
      window.location.origin + '/menu?tenant=' + activeTenant + '&table=' + qrTableNumber
    )}`;
    
    const link = document.createElement('a');
    link.href = qrUrl;
    link.target = '_blank';
    link.download = `ScanBite_QR_Meja_${qrTableNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerNotification(`📥 Mengunduh QR Code Meja ${qrTableNumber}`);
  };

  const handlePrintQr = () => {
    const activeTenant = localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=2c2520&data=${encodeURIComponent(
      window.location.origin + '/menu?tenant=' + activeTenant + '&table=' + qrTableNumber
    )}`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak QR - Meja ${qrTableNumber}</title>
            <style>
              body {
                font-family: 'Inter', sans-serif;
                text-align: center;
                color: #2D2520;
                padding: 40px;
                background: #FFF;
              }
              .card {
                border: 3px solid #8C6239;
                border-radius: 24px;
                padding: 30px;
                max-width: 350px;
                margin: auto;
                box-shadow: 0 4px 10px rgba(0,0,0,0.05);
              }
              .logo {
                font-size: 24px;
                font-weight: 900;
                color: #8C6239;
                text-transform: uppercase;
                letter-spacing: 2px;
                margin-bottom: 5px;
              }
              .sub {
                font-size: 11px;
                color: #9E8775;
                font-weight: bold;
                margin-bottom: 20px;
              }
              img {
                width: 230px;
                height: 230px;
                margin: 10px auto;
              }
              .table {
                font-size: 28px;
                font-weight: 950;
                background: #8C6239;
                color: #FFF;
                display: inline-block;
                padding: 6px 20px;
                border-radius: 50px;
                margin: 15px 0;
              }
              .info {
                font-size: 10px;
                color: #666;
                margin-top: 15px;
                line-height: 1.4;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="logo">${cafeName.toUpperCase()}</div>
              <div class="sub">DIENG AMBIENT SMART ORDER</div>
              <img src="${qrUrl}" alt="QR Meja ${qrTableNumber}" />
              <div class="table">MEJA ${qrTableNumber}</div>
              <div class="info">Pindai kode QR untuk memesan menu makanan dan pembayaran split-bill mandiri secara instan.</div>
            </div>
            <script>
              window.onload = function() {
                window.print();
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // Filter lists orders
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');
  const finishedOrders = orders.filter(o => o.status === 'delivered');

  // Completed / Delivered Orders for Archive Log with comprehensive system filters
  const completedOrders = finishedOrders.filter(ord => {
    // 1. Table Number Query Search
    if (historyTableFilter) {
      if (!ord.tableNumber.toLowerCase().includes(historyTableFilter.toLowerCase())) {
        return false;
      }
    }
    // 2. Date Range Filter comparing with Raw DateTime
    const ordDateObj = (ord as any).createdAtDate ? new Date((ord as any).createdAtDate) : new Date();
    
    if (historyStartDate) {
      const startLimit = new Date(historyStartDate);
      startLimit.setHours(0,0,0,0);
      if (ordDateObj < startLimit) return false;
    }
    if (historyEndDate) {
      const endLimit = new Date(historyEndDate);
      endLimit.setHours(23,59,59,999);
      if (ordDateObj > endLimit) return false;
    }

    return true;
  });

  const totalOmzet = completedOrders.reduce((sum, ord) => sum + ord.totalPrice, 0);

  const handleExportToExcel = () => {
    if (completedOrders.length === 0) {
      triggerNotification('Riwayat kosong, tidak ada data untuk diekspor!');
      return;
    }

    try {
      import('xlsx').then((XLSX) => {
        const excelData = completedOrders.map((order: any, idx: number) => ({
          'No': idx + 1,
          'ID Pesanan': order.id.slice(0, 8).toUpperCase(),
          'Waktu': order.createdAtDate || new Date().toLocaleString('id-ID'),
          'Nama Pelanggan': order.customerName,
          'Nomor Meja': order.tableNumber,
          'Menu Dipesan': order.items.map((i: any) => `${i.quantity}x ${i.name}`).join(', '),
          'Total Tagihan (Rp)': order.totalPrice,
          'Status Pembayaran': 'Paid',
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Riwayat Selesai');
        
        const fileName = `Laporan_Penjualan_ScanBite_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
        triggerNotification('✅ Berhasil mengunduh laporan penjualan (Excel)!');
      });
    } catch (err) {
      console.error('Failed to export to excel:', err);
      triggerNotification('❌ Gagal mengunduh file laporan.');
    }
  };

  // If cashier is not verified, exhibit the Fullscreen PIN gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#221B17] text-[#FDFBF7] font-sans antialiased flex flex-col justify-center items-center p-4 relative overflow-hidden">
        {/* Dynamic atmospheric backdrops */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-[#3A2D25] via-[#221B17] to-[#120D0A] opacity-90" />
        <div className="absolute top-[-10%] left-[-10%] w-[50%] aspect-square rounded-full bg-[#8C6239]/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] aspect-square rounded-full bg-rose-950/20 blur-[120px]" />

        {/* Floating toast inside the lockscreen */}
        {adminToast && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs px-4">
            <div className="bg-[#FAF8F5] text-[#2C2520] text-xs font-black px-4 py-2.5 rounded-xl shadow-lg border border-[#EBE3D5] text-center animate-fadeIn">
              {adminToast}
            </div>
          </div>
        )}

        <div className="w-full max-w-md bg-[#2C2520]/80 backdrop-blur-md rounded-3xl border border-[#8C6239]/20 p-6 sm:p-8 space-y-6 shadow-2xl relative z-10 animate-fadeIn text-center">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#8C6239] hover:bg-[#a67443] flex items-center justify-center text-white mx-auto shadow-md border border-white/10 transition-colors">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-black uppercase tracking-widest text-white">Bistro Operator PIN</h2>
            <p className="text-[11px] text-[#9E8775] font-semibold">Masukkan Kode PIN 4-digit Kasir / Barista Anda untuk membuka dashboard.</p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-5">
            {/* Visual PIN Dots Indicator */}
            <div className="flex justify-center gap-3 py-2">
              {[0, 1, 2, 3].map((index) => {
                const isActive = pinInput.length > index;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      isActive
                        ? 'bg-amber-400 border-amber-400 scale-120 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                        : 'bg-transparent border-gray-600'
                    }`}
                  />
                );
              })}
            </div>

            {/* Error prompt */}
            {loginError && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl py-2 px-3 text-[10px] font-black tracking-wide flex items-center justify-center gap-1.5 animate-pulse">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Hidden Input field for accessibility / manual keyboard keying */}
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full text-center tracking-[1.5em] text-lg bg-[#3A2D25] text-amber-300 font-black py-2.5 px-4 rounded-xl border border-white/5 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-transparent opacity-90"
              style={{ letterSpacing: '0.8em', textIndent: '0.4em', touchAction: 'manipulation' }}
            />

            {/* Elegant Bistro Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3" style={{ touchAction: 'manipulation' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  style={{ touchAction: 'manipulation' }}
                  onClick={() => handleKeyPress(num)}
                  className="bg-white/5 hover:bg-white/10 text-white font-black text-sm py-3.5 rounded-2xl border border-white/5 transition-colors cursor-pointer active:scale-95 duration-75 flex items-center justify-center"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                style={{ touchAction: 'manipulation' }}
                onClick={handleClear}
                className="bg-white/5 hover:bg-white/10 text-rose-450 font-black text-xs py-3.5 rounded-2xl border border-white/5 transition-colors cursor-pointer active:scale-95 duration-75"
              >
                CLEAR
              </button>
              <button
                type="button"
                style={{ touchAction: 'manipulation' }}
                onClick={() => handleKeyPress('0')}
                className="bg-white/5 hover:bg-white/10 text-white font-black text-sm py-3.5 rounded-2xl border border-white/5 transition-colors cursor-pointer active:scale-95 duration-75 flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                style={{ touchAction: 'manipulation' }}
                onClick={handleBackspace}
                className="bg-white/5 hover:bg-white/10 text-[#FAFBF7]/80 font-black text-[10px] py-3.5 rounded-2xl border border-white/5 transition-colors cursor-pointer active:scale-95 duration-75 flex items-center justify-center"
              >
                DEL
              </button>
            </div>

            {/* Auto trigger check hint info */}
            <div className="text-[10px] bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20 rounded-2xl px-4 py-2 leading-relaxed">
              🔑 Mode Sandbox: Gunakan kode PIN Aktif <strong className="text-white bg-[#8C6239] px-1.5 py-0.5 rounded ml-1 select-all font-black">{localStorage.getItem('scanbite_admin_pin') || '1234'}</strong> untuk login.
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-white/5">
              <button
                type="button"
                onClick={() => onNavigate('menu')}
                className="text-xs font-black text-gray-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Portal Pelanggan</span>
              </button>
              
              <button
                type="submit"
                className="bg-[#8C6239] hover:bg-[#6D4926] text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shadow-md"
              >
                Buka Kunci
              </button>
            </div>
          </form>
        </div>

        <p className="text-[10px] text-[#9E8775]/50 mt-8 relative z-10 font-medium">ScanBite Bistro Point-of-Sale System • Dieng High Atmospheric Smart Ordering Platform</p>
      </div>
    );
  }

  const subtotalCalculation = activeReceipt 
    ? (activeReceipt.totalPrice / (1 + (taxPercent + servicePercent) / 100)) 
    : 0;
  const taxCalculation = activeReceipt 
    ? (subtotalCalculation * taxPercent / 100) 
    : 0;
  const serviceCalculation = activeReceipt 
    ? (subtotalCalculation * servicePercent / 100) 
    : 0;

  // If cashier is authenticated, exhibit the main interactive Admin Dashboard
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2C2520] font-sans antialiased flex flex-col md:flex-row">
      
      {/* Toast Notification Element */}
      {adminToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-[#2C2520] text-[#FDFBF7] text-xs font-black px-4.5 py-3 rounded-2xl shadow-xl border border-[#8C6239]/40 flex items-center justify-between gap-3 animate-fadeIn">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{adminToast}</span>
            </span>
          </div>
        </div>
      )}

      {/* Styled Sidepanel */}
      <aside className="w-full md:w-64 bg-[#2C2520] text-[#FDFBF7] p-5 shrink-0 flex flex-col justify-between">
        <div className="space-y-6">
          
          <div className="flex flex-col pb-4 border-b border-white/10 gap-3">
            <div className="flex items-center gap-3">
              {/* Circular Logo Component with Hover Effect & Pencil overlay Trigger */}
              <div 
                onClick={() => logoInputRef.current?.click()}
                className="relative w-12 h-12 rounded-full cursor-pointer overflow-hidden border-2 border-[#8C6239] flex-shrink-0 transition-transform hover:scale-105 group/logo"
                title="Sua Logo Toko (Klik untuk ganti)"
              >
                <img 
                  src={logoPreview || merchantLogo || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=150&q=80'} 
                  alt="Scanbite Brand Logo" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                {/* Pencil Hover Icon Trigger */}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                  <Pencil className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Hidden file selector */}
              <input 
                type="file"
                ref={logoInputRef}
                onChange={handleLogoChange}
                accept="image/*"
                className="hidden"
              />

              <div>
                <h2 className="text-xs font-black tracking-wider uppercase text-white -mb-1">{cafeName}</h2>
                <span className="text-[9px] text-amber-500 uppercase font-black tracking-widest block">Merchant Dashboard</span>
                
                {/* Dynamic Outlet and Active Currency Information */}
                <button
                  type="button"
                  onClick={() => {
                    const branches: ('Pusat' | 'Shibuya' | 'Sydney')[] = ['Pusat', 'Shibuya', 'Sydney'];
                    const currencies: ('IDR' | 'JPY' | 'AUD')[] = ['IDR', 'JPY', 'AUD'];
                    
                    const nextIndex = (branches.indexOf(outletBranch) + 1) % branches.length;
                    const nextBranch = branches[nextIndex];
                    const nextCurrency = currencies[nextIndex];
                    
                    setOutletBranch(nextBranch);
                    setCurrencySymbol(nextCurrency);
                    
                    localStorage.setItem('scanbite_outlet_branch', nextBranch);
                    localStorage.setItem('scanbite_currency_symbol', nextCurrency);
                    
                    triggerNotification(`Outlet diubah ke: ${nextBranch} (${nextCurrency})`);
                  }}
                  className="mt-1.5 flex items-center gap-1 text-[8.5px] font-bold text-amber-100 bg-amber-955/55 hover:bg-[#8C6239] border border-amber-800/40 px-2 py-0.5 rounded-md cursor-pointer transition-colors uppercase tracking-wider text-left font-sans"
                  title="Klik untuk ubah cabang & mata uang"
                >
                  <span className="shrink-0 text-[10px]">📍</span>
                  <span>Outlet: {outletBranch} ({currencySymbol})</span>
                </button>
              </div>
            </div>

            {/* Micro action-states: Save or Cancel Logo */}
            {logoPreview && (
              <div className="bg-amber-900/20 border border-amber-900/40 rounded-xl p-2.5 space-y-2 animate-fadeIn">
                <p className="text-[9.5px] text-amber-400 font-extrabold text-center uppercase tracking-wider">Simpan Logo Baru?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cleanLogoPreview}
                    disabled={isSavingLogo}
                    className="flex-1 py-1.5 px-2 bg-red-950/70 hover:bg-red-900 text-white border border-red-800 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateLogo}
                    disabled={isSavingLogo}
                    className="flex-1 py-1.5 px-2 bg-[#8C6239] hover:bg-[#6D4926] text-white border border-rose-950 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer text-center"
                  >
                    {isSavingLogo ? 'Proses...' : 'Simpan'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#FAF2E8]/10 border border-white/5 rounded-xl p-3 text-[11px] space-y-1">
            <p className="flex items-center gap-1.5 font-bold">
              <Database className="w-3.5 h-3.5 text-[#8C6239]" />
              <span>Koneksi: {isLiveDatabase ? 'Cloud Database Active' : 'Simulasi Local'}</span>
            </p>
            <p className="flex items-center gap-1.5 pl-0.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>Realtime Listener Active</span>
            </p>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full py-3 px-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-[#8C6239] text-white shadow-xs'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <ChefHat className="w-4 h-4" />
                <span>Monitoring Dapur</span>
              </span>
              {pendingOrders.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {pendingOrders.length}
                </span>
              )}
            </button>

            {/* TAB: RIWAYAT SELESAI */}
            <button
              onClick={() => setActiveTab('completed_history')}
              className={`w-full py-3 px-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'completed_history'
                  ? 'bg-[#8C6239] text-white shadow-xs'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>Riwayat Selesai</span>
              </span>
              {completedOrders.length > 0 && (
                <span className="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {completedOrders.length}
                </span>
              )}
            </button>

            {/* TAB: QR GENERATOR */}
            <button
              onClick={() => setActiveTab('qr_generator')}
              className={`w-full py-3 px-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'qr_generator'
                  ? 'bg-[#8C6239] text-white shadow-xs'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Generator</span>
            </button>

            <button
              onClick={() => setActiveTab('menu_management')}
              className={`w-full py-3 px-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'menu_management'
                  ? 'bg-[#8C6239] text-white shadow-xs'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Manajemen Menu</span>
            </button>

            <button
              onClick={() => setActiveTab('jukebox_controller')}
              className={`w-full py-3 px-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'jukebox_controller'
                  ? 'bg-[#8C6239] text-white shadow-xs'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Music className="w-4 h-4" />
                <span>Playlist Jukebox</span>
              </span>
              {jukeboxQueue.length > 0 && (
                <span className="bg-amber-400/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {jukeboxQueue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('store_settings')}
              className={`w-full py-3 px-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'store_settings'
                  ? 'bg-[#8C6239] text-white shadow-xs'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Pengaturan Toko</span>
            </button>
          </nav>
        </div>

        <div className="pt-6 border-t border-white/10 mt-6 space-y-2">
          {/* SECURE SESSION LOGOUT ACTION */}
          <button
            onClick={handleLogOut}
            className="w-full bg-red-500/10 text-red-400 hover:bg-red-500/25 transition-all py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer border border-red-500/20"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Kasir (Log Out)</span>
          </button>

          <button
            onClick={() => onNavigate('menu')}
            className="w-full bg-white/5 text-white hover:bg-white/10 border border-transparent transition-all py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ke Mode Pelanggan</span>
          </button>
        </div>

        <div className="bg-[#1C1612]/30 border border-white/5 rounded-xl p-3.5 space-y-2 mt-4 text-left">
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">
            <span>🔊 Suara Notifikasi</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p className="text-[10px] text-gray-400 leading-normal font-medium">
            Browser mengunci suara otomatis jika belum ada interaksi. Klik tombol di bawah untuk mengaktifkan bel pesanan & request lagu baru secara otomatis:
          </p>
          <button
            onClick={() => {
              playKitchenChime();
              triggerNotification("🔊 Bel Notifikasi Berhasil Diaktifkan!");
            }}
            className="w-full text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2.5 rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5 border border-emerald-500/20"
          >
            <span>Tes Bel Notifikasi</span>
          </button>
        </div>

        {/* Sidebar Copyright Info */}
        <div className="pt-4 mt-4 border-t border-white/5 text-center text-[10px] text-gray-500 font-sans space-y-0.5 select-none opacity-85">
          <p>© 2026 {cafeName}. All rights reserved.</p>
          <p className="opacity-75 leading-tight">Powered by RasyaTech | Vibe Modern • Digital Jukebox • Real-time Split Billing</p>
        </div>
      </aside>

      {/* Main Panel Content Area */}
      <main className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto max-w-5xl">
        
        {dbError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Konektivitas Database: {dbError}</span>
          </div>
        )}

        {/* TAB 1: COCKPIT REALTIME */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                  <ListOrdered className="w-5 h-5 text-[#8C6239]" />
                  <span>Daftar Pesanan Meja Kafe</span>
                </h3>
                <p className="text-[11px] text-[#9E8775] font-semibold mt-0.5">Pantau & sajikan order langsung dari loket dapur utama</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTableOpen(true)}
                  className="bg-[#8C6239] hover:bg-[#6D4926] text-white rounded-xl px-4 py-2.5 text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Meja Baru</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    fetchOrders();
                    fetchTables();
                  }}
                  className="bg-white hover:bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 text-xs font-black text-[#8C6239] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                {!isProduction && (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('scanbite_orders');
                      localStorage.removeItem('scanbite_tables');
                      setOrders([]);
                      setTablesList(['01', '02', '03', '04', '05', '06', '07', '08']);
                      triggerNotification('Database simulasi lokal di-reset!');
                    }}
                    className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-xs font-black shadow-xs transition-all cursor-pointer mr-0.5"
                  >
                    Clear Local DB
                  </button>
                )}
              </div>
            </div>

            {/* Quick Stats Bento Cards Grid */}
            {(() => {
              const statsRevenue = orders
                .filter(o => o.status === 'delivered')
                .reduce((sum, o) => sum + o.totalPrice, 0);

              const formattedRevenue = (() => {
                if (currencySymbol === 'JPY') {
                  return `¥${statsRevenue.toLocaleString('en-US')}`;
                } else if (currencySymbol === 'AUD') {
                  return `A$${statsRevenue.toLocaleString('en-US')}`;
                } else {
                  return `Rp ${statsRevenue.toLocaleString('id-ID')}`;
                }
              })();

              const statsActiveOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length;

              const statsOccupiedTables = tablesList.filter(num => {
                const activeTableOrders = orders.filter(o => o.tableNumber === num && o.status !== 'delivered');
                const hasOnlyDeliveredOrders = orders.some(o => o.tableNumber === num && o.status === 'delivered') && 
                                               !orders.some(o => o.tableNumber === num && o.status !== 'delivered');
                
                const tblDetail = tablesData.find(t => t.nomor_meja_id === num);
                const dbStatus = tblDetail?.status || 'KOSONG';
                
                let tblStatus = 'KOSONG';
                if (dbStatus === 'SEDANG MAKAN' || (hasOnlyDeliveredOrders && dbStatus !== 'KOSONG')) {
                  tblStatus = 'SEDANG MAKAN';
                } else if (activeTableOrders.length > 0) {
                  tblStatus = 'MELAYANI';
                } else if (dbStatus === 'MEMILIH') {
                  tblStatus = 'MEMILIH';
                } else if (dbStatus === 'MELAYANI') {
                  tblStatus = 'MELAYANI';
                }
                return tblStatus !== 'KOSONG';
              }).length;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 select-none">
                  {/* Stat 1: Total Pendapatan */}
                  <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-xs flex items-center gap-4 hover:shadow-md transition-all">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100">
                      <DollarSign className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="space-y-0.5 text-left">
                      <p className="text-[10px] text-[#9E8775] font-black uppercase tracking-wider">Total Pendapatan Hari Ini</p>
                      <p className="text-base font-black text-[#8C6239] font-mono tracking-tight">{formattedRevenue}</p>
                    </div>
                  </div>

                  {/* Stat 2: Pesanan Aktif */}
                  <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-xs flex items-center gap-4 hover:shadow-md transition-all">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shrink-0 border border-amber-100">
                      <ListOrdered className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5 text-left">
                      <p className="text-[10px] text-[#9E8775] font-black uppercase tracking-wider">Jumlah Pesanan Aktif</p>
                      <p className="text-base font-black text-[#8C6239] font-mono">{statsActiveOrders} <span className="text-[10px] font-bold text-[#9E8775]/70 uppercase">Pesanan</span></p>
                    </div>
                  </div>

                  {/* Stat 3: Meja Terisi */}
                  <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-xs flex items-center gap-4 hover:shadow-md transition-all">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100">
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div className="space-y-0.5 text-left">
                      <p className="text-[10px] text-[#9E8775] font-black uppercase tracking-wider">Jumlah Meja Terisi</p>
                      <p className="text-base font-black text-indigo-900 font-mono">{statsOccupiedTables} <span className="text-[10px] font-bold text-[#9E8775]/70 uppercase">Dari {tablesList.length} Meja</span></p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* BISTRO LIVE GRID MONITORING MEJA */}
            <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-xs space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-2.5 border-b border-[#FAF2E8] gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider">Dashboard Grid Meja Bistro Live</h4>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-black uppercase tracking-wider text-[#9E8775]">
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> KOSONG
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> MEMILIH
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> MENUNGGU HIDANGAN
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" /> SEDANG MAKAN
                  </span>
                </div>
              </div>

              <div className="max-h-[340px] overflow-y-auto scrollbar-thin pr-1 pb-1.5">
                {isTablesEmpty ? (
                    <div className="flex flex-col items-center justify-center p-10 bg-white border border-dashed border-[#EBE3D5] rounded-2xl w-full">
                        <p className="text-sm text-[#9E8775] mb-4">Belum ada meja yang terdaftar.</p>
                        <button
                            onClick={initializeTables}
                            className="bg-[#8C6239] text-white px-5 py-3 rounded-xl text-sm font-bold shadow-sm hover:bg-[#6D4926]"
                        >
                            Inisialisasi Tabel Meja (01, 03, 05, 08, 12, 18)
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {tablesList.map((num) => {
                    const activeTableOrders = orders.filter(o => o.tableNumber === num && o.status !== 'delivered' && o.status !== 'completed');
                    const hasOnlyDeliveredOrders = orders.some(o => o.tableNumber === num && (o.status === 'delivered' || o.status === 'completed')) && 
                                                   !orders.some(o => o.tableNumber === num && o.status !== 'delivered' && o.status !== 'completed');
                    
                    const tblDetail = tablesData.find(t => t.nomor_meja_id === num);
                    const dbStatus = tblDetail?.status || 'KOSONG';
                    
                    let status: 'KOSONG' | 'MEMILIH' | 'MELAYANI' | 'SEDANG MAKAN' = 'KOSONG';
                    let guestName = '-';

                    // Detect active payment that is unpaid (Menunggu Kasir / Verifikasi QRIS)
                    const unpaidOrder = orders.find(o => 
                      o.tableNumber === num && 
                      o.status !== 'completed' && o.status !== 'delivered' &&
                      (o.paymentStatus === 'unpaid' || o.paymentStatus?.toLowerCase() === 'unpaid' || o.status === 'unpaid')
                    );
                    const isQrisPayment = unpaidOrder && (unpaidOrder.paymentMethod === 'qris' || unpaidOrder.paymentMethod?.toLowerCase() === 'qris' || unpaidOrder.paymentMethod === 'emoney');

                    if (dbStatus === 'SEDANG MAKAN' || (hasOnlyDeliveredOrders && dbStatus !== 'KOSONG')) {
                      status = 'SEDANG MAKAN';
                      const matchedOrder = orders.find(o => o.tableNumber === num);
                      guestName = matchedOrder ? matchedOrder.customerName : (tblDetail?.nama_pelanggan || 'Sajian Disajikan');
                    } else if (activeTableOrders.length > 0) {
                      status = 'MELAYANI';
                      guestName = activeTableOrders[0].customerName;
                    } else if (dbStatus === 'MEMILIH') {
                      status = 'MEMILIH';
                      guestName = tblDetail?.nama_pelanggan || 'Pelanggan Baru';
                    } else if (dbStatus === 'MELAYANI') {
                      status = 'MELAYANI';
                      guestName = tblDetail?.nama_pelanggan || 'Pelanggan';
                    } else {
                      status = 'KOSONG';
                    }

                    let statusBg = 'bg-emerald-50/45 border-emerald-250 text-emerald-850';
                    let label = 'KOSONG';

                    const hasPending = activeTableOrders.some(o => o.status === 'pending');
                    const hasReadyOrder = activeTableOrders.some(o => o.status === 'ready');

                    // Implement conditional background color coding and subtle pulsing for pending orders
                    if (hasPending) {
                      statusBg = 'bg-rose-100/90 border-rose-400 text-rose-900 animate-[pulse_1.5s_infinite_ease-in-out] shadow-md ring-2 ring-rose-400/50';
                      label = 'BUTUH TINDAKAN (PENDING)';
                    } else if (hasReadyOrder) {
                      statusBg = 'bg-blue-100/90 border-blue-400 text-blue-900 shadow-sm animate-pulse';
                      label = 'MAKANAN SIAP DIANTAR';
                    } else if (status === 'MEMILIH') {
                      statusBg = 'bg-amber-50/70 border-amber-300 text-amber-805 animate-pulse';
                      label = 'MEMILIH';
                    } else if (status === 'MELAYANI') {
                      statusBg = 'bg-orange-50/70 border-orange-300 text-orange-805';
                      label = 'MENUNGGU HIDANGAN';
                    } else if (status === 'SEDANG MAKAN') {
                      statusBg = 'bg-indigo-50/70 border-indigo-300 text-indigo-805';
                      label = 'SEDANG MAKAN';
                    }

                    return (
                      <div 
                        key={num} 
                        className={`border rounded-2xl p-3.5 flex flex-col justify-between min-h-[110px] h-auto transition-all shadow-3xs hover:-translate-y-0.5 ${statusBg}`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-1 gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-black font-mono tracking-tight text-[#1C1612]">Meja #{num}</span>
                              {status === 'KOSONG' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTable(num)}
                                  title="Hapus Meja"
                                  className="text-[#9E8775] hover:text-red-500 transition-colors p-0.5 rounded-md hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded-md bg-white/75 shrink-0 uppercase tracking-wider">{label}</span>
                          </div>

                          {unpaidOrder && (
                            <div className={`mb-2.5 flex items-center justify-center gap-1 text-white text-[7.5px] font-black py-1 px-2 rounded-lg animate-pulse shadow-3xs ${isQrisPayment ? 'bg-sky-600' : 'bg-amber-500'}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                              <span>{isQrisPayment ? 'MENUNGGU VERIFIKASI QRIS' : 'MENUNGGU KASIR (CASH)'}</span>
                            </div>
                          )}

                          {(() => {
                            const tableActiveOrders = orders.filter(o => o.tableNumber === num && o.status !== 'completed' && o.status !== 'delivered');
                            const tableChangeAlerts = tableActiveOrders.flatMap(o => getCashChangeAlerts(o));
                            if (tableChangeAlerts.length === 0) return null;
                            return (
                              <div className="mb-2.5 flex items-center justify-center gap-1.5 bg-rose-600 text-white text-[7.5px] font-black py-1 px-2 rounded-lg animate-pulse shadow-3xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-ping" />
                                <span>🔔 BAWA KEMBALIAN!</span>
                              </div>
                            );
                          })()}

                          <div className="overflow-hidden">
                            <span className="text-[8px] text-[#9E8775]/90 font-extrabold block uppercase tracking-wider leading-none font-mono">Status Sesi:</span>
                            <span className="text-[11px] font-bold truncate text-[#2C2520] block mt-0.5">{guestName}</span>
                          </div>
                        </div>

                        {status !== 'KOSONG' && (() => {
                          const activeOrder = unpaidOrder || activeTableOrders[0];
                          const order = activeOrder ? {
                            id: activeOrder.id || activeOrder.sessionId || `sess-${num}`,
                            status: activeOrder.status || 'pending',
                            payment_method: activeOrder.paymentMethod || 'cash',
                            paymentMethod: activeOrder.paymentMethod || 'cash',
                            paymentStatus: activeOrder.paymentStatus || 'unpaid',
                            tableNumber: activeOrder.tableNumber || num
                          } : {
                            id: `sess-${num}`,
                            status: 'KOSONG',
                            payment_method: 'cash',
                            paymentMethod: 'cash',
                            paymentStatus: 'paid',
                            tableNumber: num
                          };

                          return (
                            <div className="mt-3 w-full border-t pt-2 flex flex-col gap-2">
                              {/* 1. JIKA STATUS MASIH PENDING (Pesanan Baru Masuk) */}
                              {order.status === 'pending' && (
                                <>
                                  <div className="bg-red-100 text-red-700 px-2 py-1 rounded text-center text-[11px] font-bold animate-bounce">
                                    🔔 ADA PESANAN BARU!
                                  </div>
                                  
                                  {/* Deteksi otomatis metode pembayaran yang ada di database */}
                                  {order.payment_method === 'qris' ? (
                                    <button 
                                      type="button"
                                      onClick={() => handleConfirmQrisPayment(order.id)}
                                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold w-full transition-all shadow cursor-pointer"
                                    >
                                      🔵 KONFIRMASI QRIS (LIVE)
                                    </button>
                                  ) : (
                                    <button 
                                      type="button"
                                      onClick={() => handleConfirmCashPayment(order.id)}
                                      className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold w-full transition-all shadow cursor-pointer"
                                    >
                                      🟠 KONFIRMASI CASH
                                    </button>
                                  )}
                                </>
                              )}

                              {/* 2. JIKA STATUS SEDANG DIMASAK DI DAPUR (Preparing) */}
                              {order.status === 'preparing' && (
                                <div className="bg-blue-50 text-blue-600 border border-blue-200 px-3 py-2 rounded-lg text-center text-xs font-bold flex flex-col gap-1 shadow-sm">
                                  <div className="flex items-center justify-center gap-1 animate-pulse">
                                    <span>🍳</span> <span>SEDANG DIMASAK DI DAPUR</span>
                                  </div>
                                  <span className="text-[10px] text-gray-400 font-normal">Tombol kosongkan dikunci sampai hidangan siap</span>
                                </div>
                              )}

                              {/* 3. JIKA STATUS HIDANGAN SIAP DISAJIKAN (Ready) */}
                              {order.status === 'ready' && (
                                <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-lg text-center text-xs font-bold shadow-sm">
                                  🛎️ HIDANGAN SIAP DISAJIKAN!
                                </div>
                              )}

                              {/* 4. TOMBOL UTAMA KOSONGKAN MEJA (Hanya Aktif Jika Tidak Sedang Dimasak) */}
                              <button 
                                type="button"
                                onClick={() => handleKosongkanMeja(order.tableNumber, order.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold w-full transition-all shadow-sm cursor-pointer ${
                                  order.status === 'preparing'
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300' 
                                    : 'bg-rose-600 text-white hover:bg-rose-700'
                                }`}
                                disabled={order.status === 'preparing'}
                              >
                                ❌ KOSONGKAN MEJA
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  </div>
                )}
                </div>
              </div>

            {loading ? (
              <div className="bg-white border border-[#EBE3D5] rounded-3xl p-16 text-center text-[#9E8775]">
                <div className="w-6 h-6 border-2 border-[#8C6239] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs font-bold">Menghubungkan ke server cloud...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-white border border-[#EBE3D5] rounded-3xl p-12 text-center text-[#9E8775]">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <p className="text-sm font-extrabold text-[#2C2520]">Semua Pesanan Selesai Disajikan</p>
                <p className="text-xs text-[#9E8775] mt-1 max-w-sm mx-auto leading-relaxed">Belum ada order aktif. Silakan transaksi split-bill mandiri di halaman checkout pelanggan untuk memicu order baru!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Antrean Pending */}
                <div className="space-y-3.5">
                  <div className="bg-rose-50/70 border border-rose-100 p-3.5 rounded-2xl flex justify-between items-center shadow-3xs">
                    <span className="text-xs font-black text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                      Antrean Masuk
                    </span>
                    <span className="bg-rose-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">{pendingOrders.length}</span>
                  </div>

                  {pendingOrders.length === 0 ? (
                    <p className="text-xs text-[#9E8775] italic text-center py-6 bg-white/50 border border-[#FAF2E8] rounded-2xl">Tidak ada antrean baru.</p>
                  ) : (
                    pendingOrders.map((order) => (
                      <div key={order.id} className="bg-white border border-[#EBE3D5] rounded-2xl p-4.5 space-y-4 shadow-3xs relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-full bg-rose-500" />
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] bg-rose-600 text-[#FDFBF7] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Meja {order.tableNumber}</span>
                              {order.sync_status === 'synced' ? (
                                <span className="text-[8px] bg-green-50 text-green-700 border border-green-200/50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                                  ● synced
                                </span>
                              ) : (
                                <span className="text-[8px] bg-amber-50 text-amber-600 border border-amber-200/50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider animate-pulse">
                                  ○ local-only
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 font-bold">ID: #{order.id}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className="text-[10px] font-mono text-gray-400 font-bold">{order.createdAt}</span>
                            <PendingCountdownTimer order={order} />
                          </div>
                        </div>

                        <div className="space-y-1.5 border-t border-dashed border-[#FAF8F5] pt-2.5">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-[#5B4E44]">
                              <span className="font-semibold">{item.name} <strong className="text-[#8C6239]">x{item.quantity}</strong></span>
                              <span className="text-[9px] text-[#9E8775] italic">{item.orderedBy}</span>
                            </div>
                          ))}
                        </div>

                        {/* High-visibility Bring Change Alerts */}
                        {(() => {
                          const alerts = getCashChangeAlerts(order);
                          if (alerts.length === 0) return null;
                          return (
                            <div className="bg-[#FFF9E6] border border-amber-300 rounded-xl p-2.5 space-y-1 text-left ring-2 ring-amber-400/20">
                              <p className="text-[10px] text-amber-800 font-extrabold flex items-center gap-1">
                                <span className="animate-bounce">🔔</span> BAWA KEMBALIAN (BRING CHANGE)
                              </p>
                              <div className="pl-1.5 space-y-0.5">
                                {alerts.map((al, aIdx) => (
                                  <p key={aIdx} className="text-[9.5px] text-[#5B4E44] font-black italic select-all">
                                    • {al}
                                  </p>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="pt-3 border-t border-[#FAF8F5] flex items-center justify-between">
                          <div>
                            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Total Pembayaran</p>
                            <p className="text-xs font-black text-[#2C2520]">Rp {order.totalPrice.toLocaleString('id-ID')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(order.id, 'pending')}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                          >
                            Proses Dapur
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Antrean Preparing */}
                <div className="space-y-3.5">
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex justify-between items-center shadow-3xs">
                    <span className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block" />
                      Sedang Diracik
                    </span>
                    <span className="bg-amber-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">{preparingOrders.length}</span>
                  </div>

                  {preparingOrders.length === 0 ? (
                    <p className="text-xs text-[#9E8775] italic text-center py-6 bg-white/50 border border-[#FAF2E8] rounded-2xl">Tidak ada menu diproses.</p>
                  ) : (
                    preparingOrders.map((order) => (
                      <div key={order.id} className="bg-white border border-[#EBE3D5] rounded-2xl p-4.5 space-y-4 shadow-3xs relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-500" />
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] bg-amber-600 text-[#FDFBF7] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Meja {order.tableNumber}</span>
                              {order.sync_status === 'synced' ? (
                                <span className="text-[8px] bg-green-50 text-green-700 border border-green-200/50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                                  ● synced
                                </span>
                              ) : (
                                <span className="text-[8px] bg-amber-50 text-amber-600 border border-amber-200/50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider animate-pulse">
                                  ○ local-only
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 font-bold">ID: #{order.id}</p>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 font-bold">{order.createdAt}</span>
                        </div>

                        <div className="space-y-1.5 border-t border-dashed border-[#FAF8F5] pt-2.5">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-[#5B4E44]">
                              <span className="font-semibold">{item.name} <strong className="text-amber-700">x{item.quantity}</strong></span>
                              <span className="text-[9px] text-[#9E8775] italic">{item.orderedBy}</span>
                            </div>
                          ))}
                        </div>

                        {/* High-visibility Bring Change Alerts */}
                        {(() => {
                          const alerts = getCashChangeAlerts(order);
                          if (alerts.length === 0) return null;
                          return (
                            <div className="bg-[#FFF9E6] border border-amber-300 rounded-xl p-2.5 space-y-1 text-left ring-2 ring-amber-400/20">
                              <p className="text-[10px] text-amber-800 font-extrabold flex items-center gap-1">
                                <span className="animate-bounce">🔔</span> BAWA KEMBALIAN (BRING CHANGE)
                              </p>
                              <div className="pl-1.5 space-y-0.5">
                                {alerts.map((al, aIdx) => (
                                  <p key={aIdx} className="text-[9.5px] text-[#5B4E44] font-black italic select-all">
                                    • {al}
                                  </p>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="pt-3 border-t border-[#FAF8F5] flex items-center justify-between">
                          <div>
                            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Total Pembayaran</p>
                            <p className="text-xs font-black text-[#2C2520]">Rp {order.totalPrice.toLocaleString('id-ID')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                          >
                            Siap Saji
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Status Box Saji / Instant Delivery */}
                <div className="space-y-3.5">
                  <div className="bg-emerald-50 border border-emerald-250 p-3.5 rounded-2xl flex justify-between items-center shadow-3xs">
                    <span className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600 animate-bounce" />
                      Sajikan Ke Meja ({readyOrders.length})
                    </span>
                    <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">{readyOrders.length}</span>
                  </div>

                  {readyOrders.length === 0 ? (
                    <div className="bg-emerald-50/20 border border-dashed border-emerald-150 rounded-2xl p-4.5 text-center">
                      <p className="text-[11px] text-emerald-800 font-bold leading-normal">Semua hidangan terkirim. Tidak ada hidangan menunggu disajikan.</p>
                    </div>
                  ) : (
                    readyOrders.map((order) => (
                      <div key={order.id} className="bg-white border border-emerald-250 rounded-2xl p-4.5 space-y-3.5 shadow-3xs relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500" />
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9.5px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Meja {order.tableNumber}</span>
                              <span className="text-[8px] bg-green-50 text-green-700 border border-green-200/50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider animate-pulse">🛎️ READY</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 font-bold">ID: #{order.id}</p>
                          </div>
                        </div>

                        <div className="space-y-1.5 border-t border-dashed border-gray-150 pt-2.5">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-[#5B4E44]">
                              <span className="font-semibold">{item.name} <strong className="text-emerald-750">x{item.quantity}</strong></span>
                              <span className="text-[9px] text-[#9E8775] italic">{item.orderedBy}</span>
                            </div>
                          ))}
                        </div>

                        {/* High-visibility Bring Change Alerts */}
                        {(() => {
                          const alerts = getCashChangeAlerts(order);
                          if (alerts.length === 0) return null;
                          return (
                            <div className="bg-[#FFF9E6] border border-amber-300 rounded-xl p-2.5 space-y-1 text-left ring-2 ring-amber-400/20 animate-pulse">
                              <p className="text-[10px] text-amber-800 font-extrabold flex items-center gap-1">
                                <span className="animate-bounce">🔔</span> BAWA KEMBALIAN (BRING CHANGE)
                              </p>
                              <div className="pl-1.5 space-y-0.5">
                                {alerts.map((al, aIdx) => (
                                  <p key={aIdx} className="text-[9.5px] text-[#5B4E44] font-black italic select-all">
                                    • {al}
                                  </p>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="pt-3 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(order.id, 'ready')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider w-full py-2.5 rounded-xl transition-all cursor-pointer text-center"
                          >
                            Tandai Sudah Disajikan (Selesai)
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  
                  <div className="bg-emerald-50/20 border border-dashed border-emerald-200 rounded-2xl p-4.5 text-center space-y-2">
                    <p className="text-[11px] text-emerald-800 font-bold">Seluruh pesanan yang sudah berstatus <strong>SIAP SAJI / DELIVERED</strong> akan diarsipkan ke tab "Riwayat Selesai" beserta omzet.</p>
                    <button 
                      onClick={() => setActiveTab('completed_history')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black tracking-wider uppercase px-4 py-2 rounded-xl transition-all cursor-pointer inline-block"
                    >
                      Buka Riwayat Lengkap
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* MODAL: TAMBAH MEJA BARU */}
            {isAddTableOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C2520]/60 backdrop-blur-sm animate-fadeIn">
                <div className="w-full max-w-sm bg-white rounded-3xl border border-[#EBE3D5] p-6 space-y-5 shadow-2xl animate-scaleIn">
                  <div className="space-y-1.5 text-center">
                    <h3 className="text-sm font-black text-[#1C1612] uppercase tracking-wider flex items-center justify-center gap-2">
                      <QrCode className="w-5 h-5 text-[#8C6239]" />
                      <span>Tambah Meja Baru</span>
                    </h3>
                    <p className="text-[10.5px] text-[#9E8775] font-semibold">Daftarkan nomor meja baru ke dalam sistem Bistro</p>
                  </div>

                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newTableNum.trim()) return;
                    await handleAddTable(newTableNum);
                    setIsAddTableOpen(false);
                    setNewTableNum('');
                  }} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Nomor Meja</label>
                      <input 
                        type="text"
                        required
                        placeholder="Contoh: 09, 10"
                        value={newTableNum}
                        onChange={(e) => setNewTableNum(e.target.value.replace(/\D/g, '').slice(0, 3))}
                        className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-3 text-xs text-[#2C2520] font-bold focus:outline-none focus:ring-1 focus:ring-[#8C6239] text-center text-lg tracking-wider"
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddTableOpen(false);
                          setNewTableNum('');
                        }}
                        className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-[#5B4E44] text-xs font-black uppercase tracking-wider py-2.5 rounded-xl transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-[#8C6239] hover:bg-[#6D4926] text-white text-xs font-black uppercase tracking-wider py-2.5 rounded-xl transition-colors cursor-pointer shadow-xs"
                      >
                        Simpan Meja
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: RIWAYAT SELESAI & ARCHIVE LOG OMZET KAFE */}
        {activeTab === 'completed_history' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[#8C6239]" />
                <span>Arsip Penjualan & Riwayat Selesai</span>
              </h3>
              <p className="text-[11px] text-[#9E8775] font-semibold mt-0.5">Pantau realisasi transaksi kasir, daftar lunas, dan total omzet harian</p>
            </div>

            {/* Dashboard Omzet Band */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-3xs flex items-center gap-4 relative overflow-hidden">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                  <DollarSign className="w-5.5 h-5.5" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Omzet Harian</span>
                  <h4 className="text-base font-black text-slate-900">Rp {totalOmzet.toLocaleString('id-ID')}</h4>
                </div>
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[8px] font-black px-1.5 py-0.2 rounded-full">
                  <TrendingUp className="w-2.5 h-2.5" />
                  <span>100%</span>
                </div>
              </div>

              <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-3xs flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-[#8C6239]/10 text-[#8C6239] flex items-center justify-center shrink-0">
                  <ListOrdered className="w-5.5 h-5.5" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Jumlah Pesanan Selesai</span>
                  <h4 className="text-base font-black text-slate-900">{completedOrders.length} Transaksi</h4>
                </div>
              </div>

              <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-3xs flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Calendar className="w-5.5 h-5.5" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Sesi Rekap</span>
                  <h4 className="text-base font-black text-slate-900">Hari Ini (Live)</h4>
                </div>
              </div>
            </div>

            {/* WEEKLY REVENUE BAR CHART */}
            <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-3xs">
              <div className="mb-4">
                <h4 className="text-sm font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#8C6239]" />
                  Grafik Pendapatan Mingguan
                </h4>
                <p className="text-[10px] text-[#9E8775] font-semibold mt-1">Tren penjualan kotor selama 7 hari terakhir</p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'H-6', revenue: 1540000 },
                    { name: 'H-5', revenue: 2120000 },
                    { name: 'H-4', revenue: 1850000 },
                    { name: 'H-3', revenue: 3100000 },
                    { name: 'H-2', revenue: 2800000 },
                    { name: 'H-1', revenue: 4200000 },
                    { name: 'Hari Ini', revenue: totalOmzet > 0 ? totalOmzet : 800000 },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE3D5" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#786455', fontSize: 10, fontWeight: 'bold' }} 
                      dy={10} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#786455', fontSize: 10, fontWeight: 'bold' }} 
                      tickFormatter={(value) => `Rp ${(value / 1000000).toFixed(1)}M`}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: '#FAF8F5' }}
                      contentStyle={{ borderRadius: '16px', border: '1px solid #EBE3D5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                      formatter={(value: number) => [`Rp ${value.toLocaleString('id-ID')}`, 'Pendapatan']}
                    />
                    <Bar dataKey="revenue" fill="#8C6239" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* INTERACTIVE COMPREHENSIVE FILTER PANEL */}
            <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-3xs grid grid-cols-1 md:grid-cols-3 gap-4 animate-fadeIn">
              <div>
                <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-[#8C6239]" />
                  <span>Cari Nomor Meja (Table No.)</span>
                </label>
                <input 
                  type="text" 
                  placeholder="Contoh: 05, 03"
                  value={historyTableFilter}
                  onChange={(e) => setHistoryTableFilter(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 text-xs text-[#2C2520] font-bold focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Dari Tanggal (Start Date)</label>
                <input 
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 text-xs text-[#2C2520] font-bold focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Hingga Tanggal (End Date)</label>
                <div className="flex gap-2">
                  <input 
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => setHistoryEndDate(e.target.value)}
                    className="flex-1 bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 text-xs text-[#2C2520] font-bold focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
                  />
                  {(historyTableFilter || historyStartDate || historyEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryTableFilter('');
                        setHistoryStartDate('');
                        setHistoryEndDate('');
                        triggerNotification('✓ Filter pencarian dibersihkan.');
                      }}
                      className="px-4.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-750 rounded-xl text-xs font-black transition-colors uppercase tracking-wider cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* List Table Archive */}
            <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-[#FAF8F5] gap-3 mb-4">
                <div>
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider">Logs Penjualan Lunas</h4>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mt-1 inline-block">Saji Terkirim</span>
                </div>
                
                {completedOrders.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleExportToExcel}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 border border-emerald-500 text-white hover:text-white rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-3xs"
                      title="Export completed orders to Excel"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span>Ekspor Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllCompletedOrders}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 border border-red-500 text-white hover:text-white rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-3xs"
                      title="Clear completed orders history"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                      <span>Hapus Riwayat Selesai</span>
                    </button>
                  </div>
                )}
              </div>

              {completedOrders.length === 0 ? (
                <div className="py-16 text-center text-[#9E8775] italic">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <span>Belum ada omzet transaksi selesai hari ini.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {completedOrders.map((order) => (
                    <div key={order.id} className="border border-[#FAF2E8] bg-[#FAF8F5]/55 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-slate-900 uppercase">#ORD-{order.id}</span>
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.2 rounded font-black uppercase tracking-wide">Meja {order.tableNumber}</span>
                          {order.sync_status === 'synced' ? (
                            <span className="text-[8px] bg-green-50 text-green-700 border border-green-200/30 px-1.5 py-0.5 rounded font-black uppercase tracking-widest leading-none">● SYNCED</span>
                          ) : (
                            <span className="text-[8px] bg-amber-50 text-amber-600 border border-amber-200/30 px-1.5 py-0.5 rounded font-black uppercase tracking-widest leading-none animate-pulse">○ LOCAL</span>
                          )}
                          <span className="text-[9px] bg-emerald-500/15 text-emerald-700 px-2.5 py-0.2 rounded-full font-black uppercase tracking-widest">LUNAS SUKSES</span>
                        </div>
                        <p className="text-[11px] text-[#5B4E44] font-medium leading-relaxed">
                          Pelanggan: <strong className="text-slate-900 font-extrabold">{order.customerName}</strong> • {order.items.map(i => `${i.name} (${i.quantity}x)`).join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveReceipt(order)}
                          className="bg-white hover:bg-[#FAF8F5] text-[#8C6239] border border-[#EBE3D5] hover:border-[#8C6239]/40 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all active:scale-[0.98]"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Cetak Struk</span>
                        </button>
                        <div className="text-right">
                          <span className="text-[8px] text-gray-450 block font-bold uppercase tracking-wider">Total Belanja</span>
                          <span className="text-xs font-black text-[#8C6239]">Rp {order.totalPrice.toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB: DYNAMIC CUSTOM QR CODE GENERATOR */}
        {activeTab === 'qr_generator' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#8C6239]" />
                <span>QR Code Meja Generator</span>
              </h3>
              <p className="text-[11px] text-[#9E8775] font-semibold mt-0.5">Cetak dan tempelkan lembar QR dinamis premium ini di atas meja makan kafe Dieng</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Input params controller */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 space-y-4 shadow-xs">
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider pb-2 border-b border-[#FAF2E8]">Konfigurasi Nomor Meja</h4>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Nomor Meja Kafe (e.g. 05, 12, 08)</label>
                    <input 
                      type="text" 
                      placeholder="05"
                      value={qrTableNumber}
                      onChange={(e) => setQrTableNumber(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-3 text-xs text-[#2C2520] font-bold focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
                    />
                  </div>

                  <div className="bg-amber-50/50 p-3.5 border border-amber-200/50 rounded-2xl text-[10px] text-amber-900 leading-relaxed font-semibold">
                    <span className="font-black uppercase block mb-0.5">💡 Cara Kerja:</span>
                    QR ini dilingkari dengan URL parameter otomatis agar pelanggan yang memindai langsung masuk sebagai order group di nomor meja <strong>Meja {qrTableNumber || 'Empty'}</strong>.
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl font-mono text-[9px] text-gray-500 break-all select-all border border-gray-100">
                    <span className="font-extrabold text-[#8C6239] block uppercase mb-0.5 text-[8px] tracking-wider">Sasaran URL Link:</span>
                    {window.location.origin}/menu?tenant={localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live'}&table={qrTableNumber || '05'}
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="bg-white border border-[#8C6239] hover:bg-amber-50 text-[#8C6239] text-xs font-black uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PNG</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrintQr}
                      className="bg-[#8C6239] hover:bg-[#6D4926] text-white text-xs font-black uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Cetak QR</span>
                    </button>
                  </div>

                </div>
              </div>

              {/* Live Card Mockup Rendering */}
              <div className="lg:col-span-3">
                <div className="bg-white border-2 border-[#8C6239] rounded-3xl p-6.5 max-w-sm mx-auto text-center space-y-4 shadow-lg border-double relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-[#8C6239]" />
                  
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-black uppercase tracking-widest text-[#8C6239]">ScanBite Bistro</h4>
                    <p className="text-[9px] text-[#9E8775] font-extrabold pb-2 border-b border-[#FAF2E8] uppercase tracking-wider">DIENG AMBIENT SMART ORDER</p>
                  </div>

                  {/* QR Image Frame */}
                  <div className="bg-[#FAF8F5] border border-[#EBE3D5] p-5.5 rounded-2xl max-w-xs mx-auto flex items-center justify-center">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=2c2520&data=${encodeURIComponent(
                        window.location.origin + '/menu?tenant=' + (localStorage.getItem('current_tenant') || currentTenant || 'scanbite_live') + '&table=' + (qrTableNumber || '05')
                      )}`} 
                      alt={`QR Code Meja ${qrTableNumber}`}
                      referrerPolicy="no-referrer"
                      className="w-48 h-48 bg-white border border-gray-150 p-2 rounded-xl shadow-xs"
                    />
                  </div>

                  <div className="bg-[#8C6239] text-white py-1.5 px-6 rounded-full inline-block font-black text-base uppercase tracking-widest">
                    MEJA {qrTableNumber || 'XX'}
                  </div>

                  <p className="text-[10px] text-gray-500 max-w-xs mx-auto leading-relaxed">
                    Pindai kode QR di atas menggunakan kamera ponsel daku atau aplikasi scanner untuk memesan menu hidangan & bayar perorangan secara mandiri.
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: MANAJEMEN MENU & CLOUD STORAGE IMAGE PATHS */}
        {activeTab === 'menu_management' && (
          <div className="space-y-6">
            
            {/* Setting QRIS NMID Custom form */}
            <form onSubmit={handleSaveQrisString} className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#FAF8F5]">
                <QrCode className="w-5 h-5 text-[#8C6239]" />
                <div>
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider">Pengaturan QRIS Merchant Kafe</h4>
                  <p className="text-[10px] text-[#9E8775] font-semibold">Ubah string NMID / kode teks QRIS di bawah ini untuk diperbarui otomatis pada lembar pembayaran kasir pelanggan sekeluarga</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  placeholder="Contoh Code: ID1030438189"
                  value={customQrisNmid}
                  onChange={(e) => setCustomQrisNmid(e.target.value)}
                  className="flex-1 bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 text-xs text-[#2C2520] font-bold focus:outline-none focus:ring-1 focus:ring-[#8C6239]"
                />
                <button
                  type="submit"
                  className="bg-[#8C6239] hover:bg-[#724f2b] text-[#FDFBF7] text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Update QRIS</span>
                </button>
              </div>
            </form>

            <div className="p-5 rounded-3xl border border-[#FAF2E8] bg-[#FAF2E8]/40">
              <h3 className="text-xs font-black text-[#8C6239] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Upload className="w-4.5 h-4.5" />
                <span>Media & Storage Manager</span>
              </h3>
              <p className="text-xs text-[#786455] leading-relaxed">
                Tambahkan menu hidangan kafe gres secepat kilat. Gunakan uploader drag-and-drop di bawah ini untuk memuat gambar piringan baru langsung ke **Supabase Storage bucket `menu-images`**.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Image attachment box */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 space-y-4">
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider">File Gambar Menu</h4>
                  
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={handleFileDrop}
                    className="border-2 border-dashed border-[#EBE3D5] hover:border-[#8C6239] rounded-2xl p-6 text-center cursor-pointer transition-all bg-[#FAF8F5] relative min-h-[170px] flex flex-col justify-center animate-fadeIn"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />

                    {previewUrl ? (
                      <div className="space-y-2 animate-fadeIn">
                        <img 
                          src={previewUrl} 
                          alt="Preview" 
                          className="w-full aspect-video object-cover rounded-xl shadow-xs" 
                        />
                        <p className="text-[10px] font-black text-[#2C2520] truncate select-all">{selectedFile?.name}</p>
                        <p className="text-[9px] text-[#9E8775] font-semibold">{(selectedFile!.size / 1024).toFixed(1)} KB • Klik/Tarik file untuk mengganti</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 text-[#9E8775]">
                        <Upload className="w-8 h-8 mx-auto text-[#8C6239]" />
                        <p className="text-xs font-extrabold text-[#5B4E44]">Tarik & Lepaskan File di Sini</p>
                        <p className="text-[9px] text-gray-400">Atau ketuk layar untuk menelusuri dari folder lokal</p>
                      </div>
                    )}
                  </div>

                  {selectedFile && uploadStatus === 'idle' && (
                    <p className="text-[10px] text-amber-600 font-extrabold flex items-center gap-1 justify-center animate-pulse">
                      <Sparkles className="w-3.5 h-3.5" /> File terpasang, siap di-submit ke Supabase!
                    </p>
                  )}

                  {uploadStatus === 'uploading' && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black text-[#8C6239]">
                        <span>Uploading file ke bucket...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-[#8C6239] h-1.5 transition-all" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}

                  {uploadStatus === 'completed' && (
                    <p className="text-xs text-emerald-600 font-extrabold text-center flex items-center justify-center gap-1.5 animate-fadeIn">
                      <CheckCircle className="w-4 h-4 text-emerald-500" /> Gambar berhasil diupload!
                    </p>
                  )}
                </div>
              </div>

              {/* Specs Entry Panel */}
              <div className="lg:col-span-3">
                <form onSubmit={handleSaveMenu} className="bg-white border border-[#EBE3D5] rounded-3xl p-5 space-y-4 shadow-3xs animate-fadeIn">
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider pb-2 border-b border-[#FAF8F5]">Spesifikasi Detail Hidangan</h4>

                  <div>
                    <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Nama Sajian (Food/Coffee Name)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Avocado Chilled Mousse Cup"
                      value={newMenuName}
                      onChange={(e) => setNewMenuName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-3.5 py-2.5 text-xs placeholder-[#B2A494] focus:outline-none focus:ring-1 focus:ring-[#8C6239] text-gray-950 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Harga Rupiah (Nominal)</label>
                      <input 
                        type="number" 
                        required
                        placeholder="35000"
                        value={newMenuPrice}
                        onChange={(e) => setNewMenuPrice(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#8C6239] text-gray-950 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Kategori Menu</label>
                      <select
                        value={newMenuCategory}
                        onChange={(e: any) => setNewMenuCategory(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-3.5 py-2.5 text-xs font-extrabold focus:outline-none"
                      >
                        <option value="coffee">Coffee Drink</option>
                        <option value="non-coffee">Non-Coffee / Refresher</option>
                        <option value="food">Main Course / Nasi Goreng</option>
                        <option value="dessert">Sweet Cakes & Pastries</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Stok Awal (Stock)</label>
                      <input 
                        type="number" 
                        required
                        placeholder="20"
                        value={newMenuStock}
                        onChange={(e) => setNewMenuStock(Math.max(0, parseInt(e.target.value) || 0).toString())}
                        className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#8C6239] text-gray-950 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#5B4E44] uppercase tracking-wider mb-1.5">Deskripsi Singkat Kelezatan</label>
                    <textarea 
                      placeholder="Racikan rasa koki bistro yang lezat..."
                      value={newMenuDesc}
                      onChange={(e) => setNewMenuDesc(e.target.value)}
                      rows={2.5}
                      className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-3.5 py-2.5 text-xs placeholder-[#B2A494] focus:outline-none focus:ring-1 focus:ring-[#8C6239] text-gray-950"
                    />
                  </div>

                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isAvailable}
                        onChange={(e) => setIsAvailable(e.target.checked)}
                        className="w-4 h-4 text-[#8C6239] bg-[#FAF8F5] border-[#EBE3D5] rounded"
                      />
                      <span className="text-xs font-bold text-[#5B4E44]">Tersedia</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isPopular}
                        onChange={(e) => setIsPopular(e.target.checked)}
                        className="w-4 h-4 text-[#8C6239] bg-[#FAF8F5] border-[#EBE3D5] rounded"
                      />
                      <span className="text-xs font-bold text-[#5B4E44]">Rekomendasi Utama</span>
                    </label>
                  </div>

                  <button 
                    type="submit"
                    disabled={submittingMenu}
                    className="w-full bg-[#8C6239] disabled:bg-gray-300 hover:bg-[#6D4926] text-[#FDFBF7] py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md mt-2 cursor-pointer"
                  >
                    {submittingMenu ? 'Menyimpan...' : 'Tambahkan Menu ke Database'}
                  </button>
                </form>
              </div>

            </div>
            
            <CategoryManagement />

            {/* KATALOG INVENTORI MENU & STOCK ALERT SYSTEM */}
            <div className="bg-white border border-[#EBE3D5] rounded-3xl p-5 shadow-xs space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-3.5 border-b border-[#FAF2E8] gap-3">
                <div>
                  <h4 className="text-sm font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-1.5">
                    <ListOrdered className="w-4.5 h-4.5 text-[#8C6239]" />
                    <span>Katalog Inventori & Manajemen Stok</span>
                  </h4>
                  <p className="text-[10.5px] text-[#9E8775] font-semibold mt-0.5">Pantau tingkat ketersediaan bahan, status hidangan, dan peringatan limit stok kritis</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9.5px] bg-[#8C6239]/10 text-[#8C6239] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider">
                    Total {allMenus.length} Katalog
                  </span>
                  <button
                    type="button"
                    onClick={fetchAllMenus}
                    disabled={fetchingMenus}
                    className="p-1.5 bg-gray-50 text-[#8C6239] hover:bg-[#8C6239]/15 border border-gray-150 rounded-lg transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${fetchingMenus ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {allMenus.length === 0 ? (
                <div className="py-12 text-center text-gray-400 italic font-semibold">
                  {fetchingMenus ? 'Menyelaraskan data...' : 'Belum ada menu tersimpan dalam database.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#FAF2E8]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF8F5] border-b border-[#FAF2E8] text-[#5B4E44] font-black uppercase text-[9.5px] tracking-wider">
                        <th className="p-4">Sajian Menu</th>
                        <th className="p-4">Kategori</th>
                        <th className="p-4">Harga Jual</th>
                        <th className="p-4 text-center">Tingkat Stok</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-right">Quick Stock</th>
                        <th className="p-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#FAF8F5]">
                      {allMenus.map((menu) => {
                        const stock = Number(menu.stock_quantity ?? menu.stock ?? 15);
                        const isCritical = stock <= 5;
                        const isOut = stock === 0;

                        const handleAdjustStock = async (amount: number) => {
                          const newStockVal = Math.max(0, stock + amount);
                          
                          // update state locally for snappy UI
                          setAllMenus(prev => prev.map(m => m.id === menu.id ? { ...m, stock_quantity: newStockVal } : m));

                          if (supabase && menu.id) {
                            try {
                              // try updating first in menus
                              const { error } = await supabase
                                .from('sb_menus')
                                .update({ stock_quantity: newStockVal })
                                .eq('id', menu.id);

                              if (error) {
                                // fallback to menu_items table
                                await supabase
                                  .from('menu_items')
                                  .update({ stock_quantity: newStockVal })
                                  .eq('id', menu.id);
                              }
                            } catch (e: any) {
                              console.warn('Silent DB stock update err: ', e.message);
                            }
                          }
                        };

                        return (
                          <tr key={menu.id} className="hover:bg-gray-50/50 transition-all font-medium text-[#2C2520]">
                            <td className="p-4 flex items-center gap-3">
                              <img 
                                src={menu.image || menu.image_url || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80'} 
                                alt={menu.name}
                                className="w-10 h-10 object-cover rounded-xl border border-gray-150 shadow-3xs hover:scale-105 transition-all"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80';
                                }}
                              />
                              <div>
                                <p className="font-extrabold text-[#1C1612] truncate max-w-[170px] sm:max-w-[220px]">{menu.name}</p>
                                <p className="text-[10px] text-gray-400 font-bold">Rating: ★ {menu.rating}</p>
                              </div>
                            </td>
                            <td className="p-4 capitalize">
                              <span className="bg-gray-100 text-[#5B4E44] px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wider">
                                {menu.category}
                              </span>
                            </td>
                            <td className="p-4 font-mono font-bold text-[#8C6239]">
                              Rp {Number(menu.price).toLocaleString('id-ID')}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex flex-col items-center justify-center">
                                <span className={`text-sm font-black font-mono ${isOut ? 'text-red-650' : (isCritical ? 'text-rose-600 animate-pulse' : 'text-slate-700')}`}>
                                  {stock} Pcs
                                </span>
                                {isOut ? (
                                  <span className="text-[8px] bg-red-100 text-red-700 font-extrabold px-1.5 py-0.2 rounded mt-0.5">HABIS</span>
                                ) : (
                                  isCritical && (
                                    <span className="text-[8px] bg-rose-100 text-rose-700 font-black px-1.5 py-0.2 rounded mt-0.5 animate-pulse tracking-wide">
                                      🚨 STOK KRITIS
                                    </span>
                                  )
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                menu.isAvailable 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-gray-150 text-gray-500'
                              }`}>
                                {menu.isAvailable ? 'Tersedia' : 'Kosong'}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleAdjustStock(-1)}
                                  className="w-7 h-7 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-700 border border-gray-200 rounded-lg flex items-center justify-center font-black transition-colors"
                                  title="Kurangi 1 Pcs"
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustStock(1)}
                                  className="w-7 h-7 bg-gray-50 hover:bg-emerald-50 text-gray-400 hover:text-emerald-700 border border-gray-200 rounded-lg flex items-center justify-center font-black transition-colors"
                                  title="Tambah 1 Pcs"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    // TODO: Implement Edit
                                    alert('Fitur edit segera hadir');
                                  }}
                                  className="px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm(`Yakin ingin menghapus menu ${menu.name}?`)) {
                                       if (supabase && menu.id) {
                                          try {
                                            const { error } = await supabase.from('sb_menus').delete().eq('id', menu.id);
                                            if (!error) {
                                              setAllMenus(prev => prev.filter(m => m.id !== menu.id));
                                            } else {
                                              const { error: fbErr } = await supabase.from('menu_items').delete().eq('id', menu.id);
                                              if (!fbErr) {
                                                setAllMenus(prev => prev.filter(m => m.id !== menu.id));
                                              }
                                            }
                                          } catch (e: any) {
                                            console.warn('Gagal menghapus:', e.message);
                                          }
                                       } else {
                                          setAllMenus(prev => prev.filter(m => m.id !== menu.id));
                                       }
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* CONTROLLER JUKEBOX SYSTEM */}
        {activeTab === 'jukebox_controller' && (
          <div className="space-y-6">
            <div className="bg-[#1C1612] text-white p-5 rounded-3xl border border-white/5 relative overflow-hidden animate-fadeIn">
              <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <Music className="w-5 h-5" /> 
                <span>Sistem Antrean Jukebox Dapur</span>
              </h3>
              <p className="text-xs text-gray-400 max-w-xl leading-relaxed font-medium">
                Sistem smart-sound player yang disinkronkan secara real-time. Mainkan lagu-lagu request yang dicalonkan pelanggan dengan upvote suara terbanyak!
              </p>
            </div>

            {/* ACTIVE IN-CAFE LIVE STREAMING MUSIC PLAYER PLAYER */}
            <div className="bg-[#1C1612] text-white p-6 rounded-3xl border border-white/10 shadow-2xl space-y-4 animate-scaleUp">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#1DB954]">Bistro Sound Console Player</span>
                </div>
                {inlinePlayerTrack && (
                  <span className="text-[9px] bg-white/10 text-gray-300 font-mono px-2.5 py-0.5 rounded-full uppercase">
                    LIVE STREAMING
                  </span>
                )}
              </div>

              {!inlinePlayerTrack ? (
                <div className="py-10 text-center space-y-2.5">
                  <div className="w-12 h-12 rounded-full bg-white/5 text-gray-500 flex items-center justify-center mx-auto border border-white/10 border-dashed">
                    <VolumeX className="w-5 h-5 animate-pulse" />
                  </div>
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Player Belum Aktif</h4>
                  <p className="text-[11px] text-gray-500 max-w-sm mx-auto leading-relaxed">
                    Silakan pilih atau klik "Set Active" atau Tombol Play di bawah untuk memuat player lagu gratis secara langsung di browser Anda!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  
                  {/* Left Metadata info card */}
                  <div className="md:col-span-5 flex items-center gap-4">
                    {inlinePlayerTrack.artworkUrl ? (
                      <img 
                        src={inlinePlayerTrack.artworkUrl} 
                        alt="Album Cover" 
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-2xl object-cover bg-white/10 border border-white/10 shadow-lg shrink-0" 
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-500 shrink-0">
                        <Music className="w-8 h-8 animate-spin" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-[9px] bg-amber-500/15 text-amber-400 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Sedang Diputar
                      </span>
                      <h4 className="font-extrabold text-sm truncate text-white leading-tight mt-1.5">{inlinePlayerTrack.title}</h4>
                      <p className="text-xs text-gray-400 truncate leading-tight mt-0.5">{inlinePlayerTrack.artist}</p>
                      <p className="text-[10px] text-gray-500 mt-2">
                        Request oleh: <strong className="text-gray-300 font-semibold">{inlinePlayerTrack.requestedBy}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Middle interactive iframe stream frame */}
                  <div className="md:col-span-4 bg-black/40 border border-white/5 rounded-2xl overflow-hidden h-24 flex items-center justify-center relative">
                    {inlinePlayerTrack.id && String(inlinePlayerTrack.id).includes('sp-') ? (
                      <iframe
                        src={`https://open.spotify.com/embed/track/${String(inlinePlayerTrack.id).replace('sp-', '')}`}
                        width="100%"
                        height="80"
                        allow="encrypted-media"
                        className="border-0 rounded-xl"
                        title="Spotify Embed"
                      />
                    ) : inlinePlayerTrack.youtubeId ? (
                      <iframe
                        src={
                          String(inlinePlayerTrack.youtubeId || '').includes('yt_q_') || !/^[a-zA-Z0-9_\-]+$/.test(String(inlinePlayerTrack.youtubeId || ''))
                            ? `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(inlinePlayerTrack.title + " " + inlinePlayerTrack.artist)}&autoplay=1`
                            : `https://www.youtube.com/embed/${inlinePlayerTrack.youtubeId}?autoplay=1&enablejsapi=1`
                        }
                        width="100%"
                        height="100%"
                        allow="autoplay; encrypted-media"
                        className="border-0 rounded-xl absolute inset-0"
                        title="YouTube Audio Stream"
                      />
                    ) : (
                      <div className="text-[11px] text-amber-500 font-black uppercase text-center py-4 px-2">
                        <span className="block animate-bounce mb-1">📻</span>
                        <span>iTunes Preview Direct stream</span>
                      </div>
                    )}
                  </div>

                  {/* Right quick console player controller triggers */}
                  <div className="md:col-span-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteJukeboxTrack(inlinePlayerTrack.id)}
                      className="bg-[#1DB954] hover:bg-[#1ed760] text-black text-xs font-black uppercase py-4 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                    >
                      <Check className="w-4 h-4 font-bold" />
                      <span>Selesaikan Lagu</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setInlinePlayerTrack(null)}
                      className="bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[10px] font-bold py-2 px-4 rounded-xl transition-all text-center border border-[#333]/20 cursor-pointer"
                    >
                      Matikan Player
                    </button>
                  </div>

                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-[#EBE3D5] p-5 shadow-xs animate-fadeIn">
              <div className="flex justify-between items-center pb-3 border-b border-[#FAF8F5] mb-4">
                <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider">Antrean Lagu Kafe ({jukeboxQueue.length} Track)</h4>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span>Streaming Player Active</span>
                </div>
              </div>

              {jukeboxQueue.length === 0 ? (
                <div className="py-12 text-center text-[#9E8775] italic">
                  <span>Tidak ada antrean request lagu saat ini.</span>
                </div>
              ) : (
                <div className="divide-y divide-[#FAF8F5] space-y-2">
                  {(() => {
                    const maxVotes = Math.max(...jukeboxQueue.map(t => t.votes || 0), 1);
                    return jukeboxQueue.map((track) => {
                      const votePercentage = Math.min(((track.votes || 0) / maxVotes) * 100, 100);
                      return (
                        <div key={track.id} className="pt-3 pb-3 flex flex-col gap-2 first:pt-0">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {track.isPlaying ? (
                                <div className="flex items-end gap-0.5 h-4.5" title="Sedang diputar">
                                  <span className="w-0.5 bg-amber-500 h-2 animate-[pulse_1s_infinite_ease-in-out]" />
                                  <span className="w-0.5 bg-amber-500 h-4 animate-[pulse_0.7s_infinite_ease-in-out_0.2s]" />
                                  <span className="w-0.5 bg-amber-500 h-1 animate-[pulse_0.5s_infinite_ease-in-out_0.1s]" />
                                  <span className="w-0.5 bg-amber-500 h-3 animate-[pulse_0.8s_infinite_ease-in-out_0.3s]" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-500 font-mono">Q</div>
                              )}
                              <div>
                                <p className={`text-xs font-black ${track.isPlaying ? 'text-[#8C6239]' : 'text-[#2C2520]'}`}>
                                  {track.title}
                                </p>
                                <p className="text-[10px] text-gray-400 font-medium">
                                  {track.artist} • <span className="text-[#8C6239] font-bold">{track.requestedBy}</span> • Upvote: <strong className="text-gray-900">{track.votes} suara</strong>
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handlePlayInCafe(track)}
                                className="bg-[#1DB954] hover:bg-[#1ed760] text-[#1C1612] text-[10px] font-black px-3.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                                title="Membuka Spotify"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Mainkan (Spotify)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePlayInCafeYt(track)}
                                className="bg-[#FF0000] hover:bg-[#CC0000] text-white text-[10px] font-black px-3.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors cursor-pointer animate-pulse"
                                title="Membuka YouTube"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Mainkan (YouTube)</span>
                              </button>

                              {track.isPlaying ? (
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-black px-2.5 py-1.5 rounded-lg border border-emerald-200">
                                  SEDANG DIPUTAR
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handlePlayJukeboxTrack(track.id)}
                                  className="bg-[#8C6239] hover:bg-[#6D4926] text-white text-[10px] font-black px-3.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <span>Set Active</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteJukeboxTrack(track.id)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-black px-3.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                                title="Lagu Selesai Diputar"
                              >
                                <Check className="w-3.5 h-3.5 font-bold" />
                                <span>Tandai Selesai</span>
                              </button>
                            </div>
                          </div>
                          
                          {/* Vote Progress Bar */}
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-700 ease-out ${track.isPlaying ? 'bg-emerald-500' : 'bg-amber-400'}`} 
                              style={{ width: `${votePercentage}%` }} 
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPREHENSIVE WHITE-LABEL STORE SETTINGS */}
        {activeTab === 'store_settings' && (
          <div className="space-y-6 animate-fadeIn pb-12">
            {/* Header info */}
            <div className="bg-[#1C1612] text-white p-5 rounded-3xl border border-white/5 relative overflow-hidden">
              <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <Settings className="w-5 h-5 animate-spin-slow" />
                <span>Pengaturan White-Label POS Toko</span>
              </h3>
              <p className="text-xs text-gray-400 max-w-xl leading-relaxed font-medium">
                Sesuaikan identitas kafe, logo, format finansial global, persentase pajak, serta PIN otorisasi operator kasir Anda di sini. Semua perubahan tersimpan secara aman di database lokal.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">

              {/* SECTION A: PROFILE IDENTITAS & BRANDING */}
              <div className="bg-white rounded-3xl border border-[#EBE3D5] p-5 shadow-xs space-y-4">
                <div className="pb-3 border-b border-[#FAF2E8] flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-base">🏢</span> Profil & Identitas Kafe
                  </h4>
                  <span className="text-[9px] bg-amber-500/10 text-[#8C6239] font-black px-2 py-0.5 rounded-full uppercase">Branding</span>
                </div>

                <form onSubmit={handleUpdateSettings} className="space-y-4">
                  {/* Logo Upload Panel */}
                  <div className="bg-[#FAF8F5] rounded-2xl p-4 border border-[#EBE3D5] flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-[#8C6239] group/setting-logo shrink-0 shadow-sm bg-white flex items-center justify-center">
                      <img
                        src={logoPreview || merchantLogo || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=150&q=80'}
                        alt="Preview Logo"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="space-y-1.5 flex-1 text-center sm:text-left">
                      <p className="text-xs font-black text-[#1C1612] uppercase tracking-wider">Logo Brand Kafe</p>
                      <p className="text-[10px] text-gray-400 font-bold leading-normal font-sans">Unggah logo kustom Anda untuk ditampilkan pada struk digital, QR, dan layar menu kasir.</p>
                      <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1 font-sans">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="bg-[#FAF8F5] hover:bg-[#FAF2E8] text-[#8C6239] text-[10px] font-black px-3.5 py-1.5 rounded-lg border border-[#EBE3D5] cursor-pointer transition-colors"
                        >
                          Pilih Gambar Logo
                        </button>
                        {logoPreview && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleUpdateLogo}
                              className="bg-[#8C6239] hover:bg-[#6D4926] text-white text-[10px] font-black px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                              disabled={isSavingLogo}
                            >
                              {isSavingLogo ? 'Menyimpan...' : 'Simpan Logo'}
                            </button>
                            <button
                              type="button"
                              onClick={cleanLogoPreview}
                              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Input Fields */}
                  <div className="space-y-3 font-sans">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Kode Tenant (Multi-Tenant)</label>
                      <select
                        value={currentTenant}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCurrentTenant(val);
                          localStorage.setItem('current_tenant', val);
                        }}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 px-3.5 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent transition-all"
                      >
                        <option value="scanbite_live">scanbite_live (Default)</option>
                        <option value="pawon_raos_demo">pawon_raos_demo (Demo)</option>
                      </select>
                      <p className="text-[9px] text-[#A68F80] mt-0.5 font-medium leading-relaxed">
                        Ganti kode tenant untuk memuat profil, nama toko, dan PIN dari cloud database Supabase.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Nama Kafe / Resto</label>
                      <input
                        type="text"
                        value={cafeName}
                        onChange={(e) => setCafeName(e.target.value)}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 px-3.5 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent transition-all"
                        placeholder="ScanBite Bistro"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Email Kontak Resto / Admin</label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 px-3.5 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent transition-all"
                        placeholder="bistro@scanbite.com"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Alamat Lengkap Cabang</label>
                      <textarea
                        rows={2}
                        value={cafeAddress}
                        onChange={(e) => setCafeAddress(e.target.value)}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2 px-3 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent transition-all resize-none"
                        placeholder="Jl. Dieng Raya No. 45, Wonosobo"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">WhatsApp / No. Telepon Toko</label>
                      <input
                        type="text"
                        value={cafePhone}
                        onChange={(e) => setCafePhone(e.target.value)}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 px-3.5 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent transition-all"
                        placeholder="+62 812-3456-7890"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Teks Kustom Kaki Struk (Receipt Footer)</label>
                      <input
                        type="text"
                        value={cafeReceiptFooter}
                        onChange={(e) => setCafeReceiptFooter(e.target.value)}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 px-3.5 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent transition-all"
                        placeholder="Terima kasih atas kunjungan Anda. Silakan scan QR lagi untuk pesanan berikutnya!"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    onClick={handleUpdateSettings}
                    className="w-full bg-[#8C6239] hover:bg-[#6D4926] text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs font-sans"
                  >
                    <Save className="w-4 h-4" />
                    <span>Simpan Profil & Branding</span>
                  </button>
                </form>
              </div>

              {/* SECTION B: SECURITY PIN SYSTEM */}
              <div className="bg-white rounded-3xl border border-[#EBE3D5] p-5 shadow-xs space-y-4">
                <div className="pb-3 border-b border-[#FAF8F5] flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-base">🔑</span> Pengaturan PIN Keamanan
                  </h4>
                  <span className="text-[9px] bg-rose-500/10 text-rose-600 font-black px-2 py-0.5 rounded-full uppercase font-sans">Security Gate</span>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] text-[#786455] leading-relaxed font-bold font-sans">
                    Atur 4-digit PIN rahasia baru untuk membatasi akses ke dashboard operator toko, kasir, monitor dapur serta halaman otorisasi ini.
                  </p>

                  <form
                    onSubmit={handleUpdateSettings}
                    className="space-y-3.5"
                  >
                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1 font-sans">Masukkan PIN Lama</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={oldPinInput}
                        onChange={(e) => setOldPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="w-full text-center text-sm font-black tracking-[0.5em] bg-[#FAF8F5] text-[#8C6239] py-2.5 px-3 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-transparent font-mono animate-none"
                        placeholder="••••"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1 font-sans">PIN Baru (4-Angka)</label>
                        <input
                          type="password"
                          maxLength={4}
                          value={newPinInput}
                          onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full text-center text-sm font-black tracking-[0.5em] bg-[#FAF8F5] text-[#8C6239] py-2.5 px-3 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent font-mono animate-none"
                          placeholder="••••"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1 font-sans">Konfirmasi PIN Baru</label>
                        <input
                          type="password"
                          maxLength={4}
                          value={confirmNewPinInput}
                          onChange={(e) => setConfirmNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full text-center text-sm font-black tracking-[0.5em] bg-[#FAF8F5] text-[#8C6239] py-2.5 px-3 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] focus:border-transparent font-mono animate-none"
                          placeholder="••••"
                          required
                        />
                      </div>
                    </div>

                    {pinFormError && (
                      <p className="text-[10px] text-rose-600 font-extrabold text-center tracking-wide font-sans">{pinFormError}</p>
                    )}

                    <button
                      type="submit"
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs border border-rose-500/20 font-sans"
                    >
                      <Lock className="w-4 h-4" />
                      <span>Ubah PIN Keamanan</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* SECTION C: LOKALISASI & FINANSIAL */}
              <div className="bg-white rounded-3xl border border-[#EBE3D5] p-5 shadow-xs space-y-4">
                <div className="pb-3 border-b border-[#FAF8F5] flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-base">🌐</span> Lokalisasi & Finansial (Global Ready)
                  </h4>
                  <span className="text-[9px] bg-[#8C6239]/10 text-[#8C6239] font-black px-2 py-0.5 rounded-full uppercase font-sans">Localization</span>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] text-[#786455] leading-relaxed font-bold font-sans">
                    Konfigurasi mata uang penagihan POS secara instan serta bahasa instruksi menu tamu.
                  </p>

                  <div className="space-y-3.5 text-left font-sans">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Mata Uang Aktif (Simbol POS)</label>
                      <select
                        value={currencySymbol}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setCurrencySymbol(val);
                          localStorage.setItem('scanbite_currency_symbol', val);
                          triggerNotification(`🟢 Simbol mata uang POS disetel ke: ${val}`);
                        }}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 px-3.5 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] transition-colors cursor-pointer"
                      >
                        <option value="IDR">IDR (Rp - Rupiah Indonesia)</option>
                        <option value="USD">USD ($ - United States Dollar)</option>
                        <option value="JPY">JPY (¥ - Japanese Yen)</option>
                        <option value="SGD">SGD (S$ - Singapore Dollar)</option>
                        <option value="AUD">AUD (A$ - Australian Dollar)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Bahasa Utama Sistem Restoran (Tamu)</label>
                      <select
                        value={langApp}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setLangApp(val);
                          localStorage.setItem('scanbite_lang', val);
                          triggerNotification(`🟢 Bahasa aplikasi diubah ke: ${val === 'id' ? 'Indonesia' : 'Inggris'}`);
                        }}
                        className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 px-3.5 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] transition-colors cursor-pointer"
                      >
                        <option value="id">Bahasa Indonesia</option>
                        <option value="en">English (Inggris)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION D: SERVICE FEES & TAXES */}
              <div className="bg-white rounded-3xl border border-[#EBE3D5] p-5 shadow-xs space-y-4">
                <div className="pb-3 border-b border-[#FAF2E8] flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-base">📊</span> Pengaturan Biaya Tambahan
                  </h4>
                  <span className="text-[9px] bg-emerald-500/10 text-emerald-700 font-black px-2 py-0.5 rounded-full uppercase font-sans">Fees & Taxes</span>
                </div>

                <div className="space-y-4 font-sans">
                  <p className="text-[10px] text-[#786455] leading-relaxed font-bold">
                    Tentukan tarif Pajak Restoran (PB1) dan Biaya Pelayanan (Service Charge) saat checkout pelanggan.
                  </p>

                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Persentase Pajak (% Tax)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={taxPercent}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setTaxPercent(val);
                            localStorage.setItem('scanbite_tax_percent', String(val));
                          }}
                          className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 pl-3.5 pr-8 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] font-mono"
                          placeholder="10"
                        />
                        <span className="absolute right-3.5 top-2.5 text-xs font-bold text-gray-400 font-mono">%</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-[#786455] tracking-wider mb-1">Biaya Layanan (% Service)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={servicePercent}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setServicePercent(val);
                            localStorage.setItem('scanbite_service_charge_percent', String(val));
                          }}
                          className="w-full text-xs bg-[#FAF8F5] text-[#2C2520] font-bold py-2.5 pl-3.5 pr-8 rounded-xl border border-[#EBE3D5] focus:outline-none focus:ring-1 focus:ring-[#8C6239] font-mono"
                          placeholder="5"
                        />
                        <span className="absolute right-3.5 top-2.5 text-xs font-bold text-gray-400 font-mono">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FAF8F5] rounded-2xl p-4 border border-[#EBE3D5] space-y-1.5 text-left border-dashed">
                    <p className="text-[10px] font-black text-[#1C1612] uppercase tracking-wider flex items-center gap-1.5">
                      <span>📌</span> Ilustrasi Perhitungan POS
                    </p>
                    <p className="text-[10.5px] text-[#786455] font-semibold leading-relaxed">
                      Tambahan Tagihan: <strong className="text-gray-950 font-mono">{taxPercent}% Pajak</strong> + <strong className="text-gray-950 font-mono">{servicePercent}% Biaya Pelayanan</strong> (Total: <strong className="text-emerald-700 font-mono">+{taxPercent + servicePercent}%</strong> dari harga subtotal hidangan yang dipesan).
                    </p>
                  </div>
                </div>
              </div>

             </div>
          </div>
        )}

      </main>

      {/* RENDER EMBEDDED KASIR PRINT RECEIPT PREVIEW MODAL */}
      {activeReceipt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:absolute print:inset-0 print:bg-white print:z-50 print:flex print:items-start print:justify-center overflow-y-auto">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm shadow-xl space-y-4 animate-fadeIn font-mono text-xs border border-[#EBE3D5] print-receipt-modal flex flex-col my-8">
            
            {/* Render full digital receipt with item-wise details and split bills support */}
            <DigitalReceipt 
              orderData={{
                ...activeReceipt,
                table_number: activeReceipt.tableNumber,
                customer_name: activeReceipt.customerName,
                total_price: activeReceipt.totalPrice,
                created_at: (activeReceipt as any).created_at || (activeReceipt as any).createdAtDate || new Date().toISOString(),
                createdAt: (activeReceipt as any).createdAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                payment_method_label: activeReceipt.paymentMethod === 'cash' ? 'Tunai / Cash' : 'QRIS / E-Wallet',
                payment_method: activeReceipt.paymentMethod,
                amountPaid: activeReceipt.totalPrice,
                changeAmount: 0
              }} 
              className="border-0 shadow-none p-0 w-full" 
            />

            {/* Actions (Not visible during print) */}
            <div className="grid grid-cols-2 gap-3 pt-2 print:hidden font-sans border-t border-dashed border-gray-300">
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="border border-[#EBE3D5] hover:bg-gray-50 text-gray-600 text-xs font-bold py-3.5 rounded-xl transition-all cursor-pointer"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    window.print();
                  } catch (err) {
                    console.warn(err);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Struk</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
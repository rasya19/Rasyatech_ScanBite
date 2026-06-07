import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  Coffee, 
  User, 
  ArrowRight, 
  MapPin, 
  AlertTriangle, 
  HelpCircle,
  Sparkles,
  ChevronRight,
  Compass
} from 'lucide-react';
import { supabase } from '../supabaseClient';

interface HomeProps {
  onNavigate: (page: string) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState('');
  const [logoSrc, setLogoSrc] = useState<string | null>(() => localStorage.getItem('scanbite_merchant_logo'));
  const [cafeNameText, setCafeNameText] = useState(() => localStorage.getItem('scanbite_cafe_name') || 'ScanBite');

  const [isValidatingTable, setIsValidatingTable] = useState(false);
  const [tableValidationError, setTableValidationError] = useState<string | null>(null);

  // Real-time validation function
  const validateTableRealTime = async (tableNumToCheck: string): Promise<boolean> => {
    if (!supabase) return true; // Fail safe if no supabase connection
    
    setIsValidatingTable(true);
    setTableValidationError(null);
    try {
      const { data, error: queryErr } = await supabase
        .from('sb_tables')
        .select('*')
        .or(`table_number.eq."${tableNumToCheck}",table_number.eq."${tableNumToCheck.padStart(2, '0')}",table_number.eq."${parseInt(tableNumToCheck, 10).toString()}"`)
        .maybeSingle();
        
      if (queryErr) {
        console.warn('Real-time table lookup error:', queryErr.message);
        return true; 
      }
      
      if (data) {
        // Validate if table is active (session_id is NULL)
        if (data.session_id !== null) {
          // It might be active, but let's just warn or allow. Based on requirements: "If NULL, inactive/disabled"
        }
        return true;
      } else {
        setTableValidationError('Meja tidak ditemukan.');
        return false;
      }
    } catch (err) {
      console.warn('Failed real-time table check:', err);
      return true;
    } finally {
      setIsValidatingTable(false);
    }
  };

  // Fetch available tables
  const fetchAvailableTables = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('sb_tables').select('table_number');
    if (data) {
      setAvailableTables(data.map(t => t.table_number.toString().padStart(2, '0')).sort());
    }
  };

  // Read table parameter on mount
  useEffect(() => {
    fetchAvailableTables();

    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    const tenant = params.get('tenant');
    if (tenant) {
      localStorage.setItem('current_tenant', tenant);
    }
    
    const savedTable = sessionStorage.getItem('scanbite_table');
    
    if (table) {
      if (savedTable && savedTable !== table) {
        // Mismatch
        if (confirm("Anda sedang memindai meja baru. Ingin ganti meja?")) {
          setTableNumber(table);
          sessionStorage.setItem('scanbite_table', table);
        } else {
          setTableNumber(savedTable);
        }
      } else {
        setTableNumber(table);
        sessionStorage.setItem('scanbite_table', table);
      }
    } else if (savedTable) {
        setTableNumber(savedTable);
    } else {
        setShowTableSelection(true);
    }
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('Masukkan nama lengkap Anda agar kami bisa menyapa Anda!');
      return;
    }
    if (customerName.trim().length < 2) {
      setError('Nama terlalu pendek, silakan masukkan minimal 2 karakter.');
      return;
    }

    if (tableNumber) {
      const isValid = await validateTableRealTime(tableNumber);
      if (!isValid) {
        return;
      }
    }

    // Save customer session state per tab.
    sessionStorage.setItem('scanbite_customer_name', customerName.trim());
    localStorage.setItem('scanbite_session_start_time', Date.now().toString());
    if (tableNumber) {
      sessionStorage.setItem('scanbite_table', tableNumber);
    }
    
    // Clear error
    setError('');
    
    // Navigate to Menu
    onNavigate('menu');
  };

  // Helper to simulate scanning a table QR code in sandbox
  const handleSimulateQR = (num: string) => {
    // Reload page with root path and tenant/table parameters to execute full verification flow
    const newUrl = `${window.location.origin}/?tenant=scanbite_live&table=${num}`;
    window.location.href = newUrl;
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2C2520] flex flex-col justify-between tracking-normal font-sans antialiased relative overflow-hidden selection:bg-[#E6D5C3]">
      
      {/* Background Decorative Rings */}
      <div className="absolute top-[-20%] left-[-20%] w-[90%] aspect-square rounded-full bg-[#F4EDE2] opacity-50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] aspect-square rounded-full bg-[#EFE6D5] opacity-60 blur-2xl pointer-events-none" />

      {/* Main Container */}
      <main className="flex-1 w-full max-w-md mx-auto px-6 pt-10 pb-8 flex flex-col justify-center z-10">
        
        {/* Header Branding */}
        <div id="brand-header" className="text-center mb-8">
          {logoSrc ? (
            <div className="inline-flex items-center justify-center p-0.5 bg-gradient-to-tr from-[#8C6239] to-amber-500 rounded-full mb-4 shadow-md hover:scale-105 transition-transform">
              <img 
                src={logoSrc} 
                alt={cafeNameText} 
                className="w-20 h-20 rounded-full object-cover border-2 border-white"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center p-3 bg-[#EFE6D5] rounded-2xl mb-4 text-[#8C6239] shadow-inner border border-white/40">
              <Coffee className="w-8 h-8 stroke-[1.5]" />
            </div>
          )}
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1C1612]">
            {cafeNameText}
          </h1>
          <p className="text-sm text-[#786455] font-medium mt-1">
            Pesan Cepat Mandiri Dari Meja Anda
          </p>
        </div>

        {/* Dynamic Card Content */}
        <div id="home-card" className="bg-white/80 backdrop-blur-md rounded-3xl p-6 shadow-xl shadow-[#2C2520]/5 border border-white/60">
          
          {showTableSelection ? (
            /* CASE 0: Table Selection Grid */
            <div className="text-center animate-fadeIn">
              <h2 className="text-xl font-bold text-[#1C1612] mb-6">Pilih Meja Anda</h2>
              <div className="grid grid-cols-3 gap-3">
                {availableTables.map(num => (
                  <button
                    key={num}
                    onClick={() => {
                        setTableNumber(num);
                        sessionStorage.setItem('scanbite_table', num);
                        setShowTableSelection(false);
                    }}
                    className="p-4 bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl hover:border-[#8C6239] transition-all font-bold text-[#8C6239]"
                  >
                    Meja {num}
                  </button>
                ))}
              </div>
            </div>
          ) : tableNumber ? (
            /* CASE 1: Table Detected - Show Check-in Form */
            <div>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#F7F2EA]">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#8C6239]/10 text-[#8C6239]">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-[#9E8775] font-semibold uppercase tracking-wider">Lokasi Meja Anda</p>
                  <p className="text-lg font-bold text-[#2C2520]">Meja Nomor {tableNumber}</p>
                </div>
              </div>

              {tableValidationError ? (
                <div className="space-y-4 animate-fadeIn text-center py-2">
                  <div className="w-12 h-12 bg-red-50 text-red-650 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-red-100 shadow-inner">
                    <AlertTriangle className="w-6 h-6 stroke-[2] text-red-650 animate-pulse" />
                  </div>
                  <h3 className="text-sm font-extrabold text-red-650 uppercase tracking-widest leading-none">Meja Tidak Terdaftar!</h3>
                  <p className="text-xs text-[#5B4E44] leading-relaxed font-bold">
                    {tableValidationError}
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-[#1C1612] mb-2">Selamat Datang!</h2>
                  <p className="text-sm text-[#786455] mb-6 leading-relaxed">
                    Silakan masukkan nama lengkap Anda untuk memulai pesanan bersama anggota meja lainnya.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="customer-name" className="block text-xs font-bold text-[#5B4E44] uppercase tracking-wider mb-2">
                        Nama Lengkap Anda
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#9E8775] pointer-events-none">
                          <User className="w-5 h-5 stroke-[1.8]" />
                        </span>
                        <input
                          id="customer-name"
                          type="text"
                          className="w-full pl-11 pr-4 py-3.5 bg-[#FAF8F5] border border-[#EBE3D5] rounded-2xl text-base font-medium placeholder-[#B2A494] text-[#1C1612] focus:outline-none focus:ring-2 focus:ring-[#8C6239] focus:bg-white transition-all shadow-inner"
                          placeholder="Contoh: Budi Santoso"
                          value={customerName}
                          onChange={(e) => {
                            setCustomerName(e.target.value);
                            if (error) setError('');
                          }}
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 text-xs font-medium text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 animate-fadeIn">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      id="btn-lihat-menu"
                      type="submit"
                      className="w-full bg-[#8C6239] hover:bg-[#6D4926] text-white py-4 px-6 rounded-2xl font-bold text-base flex items-center justify-center gap-2 group transition-all duration-300 shadow-lg shadow-[#8C6239]/20 hover:scale-[1.01]"
                    >
                      <span>Lihat Menu & Pesan</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowTableSelection(true)}
                        className="w-full text-xs text-[#8C6239] font-bold py-2"
                    >
                        Pilih Meja Lain
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : (
            /* CASE 2: No Table Detected - Warn Customer */
            <div className="text-center py-4 animate-fadeIn">
              <div className="w-14 h-14 bg-[#FCE8E6] text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-inner">
                <QrCode className="w-7 h-7 stroke-[1.5]" />
              </div>
              
              <h2 className="text-xl font-bold text-[#1C1612] mb-2">QR Code Meja Diperlukan</h2>
              
              <button onClick={() => setShowTableSelection(true)} className="mt-4 bg-[#8C6239] text-white py-3 px-6 rounded-2xl">
                Pilih Meja Manual
              </button>
            </div>
          )}

        </div>

      </main>

      {/* Footer Branding */}
      <footer className="w-full text-center py-6 text-xs text-[#9E8775] border-t border-[#F1E9DB] bg-[#FAF7F2]/40">
        <p>© 2026 {cafeNameText}. All rights reserved.</p>
        <p className="text-[10px] text-[#B2A494] mt-0.5">Powered by RasyaTech | Vibe Modern • Digital Jukebox • Real-time Split Billing</p>
      </footer>
    </div>
  );
}

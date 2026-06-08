import { useState, useEffect } from 'react';
import Home from './pages/Home';
import Menu from './pages/Menu';
import Checkout from './pages/Checkout';
import Admin from './pages/Admin';
import { CartItem } from './types';

const normalizeCollectiveCart = (items: CartItem[]) => {
  const grouped = new Map<string, CartItem>();

  items.forEach((item) => {
    const existing = grouped.get(item.menuItemId);
    if (existing) {
      grouped.set(item.menuItemId, {
        ...existing,
        quantity: existing.quantity + item.quantity
      });
    } else {
      grouped.set(item.menuItemId, {
        ...item,
        user: 'Meja'
      });
    }
  });

  return Array.from(grouped.values());
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<string>(() => {
    const path = window.location.pathname.toLowerCase().replace(/^\/|\/$/g, '');
    const params = new URLSearchParams(window.location.search);
    const hasTable = params.get('table');
    
    if (path === 'admin') return 'admin';
    if (path === 'checkout') return 'checkout';
    if (path === 'menu' || hasTable) return 'menu';
    
    // Redirect customer on '/' if active table session exists
    const hasSessionName = sessionStorage.getItem('scanbite_customer_name');
    const hasSessionTable = sessionStorage.getItem('scanbite_table');
    if (hasSessionName && hasSessionTable) {
      return 'menu';
    }

    return 'home';
  });

  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname.toLowerCase().replace(/^\/|\/$/g, '');
    const params = new URLSearchParams(window.location.search);
    const hasTable = params.get('table');
    
    if (path === 'admin') return 'admin';
    if (path === 'checkout') return 'checkout';
    if (path === 'menu' || hasTable) return 'menu';
    
    const hasSessionName = sessionStorage.getItem('scanbite_customer_name');
    const hasSessionTable = sessionStorage.getItem('scanbite_table');
    if (hasSessionName && hasSessionTable) {
      return 'menu';
    }

    return 'root';
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    const savedCart = localStorage.getItem('scanbite_cart');
    if (savedCart) {
      try {
        return normalizeCollectiveCart(JSON.parse(savedCart));
      } catch (_) {}
    }
    return [];
  });

  useEffect(() => {
    const normalizedCart = normalizeCollectiveCart(cart);
    if (JSON.stringify(normalizedCart) !== JSON.stringify(cart)) {
      setCart(normalizedCart);
      return;
    }
    localStorage.setItem('scanbite_cart', JSON.stringify(normalizedCart));
  }, [cart]);

  // Simple clean router switcher with active pushState updating
  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    const targetPath = page === 'home' ? '/' : `/${page}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
    const route = page === 'home' ? 'root' : page;
    setCurrentRoute(route);

    // Save states to localStorage for sandbox iframe refresh survival
    localStorage.setItem('scanbite_current_page', page);
    localStorage.setItem('scanbite_current_route', route);

    // Scroll to top cleanly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep track of url page changes
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase().replace(/^\/|\/$/g, '');
      const params = new URLSearchParams(window.location.search);
      const hasTable = params.get('table');
      let targetPage = 'home';
      let targetRoute = 'root';

      if (path === 'checkout') {
        targetRoute = 'checkout';
        targetPage = 'checkout';
      } else if (path === 'menu' || hasTable) {
        targetRoute = 'menu';
        targetPage = 'menu';
      } else if (path === 'admin') {
        targetRoute = 'admin';
        targetPage = 'admin';
      }

      setCurrentRoute(targetRoute);
      setCurrentPage(targetPage);
      localStorage.setItem('scanbite_current_page', targetPage);
      localStorage.setItem('scanbite_current_route', targetRoute);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle auto url replacement on root route for active session
  useEffect(() => {
    if (currentPage === 'menu' && (window.location.pathname === '/' || window.location.pathname === '')) {
      const activeTable = sessionStorage.getItem('scanbite_table') || '05';
      window.history.replaceState(null, '', `/menu?tenant=scanbite_live&table=${activeTable}`);
      setCurrentRoute('menu');
      localStorage.setItem('scanbite_current_page', 'menu');
      localStorage.setItem('scanbite_current_route', 'menu');
    }
  }, [currentPage]);

  // Render Full Screen Dedicated View for /admin
  if (currentRoute === 'admin') {
    return (
      <div className="min-h-screen w-full bg-[#FAFBF7] text-[#2C2520] selection:bg-[#8C6239]/40 font-sans antialiased overflow-y-auto">
        <Admin onNavigate={handleNavigate} />
      </div>
    );
  }

  // Render Full Screen Dedicated View for /checkout
  if (currentRoute === 'checkout') {
    return (
      <div className="min-h-screen w-full bg-[#FAF7F2] text-[#2C2520] selection:bg-[#8C6239]/40 font-sans antialiased overflow-y-auto animate-fadeIn">
        <div className="max-w-4xl mx-auto p-4 sm:p-8">
          <Checkout 
            onNavigate={handleNavigate} 
            cart={cart} 
            setCart={setCart} 
          />
        </div>
      </div>
    );
  }

  // Render Full Screen Dedicated View for /menu
  if (currentRoute === 'menu') {
    return (
      <div className="min-h-screen w-full bg-[#FAF7F2] text-[#2C2520] selection:bg-[#8C6239]/40 font-sans antialiased overflow-y-auto animate-fadeIn">
        <div className="max-w-md mx-auto min-h-screen bg-[#FDFBF9] shadow-md relative pb-8">
          <div className="py-3.5 px-5 flex justify-between items-center text-[8.5px] font-extrabold text-[#735A4D] bg-[#FDFBF9] shrink-0 z-40 select-none border-b border-[#FAF4EC]">
            <span>09:41 AM</span>
            <div className="flex items-center gap-1">
              <span>📶 5G</span>
              <span>🔋 100%</span>
            </div>
          </div>
          <Menu 
            onNavigate={handleNavigate} 
            cart={cart} 
            setCart={setCart} 
          />
        </div>
      </div>
    );
  }

  // Render Clean Customer Entry / Home form as default landing / root view
  return (
    <div className="min-h-screen w-full bg-[#FAF7F2] text-[#2C2520] selection:bg-[#8C6239]/40 font-sans antialiased overflow-y-auto animate-fadeIn">
      <div className="max-w-md mx-auto min-h-screen bg-[#FDFBF9] shadow-md relative pb-8">
        <div className="py-3.5 px-5 flex justify-between items-center text-[8.5px] font-extrabold text-[#735A4D] bg-[#FDFBF9] shrink-0 z-40 select-none border-b border-[#FAF4EC]">
          <span>09:41 AM</span>
          <div className="flex items-center gap-1">
            <span>📶 5G</span>
            <span>🔋 100%</span>
          </div>
        </div>
        <Home onNavigate={handleNavigate} />
      </div>
    </div>
  );
}

// Force re-sync commit Rasayatech Cloud v1.0.1

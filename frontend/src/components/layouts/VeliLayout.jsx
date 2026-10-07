import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Home, BookOpen, CreditCard, LogOut, Menu, X } from 'lucide-react';

const VeliLayout = ({ children }) => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/veli', label: 'Ana Sayfa', icon: Home },
    { path: '/veli/lessons', label: 'Dersler', icon: BookOpen },
    { path: '/veli/payments', label: 'Ödemeler', icon: CreditCard },
  ];

  const isActive = (path) => path === '/veli'
    ? location.pathname === '/veli'
    : location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50">
      <header className="bg-white/90 backdrop-blur-md border-b border-indigo-100 sticky top-0 z-30">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">
            <h1 className="text-lg lg:text-2xl font-bold text-indigo-600" data-testid="veli-logo">Veli Paneli</h1>

            <nav className="hidden md:flex items-center gap-1 lg:gap-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    data-testid={`veli-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    className={`flex items-center gap-2 px-3 lg:px-4 py-2 rounded-full transition-all text-sm lg:text-base ${
                      isActive(item.path)
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                data-testid="veli-logout-btn"
                className="flex items-center gap-2 px-3 lg:px-4 py-2 text-red-600 hover:bg-red-50 rounded-full transition-colors ml-2 lg:ml-4"
              >
                <LogOut size={18} />
                <span className="font-medium">Çıkış</span>
              </button>
            </nav>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 -mr-2 rounded-lg hover:bg-slate-100 active:bg-slate-200"
              data-testid="veli-mobile-menu-btn"
              aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-indigo-100 bg-white">
            <nav className="container mx-auto px-4 py-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-lg my-1 transition-colors ${
                      isActive(item.path)
                        ? 'bg-indigo-50 text-indigo-600 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3.5 mt-2 text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg border-t border-slate-100"
              >
                <LogOut size={20} />
                <span className="font-medium">Çıkış Yap</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 lg:px-6 py-6 lg:py-10">
        {children}
      </main>
    </div>
  );
};

export default VeliLayout;

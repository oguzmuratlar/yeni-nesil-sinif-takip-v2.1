import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/axios';
import { Users, Wallet, LogOut, Home, Tent, Youtube, Menu, X, Calendar, Megaphone } from 'lucide-react';

const TeacherLayout = ({ children }) => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sponsorEnabled, setSponsorEnabled] = useState(false);

  // Sayfa değiştiğinde menüyü kapat
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    apiClient.get('/system-settings/sponsor-status').then(r => setSponsorEnabled(r.data.enabled)).catch(() => {});
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/teacher/dashboard', label: 'Ana Sayfa', icon: Home },
    { path: '/teacher/students', label: 'Öğrencilerim', icon: Users },
    { path: '/teacher/camps', label: 'Kamplarım', icon: Tent },
    { path: '/teacher/youtube', label: 'YouTube', icon: Youtube },
    ...(sponsorEnabled ? [{ path: '/teacher/sponsor', label: 'Sponsor', icon: Megaphone }] : []),
    { path: '/teacher/balance', label: 'Bakiye', icon: Wallet },
  ];

  return (
    <div className="min-h-screen teacher-bg">
      {/* Top Navigation */}
      <header className="bg-white/90 backdrop-blur-md border-b border-stone-100 sticky top-0 z-30">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">
            {/* Logo */}
            <h1 className="text-lg lg:text-2xl font-bold text-teal-600" data-testid="teacher-logo">Eğitim Portalı</h1>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    data-testid={`teacher-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    className={`flex items-center gap-2 px-3 lg:px-4 py-2 rounded-full transition-all text-sm lg:text-base ${
                      isActive
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
              
              <button
                onClick={handleLogout}
                data-testid="teacher-logout-btn"
                className="flex items-center gap-2 px-3 lg:px-4 py-2 text-red-600 hover:bg-red-50 rounded-full transition-colors ml-2 lg:ml-4"
              >
                <LogOut size={18} />
                <span className="font-medium">Çıkış</span>
              </button>
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 -mr-2 rounded-lg hover:bg-stone-100 active:bg-stone-200"
              data-testid="teacher-mobile-menu-btn"
              aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-stone-100 bg-white">
            <nav className="container mx-auto px-4 py-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-lg my-1 transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-600 font-semibold'
                        : 'text-stone-600 hover:bg-stone-50 active:bg-stone-100'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3.5 mt-2 text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg border-t border-stone-100"
              >
                <LogOut size={20} />
                <span className="font-medium">Çıkış Yap</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 lg:px-6 py-6 lg:py-12">
        {children}
      </main>
    </div>
  );
};

export default TeacherLayout;

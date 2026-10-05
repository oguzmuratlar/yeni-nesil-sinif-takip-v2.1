import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Users, 
  GraduationCap, 
  CreditCard, 
  Calendar, 
  LogOut,
  LayoutDashboard,
  Landmark,
  BookOpen,
  UsersRound,
  Tent,
  Youtube,
  Menu,
  X,
  Wallet,
  Trophy,
  Clock,
  ChevronDown,
  ChevronRight,
  GraduationCap as LessonsIcon,
  Calculator,
  Library,
  Settings,
  Link2,
  BarChart3,
  Star
} from 'lucide-react';

const AdminLayout = ({ children }) => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ynsEnabled, setYnsEnabled] = useState(false);

  useEffect(() => {
    import('../../api/axios').then(({ default: api }) => {
      api.get('/system-settings/yns-league-status').then(r => setYnsEnabled(r.data.enabled)).catch(() => {});
    });
  }, []);
  
  // Collapsible menu state - localStorage'dan oku
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const saved = localStorage.getItem('adminMenuExpanded');
    return saved ? JSON.parse(saved) : { dersler: true, muhasebe: true };
  });

  // Expand state'i localStorage'a kaydet
  useEffect(() => {
    localStorage.setItem('adminMenuExpanded', JSON.stringify(expandedGroups));
  }, [expandedGroups]);

  // Sayfa değiştiğinde sidebar'ı kapat (mobilde)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Escape tuşu ile kapat
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  // Menü yapısı - gruplu
  const menuStructure = {
    standalone: [
      { path: '/admin/dashboard', label: 'Ana Sayfa', icon: LayoutDashboard },
    ],
    groups: [
      {
        key: 'dersler',
        label: 'Dersler',
        icon: LessonsIcon,
        items: [
          { path: '/admin/students', label: 'Öğrenciler', icon: Users },
          { path: '/admin/teachers', label: 'Öğretmenler', icon: GraduationCap },
          { path: '/admin/lesson-links', label: 'Ders Linkleri', icon: Link2 },
          { path: '/admin/calendar', label: 'Takvim', icon: Calendar },
          { path: '/admin/groups', label: 'Gruplar', icon: UsersRound },
          { path: '/admin/camps', label: 'Kamplar', icon: Tent },
          { path: '/admin/youtube', label: 'YouTube', icon: Youtube },
          { path: '/admin/branches', label: 'Branşlar', icon: BookOpen },
        ]
      },
      {
        key: 'muhasebe',
        label: 'Muhasebe',
        icon: Calculator,
        items: [
          { path: '/admin/cashboxes', label: 'Kasalar', icon: Wallet },
          { path: '/admin/payments', label: 'Ödemeler', icon: CreditCard },
          { path: '/admin/bank-accounts', label: 'Banka Hesapları', icon: Landmark },
          { path: '/admin/monthly-program', label: 'Aylık Program', icon: Calendar },
          { path: '/admin/financial-report', label: 'Finansal Rapor', icon: BarChart3 },
        ]
      }
    ],
    bottom: [
      { path: '/admin/settings', label: 'Yeni Geliştirmeler', icon: Settings },
      { path: '/admin/homework-content', label: 'İçerik Yönetimi', icon: Library },
      { path: '/admin/badges', label: 'Rozetler', icon: Trophy },
      ...(ynsEnabled ? [{ path: '/admin/yns-league', label: 'YNS League', icon: Star }] : []),
      { path: '/admin/audit-logs', label: 'Günlük Değişiklikler', icon: Clock },
    ]
  };

  // Aktif sayfa kontrolü
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  
  // Grup içinde aktif sayfa var mı?
  const hasActiveInGroup = (items) => items.some(item => isActive(item.path));

  return (
    <div className="min-h-screen admin-bg">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-4">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
          data-testid="mobile-menu-btn"
          aria-label="Menüyü aç"
        >
          <Menu size={24} className="text-slate-700" />
        </button>
        <h1 className="text-lg font-bold text-blue-600">Eğitim Yönetim</h1>
        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-full w-72 lg:w-64 bg-white border-r border-slate-200 shadow-lg lg:shadow-sm z-50
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="p-4 lg:p-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-extrabold text-blue-600" data-testid="admin-logo">Eğitim Yönetim</h1>
            <p className="text-xs lg:text-sm text-slate-500 mt-1">Admin Paneli</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 -mr-2 rounded-lg hover:bg-slate-100 active:bg-slate-200"
            aria-label="Menüyü kapat"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        
        {/* Navigation */}
        <nav className="mt-2 lg:mt-4 overflow-y-auto max-h-[calc(100vh-180px)] pb-4">
          {/* Standalone items (Ana Sayfa) */}
          {menuStructure.standalone.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`admin-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`flex items-center gap-3 px-4 lg:px-6 py-3 transition-colors ${
                  isActive(item.path)
                    ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
                }`}
              >
                <Icon size={20} />
                <span className="text-sm lg:text-base">{item.label}</span>
              </Link>
            );
          })}

          {/* Grouped items */}
          {menuStructure.groups.map((group) => {
            const GroupIcon = group.icon;
            const isExpanded = expandedGroups[group.key];
            const hasActive = hasActiveInGroup(group.items);
            
            return (
              <div key={group.key} className="mt-1">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  data-testid={`admin-menu-group-${group.key}`}
                  className={`flex items-center justify-between w-full px-4 lg:px-6 py-3 transition-colors ${
                    hasActive && !isExpanded
                      ? 'bg-blue-50/50 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <GroupIcon size={20} />
                    <span className="text-sm lg:text-base font-medium">{group.label}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={18} className="text-slate-400" />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400" />
                  )}
                </button>
                
                {/* Group Items */}
                <div className={`overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        data-testid={`admin-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                        className={`flex items-center gap-3 pl-8 lg:pl-12 pr-4 lg:pr-6 py-2.5 transition-colors ${
                          isActive(item.path)
                            ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600 font-semibold'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:bg-slate-100'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="text-sm">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Divider */}
          <div className="my-3 mx-4 lg:mx-6 border-t border-slate-100" />

          {/* Bottom standalone items */}
          {menuStructure.bottom.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`admin-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`flex items-center gap-3 px-4 lg:px-6 py-3 transition-colors ${
                  isActive(item.path)
                    ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
                }`}
              >
                <Icon size={20} />
                <span className="text-sm lg:text-base">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 lg:p-6 bg-white border-t border-slate-100">
          <button
            onClick={handleLogout}
            data-testid="admin-logout-btn"
            className="flex items-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

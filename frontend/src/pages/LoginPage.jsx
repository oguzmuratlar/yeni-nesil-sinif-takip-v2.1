import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    
    if (result.success) {
      if (result.user_type === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/teacher/dashboard');
      }
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Form Side - Full width on mobile */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-8 bg-white min-h-screen lg:min-h-0">
        <div className="w-full max-w-md">
          {/* Logo/Brand for mobile */}
          <div className="lg:hidden text-center mb-8">
            <img 
              src="https://customer-assets.emergentagent.com/job_quirky-ride-4/artifacts/rtr89e48_WhatsApp%20Image%202026-03-28%20at%2020.34.56.jpeg"
              alt="Yeni Nesil Sınıf"
              className="w-16 h-16 mx-auto mb-4 rounded-2xl object-contain"
            />
          </div>

          <div className="mb-6 lg:mb-8">
            <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-800 mb-2" data-testid="login-title">
              Hoş Geldiniz
            </h1>
            <p className="text-slate-600 text-sm lg:text-base">
              Eğitim yönetim sisteminize giriş yapın
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 lg:space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg" data-testid="login-error">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">Kullanıcı Adı</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Kullanıcı adınızı girin"
                required
                data-testid="login-username-input"
                className="h-12 text-base"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Şifre</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifrenizi girin"
                  required
                  data-testid="login-password-input"
                  className="h-12 text-base pr-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  data-testid="toggle-password-visibility"
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-btn"
              className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
            >
              {loading ? (
                <span>Yükleniyor...</span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <LogIn size={20} />
                  Giriş Yap
                </span>
              )}
            </Button>
          </form>

        </div>
      </div>

      {/* Image Side - Hidden on mobile */}
      <div 
        className="hidden lg:flex flex-1 bg-cover bg-center relative"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1767102060241-130cb9260718?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwxfHxzdHVkZW50JTIwc3R1ZHlpbmclMjBtb2Rlcm4lMjBsaWJyYXJ5fGVufDB8fHx8MTc3NDI4ODg0Nnww&ixlib=rb-4.1.0&q=85)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 to-indigo-900/80 flex items-center justify-center">
          <div className="text-center text-white p-12">
            <h2 className="text-5xl font-extrabold mb-4">Yeni Nesil Sınıf</h2>
            <p className="text-xl font-light">
              Eğitimin Yeni Nesil Standardı
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

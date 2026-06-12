import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { useNavigate } from 'react-router';
import { Store, Lock, User, AlertCircle, Eye, EyeOff, Coffee, Info } from 'lucide-react';
import { InteractiveMeshBackground } from './ui/interactive-mesh-background';


export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasActiveBreak, setHasActiveBreak] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  // Track mouse coordinates for interactive parallax animations
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) - 0.5;
      const y = (e.clientY / window.innerHeight) - 0.5;
      setMousePosition({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Check for active breaks on mount
  useEffect(() => {
    const breaks = JSON.parse(localStorage.getItem('breakRecords') || '[]');
    const activeBreak = breaks.find((b: any) => !b.endTime);
    setHasActiveBreak(!!activeBreak);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username || !password) {
      setError('Please enter both username and password');
      setIsLoading(false);
      return;
    }

    const result = await login(username, password, rememberDevice);

    if (result.success) {
      // Synchronously request fullscreen mode for all cashiers (except developer)
      if (username !== 'developer') {
        try {
          const el = document.documentElement;
          if (el.requestFullscreen) {
            await el.requestFullscreen();
          } else if ((el as any).webkitRequestFullscreen) {
            await (el as any).webkitRequestFullscreen();
          } else if ((el as any).msRequestFullscreen) {
            await (el as any).msRequestFullscreen();
          }
        } catch (fsErr) {
          console.warn('[Kiosk Immersive Fullscreen Request Failed]', fsErr);
        }
      }
      navigate('/');
    } else {
      setError(result.error ?? 'Invalid username or password');
      setPassword('');
    }

    setIsLoading(false);
  };

  return (
    <div className={`relative min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-955 text-white' : 'bg-gray-55 text-gray-900'} px-4 overflow-hidden`}>
      {/* 🔮 Interactive High-Performance Mesh Background Constellation & Parallax Blobs */}
      <InteractiveMeshBackground />


      {/* 💳 Floating glassmorphic card container */}
      <div 
        className={`relative w-full max-w-md ${
          darkMode 
            ? 'bg-gray-900/75 border-gray-800/80 text-white shadow-indigo-950/20' 
            : 'bg-white/75 border-white/60 text-gray-850 shadow-gray-200/50'
        } border backdrop-blur-xl rounded-2xl shadow-2xl p-8 z-10 transition-all duration-[1000ms] cubic-bezier(0.16, 1, 0.3, 1) ${
          mounted ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-12'
        }`}
        style={{
          transform: `perspective(1000px) rotateY(${mousePosition.x * 6}deg) rotateX(${mousePosition.y * -6}deg)`
        }}
      >
        {/* Logo/Header */}
        <div className={`text-center mb-8 transition-all duration-700 delay-100 transform ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}>
          <div className={`inline-flex items-center justify-center w-16 h-16 ${darkMode ? 'bg-blue-900/30' : 'bg-blue-100'} rounded-full mb-4 hover:rotate-12 transition-transform duration-300`}>
            <Store size={32} className="text-blue-500 animate-pulse" />
          </div>
          <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>
            NexusFlow
          </h1>
          <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Sign in to your account
          </p>
        </div>

        {/* Break Info Message */}
        {hasActiveBreak && (
          <div className={`mb-6 p-4 ${darkMode ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-200'} border rounded-lg flex items-start gap-3 transition-all duration-500 transform ${
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}>
            <Coffee className="text-orange-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className={`text-sm font-medium ${darkMode ? 'text-orange-400' : 'text-orange-700'} mb-1`}>
                Returning from Break
              </p>
              <p className={`text-xs ${darkMode ? 'text-orange-400/80' : 'text-orange-600'}`}>
                Log in to resume work and end your break.
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className={`mb-6 p-4 ${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'} border rounded-lg flex items-center gap-3 transition-all duration-500 transform ${
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}>
            <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
            <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-700'}`}>{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username Field */}
          <div className={`transition-all duration-700 delay-200 transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
              Username or Email
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={20} className={`${darkMode ? 'text-gray-500' : 'text-gray-400'} group-focus-within:text-blue-500 transition-colors`} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border ${
                  darkMode
                    ? 'bg-gray-800/80 border-gray-700 text-white placeholder-gray-400 focus:bg-gray-800 focus:border-blue-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-blue-500'
                } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-300`}
                placeholder="Enter your username"
                autoComplete="username"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Password Field */}
          <div className={`transition-all duration-700 delay-300 transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
              Password
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={20} className={`${darkMode ? 'text-gray-500' : 'text-gray-400'} group-focus-within:text-blue-500 transition-colors`} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full pl-10 pr-12 py-3 border ${
                  darkMode
                    ? 'bg-gray-800/80 border-gray-700 text-white placeholder-gray-400 focus:bg-gray-800 focus:border-blue-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-blue-500'
                } rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-300`}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center hover:scale-105 active:scale-95 transition-transform"
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff size={20} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                ) : (
                  <Eye size={20} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                )}
              </button>
            </div>
          </div>

          {/* Remember Device */}
          <div className={`flex items-center transition-all duration-700 delay-[350ms] transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <input
              type="checkbox"
              id="remember"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500/30 transition-shadow"
              disabled={isLoading}
            />
            <label htmlFor="remember" className={`ml-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'} hover:cursor-pointer select-none`}>
              Remember this device
            </label>
          </div>

          {/* Login Button */}
          <div className={`transition-all duration-700 delay-400 transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                darkMode ? 'focus:ring-offset-gray-900' : 'focus:ring-offset-white'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className={`mt-8 text-center transition-all duration-700 delay-500 transform ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}>
          <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            © 2026 NexusFlow System. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
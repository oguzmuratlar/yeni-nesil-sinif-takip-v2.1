import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Target, X, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';

const MONTH_NAMES = {
  '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
  '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
  '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
};

const Confetti = () => {
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 8 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti"
          style={{
            left: `${piece.left}%`,
            top: '-20px',
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            transform: `rotate(${piece.rotation}deg)`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );
};

const PlanningMasterCelebration = ({ isOpen, onClose, data }) => {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen || !data) return null;

  const monthName = data.month ? MONTH_NAMES[data.month.split('-')[1]] : '';

  return (
    <>
      {showConfetti && <Confetti />}
      
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 rounded-3xl shadow-2xl max-w-md w-full p-8 relative overflow-hidden animate-in zoom-in-95 duration-500">
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <div className="absolute top-4 left-4 text-amber-500">
              <Sparkles size={40} />
            </div>
            <div className="absolute top-8 right-8 text-orange-500">
              <Sparkles size={30} />
            </div>
            <div className="absolute bottom-12 left-8 text-yellow-500">
              <Sparkles size={25} />
            </div>
            <div className="absolute bottom-4 right-4 text-amber-500">
              <Sparkles size={35} />
            </div>
          </div>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10"
          >
            <X size={24} />
          </button>
          
          {/* Content */}
          <div className="relative z-10 text-center">
            {/* Title */}
            <h2 className="text-2xl font-extrabold text-amber-600 mb-6">
              Planlama Ustası
            </h2>
            
            {/* Trophy Animation */}
            <div className="relative mx-auto w-32 h-32 mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full animate-pulse opacity-30"></div>
              <div className="absolute inset-2 bg-gradient-to-br from-amber-300 to-orange-400 rounded-full animate-pulse opacity-50" style={{ animationDelay: '0.2s' }}></div>
              <div className="absolute inset-4 bg-gradient-to-br from-amber-200 to-orange-300 rounded-full flex items-center justify-center">
                <Trophy className="text-amber-600 animate-bounce" size={56} />
              </div>
            </div>
            
            {/* Congratulations */}
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              Tebrikler! 🎉
            </h3>
            <p className="text-slate-600 mb-6">
              <span className="font-semibold text-amber-600">{monthName}</span> ayı planlamanı eksiksiz tamamladın!
            </p>
            
            {/* Badge & Streak Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Mini Badge */}
              <div className="bg-white/80 rounded-xl p-4 border border-amber-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Target className="text-amber-500" size={24} />
                  <span className="text-lg font-bold text-amber-600">+1</span>
                </div>
                <p className="text-sm text-slate-600">Mini Rozet Kazandın!</p>
                <p className="text-xs text-slate-400 mt-1">+10 puan</p>
              </div>
              
              {/* Streak */}
              <div className="bg-white/80 rounded-xl p-4 border border-orange-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Flame className="text-orange-500" size={24} />
                  <span className="text-lg font-bold text-orange-600">{data.current_streak || 1}</span>
                </div>
                <p className="text-sm text-slate-600">Streak!</p>
                <p className="text-xs text-slate-400 mt-1">Arka arkaya ay</p>
              </div>
            </div>
            
            {/* Progress to Big Badge */}
            <div className="bg-white/60 rounded-xl p-4 mb-6 border border-amber-100">
              <p className="text-sm text-slate-600 mb-2">Büyük Rozete Doğru</p>
              <div className="flex items-center justify-center gap-2">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      i < (data.mini_badge_count || 1)
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    <Target size={14} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {data.mini_badge_count || 1}/8 Mini Rozet
              </p>
            </div>
            
            {/* Close Button */}
            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 rounded-xl"
            >
              Harika! 🏆
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default PlanningMasterCelebration;

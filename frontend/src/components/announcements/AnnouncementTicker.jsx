import React from 'react';
import { Megaphone } from 'lucide-react';

// Kayar yazı (ticker). Tıklanınca onClick çağrılır (modal açmak için).
export const AnnouncementTicker = ({ announcements = [], variant = 'light', onClick }) => {
  if (!announcements.length) return null;

  const dark = variant === 'dark';
  // Kesintisiz loop için listeyi iki kez bas (CSS -50% kaydırır)
  const items = [...announcements, ...announcements];
  const duration = Math.max(14, announcements.length * 10);

  return (
    <div
      className={`announcement-marquee-wrap flex items-center gap-2 cursor-pointer select-none ${
        dark
          ? 'bg-indigo-900 text-indigo-50 border-indigo-700'
          : 'bg-indigo-600 text-white'
      }`}
      onClick={onClick}
      role="button"
      data-testid="announcement-ticker"
      title="Duyuruları görüntüle"
    >
      <span className={`flex items-center gap-1.5 px-3 py-2 font-semibold text-xs sm:text-sm shrink-0 ${dark ? 'bg-indigo-800' : 'bg-indigo-700'}`}>
        <Megaphone size={16} />
        <span className="hidden sm:inline">Duyurular</span>
      </span>
      <div className="overflow-hidden flex-1 py-2">
        <div className="announcement-marquee text-sm" style={{ animationDuration: `${duration}s` }}>
          {items.map((a, i) => (
            <span key={`${a.id}-${i}`} className="px-6 inline-flex items-center gap-2">
              <span className="font-semibold">{a.title}</span>
              <span className="opacity-80">— {a.message}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnnouncementTicker;

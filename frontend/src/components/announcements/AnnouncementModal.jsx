import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Megaphone, ChevronLeft } from 'lucide-react';

export const AnnouncementModal = ({ items = [], open, onOpenChange }) => {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (open) {
      setSelected(items.length === 1 ? items[0] : null);
    }
  }, [open, items]);

  const showList = items.length > 1 && !selected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="announcement-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {items.length > 1 && selected && (
              <button
                onClick={() => setSelected(null)}
                className="p-1 -ml-1 rounded hover:bg-slate-100"
                data-testid="announcement-back-btn"
                aria-label="Geri"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <Megaphone size={18} className="text-indigo-600" />
            {showList ? 'Duyurular' : (selected?.title || 'Duyuru')}
          </DialogTitle>
        </DialogHeader>

        {showList ? (
          <div className="space-y-2" data-testid="announcement-list">
            {items.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                data-testid={`announcement-title-${a.id}`}
                className="w-full text-left px-4 py-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition-colors font-medium text-slate-800"
              >
                {a.title}
              </button>
            ))}
          </div>
        ) : (
          <div data-testid="announcement-detail">
            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
              {selected?.message}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AnnouncementModal;

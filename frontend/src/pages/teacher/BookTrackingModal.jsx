import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Check, Download, Loader2, BookMarked } from 'lucide-react';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { printBookTrackingPdf } from './bookTrackingPdf';

const INSTAGRAM = {
  'Matematik': '@yeni.nesil.matematiik',
  'Türkçe': '@yeni.nesil.turkce',
  'Fen Bilimleri': '@yeni.nesil.fen.bilimleri',
  'Fen': '@yeni.nesil.fen.bilimleri',
};

const TEAL = '#1596a3';
const CYAN_BG = '#d4f1f4';
const DARK = '#0f4c54';

// Kitap Takip Listesi matris ekranı (modal) — teal temalı tasarım.
// Satır = kitap, kolon = ortak üniteler. Tek doğruluk kaynağı backend tracking endpoint.
const BookTrackingModal = ({ open, onOpenChange, studentId, branchId, onDataChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(null);

  const fetchTracking = useCallback(async () => {
    if (!studentId || !branchId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/homework/students/${studentId}/book-tracking`, {
        params: { branch_id: branchId },
      });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Kitap takip listesi yüklenemedi');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [studentId, branchId, onOpenChange]);

  useEffect(() => {
    if (open) fetchTracking();
  }, [open, fetchTracking]);

  const handleCellClick = async (book, col) => {
    const cell = book.cells?.[col.key];
    if (!cell || !cell.present) return;
    if (cell.completed) {
      toast.info('Bu ünite zaten tamamlandı');
      return;
    }
    if (!window.confirm(`"${book.name}" kitabında "${col.name}" ünitesinin tüm testleri tamamlandı olarak işaretlensin mi?`)) return;
    const key = `${book.id}:${cell.unit_id}`;
    setCompleting(key);
    try {
      await apiClient.put(`/homework/students/${studentId}/books/${book.id}/units/${cell.unit_id}/complete`);
      toast.success('Ünite tamamlandı olarak işaretlendi');
      await fetchTracking();
      if (onDataChanged) onDataChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'İşlem başarısız');
    } finally {
      setCompleting(null);
    }
  };

  const handlePdf = () => {
    if (!data) return;
    if (!printBookTrackingPdf(data)) toast.error('Pop-up engelleyici aktif olabilir');
  };

  const cols = data?.unit_columns || [];
  const books = data?.books || [];
  const n = cols.length;
  const gridStyle = { display: 'grid', gridTemplateColumns: `200px repeat(${n}, 46px)`, gap: 6, alignItems: 'stretch' };
  const handle = INSTAGRAM[data?.branch?.name] || '@yeni.nesil.egitim';
  const overall = books.length ? Math.round(books.reduce((s, b) => s + (b.progress_percent || 0), 0) / books.length) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] max-h-[94vh] overflow-auto p-0" data-testid="book-tracking-modal">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 sticky top-0 bg-white z-30 border-b border-slate-100">
          <DialogHeader className="space-y-0">
            <DialogTitle className="flex items-center gap-2 text-[#0f4c54]">
              <BookMarked size={18} style={{ color: TEAL }} />
              Kitap Takip Listesi
            </DialogTitle>
          </DialogHeader>
          <Button size="sm" onClick={handlePdf} className="gap-1 text-white" style={{ backgroundColor: TEAL }} data-testid="book-tracking-pdf-btn">
            <Download size={15} /> PDF İndir
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" style={{ color: TEAL }} /></div>
        ) : (
          <div className="p-4">
            <div className="rounded-3xl p-4 sm:p-5" style={{ background: CYAN_BG, minWidth: 'fit-content' }} data-testid="book-tracking-table-wrap">
              {/* Üst bar */}
              <div className="rounded-full grid items-center gap-3 px-5 py-2.5" style={{ background: TEAL, gridTemplateColumns: '1fr auto 1fr' }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-white font-extrabold text-sm tracking-wide">SINIF</span>
                  <span className="bg-white rounded-2xl px-6 py-2 font-extrabold text-sm" style={{ color: DARK }}>
                    {data?.student?.level ? `${data.student.level}.SINIF` : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-3 whitespace-nowrap">
                  <span style={{ fontFamily: "'Pacifico', cursive", color: '#fdf6e3', fontSize: 22 }}>{data?.student?.name}</span>
                  <span className="text-white font-extrabold text-lg sm:text-xl tracking-wide">KİTAP TAKİP LİSTESİ</span>
                </div>
                <div className="justify-self-end w-8 h-8 rounded-full bg-green-500 text-white font-black flex items-center justify-center border-[3px] border-white">
                  <Check size={16} strokeWidth={4} />
                </div>
              </div>

              {books.length === 0 ? (
                <div className="py-16 text-center" style={{ color: DARK }}>Bu branşta atanmış aktif kitap yok.</div>
              ) : (
                <div className="flex gap-3 mt-4 items-start">
                  {/* Sol panel */}
                  <div className="hidden md:flex flex-col items-center shrink-0" style={{ width: 118 }}>
                    <div className="bg-white rounded-xl px-3 py-1 font-black text-2xl tracking-wider" style={{ color: DARK, boxShadow: `inset 0 0 0 2px ${TEAL}` }}>
                      %{overall}
                    </div>
                    <div className="mt-4 font-extrabold text-xs tracking-wide" style={{ color: TEAL, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {handle}
                    </div>
                  </div>

                  {/* Matris */}
                  <div className="overflow-x-auto flex-1 pb-2">
                    <div style={{ minWidth: 'max-content' }}>
                      {/* Ünite başlıkları */}
                      <div style={{ ...gridStyle, marginBottom: 6 }}>
                        <div className="bg-white rounded-xl flex items-center justify-center font-extrabold text-sm" style={{ color: DARK }}>KONU</div>
                        {cols.map((c) => (
                          <div key={c.key} className="bg-white rounded-lg flex items-center justify-center" style={{ height: 118, padding: '6px 2px' }}>
                            <span className="font-bold leading-tight" style={{ color: DARK, fontSize: 9.5, writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'left' }}>{c.name}</span>
                          </div>
                        ))}
                      </div>
                      {/* Numaralar */}
                      <div style={{ ...gridStyle, marginBottom: 8 }}>
                        <div className="bg-white rounded-xl flex items-center justify-center font-extrabold text-xs py-1.5" style={{ color: DARK }}>KİTAP ADI</div>
                        {cols.map((c, i) => (
                          <div key={c.key} className="bg-white rounded-lg flex items-center justify-center font-extrabold text-sm py-1" style={{ color: DARK }}>{i + 1}</div>
                        ))}
                      </div>
                      {/* Kitap satırları */}
                      <div className="flex flex-col gap-2">
                        {books.map((book) => (
                          <div key={book.id} className="rounded-[30px] py-1.5 px-2" style={{ ...gridStyle, background: TEAL }} data-testid={`bt-row-${book.id}`}>
                            <div className="bg-white rounded-2xl flex flex-col justify-center px-3.5 py-1 min-w-0">
                              <span className="font-extrabold text-[13px] truncate" style={{ color: DARK }}>{book.name}</span>
                              <span className="font-extrabold text-[10px]" style={{ color: TEAL }}>%{book.progress_percent}</span>
                            </div>
                            {cols.map((col) => {
                              const cell = book.cells?.[col.key];
                              const present = cell?.present;
                              const completed = cell?.completed;
                              const isBusy = completing === `${book.id}:${cell?.unit_id}`;
                              return (
                                <div key={col.key} className="flex items-center justify-center">
                                  {!present ? (
                                    <span className="w-[26px] h-[26px] rounded-full cursor-not-allowed" style={{ background: 'rgba(255,255,255,.28)' }} title="Bu ünite kitapta yok" data-testid={`bt-cell-absent-${book.id}-${col.key}`} />
                                  ) : (
                                    <button
                                      onClick={() => handleCellClick(book, col)}
                                      disabled={isBusy}
                                      data-testid={`bt-cell-${book.id}-${col.key}`}
                                      title={completed ? 'Tamamlandı' : 'Tamamlandı işaretle'}
                                      className={`inline-flex items-center justify-center w-[26px] h-[26px] rounded-full transition-all hover:scale-110 ${isBusy ? 'opacity-50' : ''}`}
                                      style={completed ? { background: '#22c55e', border: '2px solid #fff', color: '#fff' } : { background: '#fff', border: '2px solid #fff' }}
                                    >
                                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: TEAL }} /> : completed ? <Check className="w-3.5 h-3.5" strokeWidth={4} /> : null}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Açıklama */}
              <div className="flex items-center gap-5 text-xs pt-4" style={{ color: DARK }}>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded-full bg-green-500 border-2 border-white" style={{ boxShadow: '0 0 0 1px #16a34a' }} /> Tamamlandı</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded-full bg-white" style={{ boxShadow: `0 0 0 1px ${TEAL}` }} /> Tamamlanmadı</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded-full" style={{ background: 'rgba(21,150,163,.25)' }} /> Kitapta yok</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookTrackingModal;

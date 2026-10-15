import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Check, Download, Loader2, BookMarked } from 'lucide-react';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { printBookTrackingPdf } from './bookTrackingPdf';

// Kitap Takip Listesi matris ekranı (modal).
// Satır = kitap, kolon = ortak üniteler. Tek doğruluk kaynağı backend tracking endpoint.
const BookTrackingModal = ({ open, onOpenChange, studentId, branchId, onDataChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(null); // `${bookId}:${unitId}`

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
    const ok = printBookTrackingPdf(data);
    if (!ok) toast.error('Pop-up engelleyici aktif olabilir');
  };

  const cols = data?.unit_columns || [];
  const books = data?.books || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col" data-testid="book-tracking-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked size={18} className="text-indigo-600" />
            Kitap Takip Listesi
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3 pb-2">
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <span className="font-bold text-slate-800">{data?.student?.name}</span>
                {data?.student?.level && <span>{data.student.level}. Sınıf</span>}
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{data?.branch?.name}</span>
              </div>
              <Button size="sm" variant="outline" onClick={handlePdf} className="gap-1" data-testid="book-tracking-pdf-btn">
                <Download size={15} /> PDF İndir
              </Button>
            </div>

            {books.length === 0 ? (
              <div className="py-16 text-center text-slate-400">Bu branşta atanmış aktif kitap yok.</div>
            ) : (
              <div className="overflow-auto border border-slate-200 rounded-lg" data-testid="book-tracking-table-wrap">
                <table className="border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-2 text-left border border-slate-200 min-w-[180px]">
                        Kitap
                      </th>
                      {cols.map((c) => (
                        <th key={c.key} className="bg-indigo-50 text-indigo-700 text-[11px] font-bold px-1.5 py-2 border border-slate-200 min-w-[48px] max-w-[72px] align-bottom">
                          <div className="break-words leading-tight">{c.name}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book) => (
                      <tr key={book.id} data-testid={`bt-row-${book.id}`}>
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 border border-slate-200 min-w-[180px]">
                          <div className="font-semibold text-slate-800 text-sm truncate max-w-[200px]">{book.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[80px]">
                              <div className="h-full bg-indigo-500" style={{ width: `${book.progress_percent}%` }} />
                            </div>
                            <span className="text-xs text-indigo-600 font-bold">%{book.progress_percent}</span>
                          </div>
                        </td>
                        {cols.map((col) => {
                          const cell = book.cells?.[col.key];
                          const present = cell?.present;
                          const completed = cell?.completed;
                          const isBusy = completing === `${book.id}:${cell?.unit_id}`;
                          return (
                            <td key={col.key} className="px-1.5 py-2 border border-slate-200 text-center">
                              {!present ? (
                                <span
                                  className="inline-block w-6 h-6 rounded-full bg-slate-200 opacity-60 cursor-not-allowed"
                                  title="Bu ünite kitapta yok"
                                  data-testid={`bt-cell-absent-${book.id}-${col.key}`}
                                />
                              ) : (
                                <button
                                  onClick={() => handleCellClick(book, col)}
                                  disabled={isBusy}
                                  data-testid={`bt-cell-${book.id}-${col.key}`}
                                  title={completed ? 'Tamamlandı' : 'Tamamlandı işaretle'}
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                                    completed
                                      ? 'bg-green-500 border-green-600 text-white'
                                      : 'bg-white border-slate-300 hover:border-indigo-400'
                                  } ${isBusy ? 'opacity-50' : ''}`}
                                >
                                  {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : completed ? <Check className="w-3.5 h-3.5" /> : null}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-5 text-xs text-slate-500 pt-2">
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded-full bg-green-500 border-2 border-green-600" /> Tamamlandı</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded-full bg-white border-2 border-slate-300" /> Tamamlanmadı</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 rounded-full bg-slate-200 opacity-60" /> Kitapta yok</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookTrackingModal;

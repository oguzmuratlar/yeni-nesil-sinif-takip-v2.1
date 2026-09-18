import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Star, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const YnsStarSection = ({ studentId, branchId }) => {
  const [enabled, setEnabled] = useState(null);
  const [open, setOpen] = useState(false);
  const [defs, setDefs] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedDefId, setSelectedDefId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    apiClient.get('/system-settings/yns-league-status').then(r => setEnabled(r.data.enabled)).catch(() => setEnabled(false));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        apiClient.get('/student-point-definitions'),
        apiClient.get('/student-points', { params: { student_id: studentId, branch_id: branchId } }),
      ]);
      setDefs(d.data);
      setRecords(r.data);
    } catch (e) { /* sessiz */ }
  }, [studentId, branchId]);

  useEffect(() => {
    if (enabled) fetchData();
  }, [enabled, fetchData]);

  if (!enabled) return null;

  const selectedDef = defs.find(d => d.id === selectedDefId);
  const isCorrectAnswer = selectedDef?.category === 'Doğru Cevap';
  const previewTotal = selectedDef ? (selectedDef.point * (isCorrectAnswer ? (parseInt(quantity, 10) || 0) : 1)) : 0;

  const submit = async () => {
    if (!selectedDefId) { toast.error('Bir başarı seçin'); return; }
    setSaving(true);
    try {
      await apiClient.post('/teacher/student-points', {
        student_id: studentId,
        branch_id: branchId,
        point_definition_id: selectedDefId,
        quantity: isCorrectAnswer ? (parseInt(quantity, 10) || 1) : 1,
        description,
      });
      toast.success('Yıldız verildi');
      setSelectedDefId(''); setQuantity('1'); setDescription('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Yıldız verilemedi');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/teacher/student-points/${deleteTarget.id}`);
      toast.success('Yıldız kaydı silindi');
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Silinemedi');
    }
  };

  const totalStars = records.reduce((s, r) => s + (r.total_point || 0), 0);

  return (
    <div className="teacher-card p-4 mb-4 border-l-4 border-amber-400" data-testid="yns-star-section">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between" data-testid="yns-star-toggle">
        <div className="flex items-center gap-2">
          <Star size={20} className="text-amber-500 fill-amber-400" />
          <span className="font-semibold text-slate-800">YNS League - Yıldız Ver</span>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Bu branşta {totalStars} ⭐</span>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Başarı</Label>
            <Select value={selectedDefId} onValueChange={setSelectedDefId}>
              <SelectTrigger data-testid="yns-star-def-select"><SelectValue placeholder="Başarı seçin" /></SelectTrigger>
              <SelectContent>
                {defs.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name} (⭐{d.point})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCorrectAnswer && (
            <div>
              <Label className="text-xs text-slate-500">Adet</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="yns-star-quantity" />
            </div>
          )}

          <div>
            <Label className="text-xs text-slate-500">Açıklama (isteğe bağlı)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} data-testid="yns-star-desc" placeholder="Açıklama" />
          </div>

          {selectedDef && (
            <p className="text-sm text-amber-600 font-medium">Verilecek toplam: {previewTotal} ⭐</p>
          )}

          <Button onClick={submit} disabled={saving} data-testid="yns-star-submit" className="w-full bg-amber-500 hover:bg-amber-600">
            <Plus size={16} className="mr-2" /> {saving ? 'Veriliyor...' : 'Yıldız Ver'}
          </Button>

          {/* Records */}
          {records.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-slate-500 mb-2">Bu öğrencinin bu branştaki yıldızları</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {records.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg p-2" data-testid={`yns-record-${r.id}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{r.point_definition_name_snapshot}</p>
                      <p className="text-xs text-slate-400">{r.point_date} · {r.teacher_name}{r.quantity > 1 ? ` · x${r.quantity}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-amber-600">{r.total_point} ⭐</span>
                      {r.can_delete && (
                        <button onClick={() => setDeleteTarget(r)} data-testid={`yns-record-delete-${r.id}`} className="text-red-500 hover:bg-red-50 rounded p-1">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yıldız kaydını sil</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">Bu yıldız kaydını silmek istediğinize emin misiniz?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>İptal</Button>
            <Button variant="destructive" onClick={confirmDelete} data-testid="yns-record-delete-confirm">Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default YnsStarSection;

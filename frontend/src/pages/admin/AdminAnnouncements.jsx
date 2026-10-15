import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Megaphone, Plus, Pencil, Trash2, Loader2, CalendarDays } from 'lucide-react';

const TARGET_OPTIONS = [
  { key: 'individual_students', label: 'Birebir ders alanlar', group: 'Ders Tipi' },
  { key: 'group_students', label: 'Grup dersi alanlar', group: 'Ders Tipi' },
  { key: 'math_students', label: 'Matematik dersi alanlar', group: 'Branş' },
  { key: 'turkish_students', label: 'Türkçe dersi alanlar', group: 'Branş' },
  { key: 'science_students', label: 'Fen Bilimleri dersi alanlar', group: 'Branş' },
  { key: 'grade_5', label: '5. Sınıflar', group: 'Sınıf' },
  { key: 'grade_6', label: '6. Sınıflar', group: 'Sınıf' },
  { key: 'grade_7', label: '7. Sınıflar', group: 'Sınıf' },
  { key: 'grade_8', label: '8. Sınıflar', group: 'Sınıf' },
  { key: 'everyone', label: 'Herkes', group: 'Genel' },
  { key: 'login_only', label: 'Sadece Login sayfası', group: 'Genel' },
];

const LABEL_MAP = Object.fromEntries(TARGET_OPTIONS.map(o => [o.key, o.label]));
const GROUPS = ['Ders Tipi', 'Branş', 'Sınıf', 'Genel'];

const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyForm = { title: '', message: '', start_date: todayStr(), end_date: todayStr(), target_types: [] };

const AdminAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/announcements');
      setAnnouncements(res.data);
    } catch (error) {
      toast.error('Duyurular yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, start_date: todayStr(), end_date: todayStr() });
    setDialogOpen(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({
      title: a.title || '',
      message: a.message || '',
      start_date: a.start_date || todayStr(),
      end_date: a.end_date || todayStr(),
      target_types: a.target_types || [],
    });
    setDialogOpen(true);
  };

  const toggleTarget = (key) => {
    setForm(prev => ({
      ...prev,
      target_types: prev.target_types.includes(key)
        ? prev.target_types.filter(t => t !== key)
        : [...prev.target_types, key],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Başlık zorunludur'); return; }
    if (!form.message.trim()) { toast.error('Duyuru metni zorunludur'); return; }
    if (!form.start_date || !form.end_date) { toast.error('Başlangıç ve bitiş tarihi zorunludur'); return; }
    if (form.end_date < form.start_date) { toast.error('Bitiş tarihi başlangıçtan önce olamaz'); return; }
    if (form.target_types.length === 0) { toast.error('En az bir hedef kitle seçilmelidir'); return; }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        target_types: form.target_types,
      };
      if (editingId) {
        await apiClient.put(`/admin/announcements/${editingId}`, payload);
        toast.success('Duyuru güncellendi');
      } else {
        await apiClient.post('/admin/announcements', payload);
        toast.success('Duyuru oluşturuldu');
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) return;
    try {
      await apiClient.delete(`/admin/announcements/${id}`);
      toast.success('Duyuru silindi');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silinemedi');
    }
  };

  const isActiveNow = (a) => {
    const t = todayStr();
    return (a.start_date || '') <= t && t <= (a.end_date || '');
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-2">
            <Megaphone className="text-indigo-600" /> Duyurular
          </h1>
          <p className="text-slate-600 mt-1">Login ekranı ve veli paneli için duyuruları yönetin.</p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-announcement-btn">
          <Plus size={16} className="mr-1" /> Yeni Duyuru
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-100 shadow-sm">
          <Megaphone size={44} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600">Henüz duyuru yok. İlk duyurunuzu oluşturun.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="announcements-list">
          {announcements.map((a) => (
            <div key={a.id} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm" data-testid={`announcement-row-${a.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-800">{a.title}</h3>
                    {isActiveNow(a)
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">Aktif</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Pasif</span>}
                  </div>
                  <p className="text-slate-600 text-sm mt-1 line-clamp-2">{a.message}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                    <CalendarDays size={14} />
                    <span>{a.start_date} → {a.end_date}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(a.target_types || []).map(t => (
                      <Badge key={t} variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">
                        {LABEL_MAP[t] || t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEdit(a)} data-testid={`edit-announcement-${a.id}`}>
                    <Pencil size={14} className="mr-1" /> Düzenle
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(a.id)} data-testid={`delete-announcement-${a.id}`}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="announcement-dialog">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Duyuru Düzenle' : 'Yeni Duyuru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Başlık *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="announcement-title-input" />
            </div>
            <div className="space-y-2">
              <Label>Duyuru Metni *</Label>
              <Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} data-testid="announcement-message-input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Başlangıç Tarihi *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="announcement-start-input" />
              </div>
              <div className="space-y-2">
                <Label>Bitiş Tarihi *</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="announcement-end-input" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Kimler Görecek * (birden fazla seçilebilir — VEYA mantığı)</Label>
              <div className="border border-slate-200 rounded-lg p-3 space-y-3">
                {GROUPS.map(g => (
                  <div key={g}>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">{g}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {TARGET_OPTIONS.filter(o => o.group === g).map(o => (
                        <label key={o.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer" data-testid={`target-label-${o.key}`}>
                          <Checkbox
                            checked={form.target_types.includes(o.key)}
                            onCheckedChange={() => toggleTarget(o.key)}
                            data-testid={`target-checkbox-${o.key}`}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-announcement-btn">
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminAnnouncements;

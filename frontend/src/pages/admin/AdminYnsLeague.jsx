import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import YnsLeaderboard from '../../components/YnsLeaderboard';
import { Star, Plus, Pencil, Trophy, ListChecks } from 'lucide-react';

const CATEGORIES = ['Ödev', 'Ders Katılımı', 'Doğru Cevap', 'Ders Disiplini', 'Kitap Okuma', 'Deneme Başarısı', 'Okul Başarısı', 'Belge / Dönem Başarısı', 'Özel Başarı'];

const emptyForm = { name: '', description: '', point: '', category: 'Ödev', is_active: true };

const AdminYnsLeague = () => {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'leaderboard' ? 'leaderboard' : 'definitions');
  const [defs, setDefs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, b] = await Promise.all([
          apiClient.get('/admin/student-point-definitions'),
          apiClient.get('/branches'),
        ]);
        setDefs(d.data);
        setBranches(b.data);
      } catch (e) {
        toast.error('Veriler yüklenemedi');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const refreshDefs = async () => {
    const d = await apiClient.get('/admin/student-point-definitions');
    setDefs(d.data);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (def) => {
    setEditing(def);
    setForm({ name: def.name, description: def.description || '', point: String(def.point), category: def.category, is_active: def.is_active });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Başarı adı gerekli'); return; }
    if (form.point === '' || isNaN(Number(form.point))) { toast.error('Geçerli bir yıldız değeri girin'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description, point: Number(form.point), category: form.category, is_active: form.is_active };
      if (editing) {
        await apiClient.put(`/admin/student-point-definitions/${editing.id}`, payload);
        toast.success('Yıldız tanımı güncellendi');
      } else {
        await apiClient.post('/admin/student-point-definitions', payload);
        toast.success('Yıldız tanımı oluşturuldu');
      }
      setDialogOpen(false);
      await refreshDefs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'İşlem başarısız');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (def) => {
    try {
      await apiClient.patch(`/admin/student-point-definitions/${def.id}/status`, { is_active: !def.is_active });
      setDefs(defs.map(d => d.id === def.id ? { ...d, is_active: !def.is_active } : d));
    } catch (e) {
      toast.error('Durum güncellenemedi');
    }
  };

  return (
    <AdminLayout>
      <div>
        <div className="mb-6 flex items-center gap-3">
          <Star size={28} className="text-amber-500 fill-amber-400" />
          <div>
            <h1 className="page-title">YNS League</h1>
            <p className="page-subtitle mt-0.5">Öğrenci yıldız sistemi</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          <button
            onClick={() => setTab('definitions')}
            data-testid="yns-tab-definitions"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === 'definitions' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500'}`}
          >
            <ListChecks size={16} /> Yıldız Tanımları
          </button>
          <button
            onClick={() => setTab('leaderboard')}
            data-testid="yns-tab-leaderboard"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === 'leaderboard' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500'}`}
          >
            <Trophy size={16} /> Liderlik Tablosu
          </button>
        </div>

        {tab === 'definitions' ? (
          <div>
            <div className="flex justify-end mb-4">
              <Button onClick={openNew} data-testid="yns-new-def-btn" className="bg-amber-500 hover:bg-amber-600">
                <Plus size={18} className="mr-2" /> Yeni Yıldız Tanımı
              </Button>
            </div>
            {loading ? (
              <div className="text-center py-10 text-slate-500">Yükleniyor...</div>
            ) : (
              <div className="admin-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Başarı</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700">Kategori</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-700">Yıldız</th>
                      <th className="text-center py-3 px-3 font-semibold text-slate-700">Durum</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-700">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defs.map(def => (
                      <tr key={def.id} className="border-t hover:bg-slate-50" data-testid={`yns-def-row-${def.id}`}>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-800">{def.name}</p>
                          {def.description && <p className="text-xs text-slate-400">{def.description}</p>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{def.category}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-600">{def.point}</td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch checked={def.is_active} onCheckedChange={() => toggleStatus(def)} data-testid={`yns-def-toggle-${def.id}`} />
                            <span className={`text-xs ${def.is_active ? 'text-green-600' : 'text-slate-400'}`}>{def.is_active ? 'Aktif' : 'Pasif'}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(def)} data-testid={`yns-def-edit-${def.id}`}>
                            <Pencil size={16} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="admin-card p-4">
            <YnsLeaderboard branches={branches} defaultBranchId="all" />
          </div>
        )}

        {/* Definition dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Yıldız Tanımını Düzenle' : 'Yeni Yıldız Tanımı'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Başarı Adı</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="yns-form-name" placeholder="Örn: Kitap bitirmek" />
              </div>
              <div>
                <Label>Açıklama</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="yns-form-desc" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Yıldız</Label>
                  <Input type="number" value={form.point} onChange={(e) => setForm({ ...form, point: e.target.value })} data-testid="yns-form-point" />
                </div>
                <div>
                  <Label>Kategori</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger data-testid="yns-form-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} data-testid="yns-form-active" />
                <Label className="cursor-pointer">Aktif</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
              <Button onClick={save} disabled={saving} data-testid="yns-form-save" className="bg-amber-500 hover:bg-amber-600">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminYnsLeague;

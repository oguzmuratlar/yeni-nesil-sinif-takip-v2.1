import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { formatMoney } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Building2, Plus, Pencil, Megaphone, Trash2, Phone, User } from 'lucide-react';

const emptyForm = { name: '', reels_price: '', story_price: '', contacts: [{ name: '', phone: '' }] };
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyShare = { share_name: '', share_type: 'reels', teacher_id: '', amount: '', share_date: todayStr() };

const AdminPublishers = () => {
  const [publishers, setPublishers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [shareDialog, setShareDialog] = useState({ open: false, publisher: null });
  const [share, setShare] = useState(emptyShare);
  const [editingShareId, setEditingShareId] = useState(null);
  const [contentsDialog, setContentsDialog] = useState({ open: false, publisher: null, items: [], loading: false });
  const [submitting, setSubmitting] = useState(false);

  const fmtDate = (d) => d || '-';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pubRes, teachRes] = await Promise.all([
        apiClient.get('/publishers'),
        apiClient.get('/teachers')
      ]);
      setPublishers(pubRes.data);
      setTeachers(teachRes.data);
    } catch (error) {
      toast.error('Yayınevleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, contacts: [{ name: '', phone: '' }] });
    setDialogOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name,
      reels_price: p.reels_price ?? '',
      story_price: p.story_price ?? '',
      contacts: p.contacts && p.contacts.length > 0 ? p.contacts.map(c => ({ name: c.name || '', phone: c.phone || '' })) : [{ name: '', phone: '' }]
    });
    setDialogOpen(true);
  };

  const addContact = () => setForm(prev => ({ ...prev, contacts: [...prev.contacts, { name: '', phone: '' }] }));
  const removeContact = (i) => setForm(prev => ({ ...prev, contacts: prev.contacts.filter((_, idx) => idx !== i) }));
  const updateContact = (i, field, val) => setForm(prev => ({
    ...prev,
    contacts: prev.contacts.map((c, idx) => idx === i ? { ...c, [field]: val } : c)
  }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Yayınevi adı zorunludur'); return; }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        reels_price: form.reels_price === '' ? null : parseFloat(form.reels_price),
        story_price: form.story_price === '' ? null : parseFloat(form.story_price),
        contacts: form.contacts.filter(c => c.name.trim()).map(c => ({ name: c.name.trim(), phone: c.phone?.trim() || null }))
      };
      if (editing) {
        await apiClient.put(`/publishers/${editing.id}`, payload);
        toast.success('Yayınevi güncellendi');
      } else {
        await apiClient.post('/publishers', payload);
        toast.success('Yayınevi oluşturuldu');
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const openShare = (p) => {
    setShareDialog({ open: true, publisher: p });
    setShare({ ...emptyShare, share_date: todayStr() });
    setEditingShareId(null);
  };

  const openContents = async (p) => {
    setContentsDialog({ open: true, publisher: p, items: [], loading: true });
    try {
      const res = await apiClient.get(`/publishers/${p.id}/sponsored-contents`);
      setContentsDialog({ open: true, publisher: p, items: res.data, loading: false });
    } catch (error) {
      toast.error('Paylaşımlar yüklenemedi');
      setContentsDialog({ open: true, publisher: p, items: [], loading: false });
    }
  };

  const refreshContents = async (publisherId) => {
    try {
      const res = await apiClient.get(`/publishers/${publisherId}/sponsored-contents`);
      setContentsDialog(prev => ({ ...prev, items: res.data }));
    } catch (e) { /* ignore */ }
  };

  const editShare = (p, item) => {
    setShareDialog({ open: true, publisher: p });
    setEditingShareId(item.id);
    setShare({
      share_name: item.share_name || '',
      share_type: item.share_type || 'reels',
      teacher_id: item.teacher_id || '',
      amount: item.publisher_amount != null ? String(item.publisher_amount) : '',
      share_date: item.share_date || todayStr()
    });
  };

  const deleteShare = async (publisherId, contentId) => {
    if (!window.confirm('Bu sponsorlu paylaşımı silmek istediğinize emin misiniz?')) return;
    try {
      await apiClient.delete(`/publishers/${publisherId}/sponsored-content/${contentId}`);
      toast.success('Sponsorlu paylaşım silindi');
      await refreshContents(publisherId);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silinemedi');
    }
  };

  const handleSaveShare = async () => {
    if (!share.share_name.trim()) { toast.error('Paylaşım adı zorunludur'); return; }
    if (!share.teacher_id) { toast.error('Paylaşım hocası seçilmelidir'); return; }
    if (!share.share_date) { toast.error('Paylaşım tarihi zorunludur'); return; }
    setSubmitting(true);
    try {
      const payload = {
        share_name: share.share_name.trim(),
        share_type: share.share_type,
        teacher_id: share.teacher_id,
        amount: share.amount === '' ? null : parseFloat(share.amount),
        share_date: share.share_date
      };
      if (editingShareId) {
        await apiClient.put(`/publishers/${shareDialog.publisher.id}/sponsored-content/${editingShareId}`, payload);
        toast.success('Sponsorlu paylaşım güncellendi');
      } else {
        await apiClient.post(`/publishers/${shareDialog.publisher.id}/sponsored-content`, payload);
        toast.success('Sponsorlu paylaşım eklendi');
      }
      const pubId = shareDialog.publisher.id;
      setShareDialog({ open: false, publisher: null });
      setEditingShareId(null);
      if (contentsDialog.open) await refreshContents(pubId);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title" data-testid="publishers-title">Yayınevleri</h1>
          <p className="page-subtitle mt-1">Yayınevlerini, iletişim kişilerini ve sponsorlu paylaşımları yönetin</p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-publisher-btn">
          <Plus size={18} className="mr-1" /> Yeni Yayınevi
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Yükleniyor...</div>
      ) : publishers.length === 0 ? (
        <div className="admin-card p-12 text-center">
          <Building2 size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-600">Henüz yayınevi eklenmemiş</p>
        </div>
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Yayınevi Adı</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">İletişim Kişileri</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Reels Ücreti</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Hikaye Ücreti</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Bakiye</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50" data-testid={`publisher-row-${p.id}`}>
                    <td className="py-3 px-4 font-medium text-slate-800">{p.name}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.contacts && p.contacts.length > 0 ? (
                        <div className="space-y-0.5">
                          {p.contacts.map((c, i) => (
                            <div key={i} className="text-xs">
                              <span className="font-medium">{c.name}</span>
                              {c.phone && <span className="text-slate-400"> · {c.phone}</span>}
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">{p.reels_price != null ? `${formatMoney(p.reels_price, false)} ₺` : '-'}</td>
                    <td className="py-3 px-4 text-right text-slate-700">{p.story_price != null ? `${formatMoney(p.story_price, false)} ₺` : '-'}</td>
                    <td className={`py-3 px-4 text-right font-bold ${p.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`} data-testid={`publisher-balance-${p.id}`}>
                      {formatMoney(p.balance, false)} ₺
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(p)} data-testid={`edit-publisher-${p.id}`}>
                          <Pencil size={14} className="mr-1" /> Düzenle
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openContents(p)} data-testid={`view-shares-${p.id}`}>
                          <Megaphone size={14} className="mr-1" /> Paylaşımlar
                        </Button>
                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => openShare(p)} data-testid={`add-share-${p.id}`}>
                          <Plus size={14} className="mr-1" /> Sponsorlu Paylaşım Ekle
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Yayınevi oluştur/düzenle dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="publisher-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? 'Yayınevi Düzenle' : 'Yeni Yayınevi'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Yayınevi Adı *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="publisher-name-input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reels Ücreti (opsiyonel)</Label>
                <Input type="number" value={form.reels_price} onChange={(e) => setForm({ ...form, reels_price: e.target.value })} data-testid="publisher-reels-input" placeholder="₺" />
              </div>
              <div className="space-y-2">
                <Label>Hikaye Ücreti (opsiyonel)</Label>
                <Input type="number" value={form.story_price} onChange={(e) => setForm({ ...form, story_price: e.target.value })} data-testid="publisher-story-input" placeholder="₺" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>İletişim Kişileri</Label>
                <Button type="button" size="sm" variant="outline" onClick={addContact} data-testid="add-contact-btn">
                  <Plus size={14} className="mr-1" /> Kişi Ekle
                </Button>
              </div>
              {form.contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`contact-row-${i}`}>
                  <div className="relative flex-1">
                    <User size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-7" placeholder="Ad Soyad" value={c.name} onChange={(e) => updateContact(i, 'name', e.target.value)} data-testid={`contact-name-${i}`} />
                  </div>
                  <div className="relative flex-1">
                    <Phone size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-7" placeholder="Telefon" value={c.phone} onChange={(e) => updateContact(i, 'phone', e.target.value)} data-testid={`contact-phone-${i}`} />
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="text-red-500" onClick={() => removeContact(i)} data-testid={`remove-contact-${i}`}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-publisher-btn">
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sponsorlu paylaşım ekle dialog */}
      <Dialog open={shareDialog.open} onOpenChange={(open) => setShareDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md" data-testid="share-dialog">
          <DialogHeader>
            <DialogTitle>{editingShareId ? 'Sponsorlu Paylaşım Düzenle' : 'Sponsorlu Paylaşım Ekle'}{shareDialog.publisher ? ` — ${shareDialog.publisher.name}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Paylaşım Adı *</Label>
              <Input value={share.share_name} onChange={(e) => setShare({ ...share, share_name: e.target.value })} data-testid="share-name-input" />
            </div>
            <div className="space-y-2">
              <Label>Paylaşım Tipi</Label>
              <Select value={share.share_type} onValueChange={(v) => setShare({ ...share, share_type: v })}>
                <SelectTrigger data-testid="share-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reels">Reels</SelectItem>
                  <SelectItem value="story">Hikaye</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Paylaşım Tarihi *</Label>
              <Input type="date" value={share.share_date} onChange={(e) => setShare({ ...share, share_date: e.target.value })} data-testid="share-date-input" />
              <p className="text-xs text-slate-500">Öğretmenin kazancı bu tarihin ait olduğu aya yazılır.</p>
            </div>
            <div className="space-y-2">
              <Label>Paylaşım Hocası *</Label>
              <Select value={share.teacher_id} onValueChange={(v) => setShare({ ...share, teacher_id: v })}>
                <SelectTrigger data-testid="share-teacher-select"><SelectValue placeholder="Öğretmen seçin" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tutar (opsiyonel)</Label>
              <Input type="number" value={share.amount} onChange={(e) => setShare({ ...share, amount: e.target.value })} data-testid="share-amount-input"
                placeholder={shareDialog.publisher ? (share.share_type === 'reels' ? `Varsayılan: ${shareDialog.publisher.reels_price ?? 'tanımsız'}` : `Varsayılan: ${shareDialog.publisher.story_price ?? 'tanımsız'}`) : ''} />
              <p className="text-xs text-slate-500">Boş bırakılırsa yayınevinin ilgili varsayılan ücreti kullanılır.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialog({ open: false, publisher: null })}>İptal</Button>
            <Button onClick={handleSaveShare} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-share-btn">
              {submitting ? 'Ekleniyor...' : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yayınevi sponsorlu paylaşımları listesi (düzenle/sil) */}
      <Dialog open={contentsDialog.open} onOpenChange={(open) => setContentsDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="contents-dialog">
          <DialogHeader>
            <DialogTitle>Sponsorlu Paylaşımlar{contentsDialog.publisher ? ` — ${contentsDialog.publisher.name}` : ''}</DialogTitle>
          </DialogHeader>
          {contentsDialog.loading ? (
            <div className="text-center py-8 text-slate-500">Yükleniyor...</div>
          ) : contentsDialog.items.length === 0 ? (
            <div className="text-center py-8 text-slate-500">Henüz sponsorlu paylaşım yok</div>
          ) : (
            <div className="space-y-2">
              {contentsDialog.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg" data-testid={`content-item-${item.id}`}>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{item.share_name}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(item.share_date)} · {item.share_type === 'reels' ? 'Reels' : 'Hikaye'} · {item.teacher_name}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Yayınevi: <span className="font-semibold text-red-600">{formatMoney(item.publisher_amount, false)} ₺</span>
                      {' · '}Öğretmen: <span className="font-semibold text-emerald-600">{formatMoney(item.teacher_amount, false)} ₺</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => editShare(contentsDialog.publisher, item)} data-testid={`edit-share-${item.id}`}>
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteShare(contentsDialog.publisher.id, item.id)} data-testid={`delete-share-${item.id}`}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setContentsDialog({ open: false, publisher: null, items: [], loading: false })}>Kapat</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => contentsDialog.publisher && openShare(contentsDialog.publisher)} data-testid="contents-add-share-btn">
              <Plus size={14} className="mr-1" /> Yeni Paylaşım
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminPublishers;

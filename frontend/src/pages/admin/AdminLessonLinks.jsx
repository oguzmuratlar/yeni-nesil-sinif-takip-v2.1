import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { Link2, Plus, Edit, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';

const AdminLessonLinks = () => {
  const [links, setLinks] = useState([]);
  const [branches, setBranches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  
  // Form state
  const [form, setForm] = useState({
    branch_id: '',
    teacher_id: '',
    link_name: '',
    link_url: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [linksRes, branchesRes, teachersRes] = await Promise.all([
        apiClient.get('/lesson-links'),
        apiClient.get('/branches'),
        apiClient.get('/teachers')
      ]);
      setLinks(linksRes.data);
      setBranches(branchesRes.data);
      setTeachers(teachersRes.data.filter(t => t.status === 'active'));
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingLink(null);
    setForm({
      branch_id: branches[0]?.id || '',
      teacher_id: teachers[0]?.id || '',
      link_name: '',
      link_url: ''
    });
    setDialogOpen(true);
  };

  const openEditDialog = (link) => {
    setEditingLink(link);
    setForm({
      branch_id: link.branch_id,
      teacher_id: link.teacher_id,
      link_name: link.link_name,
      link_url: link.link_url
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (link) => {
    setDeleteTarget(link);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.branch_id || !form.teacher_id || !form.link_name.trim() || !form.link_url.trim()) {
      toast.error('Tüm alanlar zorunludur');
      return;
    }

    setSaving(true);
    try {
      if (editingLink) {
        await apiClient.put(`/lesson-links/${editingLink.id}`, form);
        toast.success('Ders linki güncellendi');
      } else {
        await apiClient.post('/lesson-links', form);
        toast.success('Ders linki oluşturuldu');
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'İşlem başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      await apiClient.delete(`/lesson-links/${deleteTarget.id}`);
      toast.success('Ders linki silindi');
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silme işlemi başarısız');
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
              <Link2 className="w-8 h-8 text-blue-600" />
              Ders Linkleri
            </h1>
            <p className="text-slate-600 mt-2">
              Öğretmenlere ders başlatma linkleri tanımlayın
            </p>
          </div>
          <Button onClick={openAddDialog} className="gap-2" data-testid="add-lesson-link-btn">
            <Plus className="w-4 h-4" />
            Yeni Link Ekle
          </Button>
        </div>

        {/* Links Table */}
        <div className="admin-card overflow-hidden">
          {links.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Link2 className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p className="text-lg font-medium">Henüz ders linki eklenmemiş</p>
              <p className="text-sm mt-1">Yeni bir link eklemek için yukarıdaki butonu kullanın</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branş</TableHead>
                  <TableHead>Öğretmen Adı</TableHead>
                  <TableHead>Link Adı</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id} data-testid={`lesson-link-row-${link.id}`}>
                    <TableCell className="font-medium">{link.branch_name}</TableCell>
                    <TableCell>{link.teacher_name}</TableCell>
                    <TableCell>{link.link_name}</TableCell>
                    <TableCell>
                      <a 
                        href={link.link_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 max-w-[200px] truncate"
                      >
                        {link.link_url}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(link)}
                          data-testid={`edit-link-${link.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openDeleteDialog(link)}
                          data-testid={`delete-link-${link.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingLink ? 'Ders Linkini Düzenle' : 'Yeni Ders Linki'}
              </DialogTitle>
              <DialogDescription>
                Öğretmene ders başlatma linki tanımlayın.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="branch_id">Branş *</Label>
                <Select 
                  value={form.branch_id} 
                  onValueChange={(v) => setForm({ ...form, branch_id: v })}
                >
                  <SelectTrigger data-testid="branch-select">
                    <SelectValue placeholder="Branş seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher_id">Öğretmen *</Label>
                <Select 
                  value={form.teacher_id} 
                  onValueChange={(v) => setForm({ ...form, teacher_id: v })}
                >
                  <SelectTrigger data-testid="teacher-select">
                    <SelectValue placeholder="Öğretmen seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="link_name">Link Adı *</Label>
                <Input
                  id="link_name"
                  value={form.link_name}
                  onChange={(e) => setForm({ ...form, link_name: e.target.value })}
                  placeholder="Örn: LGS Fen Zoom"
                  data-testid="link-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="link_url">Link URL *</Label>
                <Input
                  id="link_url"
                  value={form.link_url}
                  onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                  placeholder="https://zoom.us/..."
                  data-testid="link-url-input"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                İptal
              </Button>
              <Button onClick={handleSave} disabled={saving} data-testid="save-link-btn">
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {editingLink ? 'Güncelle' : 'Ekle'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ders Linkini Sil</AlertDialogTitle>
              <AlertDialogDescription>
                Bu ders linkini silmek istediğinize emin misiniz?
                <br /><br />
                <strong>&quot;{deleteTarget?.link_name}&quot;</strong> linki silinecek ve öğretmen bu linki artık göremeyecek.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
                data-testid="confirm-delete-btn"
              >
                Sil
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminLessonLinks;

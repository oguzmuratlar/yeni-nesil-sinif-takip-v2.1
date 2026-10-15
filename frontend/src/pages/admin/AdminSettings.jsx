import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { Settings, ToggleLeft, ToggleRight, BookOpen, Loader2, Calendar, ChevronRight, Link2, Database, Download, Upload, AlertTriangle, CheckCircle2, X, Users, Megaphone } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const AdminSettings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  
  // Backup states
  const [backupLoading, setBackupLoading] = useState(false);
  
  // Restore states
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restorePreviewLoading, setRestorePreviewLoading] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [restoreExecuting, setRestoreExecuting] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await apiClient.get('/system-settings');
      setSettings(response.data);
    } catch (error) {
      toast.error('Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key, currentValue, description) => {
    setSaving(key);
    try {
      await apiClient.put(`/system-settings/${key}`, {
        value: !currentValue,
        description
      });
      
      setSettings(settings.map(s => 
        s.key === key ? { ...s, value: !currentValue } : s
      ));
      
      toast.success(`${description || key} ${!currentValue ? 'aktif edildi' : 'pasif edildi'}`);
    } catch (error) {
      toast.error('Ayar güncellenemedi');
    } finally {
      setSaving(null);
    }
  };

  const getSettingIcon = (key) => {
    switch (key) {
      case 'homework_tool_enabled':
        return <BookOpen className="h-5 w-5 text-blue-600" />;
      case 'lesson_links_enabled':
        return <Link2 className="h-5 w-5 text-teal-600" />;
      case 'veli_enabled':
        return <Users className="h-5 w-5 text-indigo-600" />;
      case 'announcements_enabled':
        return <Megaphone className="h-5 w-5 text-indigo-600" />;
      default:
        return <Settings className="h-5 w-5 text-slate-600" />;
    }
  };

  // ===== BACKUP FUNCTIONS =====
  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const response = await apiClient.post('/admin/database/backup', {}, {
        responseType: 'blob'
      });
      
      // Dosya adını header'dan al
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'yeni-nesil-sinif-db-backup.zip';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }
      
      // Dosyayı indir
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Yedek dosyası indirildi');
    } catch (error) {
      console.error('Backup error:', error);
      toast.error('Yedekleme başarısız');
    } finally {
      setBackupLoading(false);
    }
  };

  // ===== RESTORE FUNCTIONS =====
  const handleRestoreFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        toast.error('Sadece ZIP dosyası yükleyebilirsiniz');
        return;
      }
      setRestoreFile(file);
      setRestorePreview(null);
      setConfirmationText('');
      setRestoreResult(null);
    }
  };

  const handleRestorePreview = async () => {
    if (!restoreFile) return;
    
    setRestorePreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      
      const response = await apiClient.post('/admin/database/restore/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setRestorePreview(response.data);
    } catch (error) {
      console.error('Preview error:', error);
      const message = error.response?.data?.detail || 'Dosya analiz edilemedi';
      toast.error(message);
      setRestorePreview({ valid: false, error: message });
    } finally {
      setRestorePreviewLoading(false);
    }
  };

  const handleRestoreExecute = async () => {
    if (confirmationText !== 'VERİ TABANINI GERİ YÜKLE') {
      toast.error('Onay metni doğru değil');
      return;
    }
    
    setRestoreExecuting(true);
    try {
      // ===== ADIM 1: Pre-restore yedeği indir =====
      toast.info('Pre-restore yedeği indiriliyor...');
      
      const preBackupResponse = await apiClient.post('/admin/database/restore/pre-backup', {}, {
        responseType: 'blob'
      });
      
      // Pre-restore dosyasını indir
      const contentDisposition = preBackupResponse.headers['content-disposition'];
      let preBackupFilename = 'pre-restore-auto-backup.zip';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) preBackupFilename = match[1];
      }
      
      const preBackupUrl = window.URL.createObjectURL(new Blob([preBackupResponse.data]));
      const preBackupLink = document.createElement('a');
      preBackupLink.href = preBackupUrl;
      preBackupLink.setAttribute('download', preBackupFilename);
      document.body.appendChild(preBackupLink);
      preBackupLink.click();
      preBackupLink.remove();
      window.URL.revokeObjectURL(preBackupUrl);
      
      toast.success('Pre-restore yedeği indirildi. Restore başlıyor...');
      
      // Kısa bir bekleme - indirme tamamlansın
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // ===== ADIM 2: Restore işlemini başlat =====
      const formData = new FormData();
      formData.append('file', restoreFile);
      
      const response = await apiClient.post('/admin/database/restore/execute', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setRestoreResult(response.data);
      toast.success('Veri tabanı başarıyla geri yüklendi');
    } catch (error) {
      console.error('Restore error:', error);
      const message = error.response?.data?.detail || 'Geri yükleme başarısız';
      toast.error(message);
      setRestoreResult({ success: false, error: message });
    } finally {
      setRestoreExecuting(false);
    }
  };

  const resetRestoreDialog = () => {
    setRestoreDialogOpen(false);
    setRestoreFile(null);
    setRestorePreview(null);
    setConfirmationText('');
    setRestoreResult(null);
  };

  const getSettingDescription = (key) => {
    switch (key) {
      case 'homework_tool_enabled':
        return 'Öğretmenlerin öğrenci panelinde "Ödev Girişi" butonunu görmesini ve ödev planı oluşturmasını kontrol eder.';
      case 'lesson_links_enabled':
        return 'Öğretmenlerin öğrenci panelinde "Dersi Başlat" butonunu görmesini ve ders linklerini kullanarak hızlı ders girişi yapmasını kontrol eder.';
      case 'veli_enabled':
        return 'Veli kullanıcısı oluşturmayı ve veli panelini (ders/bakiye/ödeme görüntüleme) açar. Pasifken veli girişi kapanır ve öğrenci/kullanıcı formlarındaki veli alanları gizlenir.';
      case 'announcements_enabled':
        return 'Admin "Duyurular" sayfasını, login ekranındaki kayan duyuru alanını ve veli panelindeki duyuru/popup gösterimini açar. Pasifken tüm duyurular gizlenir.';
      default:
        return '';
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800">Yeni Geliştirmeler</h1>
          <p className="text-slate-600 mt-2">
            Sistemdeki yeni özellikleri buradan açıp kapatabilirsiniz.
          </p>
        </div>

        {/* Feature Flags */}
        <div className="space-y-4">
          {settings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                Henüz yeni geliştirme bulunmuyor.
              </CardContent>
            </Card>
          ) : (
            settings.map((setting) => (
              <Card key={setting.key} data-testid={`setting-card-${setting.key}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getSettingIcon(setting.key)}
                      <div>
                        <CardTitle className="text-lg">
                          {setting.description || setting.key}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {getSettingDescription(setting.key)}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${setting.value ? 'text-green-600' : 'text-slate-400'}`}>
                        {setting.value ? 'Aktif' : 'Pasif'}
                      </span>
                      
                      {saving === setting.key ? (
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      ) : (
                        <Switch
                          data-testid={`toggle-${setting.key}`}
                          checked={setting.value}
                          onCheckedChange={() => handleToggle(setting.key, setting.value, setting.description)}
                        />
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                {setting.key === 'homework_tool_enabled' && (
                  <CardContent className="pt-0">
                    <div className={`p-3 rounded-lg ${setting.value ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                      {setting.value ? (
                        <p className="text-sm text-green-700">
                          ✓ Ödev Takip Sistemi aktif. Öğretmenler öğrencilere ödev planı oluşturabilir.
                        </p>
                      ) : (
                        <p className="text-sm text-amber-700">
                          ⚠ Ödev Takip Sistemi pasif. Öğretmenler "Ödev Girişi" butonunu görmeyecek.
                        </p>
                      )}
                    </div>
                  </CardContent>
                )}
                
                {setting.key === 'lesson_links_enabled' && (
                  <CardContent className="pt-0">
                    <div className={`p-3 rounded-lg ${setting.value ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                      {setting.value ? (
                        <p className="text-sm text-green-700">
                          ✓ Ders Giriş Özelliği aktif. Öğretmenler "Dersi Başlat" butonunu kullanabilir.
                        </p>
                      ) : (
                        <p className="text-sm text-amber-700">
                          ⚠ Ders Giriş Özelliği pasif. Öğretmenler "Dersi Başlat" butonunu görmeyecek.
                        </p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Info Box */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">Hakkında</p>
                <p className="text-sm text-blue-700 mt-1">
                  Bu sayfada yeni eklenen özellikleri test aşamasında tutabilir veya 
                  canlı ortamda aktif edebilirsiniz. Bir özelliği pasif yaparsanız, 
                  o özelliğe ait butonlar ve sayfalar kullanıcılara gösterilmez.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sene Sonu İşlemleri */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Sene Sonu İşlemleri</h2>
          <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="h-6 w-6 text-orange-600" />
                  <div>
                    <CardTitle className="text-lg text-orange-800">Dönem Geçişi</CardTitle>
                    <CardDescription className="text-orange-700">
                      Mevcut dönemi kapatın ve yeni dönem açın
                    </CardDescription>
                  </div>
                </div>
                <Button 
                  data-testid="year-end-preview-btn"
                  onClick={() => navigate('/admin/year-end-preview')}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  Sene Sonu Preview
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="p-3 rounded-lg bg-white/50 border border-orange-200">
                <p className="text-sm text-orange-800">
                  Sene sonu işleminde:
                </p>
                <ul className="text-sm text-orange-700 mt-2 space-y-1">
                  <li>• Öğrenciler bir üst sınıfa geçer (8. sınıf pasife alınır)</li>
                  <li>• Öğrenci ve öğretmen bakiyeleri yeni döneme devredilir</li>
                  <li>• Gruplar kapatılır (yeni dönemde manuel oluşturulur)</li>
                  <li>• Birebir ders ilişkileri yeni döneme kopyalanır</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Veri Tabanı Yedekleme */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Veri Tabanı İşlemleri</h2>
          
          {/* Yedekleme Kartı */}
          <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="h-6 w-6 text-blue-600" />
                  <div>
                    <CardTitle className="text-lg text-blue-800">Veri Tabanı Yedekleme</CardTitle>
                    <CardDescription className="text-blue-700">
                      Tüm sistem verilerini ZIP dosyası olarak indirin
                    </CardDescription>
                  </div>
                </div>
                <Button 
                  data-testid="backup-btn"
                  onClick={handleBackup}
                  disabled={backupLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {backupLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {backupLoading ? 'Yedekleniyor...' : 'Yedek Al'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="p-3 rounded-lg bg-white/50 border border-blue-200">
                <p className="text-sm text-blue-800">
                  Yedek dosyası içeriği:
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                  <li>• Tüm öğrenci, öğretmen ve kullanıcı bilgileri</li>
                  <li>• Ders kayıtları ve ödemeler</li>
                  <li>• Ödev planları ve takip verileri</li>
                  <li>• Sistem ayarları ve takvim etkinlikleri</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Geri Yükleme Kartı */}
          <Card className="border-red-200 bg-gradient-to-r from-red-50 to-rose-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Upload className="h-6 w-6 text-red-600" />
                  <div>
                    <CardTitle className="text-lg text-red-800">Veri Tabanını Geri Yükle</CardTitle>
                    <CardDescription className="text-red-700">
                      Daha önce alınmış bir yedekten sistemi geri yükleyin
                    </CardDescription>
                  </div>
                </div>
                <Button 
                  data-testid="restore-btn"
                  onClick={() => setRestoreDialogOpen(true)}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Geri Yükle
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="p-3 rounded-lg bg-white/50 border border-red-200">
                <p className="text-sm text-red-800 font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Dikkat - Bu işlem kritiktir:
                </p>
                <ul className="text-sm text-red-700 mt-2 space-y-1">
                  <li>• Mevcut veriler yedekteki verilerle değiştirilir</li>
                  <li>• İşlem öncesi otomatik yedek alınır</li>
                  <li>• Geri alınamaz, dikkatli kullanın</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Restore Dialog */}
        <Dialog open={restoreDialogOpen} onOpenChange={(open) => !open && resetRestoreDialog()}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <Upload className="h-5 w-5" />
                Veri Tabanını Geri Yükle
              </DialogTitle>
              <DialogDescription>
                Daha önce alınmış bir yedek dosyasından sistemi geri yükleyin
              </DialogDescription>
            </DialogHeader>

            {/* Restore Result */}
            {restoreResult && (
              <div className={`p-4 rounded-lg ${restoreResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {restoreResult.success ? (
                  <>
                    <div className="flex items-center gap-2 text-green-800 font-medium">
                      <CheckCircle2 className="h-5 w-5" />
                      Veri tabanı başarıyla geri yüklendi!
                    </div>
                    <p className="text-sm text-green-700 mt-2">
                      {restoreResult.restored_collections?.length} collection geri yüklendi.
                    </p>
                    <p className="text-sm text-amber-700 mt-2 font-medium">
                      ⚠️ {restoreResult.warning}
                    </p>
                    <Button 
                      className="mt-4"
                      onClick={() => window.location.reload()}
                    >
                      Sayfayı Yenile
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-red-800">
                    <X className="h-5 w-5" />
                    Hata: {restoreResult.error}
                  </div>
                )}
              </div>
            )}

            {/* Step 1: File Upload */}
            {!restoreResult && (
              <>
                <div className="space-y-4">
                  <div>
                    <Label>Yedek Dosyası (ZIP)</Label>
                    <Input
                      type="file"
                      accept=".zip"
                      onChange={handleRestoreFileChange}
                      className="mt-2"
                    />
                    {restoreFile && (
                      <p className="text-sm text-slate-600 mt-1">
                        Seçilen: {restoreFile.name} ({(restoreFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    )}
                  </div>

                  {restoreFile && !restorePreview && (
                    <Button 
                      onClick={handleRestorePreview}
                      disabled={restorePreviewLoading}
                      className="w-full"
                    >
                      {restorePreviewLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      {restorePreviewLoading ? 'Analiz ediliyor...' : 'Dosyayı Analiz Et'}
                    </Button>
                  )}
                </div>

                {/* Preview Result */}
                {restorePreview && (
                  <div className="space-y-4 mt-4">
                    {restorePreview.valid ? (
                      <>
                        {/* Metadata */}
                        <div className="bg-slate-50 p-4 rounded-lg">
                          <h4 className="font-medium text-slate-800 mb-2">Yedek Bilgileri</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-slate-500">Tarih:</span> {new Date(restorePreview.backup_metadata?.created_at).toLocaleString('tr-TR')}</div>
                            <div><span className="text-slate-500">Kullanıcı:</span> {restorePreview.backup_metadata?.created_by_username || 'Bilinmiyor'}</div>
                            <div><span className="text-slate-500">Ortam:</span> {restorePreview.backup_metadata?.environment}</div>
                            <div><span className="text-slate-500">Versiyon:</span> {restorePreview.backup_metadata?.backup_version}</div>
                            <div><span className="text-slate-500">Toplam Kayıt:</span> {restorePreview.backup_metadata?.total_records?.toLocaleString()}</div>
                          </div>
                        </div>

                        {/* Warnings */}
                        {restorePreview.warnings?.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                            <p className="text-amber-800 text-sm font-medium">⚠️ Uyarılar:</p>
                            <ul className="text-sm text-amber-700 mt-1">
                              {restorePreview.warnings.map((w, i) => (
                                <li key={i}>• {w}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Differences Table */}
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-slate-100 px-4 py-2 font-medium text-sm">
                            Karşılaştırma Tablosu
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                  <th className="px-4 py-2 text-left">Collection</th>
                                  <th className="px-4 py-2 text-right">Mevcut</th>
                                  <th className="px-4 py-2 text-right">Yedek</th>
                                  <th className="px-4 py-2 text-right">Fark</th>
                                </tr>
                              </thead>
                              <tbody>
                                {restorePreview.differences?.map((diff, i) => (
                                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="px-4 py-2">{diff.collection}</td>
                                    <td className="px-4 py-2 text-right">{diff.current_count.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-right">{diff.backup_count.toLocaleString()}</td>
                                    <td className={`px-4 py-2 text-right font-medium ${
                                      diff.difference > 0 ? 'text-green-600' : 
                                      diff.difference < 0 ? 'text-red-600' : 'text-slate-400'
                                    }`}>
                                      {diff.difference > 0 ? '+' : ''}{diff.difference.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Big Warning */}
                        <div className="bg-red-100 border-2 border-red-300 p-4 rounded-lg">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-red-800">DİKKAT - GERİ ALINAMAZ İŞLEM</p>
                              <p className="text-sm text-red-700 mt-1">
                                Bu işlem mevcut veri tabanını yüklediğiniz yedek dosyasındaki verilerle değiştirecektir.
                              </p>
                              <p className="text-sm text-green-700 mt-2 font-medium">
                                ✓ İşlem öncesi mevcut veri tabanının yedeği otomatik olarak bilgisayarınıza indirilecektir.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Confirmation Input */}
                        <div>
                          <Label className="text-red-700 font-medium">
                            Onaylamak için aşağıdaki metni yazın:
                          </Label>
                          <p className="text-sm text-slate-600 mt-1 mb-2 font-mono bg-slate-100 px-2 py-1 rounded inline-block">
                            VERİ TABANINI GERİ YÜKLE
                          </p>
                          <Input
                            value={confirmationText}
                            onChange={(e) => setConfirmationText(e.target.value)}
                            placeholder="Onay metnini buraya yazın..."
                            className="font-mono"
                          />
                        </div>

                        <DialogFooter>
                          <Button variant="outline" onClick={resetRestoreDialog}>
                            İptal
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={handleRestoreExecute}
                            disabled={confirmationText !== 'VERİ TABANINI GERİ YÜKLE' || restoreExecuting}
                          >
                            {restoreExecuting ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : null}
                            {restoreExecuting ? 'Geri Yükleniyor...' : 'Veri Tabanını Geri Yükle'}
                          </Button>
                        </DialogFooter>
                      </>
                    ) : (
                      <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                        <div className="flex items-center gap-2 text-red-800">
                          <X className="h-5 w-5" />
                          {restorePreview.error || 'Dosya doğrulanamadı'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;

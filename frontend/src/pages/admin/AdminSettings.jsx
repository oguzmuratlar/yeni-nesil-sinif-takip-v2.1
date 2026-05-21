import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { Settings, ToggleLeft, ToggleRight, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';

const AdminSettings = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

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
      default:
        return <Settings className="h-5 w-5 text-slate-600" />;
    }
  };

  const getSettingDescription = (key) => {
    switch (key) {
      case 'homework_tool_enabled':
        return 'Öğretmenlerin öğrenci panelinde "Ödev Girişi" butonunu görmesini ve ödev planı oluşturmasını kontrol eder.';
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
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;

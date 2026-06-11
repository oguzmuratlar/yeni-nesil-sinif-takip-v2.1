import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Calendar, 
  Users, 
  GraduationCap, 
  AlertTriangle, 
  ChevronRight,
  Loader2,
  RefreshCw,
  Building2,
  Wallet,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  PlayCircle
} from 'lucide-react';

const AdminYearEndPreview = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState(null);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/year-end/preview');
      setPreviewData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Preview yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const response = await api.post('/year-end/execute', { confirm: true });
      setExecuteResult(response.data);
      setShowConfirmDialog(false);
      toast.success('Sene sonu işlemi başarıyla tamamlandı!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Sene sonu işlemi sırasında hata oluştu');
      setShowConfirmDialog(false);
    } finally {
      setExecuting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Preview yükleniyor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Hata</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => navigate('/admin/settings')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Ayarlara Dön
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate('/admin/settings')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Geri
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sene Sonu Preview</h1>
            <p className="text-sm text-gray-500">
              {previewData?.closing_season?.name} → {previewData?.opening_season?.name}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchPreview}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Yenile
        </Button>
      </div>

      {/* Warning Alert */}
      <Alert className="bg-amber-50 border-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">Bu Sadece Preview</AlertTitle>
        <AlertDescription className="text-amber-700">
          Henüz hiçbir veri değişmedi. Bu ekran sene sonu işleminin etkilerini göstermektedir.
        </AlertDescription>
      </Alert>

      {/* Season Transition Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-blue-600" />
            Dönem Geçişi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center space-x-8">
            <div className="text-center p-6 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Kapanacak Dönem</p>
              <p className="text-2xl font-bold text-gray-900">{previewData?.closing_season?.name}</p>
            </div>
            <ChevronRight className="h-8 w-8 text-gray-400" />
            <div className="text-center p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
              <p className="text-sm text-blue-600 mb-1">Açılacak Dönem</p>
              <p className="text-2xl font-bold text-blue-700">{previewData?.opening_season?.name}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Student Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Users className="h-5 w-5 mr-2 text-green-600" />
              Öğrenci Özeti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Aktif Öğrenci</span>
                <Badge variant="secondary">{previewData?.student_summary?.total_active_students}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Sınıf Atlayacak</span>
                <Badge className="bg-green-100 text-green-800">{previewData?.student_summary?.upgrading_students}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Mezun Olacak (8. Sınıf)</span>
                <Badge className="bg-orange-100 text-orange-800">{previewData?.student_summary?.graduating_students}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Class Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <GraduationCap className="h-5 w-5 mr-2 text-purple-600" />
              Sınıf Dağılımı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>5 → 6. Sınıf</span>
                <span className="font-medium">{previewData?.student_summary?.class_breakdown?.['5_to_6']}</span>
              </div>
              <div className="flex justify-between">
                <span>6 → 7. Sınıf</span>
                <span className="font-medium">{previewData?.student_summary?.class_breakdown?.['6_to_7']}</span>
              </div>
              <div className="flex justify-between">
                <span>7 → 8. Sınıf</span>
                <span className="font-medium">{previewData?.student_summary?.class_breakdown?.['7_to_8']}</span>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>8. Sınıf → Pasif</span>
                <span className="font-medium">{previewData?.student_summary?.class_breakdown?.['8_to_inactive']}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Group Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Building2 className="h-5 w-5 mr-2 text-blue-600" />
              Grup Özeti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Aktif Grup</span>
                <Badge variant="secondary">{previewData?.group_summary?.total_active_groups}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Kapatılacak</span>
                <Badge className="bg-red-100 text-red-800">{previewData?.group_summary?.groups_to_close}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Gruplar yeni döneme kopyalanmayacak
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed info */}
      <Tabs defaultValue="students" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="students">Öğrenci Bakiyeleri</TabsTrigger>
          <TabsTrigger value="teachers">Öğretmen Bakiyeleri</TabsTrigger>
          <TabsTrigger value="warnings">Uyarılar</TabsTrigger>
        </TabsList>

        {/* Student Balances Tab */}
        <TabsContent value="students">
          <Card>
            <CardHeader>
              <CardTitle>Öğrenci Bakiye Devri</CardTitle>
              <CardDescription>
                Devredilecek bakiyeler (8. sınıf öğrencileri hariç)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Öğrenci</th>
                      <th className="text-left py-3 px-4">Sınıf</th>
                      <th className="text-left py-3 px-4">Branş Bakiyeleri</th>
                      <th className="text-right py-3 px-4">Toplam Bakiye</th>
                      <th className="text-center py-3 px-4">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData?.student_balances?.map((student) => (
                      <tr key={student.student_id} className={`border-b ${student.will_graduate ? 'bg-orange-50' : ''}`}>
                        <td className="py-3 px-4 font-medium">
                          {student.student_name}
                          {student.will_graduate && (
                            <Badge className="ml-2 bg-orange-100 text-orange-800 text-xs">Mezun</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {student.level} → {student.new_level || 'Pasif'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {student.by_branch?.map((branch, idx) => (
                              <div key={idx} className="flex items-center text-xs">
                                <span className="text-gray-500 mr-2">{branch.branch_name}:</span>
                                <span className={branch.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {formatCurrency(branch.balance)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          <span className={student.total_balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(student.total_balance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {student.will_graduate ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-300">
                              Devredilmeyecek
                            </Badge>
                          ) : student.total_balance !== 0 ? (
                            <Badge className="bg-blue-100 text-blue-800">
                              Devredilecek
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500">
                              Bakiye Yok
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teacher Balances Tab */}
        <TabsContent value="teachers">
          <Card>
            <CardHeader>
              <CardTitle>Öğretmen Bakiye Devri</CardTitle>
              <CardDescription>
                Öğretmen toplam bakiyeleri tek kalem olarak devredilecek
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Öğretmen</th>
                      <th className="text-right py-3 px-4">Toplam Kazanç</th>
                      <th className="text-right py-3 px-4">Toplam Ödeme</th>
                      <th className="text-right py-3 px-4">Devredecek Bakiye</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData?.teacher_balances?.map((teacher) => (
                      <tr key={teacher.teacher_id} className="border-b">
                        <td className="py-3 px-4 font-medium">{teacher.teacher_name}</td>
                        <td className="py-3 px-4 text-right text-green-600">
                          <div className="flex items-center justify-end">
                            <TrendingUp className="h-4 w-4 mr-1" />
                            {formatCurrency(teacher.total_earnings)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-blue-600">
                          <div className="flex items-center justify-end">
                            <Wallet className="h-4 w-4 mr-1" />
                            {formatCurrency(teacher.total_paid)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold">
                          <span className={teacher.carryover_balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {teacher.carryover_balance >= 0 ? (
                              <TrendingUp className="h-4 w-4 inline mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 inline mr-1" />
                            )}
                            {formatCurrency(teacher.carryover_balance)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Warnings Tab */}
        <TabsContent value="warnings">
          <Card>
            <CardHeader>
              <CardTitle>Uyarılar ve Notlar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewData?.warnings?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-amber-700 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Uyarılar
                  </h4>
                  {previewData.warnings.map((warning, idx) => (
                    <Alert key={idx} className="bg-amber-50 border-amber-200">
                      <AlertDescription className="text-amber-800">{warning}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              <div className="space-y-2 mt-6">
                <h4 className="font-medium text-blue-700">Önemli Notlar</h4>
                {previewData?.important_notes?.map((note, idx) => (
                  <div key={idx} className="flex items-start space-x-2 text-sm text-gray-700">
                    <ChevronRight className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Execute Result */}
      {executeResult && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center text-green-800">
              <CheckCircle className="h-6 w-6 mr-2" />
              Sene Sonu İşlemi Tamamlandı!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-600">{executeResult.summary?.upgraded_students || 0}</p>
                <p className="text-sm text-gray-600">Sınıf Atlayan</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-orange-600">{executeResult.summary?.graduated_students || 0}</p>
                <p className="text-sm text-gray-600">Mezun Olan</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{executeResult.summary?.closed_groups || 0}</p>
                <p className="text-sm text-gray-600">Kapatılan Grup</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{executeResult.summary?.copied_courses || 0}</p>
                <p className="text-sm text-gray-600">Kopyalanan Ders</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div>
                <p className="text-sm text-green-700">
                  <strong>{executeResult.from_season}</strong> dönemi kapatıldı, 
                  <strong> {executeResult.to_season}</strong> dönemi açıldı.
                </p>
                <p className="text-xs text-green-600 mt-1">
                  İşlem tarihi: {new Date(executeResult.cutoff_date).toLocaleString('tr-TR')}
                </p>
              </div>
              <Button onClick={() => navigate('/admin/dashboard')} className="bg-green-600 hover:bg-green-700">
                Ana Sayfaya Dön
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {!executeResult && (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <p className="font-medium text-orange-700">
                  DİKKAT: Bu işlem geri alınamaz!
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Preview tarihi: {new Date(previewData?.cutoff_date).toLocaleString('tr-TR')}
                </p>
              </div>
              <div className="flex space-x-3">
                <Button variant="outline" onClick={() => navigate('/admin/settings')}>
                  İptal
                </Button>
                <Button 
                  data-testid="execute-year-end-btn"
                  onClick={() => setShowConfirmDialog(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Sene Sonunu Uygula
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center text-orange-700">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Sene Sonu Onayı
            </DialogTitle>
            <DialogDescription>
              Bu işlem geri alınamaz. Aşağıdaki değişiklikler yapılacak:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <div className="flex items-center text-sm">
              <ChevronRight className="h-4 w-4 text-orange-500 mr-2" />
              <span><strong>{previewData?.student_summary?.graduating_students || 0}</strong> öğrenci mezun olup pasife alınacak</span>
            </div>
            <div className="flex items-center text-sm">
              <ChevronRight className="h-4 w-4 text-orange-500 mr-2" />
              <span><strong>{previewData?.student_summary?.upgrading_students || 0}</strong> öğrenci sınıf atlayacak</span>
            </div>
            <div className="flex items-center text-sm">
              <ChevronRight className="h-4 w-4 text-orange-500 mr-2" />
              <span><strong>{previewData?.group_summary?.groups_to_close || 0}</strong> grup kapatılacak</span>
            </div>
            <div className="flex items-center text-sm">
              <ChevronRight className="h-4 w-4 text-orange-500 mr-2" />
              <span>Öğrenci ve öğretmen bakiyeleri yeni döneme devredilecek</span>
            </div>
            <div className="flex items-center text-sm">
              <ChevronRight className="h-4 w-4 text-orange-500 mr-2" />
              <span><strong>{previewData?.closing_season?.name}</strong> kapanacak, <strong>{previewData?.opening_season?.name}</strong> açılacak</span>
            </div>
          </div>
          
          <Alert className="bg-red-50 border-red-200">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">Uyarı</AlertTitle>
            <AlertDescription className="text-red-700">
              Bu işlem geri alınamaz. Emin misiniz?
            </AlertDescription>
          </Alert>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={executing}>
              Vazgeç
            </Button>
            <Button 
              onClick={handleExecute} 
              disabled={executing}
              className="bg-red-600 hover:bg-red-700"
            >
              {executing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                'Evet, Sene Sonunu Uygula'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminYearEndPreview;

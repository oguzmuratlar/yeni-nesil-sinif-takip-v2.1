import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, X, Eye, EyeOff, Edit, Calendar, TrendingUp } from 'lucide-react';

const AdminTeacherForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    season_id: '',
    username: '',
    password: '',
    user_type: 'teacher',
    branches: [],  // [{branch_id, birebir_price, group_prices: {1, 2, 3, 4}}]
  });
  const [existingUser, setExistingUser] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [branches, setBranches] = useState([]);
  const [lessonTypes, setLessonTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [priceUpdateDialogOpen, setPriceUpdateDialogOpen] = useState(false);
  const [selectedBranchForUpdate, setSelectedBranchForUpdate] = useState(null);
  const [priceUpdateData, setPriceUpdateData] = useState({
    birebir_price: '',
    group_1: '',
    group_2: '',
    group_3: '',
    group_4: '',
    valid_from: new Date().toISOString().split('T')[0]
  });
  const [priceHistory, setPriceHistory] = useState([]);
  const [newBranch, setNewBranch] = useState({
    branch_id: '',
    birebir_price: '',
    group_1: '',
    group_2: '',
    group_3: '',
    group_4: ''
  });

  useEffect(() => {
    fetchReferenceData();
    if (isEdit) {
      fetchTeacher();
      fetchUserInfo();
    }
  }, [id]);

  const fetchReferenceData = async () => {
    try {
      const [seasonsRes, branchesRes, typesRes] = await Promise.all([
        apiClient.get('/seasons'),
        apiClient.get('/branches'),
        apiClient.get('/lesson-types')
      ]);
      setSeasons(seasonsRes.data.filter(s => s.status === 'active'));
      setBranches(branchesRes.data);
      setLessonTypes(typesRes.data);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    }
  };

  const fetchTeacher = async () => {
    try {
      const response = await apiClient.get(`/teachers/${id}`);
      const teacherData = response.data;
      
      // Load teacher prices
      const pricesRes = await apiClient.get(`/teacher-prices?teacher_id=${id}`);
      const prices = pricesRes.data;
      
      // Group by branch
      const branchGroups = {};
      prices.forEach(price => {
        if (!branchGroups[price.branch_id]) {
          branchGroups[price.branch_id] = { branch_id: price.branch_id };
        }
        if (price.group_size) {
          branchGroups[price.branch_id][`group_${price.group_size}`] = price.price;
        } else {
          branchGroups[price.branch_id].birebir_price = price.price;
        }
      });
      
      setFormData(prev => ({
        ...prev,
        ...teacherData,
        branches: Object.values(branchGroups)
      }));
    } catch (error) {
      toast.error('Öğretmen bilgileri yüklenemedi');
    }
  };

  const fetchUserInfo = async () => {
    try {
      const response = await apiClient.get(`/users/by-teacher/${id}`);
      if (response.data) {
        setExistingUser(response.data);
        setFormData(prev => ({
          ...prev,
          username: response.data.username || '',
          user_type: response.data.user_type || 'teacher'
        }));
      }
    } catch (error) {
      // Kullanıcı olmayabilir
      console.log('No user found for teacher');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEdit) {
        // Update teacher basic info
        await apiClient.put(`/teachers/${id}`, {
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          season_id: formData.season_id
        });
        
        // Update user info if provided
        if (formData.username || formData.password || formData.user_type) {
          const userUpdateData = {};
          if (formData.username) userUpdateData.username = formData.username;
          if (formData.password) userUpdateData.password = formData.password;
          if (formData.user_type) userUpdateData.user_type = formData.user_type;
          
          if (existingUser) {
            await apiClient.put(`/users/by-teacher/${id}`, userUpdateData);
          } else if (formData.username && formData.password) {
            // Create new user if doesn't exist
            await apiClient.post('/auth/register', {
              username: formData.username,
              password: formData.password,
              user_type: formData.user_type,
              teacher_id: id
            });
          }
        }
        
        // Update prices if provided
        if (formData.branches && formData.branches.length > 0) {
          const birebirType = lessonTypes.find(t => t.name === 'Birebir');
          const grupType = lessonTypes.find(t => t.name === 'Grup');
          
          for (const branch of formData.branches) {
            // Update or create birebir price
            await apiClient.post('/teacher-prices', {
              teacher_id: id,
              branch_id: branch.branch_id,
              lesson_type_id: birebirType.id,
              price: parseFloat(branch.birebir_price),
              season_id: formData.season_id
            });
            
            // Update or create group prices
            if (grupType) {
              for (let i = 1; i <= 4; i++) {
                const groupPrice = branch[`group_${i}`];
                if (groupPrice) {
                  await apiClient.post('/teacher-prices', {
                    teacher_id: id,
                    branch_id: branch.branch_id,
                    lesson_type_id: grupType.id,
                    price: parseFloat(groupPrice),
                    group_size: i,
                    season_id: formData.season_id
                  });
                }
              }
            }
          }
        }
        
        toast.success('Öğretmen güncellendi');
      } else {
        // Create new teacher
        const teacherResponse = await apiClient.post('/teachers', {
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          season_id: formData.season_id
        });
        const teacherId = teacherResponse.data.id;
        
        // Create prices for each branch
        const birebirType = lessonTypes.find(t => t.name === 'Birebir');
        const grupType = lessonTypes.find(t => t.name === 'Grup');
        
        for (const branch of formData.branches) {
          // Birebir price
          await apiClient.post('/teacher-prices', {
            teacher_id: teacherId,
            branch_id: branch.branch_id,
            lesson_type_id: birebirType.id,
            price: parseFloat(branch.birebir_price),
            season_id: formData.season_id
          });
          
          // Group prices
          if (grupType) {
            for (let i = 1; i <= 4; i++) {
              const groupPrice = branch[`group_${i}`];
              if (groupPrice) {
                await apiClient.post('/teacher-prices', {
                  teacher_id: teacherId,
                  branch_id: branch.branch_id,
                  lesson_type_id: grupType.id,
                  price: parseFloat(groupPrice),
                  group_size: i,
                  season_id: formData.season_id
                });
              }
            }
          }
        }
        
        // Then create user for this teacher
        await apiClient.post('/auth/register', {
          username: formData.username,
          password: formData.password,
          user_type: formData.user_type,
          teacher_id: teacherId
        });
        
        toast.success('Öğretmen ve kullanıcı oluşturuldu');
      }
      navigate('/admin/teachers');
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEdit ? 'Güncelleme başarısız' : 'Ekleme başarısız'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddBranch = () => {
    if (!newBranch.branch_id || !newBranch.birebir_price) {
      toast.error('Branş ve birebir ders ücreti zorunlu');
      return;
    }
    
    formData.branches.push({
      branch_id: newBranch.branch_id,
      birebir_price: newBranch.birebir_price,
      group_1: newBranch.group_1,
      group_2: newBranch.group_2,
      group_3: newBranch.group_3,
      group_4: newBranch.group_4
    });
    
    setFormData({ ...formData });
    setNewBranch({ branch_id: '', birebir_price: '', group_1: '', group_2: '', group_3: '', group_4: '' });
    setBranchDialogOpen(false);
    toast.success('Branş eklendi');
  };

  const handleRemoveBranch = (index) => {
    formData.branches.splice(index, 1);
    setFormData({ ...formData });
  };

  // Fiyat güncelleme dialog'unu aç
  const openPriceUpdateDialog = async (branch, index) => {
    setSelectedBranchForUpdate({ ...branch, index });
    setPriceUpdateData({
      birebir_price: branch.birebir_price || '',
      group_1: branch.group_1 || '',
      group_2: branch.group_2 || '',
      group_3: branch.group_3 || '',
      group_4: branch.group_4 || '',
      valid_from: new Date().toISOString().split('T')[0]
    });
    
    // Fiyat geçmişini getir
    try {
      const response = await apiClient.get(`/teacher-price-history/${id}?branch_id=${branch.branch_id}`);
      setPriceHistory(response.data);
    } catch (error) {
      setPriceHistory([]);
    }
    
    setPriceUpdateDialogOpen(true);
  };

  // Fiyat güncelle
  const handlePriceUpdate = async () => {
    if (!priceUpdateData.birebir_price || !priceUpdateData.valid_from) {
      toast.error('Birebir ders ücreti ve geçerlilik tarihi zorunludur');
      return;
    }

    try {
      const birebirType = lessonTypes.find(t => t.name === 'Birebir');
      const grupType = lessonTypes.find(t => t.name === 'Grup');
      
      // Birebir fiyatı güncelle
      await apiClient.post('/teacher-price-history', {
        teacher_id: id,
        branch_id: selectedBranchForUpdate.branch_id,
        lesson_type_id: birebirType.id,
        price: parseFloat(priceUpdateData.birebir_price),
        valid_from: priceUpdateData.valid_from
      });

      // Grup fiyatlarını güncelle
      if (grupType) {
        for (let i = 1; i <= 4; i++) {
          const groupPrice = priceUpdateData[`group_${i}`];
          if (groupPrice) {
            await apiClient.post('/teacher-price-history', {
              teacher_id: id,
              branch_id: selectedBranchForUpdate.branch_id,
              lesson_type_id: grupType.id,
              group_size: i,
              price: parseFloat(groupPrice),
              valid_from: priceUpdateData.valid_from
            });
          }
        }
      }

      // Local state'i güncelle
      const updatedBranches = [...formData.branches];
      updatedBranches[selectedBranchForUpdate.index] = {
        ...updatedBranches[selectedBranchForUpdate.index],
        birebir_price: priceUpdateData.birebir_price,
        group_1: priceUpdateData.group_1,
        group_2: priceUpdateData.group_2,
        group_3: priceUpdateData.group_3,
        group_4: priceUpdateData.group_4
      };
      setFormData({ ...formData, branches: updatedBranches });

      toast.success('Fiyatlar güncellendi. Bu tarihten itibaren yeni fiyatlar uygulanacak.');
      setPriceUpdateDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Fiyatlar güncellenemedi');
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-800 mb-2" data-testid="teacher-form-title">
            {isEdit ? 'Öğretmen Düzenle' : 'Yeni Öğretmen Ekle'}
          </h1>
          <p className="text-slate-600">Öğretmen bilgilerini girin</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="admin-card p-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Öğretmen Adı *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="teacher-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefon *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                data-testid="teacher-phone-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adres</Label>
              <Input
                id="address"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Öğretmenin adresi"
                data-testid="teacher-address-input"
              />
            </div>
          </div>

          {/* Kullanıcı Bilgileri */}
          <div className="admin-card p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Kullanıcı Bilgileri</h3>
              <p className="text-sm text-slate-600 mb-4">
                {isEdit 
                  ? (existingUser 
                      ? 'Mevcut kullanıcı bilgilerini görüntüleyin ve güncelleyin' 
                      : 'Bu öğretmen için henüz kullanıcı oluşturulmamış. Yeni kullanıcı oluşturmak için bilgileri doldurun.')
                  : 'Öğretmenin giriş yapabilmesi için kullanıcı bilgilerini girin'}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="username">Kullanıcı Adı {!isEdit && '*'}</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required={!isEdit}
                data-testid="teacher-username-input"
                placeholder={isEdit ? 'Değiştirmek için yeni kullanıcı adı girin' : 'Kullanıcı adı girin'}
              />
              {isEdit && existingUser && (
                <p className="text-xs text-slate-500">Mevcut: {existingUser.username}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Şifre {!isEdit && '*'}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!isEdit && !existingUser}
                  data-testid="teacher-password-input"
                  placeholder={isEdit ? 'Değiştirmek için yeni şifre girin' : 'Şifre girin'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {isEdit && (
                <p className="text-xs text-slate-500">Boş bırakırsanız şifre değişmez</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="user_type">Yetki Seviyesi</Label>
              <Select value={formData.user_type} onValueChange={(value) => setFormData({ ...formData, user_type: value })}>
                <SelectTrigger data-testid="user-type-select">
                  <SelectValue placeholder="Yetki seviyesi seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Öğretmen</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Admin yetkisi verilirse tüm sisteme erişim sağlar</p>
            </div>
          </div>

          <div className="admin-card p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Branş ve Ücretlendirme</h3>
                {isEdit && <p className="text-sm text-slate-600 mt-1">Yeni fiyatlar sadece ileriye dönük uygulanır</p>}
              </div>
              <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline">
                    <Plus size={16} className="mr-2" />
                    Branş Ekle
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Branş ve Fiyatlandırma Ekle</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Branş *</Label>
                      <Select value={newBranch.branch_id} onValueChange={(value) => setNewBranch({ ...newBranch, branch_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Branş seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Birebir Ders Ücreti (₺) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newBranch.birebir_price}
                        onChange={(e) => setNewBranch({ ...newBranch, birebir_price: e.target.value })}
                        placeholder="200"
                      />
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-slate-800 mb-3">Grup Dersi Ücretleri</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>1 Kişilik Grup (₺)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={newBranch.group_1}
                            onChange={(e) => setNewBranch({ ...newBranch, group_1: e.target.value })}
                            placeholder="150"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>2 Kişilik Grup (₺)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={newBranch.group_2}
                            onChange={(e) => setNewBranch({ ...newBranch, group_2: e.target.value })}
                            placeholder="100"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>3 Kişilik Grup (₺)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={newBranch.group_3}
                            onChange={(e) => setNewBranch({ ...newBranch, group_3: e.target.value })}
                            placeholder="75"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>4 Kişilik Grup (₺)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={newBranch.group_4}
                            onChange={(e) => setNewBranch({ ...newBranch, group_4: e.target.value })}
                            placeholder="60"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button type="button" onClick={handleAddBranch} className="flex-1">Ekle</Button>
                      <Button type="button" variant="outline" onClick={() => setBranchDialogOpen(false)}>İptal</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            {formData.branches.length > 0 ? (
              <div className="space-y-3">
                {formData.branches.map((branch, index) => {
                  const branchData = branches.find(b => b.id === branch.branch_id);
                  return (
                    <div key={index} className="p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800 mb-2">{branchData?.name}</p>
                          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                            <p>• Birebir: <span className="font-medium text-green-700">{branch.birebir_price} ₺</span></p>
                            {branch.group_1 && <p>• Grup 1: <span className="font-medium text-green-700">{branch.group_1} ₺</span></p>}
                            {branch.group_2 && <p>• Grup 2: <span className="font-medium text-green-700">{branch.group_2} ₺</span></p>}
                            {branch.group_3 && <p>• Grup 3: <span className="font-medium text-green-700">{branch.group_3} ₺</span></p>}
                            {branch.group_4 && <p>• Grup 4: <span className="font-medium text-green-700">{branch.group_4} ₺</span></p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isEdit && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openPriceUpdateDialog(branch, index)}
                              className="text-blue-600 hover:bg-blue-50"
                              data-testid={`update-teacher-price-${index}`}
                            >
                              <Edit size={14} className="mr-1" />
                              Fiyat Güncelle
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemoveBranch(index)}
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-600 text-center py-8">Branş ekleyin</p>
            )}
          </div>

          {/* Öğretmen Fiyat Güncelleme Dialog */}
          <Dialog open={priceUpdateDialogOpen} onOpenChange={setPriceUpdateDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp size={20} className="text-green-600" />
                  Öğretmen Ücretlerini Güncelle
                </DialogTitle>
                <DialogDescription>
                  {selectedBranchForUpdate && branches.find(b => b.id === selectedBranchForUpdate.branch_id)?.name}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="teacher-valid-from" className="flex items-center gap-2">
                    <Calendar size={16} />
                    Geçerlilik Başlangıç Tarihi *
                  </Label>
                  <Input
                    id="teacher-valid-from"
                    type="date"
                    value={priceUpdateData.valid_from}
                    onChange={(e) => setPriceUpdateData({...priceUpdateData, valid_from: e.target.value})}
                    data-testid="teacher-valid-from-input"
                  />
                  <p className="text-xs text-gray-500">
                    Bu tarihten önce verilen dersler eski ücretten, sonra verilenler yeni ücretten hesaplanacak.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="teacher-birebir-price">Birebir Ders Ücreti (₺) *</Label>
                  <Input
                    id="teacher-birebir-price"
                    type="number"
                    step="0.01"
                    value={priceUpdateData.birebir_price}
                    onChange={(e) => setPriceUpdateData({...priceUpdateData, birebir_price: e.target.value})}
                    placeholder="Yeni birebir ders ücreti"
                    data-testid="teacher-price-birebir-input"
                  />
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Grup Dersi Ücretleri</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm">1 Kişilik Grup (₺)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={priceUpdateData.group_1}
                        onChange={(e) => setPriceUpdateData({...priceUpdateData, group_1: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">2 Kişilik Grup (₺)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={priceUpdateData.group_2}
                        onChange={(e) => setPriceUpdateData({...priceUpdateData, group_2: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">3 Kişilik Grup (₺)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={priceUpdateData.group_3}
                        onChange={(e) => setPriceUpdateData({...priceUpdateData, group_3: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">4 Kişilik Grup (₺)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={priceUpdateData.group_4}
                        onChange={(e) => setPriceUpdateData({...priceUpdateData, group_4: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Fiyat Geçmişi */}
                {priceHistory.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">Fiyat Geçmişi</p>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {priceHistory.map((ph, idx) => (
                        <div key={idx} className="text-xs flex justify-between bg-gray-50 p-2 rounded">
                          <span>
                            {new Date(ph.valid_from).toLocaleDateString('tr-TR')} - {ph.valid_to ? new Date(ph.valid_to).toLocaleDateString('tr-TR') : 'Devam'}
                            {ph.group_size && <span className="text-purple-600 ml-1">(Grup {ph.group_size})</span>}
                          </span>
                          <span className="font-medium">{ph.price} ₺</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPriceUpdateDialogOpen(false)}>
                  İptal
                </Button>
                <Button type="button" onClick={handlePriceUpdate} className="bg-green-600 hover:bg-green-700">
                  Fiyatları Güncelle
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={loading}
              data-testid="save-teacher-btn"
              className="admin-btn"
            >
              {loading ? 'Kaydediliyor...' : (isEdit ? 'Güncelle' : 'Kaydet')}
            </Button>
            <Button
              type="button"
              onClick={() => navigate('/admin/teachers')}
              variant="outline"
              data-testid="cancel-btn"
            >
              İptal
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default AdminTeacherForm;

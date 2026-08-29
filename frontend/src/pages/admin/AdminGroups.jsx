import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, Users, Edit, Trash2, Book, RotateCcw, Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';

const AdminGroups = () => {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [branches, setBranches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [showInactive]);

  const fetchData = async () => {
    try {
      const [groupsRes, studentsRes, branchesRes, teachersRes] = await Promise.all([
        apiClient.get(`/student-groups?include_inactive=${showInactive}`),
        apiClient.get('/students'),
        apiClient.get('/branches'),
        apiClient.get('/teachers')
      ]);
      setGroups(groupsRes.data);
      setStudents(studentsRes.data);
      setBranches(branchesRes.data);
      setTeachers(teachersRes.data);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (groupId) => {
    if (!window.confirm('Bu grubu pasifleştirmek istediğinizden emin misiniz? Gruptaki öğrenciler gruptan çıkarılacak.')) return;
    try {
      await apiClient.delete(`/student-groups/${groupId}`);
      toast.success('Grup pasifleştirildi ve öğrenciler gruptan çıkarıldı');
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
      console.error(error);
    }
  };

  const handleActivate = async (groupId) => {
    if (!window.confirm('Bu grubu aktifleştirmek istediğinizden emin misiniz?')) return;
    try {
      await apiClient.post(`/student-groups/${groupId}/activate`);
      toast.success('Grup aktifleştirildi');
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
      console.error(error);
    }
  };

  const activeGroups = groups.filter(g => g.status !== 'inactive');
  const inactiveGroups = groups.filter(g => g.status === 'inactive');

  // Arama filtreleme
  const filterBySearch = (groupList) => {
    if (!searchQuery.trim()) return groupList;
    const query = searchQuery.toLowerCase().trim();
    return groupList.filter(g => g.name?.toLowerCase().includes(query));
  };

  const filteredActiveGroups = filterBySearch(activeGroups);
  const filteredInactiveGroups = filterBySearch(inactiveGroups);

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-800 mb-2" data-testid="admin-groups-title">
              Grup/Sınıf Yönetimi
            </h1>
            <p className="text-slate-600">Öğrenci gruplarını yönetin ve grup ders girişi yapın</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant={showInactive ? "default" : "outline"}
              onClick={() => setShowInactive(!showInactive)}
              data-testid="toggle-inactive-btn"
            >
              {showInactive ? <EyeOff size={18} className="mr-2" /> : <Eye size={18} className="mr-2" />}
              {showInactive ? 'Pasifleri Gizle' : 'Pasifleri Göster'}
            </Button>
            <Button
              onClick={() => navigate('/admin/groups/new')}
              data-testid="add-group-btn"
              className="admin-btn"
            >
              <Plus size={20} className="mr-2" />
              Grup Oluştur
            </Button>
          </div>
        </div>

        {/* Arama Alanı */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Grup adına göre ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="group-search-input"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Yükleniyor...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="admin-card p-12 text-center">
            <p className="text-slate-600">
              {showInactive ? 'Henüz grup oluşturulmamış veya tüm gruplar aktif' : 'Henüz grup oluşturulmamış'}
            </p>
          </div>
        ) : (
          <>
            {/* Aktif Gruplar */}
            {filteredActiveGroups.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-700 mb-4">
                  Aktif Gruplar ({filteredActiveGroups.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredActiveGroups.map((group) => {
                    const branch = branches.find(b => b.id === group.branch_id);
                    const teacher = teachers.find(t => t.id === group.teacher_id);
                    return (
                      <div
                        key={group.id}
                        data-testid={`group-card-${group.id}`}
                        className="admin-card p-6"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-slate-800 mb-2">{group.name}</h3>
                            <div className="space-y-1">
                              <Badge variant="secondary">{branch?.name}</Badge>
                              <p className="text-sm text-slate-600">Sınıf: {group.level}</p>
                              {teacher && <p className="text-sm text-slate-600">Öğretmen: {teacher.name}</p>}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-slate-600 mb-4">
                          <Users size={18} />
                          <span className="text-sm">{group.student_ids?.length || 0} öğrenci</span>
                          {(group.student_ids?.length || 0) > 4 && (
                            <Badge variant="outline" className="text-xs">4+ kişi</Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <Button
                            size="sm"
                            onClick={() => navigate(`/admin/groups/${group.id}/lesson`)}
                            data-testid={`group-lesson-${group.id}`}
                            className="flex-1"
                          >
                            <Book size={16} className="mr-1" />
                            Ders Girişi
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/groups/${group.id}`)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(group.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pasif Gruplar */}
            {showInactive && filteredInactiveGroups.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-500 mb-4">
                  Pasif Gruplar ({filteredInactiveGroups.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredInactiveGroups.map((group) => {
                    const branch = branches.find(b => b.id === group.branch_id);
                    const teacher = teachers.find(t => t.id === group.teacher_id);
                    return (
                      <div
                        key={group.id}
                        data-testid={`group-card-${group.id}`}
                        className="admin-card p-6 opacity-60 border-dashed"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-xl font-bold text-slate-600">{group.name}</h3>
                              <Badge variant="destructive" className="text-xs">Pasif</Badge>
                            </div>
                            <div className="space-y-1">
                              <Badge variant="secondary">{branch?.name}</Badge>
                              <p className="text-sm text-slate-500">Sınıf: {group.level}</p>
                              {teacher && <p className="text-sm text-slate-500">Öğretmen: {teacher.name}</p>}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-slate-500 mb-4">
                          <Users size={18} />
                          <span className="text-sm">{group.student_ids?.length || 0} öğrenci</span>
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleActivate(group.id)}
                            className="flex-1"
                          >
                            <RotateCcw size={16} className="mr-1" />
                            Aktifleştir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/groups/${group.id}`)}
                          >
                            <Edit size={16} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Arama sonucu boşsa */}
            {searchQuery && filteredActiveGroups.length === 0 && filteredInactiveGroups.length === 0 && (
              <div className="admin-card p-12 text-center">
                <p className="text-slate-600">"{searchQuery}" aramasına uygun grup bulunamadı.</p>
              </div>
            )}

            {/* Pasif grup varsa ve gösterilmiyorsa bilgi */}
            {!showInactive && inactiveGroups.length > 0 && (
              <div className="text-center py-4 text-slate-500">
                <p>{inactiveGroups.length} pasif grup gizleniyor. Görmek için "Pasifleri Göster" butonuna tıklayın.</p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminGroups;
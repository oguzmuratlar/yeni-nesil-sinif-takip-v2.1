import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Edit, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const AdminTeacherProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeacher();
  }, [id]);

  const fetchTeacher = async () => {
    try {
      const response = await apiClient.get(`/teachers/${id}`);
      setTeacher(response.data);
    } catch (error) {
      toast.error('Öğretmen bilgileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">Yükleniyor...</div>
      </AdminLayout>
    );
  }

  if (!teacher) {
    return (
      <AdminLayout>
        <div className="text-center py-12">Öğretmen bulunamadı</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        <Button
          onClick={() => navigate('/admin/teachers')}
          variant="ghost"
          className="mb-4"
          data-testid="back-to-teachers-btn"
        >
          <ArrowLeft size={20} className="mr-2" />
          Geri Dön
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-800 mb-2" data-testid="teacher-profile-title">
              {teacher.name}
            </h1>
            <Badge variant={teacher.status === 'active' ? 'default' : 'secondary'}>
              {teacher.status === 'active' ? 'Aktif' : 'Pasif'}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => navigate(`/admin/teachers/${id}/balance`)}
              data-testid="view-balance-btn"
              className="bg-green-600 hover:bg-green-700"
            >
              <Wallet size={20} className="mr-2" />
              Bakiye Bilgisi
            </Button>
            <Button
              onClick={() => navigate(`/admin/teachers/${id}/edit`)}
              data-testid="edit-teacher-btn"
              className="admin-btn"
            >
              <Edit size={20} className="mr-2" />
              Düzenle
            </Button>
          </div>
        </div>

        <div className="admin-card p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Öğretmen Bilgileri</h2>
          <div className="space-y-3 text-slate-700">
            <div>
              <span className="text-sm text-slate-500">Telefon:</span>
              <p className="font-semibold" data-testid="teacher-profile-phone">{teacher.phone}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500">Adres:</span>
              <p className="font-semibold" data-testid="teacher-profile-address">{teacher.address || '-'}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500">Durum:</span>
              <p className="font-semibold">{teacher.status === 'active' ? 'Aktif' : 'Pasif'}</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTeacherProfile;
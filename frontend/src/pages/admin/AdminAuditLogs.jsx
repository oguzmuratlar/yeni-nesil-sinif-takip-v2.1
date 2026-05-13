import React, { useState, useEffect } from 'react';
import { Clock, User, Users, BookOpen, Edit, Trash2, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import AdminLayout from '../../components/layouts/AdminLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import apiClient from '../../api/axios';

const AdminAuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, startDate, endDate]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('page_size', pageSize);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      const response = await apiClient.get(`/admin/audit-logs?${params.toString()}`);
      setLogs(response.data.logs || []);
      setTotalCount(response.data.total_count || 0);
      setTotalPages(response.data.total_pages || 1);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'add': return <Plus className="w-4 h-4 text-green-600" />;
      case 'update': return <Edit className="w-4 h-4 text-blue-600" />;
      case 'delete': return <Trash2 className="w-4 h-4 text-red-600" />;
      default: return <BookOpen className="w-4 h-4 text-slate-600" />;
    }
  };

  const getActionLabel = (actionType) => {
    switch (actionType) {
      case 'add': return 'Ekledi';
      case 'update': return 'Güncelledi';
      case 'delete': return 'Sildi';
      default: return actionType;
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'lesson_entry': return 'Ders Girişi';
      case 'lesson_planning': return 'Ders Planlaması';
      default: return category;
    }
  };

  const getActionBgColor = (actionType) => {
    switch (actionType) {
      case 'add': return 'bg-green-50 border-green-200';
      case 'update': return 'bg-blue-50 border-blue-200';
      case 'delete': return 'bg-red-50 border-red-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-7 h-7 text-blue-600" />
              Günlük Değişiklikler
            </h1>
            <p className="text-slate-600 mt-1">Öğretmenlerin yaptığı ders ve planlama değişiklikleri</p>
          </div>
          <div className="text-sm text-slate-500">
            Toplam: <span className="font-semibold text-slate-700">{totalCount}</span> kayıt
          </div>
        </div>

        {/* Filters */}
        <div className="admin-card p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">Başlangıç Tarihi</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                  className="h-10"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">Bitiş Tarihi</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                  className="h-10"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1 block">Sayfa Başına</label>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 kayıt</SelectItem>
                    <SelectItem value="25">25 kayıt</SelectItem>
                    <SelectItem value="50">50 kayıt</SelectItem>
                    <SelectItem value="100">100 kayıt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(startDate || endDate) && (
              <Button variant="outline" onClick={handleClearFilters} className="shrink-0">
                <Filter className="w-4 h-4 mr-2" />
                Filtreleri Temizle
              </Button>
            )}
          </div>
        </div>

        {/* Logs List */}
        <div className="space-y-3">
          {loading ? (
            <div className="admin-card p-12 text-center text-slate-500">
              Yükleniyor...
            </div>
          ) : logs.length === 0 ? (
            <div className="admin-card p-12 text-center">
              <Clock className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-600 font-medium">Kayıt bulunamadı</p>
              <p className="text-slate-500 text-sm mt-1">Seçilen tarih aralığında değişiklik kaydı yok.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div 
                key={log.id} 
                className={`border rounded-lg overflow-hidden ${getActionBgColor(log.action_type)}`}
              >
                {/* Header */}
                <div 
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        {getActionIcon(log.action_type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{log.teacher_name}</span>
                          <span className="text-slate-600">{getActionLabel(log.action_type)}</span>
                          <span className="px-2 py-0.5 bg-white/70 rounded text-xs font-medium text-slate-600">
                            {getCategoryLabel(log.category)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-slate-600">
                          {log.group_id ? (
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {log.group_name || 'Grup'}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {log.student_name || 'Öğrenci'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-slate-500">{formatDate(log.created_at)}</span>
                      {expandedLog === log.id ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedLog === log.id && (
                  <div className="border-t bg-white/80 p-4 space-y-3">
                    {/* Grup öğrencileri */}
                    {log.group_students_snapshot && log.group_students_snapshot.length > 0 && (
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <span className="text-slate-600 font-medium text-sm">Grup Öğrencileri:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {log.group_students_snapshot.map((s, i) => (
                            <span key={i} className="px-2 py-1 bg-white rounded text-xs text-slate-700">
                              {s.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Eski Veri */}
                      {log.old_data && (
                        <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                          <span className="text-red-700 font-medium text-xs uppercase flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Eski Veri
                          </span>
                          <div className="mt-2 space-y-1">
                            {Object.entries(log.old_data).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-slate-600">{key}:</span>
                                <span className="text-slate-800 font-medium break-all text-right max-w-[60%]">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Yeni Veri */}
                      {log.new_data && (
                        <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                          <span className="text-green-700 font-medium text-xs uppercase flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Yeni Veri
                          </span>
                          <div className="mt-2 space-y-1">
                            {Object.entries(log.new_data).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-slate-600">{key}:</span>
                                <span className="text-slate-800 font-medium break-all text-right max-w-[60%]">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="admin-card p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-slate-600">
                Sayfa {page} / {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                >
                  İlk
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded font-medium">
                  {page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                >
                  Son
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAuditLogs;

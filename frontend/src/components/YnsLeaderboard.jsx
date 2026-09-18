import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/axios';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Trophy, Star } from 'lucide-react';

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GRADES = ['5', '6', '7', '8'];

const rankStyle = (rank) => {
  if (rank === 1) return 'bg-yellow-50 border-yellow-300';
  if (rank === 2) return 'bg-slate-100 border-slate-300';
  if (rank === 3) return 'bg-orange-50 border-orange-300';
  return 'bg-white border-slate-200';
};

const YnsLeaderboard = ({ branches, defaultBranchId = 'all' }) => {
  const now = new Date();
  const [filters, setFilters] = useState({
    grade_level: 'all',
    branch_id: defaultBranchId,
    view_type: 'season',
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFilters(prev => ({ ...prev, branch_id: defaultBranchId }));
  }, [defaultBranchId]);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const params = { view_type: filters.view_type };
      if (filters.grade_level !== 'all') params.grade_level = filters.grade_level;
      if (filters.branch_id !== 'all') params.branch_id = filters.branch_id;
      if (filters.view_type === 'monthly') {
        params.month = filters.month;
        params.year = filters.year;
      }
      const res = await apiClient.get('/student-points/leaderboard', { params });
      setRows(res.data.leaderboard || []);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));

  return (
    <div>
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Sınıf</Label>
          <Select value={filters.grade_level} onValueChange={(v) => setF('grade_level', v)}>
            <SelectTrigger className="h-10" data-testid="yns-lb-grade"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Sınıflar</SelectItem>
              {GRADES.map(g => <SelectItem key={g} value={g}>{g}. Sınıf</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Branş</Label>
          <Select value={filters.branch_id} onValueChange={(v) => setF('branch_id', v)}>
            <SelectTrigger className="h-10" data-testid="yns-lb-branch"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Branşlar</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Görünüm</Label>
          <Select value={filters.view_type} onValueChange={(v) => setF('view_type', v)}>
            <SelectTrigger className="h-10" data-testid="yns-lb-view"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="season">Dönemlik</SelectItem>
              <SelectItem value="monthly">Aylık</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filters.view_type === 'monthly' && (
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Ay</Label>
            <Select value={filters.month} onValueChange={(v) => setF('month', v)}>
              <SelectTrigger className="h-10" data-testid="yns-lb-month"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS_TR.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="text-center py-10 text-slate-500">Yükleniyor...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-slate-400" data-testid="yns-lb-empty">
          <Trophy size={40} className="mx-auto mb-2 opacity-40" />
          <p>Bu filtreye uygun yıldız kaydı yok</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="yns-leaderboard-list">
          {rows.map((r) => (
            <div
              key={r.student_id}
              data-testid={`yns-lb-row-${r.student_id}`}
              className={`flex items-center gap-3 p-3 rounded-xl border ${rankStyle(r.rank)}`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 ${r.rank <= 3 ? 'bg-white text-slate-800 shadow' : 'bg-slate-100 text-slate-500'}`}>
                {r.rank}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{r.student_name}</p>
                <p className="text-xs text-slate-500">{r.level}. Sınıf</p>
              </div>
              <div className="flex items-center gap-1 text-amber-500 font-bold">
                <Star size={18} className="fill-amber-400" />
                <span className="text-slate-800">{r.total_point}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default YnsLeaderboard;

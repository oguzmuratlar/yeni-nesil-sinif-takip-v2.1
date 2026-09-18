import React, { useState, useEffect } from 'react';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import YnsLeaderboard from '../../components/YnsLeaderboard';
import { Star } from 'lucide-react';

const TeacherYnsLeague = () => {
  const [branches, setBranches] = useState([]);
  const [defaultBranch, setDefaultBranch] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [b, courses] = await Promise.all([
          apiClient.get('/branches'),
          apiClient.get('/student-courses'),
        ]);
        setBranches(b.data);
        // Öğretmenin kendi branşı varsayılan olsun
        const ownBranchIds = [...new Set((courses.data || []).map(c => c.branch_id))];
        if (ownBranchIds.length > 0) setDefaultBranch(ownBranchIds[0]);
      } catch (e) {
        // sessiz
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <TeacherLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Star size={28} className="text-amber-500 fill-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">YNS League</h1>
            <p className="text-sm text-slate-500">Öğrenci yıldız sıralamaları</p>
          </div>
        </div>
        <div className="teacher-card p-4">
          {loading ? (
            <div className="text-center py-10 text-slate-500">Yükleniyor...</div>
          ) : (
            <YnsLeaderboard branches={branches} defaultBranchId={defaultBranch} />
          )}
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherYnsLeague;

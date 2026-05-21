import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { Toaster } from "./components/ui/sonner";
import ProtectedRoute from "./components/ProtectedRoute";
import axios from "axios";

// Pages
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";

// Admin Pages
import AdminStudents from "./pages/admin/AdminStudents";
import AdminStudentForm from "./pages/admin/AdminStudentForm";
import AdminStudentProfile from "./pages/admin/AdminStudentProfile";
import AdminStudentLessons from "./pages/admin/AdminStudentLessons";
import AdminStudentPlannedLessons from "./pages/admin/AdminStudentPlannedLessons";

import AdminTeachers from "./pages/admin/AdminTeachers";
import AdminTeacherForm from "./pages/admin/AdminTeacherForm";
import AdminTeacherProfile from "./pages/admin/AdminTeacherProfile";
import AdminTeacherBalance from "./pages/admin/AdminTeacherBalance";

import AdminPayments from "./pages/admin/AdminPayments";
import AdminMonthlyProgram from "./pages/admin/AdminMonthlyProgram";
import AdminUserForm from "./pages/admin/AdminUserForm";
import AdminBankAccounts from "./pages/admin/AdminBankAccounts";
import AdminBankAccountForm from "./pages/admin/AdminBankAccountForm";
import AdminBranches from "./pages/admin/AdminBranches";
import AdminGroups from "./pages/admin/AdminGroups";
import AdminGroupForm from "./pages/admin/AdminGroupForm";
import AdminGroupLesson from "./pages/admin/AdminGroupLesson";
import AdminCamps from "./pages/admin/AdminCamps";
import AdminCampStudents from "./pages/admin/AdminCampStudents";
import AdminYoutube from "./pages/admin/AdminYoutube";
import AdminCashboxes from "./pages/admin/AdminCashboxes";
import AdminStudentsByBranch from "./pages/admin/AdminStudentsByBranch";
import AdminBadges from "./pages/admin/AdminBadges";
import AdminAuditLogs from "./pages/admin/AdminAuditLogs";
import AdminHomeworkContent from "./pages/admin/AdminHomeworkContent";
import AdminSettings from "./pages/admin/AdminSettings";

// Teacher Pages
import TeacherStudents from "./pages/teacher/TeacherStudents";
import TeacherStudentProfile from "./pages/teacher/TeacherStudentProfile";
import TeacherStudentLessons from "./pages/teacher/TeacherStudentLessons";
import TeacherStudentPlannedLessons from "./pages/teacher/TeacherStudentPlannedLessons";
import TeacherBalance from "./pages/teacher/TeacherBalance";
import TeacherGroupLessons from "./pages/teacher/TeacherGroupLessons";
import TeacherGroupPlannedLessons from "./pages/teacher/TeacherGroupPlannedLessons";
import TeacherSchedule from "./pages/teacher/TeacherSchedule";
import TeacherCamps from "./pages/teacher/TeacherCamps";
import TeacherYoutube from "./pages/teacher/TeacherYoutube";
import TeacherLessonIncomeDetail from "./pages/teacher/TeacherLessonIncomeDetail";
import TeacherCampIncomeDetail from "./pages/teacher/TeacherCampIncomeDetail";
import TeacherYoutubeIncomeDetail from "./pages/teacher/TeacherYoutubeIncomeDetail";
import TeacherHomeworkEntry from "./pages/teacher/TeacherHomeworkEntry";

// Production'da aynı origin kullan, development'ta .env'den al
const getBaseUrl = () => {
  if (typeof window !== 'undefined' && 
      window.location.hostname !== 'localhost' && 
      !window.location.hostname.includes('preview.emergentagent.com')) {
    return window.location.origin;
  }
  return process.env.REACT_APP_BACKEND_URL || '';
};

const BACKEND_URL = getBaseUrl();
const API = `${BACKEND_URL}/api`;

function App() {
  useEffect(() => {
    // Initialize data on first load
    const initData = async () => {
      try {
        await axios.post(`${API}/init-data`);
      } catch (error) {
        console.log("Data initialization:", error.response?.data?.message || "Already initialized");
      }
    };
    initData();
  }, []);

  return (
    <AuthProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/students" element={
              <ProtectedRoute requiredRole="admin">
                <AdminStudents />
              </ProtectedRoute>
            } />
            <Route path="/admin/students/new" element={
              <ProtectedRoute requiredRole="admin">
                <AdminStudentForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/students/:id" element={
              <ProtectedRoute requiredRole="admin">
                <AdminStudentProfile />
              </ProtectedRoute>
            } />
            <Route path="/admin/students/:id/edit" element={
              <ProtectedRoute requiredRole="admin">
                <AdminStudentForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/students/:id/lessons/:courseId" element={
              <ProtectedRoute requiredRole="admin">
                <AdminStudentLessons />
              </ProtectedRoute>
            } />
            <Route path="/admin/students/:id/planned-lessons/:courseId" element={
              <ProtectedRoute requiredRole="admin">
                <AdminStudentPlannedLessons />
              </ProtectedRoute>
            } />

            <Route path="/admin/teachers" element={
              <ProtectedRoute requiredRole="admin">
                <AdminTeachers />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/new" element={
              <ProtectedRoute requiredRole="admin">
                <AdminTeacherForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id" element={
              <ProtectedRoute requiredRole="admin">
                <AdminTeacherProfile />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/edit" element={
              <ProtectedRoute requiredRole="admin">
                <AdminTeacherForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/balance" element={
              <ProtectedRoute requiredRole="admin">
                <AdminTeacherBalance />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/lesson-income" element={
              <ProtectedRoute requiredRole="admin">
                <TeacherLessonIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/camp-income" element={
              <ProtectedRoute requiredRole="admin">
                <TeacherCampIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/youtube-income" element={
              <ProtectedRoute requiredRole="admin">
                <TeacherYoutubeIncomeDetail />
              </ProtectedRoute>
            } />

            <Route path="/admin/payments" element={
              <ProtectedRoute requiredRole="admin">
                <AdminPayments />
              </ProtectedRoute>
            } />
            <Route path="/admin/monthly-program" element={
              <ProtectedRoute requiredRole="admin">
                <AdminMonthlyProgram />
              </ProtectedRoute>
            } />
            <Route path="/admin/users/new" element={
              <ProtectedRoute requiredRole="admin">
                <AdminUserForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/bank-accounts" element={
              <ProtectedRoute requiredRole="admin">
                <AdminBankAccounts />
              </ProtectedRoute>
            } />
            <Route path="/admin/bank-accounts/new" element={
              <ProtectedRoute requiredRole="admin">
                <AdminBankAccountForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/branches" element={
              <ProtectedRoute requiredRole="admin">
                <AdminBranches />
              </ProtectedRoute>
            } />
            <Route path="/admin/groups" element={
              <ProtectedRoute requiredRole="admin">
                <AdminGroups />
              </ProtectedRoute>
            } />
            <Route path="/admin/groups/new" element={
              <ProtectedRoute requiredRole="admin">
                <AdminGroupForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/groups/:id" element={
              <ProtectedRoute requiredRole="admin">
                <AdminGroupForm />
              </ProtectedRoute>
            } />
            <Route path="/admin/groups/:id/lesson" element={
              <ProtectedRoute requiredRole="admin">
                <AdminGroupLesson />
              </ProtectedRoute>
            } />
            <Route path="/admin/camps" element={
              <ProtectedRoute requiredRole="admin">
                <AdminCamps />
              </ProtectedRoute>
            } />
            <Route path="/admin/camps/:campId/students" element={
              <ProtectedRoute requiredRole="admin">
                <AdminCampStudents />
              </ProtectedRoute>
            } />
            <Route path="/admin/youtube" element={
              <ProtectedRoute requiredRole="admin">
                <AdminYoutube />
              </ProtectedRoute>
            } />
            <Route path="/admin/cashboxes" element={
              <ProtectedRoute requiredRole="admin">
                <AdminCashboxes />
              </ProtectedRoute>
            } />
            <Route path="/admin/badges" element={
              <ProtectedRoute requiredRole="admin">
                <AdminBadges />
              </ProtectedRoute>
            } />
            <Route path="/admin/students/branch/:branchId" element={
              <ProtectedRoute requiredRole="admin">
                <AdminStudentsByBranch />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/lesson-income" element={
              <ProtectedRoute requiredRole="admin">
                <TeacherLessonIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/camp-income" element={
              <ProtectedRoute requiredRole="admin">
                <TeacherCampIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/teachers/:id/youtube-income" element={
              <ProtectedRoute requiredRole="admin">
                <TeacherYoutubeIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/audit-logs" element={
              <ProtectedRoute requiredRole="admin">
                <AdminAuditLogs />
              </ProtectedRoute>
            } />
            <Route path="/admin/homework-content" element={
              <ProtectedRoute requiredRole="admin">
                <AdminHomeworkContent />
              </ProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <ProtectedRoute requiredRole="admin">
                <AdminSettings />
              </ProtectedRoute>
            } />

            {/* Teacher Routes */}
            <Route path="/teacher/dashboard" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherDashboard />
              </ProtectedRoute>
            } />
            <Route path="/teacher/students" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherStudents />
              </ProtectedRoute>
            } />
            <Route path="/teacher/students/:id/profile" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherStudentProfile />
              </ProtectedRoute>
            } />
            <Route path="/teacher/students/:id/lessons/:courseId" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherStudentLessons />
              </ProtectedRoute>
            } />
            <Route path="/teacher/students/:id/planned-lessons/:courseId" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherStudentPlannedLessons />
              </ProtectedRoute>
            } />
            <Route path="/teacher/balance" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherBalance />
              </ProtectedRoute>
            } />
            <Route path="/teacher/schedule" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherSchedule />
              </ProtectedRoute>
            } />
            <Route path="/teacher/groups/:groupId/lessons" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherGroupLessons />
              </ProtectedRoute>
            } />
            <Route path="/teacher/groups/:groupId/planned-lessons" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherGroupPlannedLessons />
              </ProtectedRoute>
            } />
            <Route path="/teacher/camps" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherCamps />
              </ProtectedRoute>
            } />
            <Route path="/teacher/youtube" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherYoutube />
              </ProtectedRoute>
            } />
            <Route path="/teacher/lesson-income" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherLessonIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/teacher/camp-income" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherCampIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/teacher/youtube-income" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherYoutubeIncomeDetail />
              </ProtectedRoute>
            } />
            <Route path="/teacher/students/:studentId/homework/:branchId" element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherHomeworkEntry />
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </div>
    </AuthProvider>
  );
}

export default App;

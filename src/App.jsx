import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import NavBar from './components/NavBar'
import { RequireAuth, RequireAdmin } from './components/Guards'
import Login from './pages/Login'
import ExamList from './pages/ExamList'
import ExamTake from './pages/ExamTake'
import ExamDone from './pages/ExamDone'
import AdminDashboard from './pages/AdminDashboard'
import AdminQuestions from './pages/AdminQuestions'
import AdminQuestionEditor from './pages/AdminQuestionEditor'

export default function App() {
  return (
    <BrowserRouter basename="/exam-os">
      <AuthProvider>
        <NavBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><ExamList /></RequireAuth>} />
          <Route path="/exam/:examId" element={<RequireAuth><ExamTake /></RequireAuth>} />
          <Route path="/exam/:examId/done" element={<RequireAuth><ExamDone /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="/admin/questions" element={<RequireAdmin><AdminQuestions /></RequireAdmin>} />
          <Route path="/admin/questions/:examId" element={<RequireAdmin><AdminQuestionEditor /></RequireAdmin>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { ServicesProvider, createServices, type Services } from './di/container';
import { AdminQuizListPage } from './pages/admin/AdminQuizListPage';
import { NewQuizPage, QuizEditorPage } from './pages/admin/QuizEditorPage';
import { QuizResultsPage } from './pages/admin/QuizResultsPage';
import { CatalogPage } from './pages/candidate/CatalogPage';
import { ResultPage } from './pages/candidate/ResultPage';
import { TakeQuizPage } from './pages/candidate/TakeQuizPage';
import { LoginPage } from './pages/LoginPage';
import { QrLoginPage } from './pages/QrLoginPage';
import { CandidatesPage } from './pages/admin/CandidatesPage';

export function App({ services }: { services?: Services }) {
  const resolved = useMemo(() => services ?? createServices(), [services]);

  return (
    <ServicesProvider services={resolved}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/qr" element={<QrLoginPage />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              {/* Candidat */}
              <Route index element={<RequireAuth role="candidate"><CatalogPage /></RequireAuth>} />
              <Route path="attempt/:attemptId" element={<RequireAuth role="candidate"><TakeQuizPage /></RequireAuth>} />
              {/* Partagé : le candidat voit son résultat, l'admin celui de n'importe qui */}
              <Route path="attempt/:attemptId/result" element={<ResultPage />} />
              {/* Administration */}
              <Route path="admin" element={<RequireAuth role="admin"><AdminQuizListPage /></RequireAuth>} />
              <Route path="admin/candidates" element={<RequireAuth role="admin"><CandidatesPage /></RequireAuth>} />
              <Route path="admin/quizzes/new" element={<RequireAuth role="admin"><NewQuizPage /></RequireAuth>} />
              <Route path="admin/quizzes/:quizId" element={<RequireAuth role="admin"><QuizEditorPage /></RequireAuth>} />
              <Route path="admin/quizzes/:quizId/results" element={<RequireAuth role="admin"><QuizResultsPage /></RequireAuth>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ServicesProvider>
  );
}

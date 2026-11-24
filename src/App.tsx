import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import { LoadingBlock } from './components/ui';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Beneficiaries = lazy(() => import('./pages/Beneficiaries'));
const BeneficiaryProfile = lazy(() => import('./pages/BeneficiaryProfile'));
const Churches = lazy(() => import('./pages/Churches'));
const Assistance = lazy(() => import('./pages/Assistance'));
const Loans = lazy(() => import('./pages/Loans'));
const LoanDetail = lazy(() => import('./pages/LoanDetail'));
const Repayments = lazy(() => import('./pages/Repayments'));
const Entitlements = lazy(() => import('./pages/Entitlements'));
const Reports = lazy(() => import('./pages/Reports'));
const Audit = lazy(() => import('./pages/Audit'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Guard() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10"><LoadingBlock /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="p-10"><LoadingBlock /></div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guard />}>
            <Route index element={<Dashboard />} />
            <Route path="beneficiaries" element={<Beneficiaries />} />
            <Route path="beneficiaries/:id" element={<BeneficiaryProfile />} />
            <Route path="churches" element={<Churches />} />
            <Route path="assistance" element={<Assistance />} />
            <Route path="loans" element={<Loans />} />
            <Route path="loans/:id" element={<LoanDetail />} />
            <Route path="repayments" element={<Repayments />} />
            <Route path="entitlements" element={<Entitlements />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit" element={<Audit />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuditPage } from '@/features/audit/AuditPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DocumentDetailPage } from '@/features/documents/DocumentDetailPage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { OrganizationPage } from '@/features/organizations/OrganizationPage';
import { ReviewsPage } from '@/features/reviews/ReviewsPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { OrganizationRole } from '@/types/api';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/organization" element={<OrganizationPage />} />

          <Route
            element={
              <ProtectedRoute
                allowedRoles={[
                  OrganizationRole.Reviewer,
                  OrganizationRole.Admin,
                  OrganizationRole.Owner,
                ]}
              />
            }
          >
            <Route path="/reviews" element={<ReviewsPage />} />
          </Route>

          <Route
            element={
              <ProtectedRoute allowedRoles={[OrganizationRole.Admin, OrganizationRole.Owner]} />
            }
          >
            <Route path="/audit" element={<AuditPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}


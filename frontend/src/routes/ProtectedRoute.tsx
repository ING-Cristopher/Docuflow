import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import type { OrganizationRole } from '@/types/api';
import { Alert } from '@/components/ui/Alert';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: OrganizationRole[] }) {
  const { isAuthenticated, hasRole } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <Alert tone="error" title="Acceso restringido">
          Tu rol actual en esta organización no tiene permisos para acceder a esta sección.
        </Alert>
      </div>
    );
  }

  return <Outlet />;
}


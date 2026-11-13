import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { setStoredSession } from '@/features/auth/sessionStorage';
import { DocumentDetailPage } from '@/features/documents/DocumentDetailPage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { documentsService } from '@/services/documentsService';
import {
  DocumentStatus,
  DocumentType,
  OrganizationRole,
  ValidationSeverity,
  type DocumentDetailDto,
} from '@/types/api';

function renderAuthenticatedPage(initialEntry: string, role: OrganizationRole) {
  setStoredSession({
    accessToken: 'test-token',
    userId: 'user-1',
    email: 'user@acme.com',
    fullName: 'Usuario Prueba',
    organizationId: 'org-1',
    organizationSlug: 'acme',
    role,
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Documents & Review workflows', () => {
  it('hides upload button for Viewer and shows it for Operator', async () => {
    vi.spyOn(documentsService, 'getPaged').mockResolvedValue({
      items: [
        {
          id: 'doc-100',
          title: 'Factura Proveedor Norte',
          documentType: DocumentType.Invoice,
          status: DocumentStatus.PendingReview,
          currentVersionNumber: 1,
          retryCount: 0,
          createdAt: '2026-11-13T10:00:00Z',
          updatedAt: null,
        },
      ],
      page: 1,
      pageSize: 15,
      totalCount: 1,
    });

    const viewerRender = renderAuthenticatedPage('/documents', OrganizationRole.Viewer);
    expect(await screen.findByText('Factura Proveedor Norte')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar documento/i })).not.toBeInTheDocument();
    viewerRender.unmount();

    renderAuthenticatedPage('/documents', OrganizationRole.Operator);
    expect(await screen.findByRole('button', { name: /cargar documento/i })).toBeInTheDocument();
  });

  it('allows Reviewer to correct an extracted field and approve a document', async () => {
    const detail: DocumentDetailDto = {
      id: 'doc-200',
      title: 'Factura Marzo #09',
      documentType: DocumentType.Invoice,
      status: DocumentStatus.PendingReview,
      currentVersionNumber: 1,
      retryCount: 0,
      lastError: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: '2026-11-13T10:00:00Z',
      versions: [
        {
          id: 'ver-1',
          versionNumber: 1,
          originalFileName: 'marzo-09.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          sha256Hash: 'abcdef1234567890abcdef1234567890',
          createdAt: '2026-11-13T10:00:00Z',
        },
      ],
      extractedFields: [
        {
          id: 'field-1',
          fieldName: 'TotalAmount',
          rawValue: '1500.00',
          normalizedValue: '1500.00',
          confidence: 0.72,
          pageNumber: 1,
          boundingBoxJson: null,
          isFinanciallySensitive: true,
          requiresReview: true,
          correctedValue: null,
          isValidated: false,
        },
      ],
      validationIssues: [
        {
          id: 'issue-1',
          ruleCode: 'LOW_CONFIDENCE',
          fieldName: 'TotalAmount',
          severity: ValidationSeverity.Warning,
          message: 'Confianza inferior al umbral del 85%.',
          isResolved: false,
        },
      ],
    };

    vi.spyOn(documentsService, 'getById').mockResolvedValue(detail);
    const correctSpy = vi.spyOn(documentsService, 'correctField').mockResolvedValue({
      ...detail.extractedFields[0]!,
      correctedValue: '1520.00',
      isValidated: true,
      requiresReview: false,
    });
    const approveSpy = vi.spyOn(documentsService, 'approve').mockResolvedValue();

    const user = userEvent.setup();
    renderAuthenticatedPage('/documents/doc-200', OrganizationRole.Reviewer);

    expect(await screen.findByText('Factura Marzo #09')).toBeInTheDocument();
    expect(screen.getByText('TotalAmount')).toBeInTheDocument();
    expect(screen.getByText('72.0%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /corregir/i }));
    const input = screen.getByLabelText(/valor corregido/i);
    await user.clear(input);
    await user.type(input, '1520.00');
    await user.click(screen.getByRole('button', { name: /guardar corrección/i }));

    await waitFor(() => {
      expect(correctSpy).toHaveBeenCalledWith('doc-200', 'field-1', '1520.00');
    });

    await user.click(screen.getByRole('button', { name: /aprobar/i }));
    await user.type(screen.getByLabelText(/notas de aprobación/i), 'Verificado');
    await user.click(screen.getByRole('button', { name: /confirmar aprobación/i }));

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('doc-200', 'Verificado');
    });
  });
});


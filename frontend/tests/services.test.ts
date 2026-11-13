import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  getStoredSession,
  registerUnauthorizedHandler,
  setStoredSession,
} from '@/features/auth/sessionStorage';
import { getApiErrorMessage } from '@/lib/errors';
import { apiClient } from '@/services/apiClient';
import { documentsService } from '@/services/documentsService';
import { DocumentType, OrganizationRole } from '@/types/api';

describe('HTTP client & services integration', () => {
  it('attaches Bearer token from active session and sends multipart FormData on upload', async () => {
    setStoredSession({
      accessToken: 'secret-jwt-123',
      userId: 'u1',
      email: 'op@acme.com',
      fullName: 'Operador',
      organizationId: 'org1',
      organizationSlug: 'acme',
      role: OrganizationRole.Operator,
    });

    const capturedConfigs: InternalAxiosRequestConfig[] = [];
    const originalAdapter = apiClient.defaults.adapter;

    const mockAdapter: AxiosAdapter = async (config) => {
      capturedConfigs.push(config);
      return {
        data: {
          id: 'doc-1',
          title: 'Factura Abril',
          documentType: DocumentType.Invoice,
          status: 2,
          currentVersionNumber: 1,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: null,
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    };

    apiClient.defaults.adapter = mockAdapter;
    try {
      const file = new File(['%PDF-1.4'], 'abril.pdf', { type: 'application/pdf' });
      const created = await documentsService.upload({
        title: 'Factura Abril',
        documentType: DocumentType.Invoice,
        file,
      });

      expect(created.id).toBe('doc-1');
      expect(capturedConfigs[0]?.headers?.Authorization).toBe('Bearer secret-jwt-123');
      expect(capturedConfigs[0]?.data).toBeInstanceOf(FormData);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('clears session and notifies handler on 401 Unauthorized from protected endpoints', async () => {
    setStoredSession({
      accessToken: 'expired-jwt',
      userId: 'u1',
      email: 'op@acme.com',
      fullName: 'Operador',
      organizationId: 'org1',
      organizationSlug: 'acme',
      role: OrganizationRole.Operator,
    });

    const onUnauthorized = vi.fn();
    const unregister = registerUnauthorizedHandler(onUnauthorized);
    const originalAdapter = apiClient.defaults.adapter;

    apiClient.defaults.adapter = async (config) => {
      const error = {
        isAxiosError: true,
        config,
        response: {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
          data: { title: 'Auth.Unauthenticated', detail: 'Token expired.' },
        },
      };
      return Promise.reject(error);
    };

    try {
      await expect(documentsService.getPaged()).rejects.toBeTruthy();
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(getStoredSession()).toBeNull();
    } finally {
      unregister();
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('extracts backend ProblemDetails detail message', () => {
    const message = getApiErrorMessage({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          status: 403,
          title: 'Auth.InsufficientPermissions',
          detail: 'Only organization owners can assign the Owner role.',
        },
      },
    });
    expect(message).toBe('Only organization owners can assign the Owner role.');
  });
});

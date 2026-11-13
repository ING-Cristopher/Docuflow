import { apiClient } from '@/services/apiClient';
import type { AuditLogDto, PagedResult } from '@/types/api';

export interface GetAuditLogsParams {
  page?: number;
  pageSize?: number;
  action?: string;
}

export const auditService = {
  async getPaged(params: GetAuditLogsParams = {}): Promise<PagedResult<AuditLogDto>> {
    const { data } = await apiClient.get<PagedResult<AuditLogDto>>('/api/audit-logs', {
      params: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
        ...(params.action && params.action.trim().length > 0 ? { action: params.action.trim() } : {}),
      },
    });
    return data;
  },
};


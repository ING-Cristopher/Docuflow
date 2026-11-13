import { apiClient } from '@/services/apiClient';
import type {
  DocumentDetailDto,
  DocumentStatus,
  DocumentSummaryDto,
  DocumentType,
  ExtractedFieldDto,
  PagedResult,
} from '@/types/api';

export interface GetDocumentsParams {
  page?: number;
  pageSize?: number;
  status?: DocumentStatus;
  documentType?: DocumentType;
  search?: string;
}

export interface UploadDocumentPayload {
  title: string;
  documentType: DocumentType;
  file: File;
}

export const documentsService = {
  async getPaged(params: GetDocumentsParams = {}): Promise<PagedResult<DocumentSummaryDto>> {
    const { data } = await apiClient.get<PagedResult<DocumentSummaryDto>>('/api/documents', {
      params: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        ...(params.status !== undefined ? { status: params.status } : {}),
        ...(params.documentType !== undefined ? { documentType: params.documentType } : {}),
        ...(params.search && params.search.trim().length > 0 ? { search: params.search.trim() } : {}),
      },
    });
    return data;
  },

  async getById(id: string): Promise<DocumentDetailDto> {
    const { data } = await apiClient.get<DocumentDetailDto>(`/api/documents/${id}`);
    return data;
  },

  async upload(payload: UploadDocumentPayload): Promise<DocumentSummaryDto> {
    const formData = new FormData();
    formData.append('title', payload.title.trim());
    formData.append('documentType', String(payload.documentType));
    formData.append('file', payload.file);

    const { data } = await apiClient.post<DocumentSummaryDto>('/api/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async download(id: string): Promise<{ blob: Blob; fileName: string }> {
    const response = await apiClient.get<Blob>(`/api/documents/${id}/download`, {
      responseType: 'blob',
    });

    const disposition = response.headers['content-disposition'] as string | undefined;
    let fileName = `document-${id}`;
    if (disposition) {
      const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const basicMatch = /filename="?([^";]+)"?/i.exec(disposition);
      const rawName = utf8Match?.[1] ?? basicMatch?.[1];
      if (rawName) {
        fileName = decodeURIComponent(rawName);
      }
    }

    return { blob: response.data, fileName };
  },

  async correctField(documentId: string, fieldId: string, correctedValue: string): Promise<ExtractedFieldDto> {
    const { data } = await apiClient.patch<ExtractedFieldDto>(
      `/api/documents/${documentId}/fields/${fieldId}`,
      { correctedValue },
    );
    return data;
  },

  async approve(documentId: string, notes?: string): Promise<void> {
    await apiClient.post(`/api/documents/${documentId}/approve`, {
      notes: notes && notes.trim().length > 0 ? notes.trim() : null,
    });
  },

  async reject(documentId: string, reason: string): Promise<void> {
    await apiClient.post(`/api/documents/${documentId}/reject`, {
      reason: reason.trim(),
    });
  },
};


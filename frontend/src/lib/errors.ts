import axios from 'axios';
import type { ProblemDetails } from '@/types/api';

export function getApiErrorMessage(error: unknown, fallback = 'Ocurrió un error inesperado.'): string {
  if (axios.isAxiosError<ProblemDetails>(error)) {
    const data = error.response?.data;
    if (data && typeof data === 'object') {
      if (data.detail && data.detail.trim().length > 0) {
        return data.detail;
      }
      if (data.title && data.title.trim().length > 0) {
        return data.title;
      }
    }
    if (error.response?.status === 401) {
      return 'Tu sesión ha expirado o no es válida. Inicia sesión nuevamente.';
    }
    if (error.response?.status === 403) {
      return 'No tienes permisos suficientes para realizar esta acción.';
    }
    if (error.response?.status === 413) {
      return 'El archivo supera el tamaño máximo permitido (25 MB).';
    }
    if (!error.response) {
      return 'No se pudo conectar con el servidor de DocuFlow AI.';
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}


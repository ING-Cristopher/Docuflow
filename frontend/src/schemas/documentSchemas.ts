import { z } from 'zod';
import { DocumentType } from '@/types/api';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
] as const;

const ALLOWED_EXTENSIONS_BY_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/tiff': ['.tif', '.tiff'],
};

export function validateUploadFile(file: File | undefined): string | null {
  if (!file) {
    return 'Debes seleccionar un archivo.';
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return 'El tamaño del archivo debe estar entre 1 byte y 25 MB.';
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return 'Tipo de archivo no soportado. Usa PDF, PNG, JPEG o TIFF.';
  }
  const dotIdx = file.name.lastIndexOf('.');
  const ext = dotIdx >= 0 ? file.name.slice(dotIdx).toLowerCase() : '';
  const allowedExts = ALLOWED_EXTENSIONS_BY_MIME[file.type] ?? [];
  if (!ext || !allowedExts.includes(ext)) {
    return `La extensión "${ext || 'sin extensión'}" no coincide con el tipo ${file.type}.`;
  }
  return null;
}

export const uploadDocumentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'El título debe tener al menos 2 caracteres.')
    .max(200, 'El título no puede superar los 200 caracteres.'),
  documentType: z.nativeEnum(DocumentType),
});

export type UploadDocumentFormValues = z.infer<typeof uploadDocumentSchema>;

export const correctFieldSchema = z.object({
  correctedValue: z.string().trim().min(1, 'El valor corregido no puede estar vacío.'),
});

export type CorrectFieldFormValues = z.infer<typeof correctFieldSchema>;

export const approveDocumentSchema = z.object({
  notes: z.string().trim().max(1000, 'Las notas no pueden superar 1000 caracteres.').optional(),
});

export type ApproveDocumentFormValues = z.infer<typeof approveDocumentSchema>;

export const rejectDocumentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Indica un motivo de rechazo de al menos 5 caracteres.')
    .max(1000, 'El motivo no puede superar 1000 caracteres.'),
});

export type RejectDocumentFormValues = z.infer<typeof rejectDocumentSchema>;


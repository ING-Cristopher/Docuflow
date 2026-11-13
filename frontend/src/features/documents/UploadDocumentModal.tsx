import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UploadCloud } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { getApiErrorMessage } from '@/lib/errors';
import { documentTypeLabels } from '@/lib/formatters';
import {
  uploadDocumentSchema,
  validateUploadFile,
  type UploadDocumentFormValues,
} from '@/schemas/documentSchemas';
import { documentsService } from '@/services/documentsService';
import { DocumentType } from '@/types/api';

interface UploadDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded?: (documentId: string) => void;
}

export function UploadDocumentModal({ open, onClose, onUploaded }: UploadDocumentModalProps) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UploadDocumentFormValues>({
    resolver: zodResolver(uploadDocumentSchema),
    defaultValues: {
      title: '',
      documentType: DocumentType.Invoice,
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (payload: { title: string; documentType: DocumentType; file: File }) =>
      documentsService.upload(payload),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      reset();
      setSelectedFile(undefined);
      setFileError(null);
      setServerError(null);
      onClose();
      onUploaded?.(created.id);
    },
    onError: (err) => {
      setServerError(getApiErrorMessage(err, 'No se pudo cargar el documento.'));
    },
  });

  const handleClose = () => {
    if (uploadMutation.isPending) return;
    setFileError(null);
    setServerError(null);
    onClose();
  };

  const onSubmit = (values: UploadDocumentFormValues) => {
    setServerError(null);
    const validationErr = validateUploadFile(selectedFile);
    if (validationErr || !selectedFile) {
      setFileError(validationErr ?? 'Debes seleccionar un archivo válido.');
      return;
    }
    setFileError(null);
    uploadMutation.mutate({
      title: values.title,
      documentType: values.documentType,
      file: selectedFile,
    });
  };

  const selectableTypes = [
    DocumentType.Invoice,
    DocumentType.PurchaseOrder,
    DocumentType.Contract,
    DocumentType.Receipt,
    DocumentType.Other,
    DocumentType.Unknown,
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cargar documento"
      description="Formatos permitidos: PDF, PNG, JPEG y TIFF (máximo 25 MB)."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError ? <Alert tone="error">{serverError}</Alert> : null}

        <div>
          <label htmlFor="upload-title" className="block text-sm font-medium text-slate-700">
            Título del documento
          </label>
          <input
            id="upload-title"
            type="text"
            {...register('title')}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            placeholder="Factura proveedor ACME #2026-014"
          />
          {errors.title ? <p className="mt-1 text-xs text-rose-600">{errors.title.message}</p> : null}
        </div>

        <div>
          <label htmlFor="upload-type" className="block text-sm font-medium text-slate-700">
            Tipo de documento
          </label>
          <select
            id="upload-type"
            {...register('documentType', { valueAsNumber: true })}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          >
            {selectableTypes.map((typeValue) => (
              <option key={typeValue} value={typeValue}>
                {documentTypeLabels[typeValue]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="upload-file" className="block text-sm font-medium text-slate-700">
            Archivo
          </label>
          <input
            id="upload-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,application/pdf,image/png,image/jpeg,image/tiff"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setSelectedFile(file);
              setFileError(file ? validateUploadFile(file) : null);
            }}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
          />
          {fileError ? <p className="mt-1 text-xs text-rose-600">{fileError}</p> : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={uploadMutation.isPending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            isLoading={uploadMutation.isPending}
            leftIcon={<UploadCloud className="h-4 w-4" aria-hidden="true" />}
          >
            Subir y encolar
          </Button>
        </div>
      </form>
    </Modal>
  );
}


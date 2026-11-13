import { describe, expect, it } from 'vitest';
import { loginSchema, registerOrganizationSchema } from '@/schemas/authSchemas';
import {
  MAX_FILE_SIZE_BYTES,
  rejectDocumentSchema,
  validateUploadFile,
} from '@/schemas/documentSchemas';

describe('Zod schemas and file validation', () => {
  it('validates login email and password', () => {
    expect(loginSchema.safeParse({ email: 'bad-email', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'user@acme.com', password: 'Password123!' }).success).toBe(
      true,
    );
  });

  it('rejects invalid organization slug on registration', () => {
    const result = registerOrganizationSchema.safeParse({
      organizationName: 'Acme Corp',
      organizationSlug: 'Acme Corp!',
      fullName: 'Ana Pérez',
      email: 'ana@acme.com',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('validates allowed PDF file and rejects extension mismatch or oversize files', () => {
    const validPdf = new File(['%PDF-1.4 test'], 'factura.pdf', { type: 'application/pdf' });
    expect(validateUploadFile(validPdf)).toBeNull();

    const mismatch = new File(['%PDF-1.4'], 'factura.exe', { type: 'application/pdf' });
    expect(validateUploadFile(mismatch)).toContain('extensión');

    const unsupported = new File(['hello'], 'script.js', { type: 'application/javascript' });
    expect(validateUploadFile(unsupported)).toContain('no soportado');

    const tooBig = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(tooBig, 'size', { value: MAX_FILE_SIZE_BYTES + 1 });
    expect(validateUploadFile(tooBig)).toContain('25 MB');
  });

  it('requires at least 5 characters for document rejection reason', () => {
    expect(rejectDocumentSchema.safeParse({ reason: 'mal' }).success).toBe(false);
    expect(
      rejectDocumentSchema.safeParse({ reason: 'El importe total no coincide.' }).success,
    ).toBe(true);
  });
});


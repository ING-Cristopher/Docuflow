import { z } from 'zod';
import { OrganizationRole } from '@/types/api';

export const loginSchema = z.object({
  email: z.string().trim().email('Ingresa un correo electrónico válido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.'),
  organizationSlug: z.string().trim().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerOrganizationSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, 'El nombre de la organización debe tener al menos 2 caracteres.')
    .max(120, 'El nombre de la organización es demasiado largo.'),
  organizationSlug: z
    .string()
    .trim()
    .min(2, 'El identificador (slug) debe tener al menos 2 caracteres.')
    .max(60, 'El slug no debe superar los 60 caracteres.')
    .regex(/^[a-z0-9-]+$/, 'Usa solo minúsculas, números y guiones.'),
  fullName: z
    .string()
    .trim()
    .min(2, 'El nombre completo debe tener al menos 2 caracteres.')
    .max(120, 'El nombre completo es demasiado largo.'),
  email: z.string().trim().email('Ingresa un correo electrónico válido.'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(128, 'La contraseña es demasiado larga.'),
});

export type RegisterOrganizationFormValues = z.infer<typeof registerOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Ingresa un correo electrónico válido.'),
  fullName: z.string().trim().min(2, 'El nombre completo es obligatorio.'),
  temporaryPassword: z
    .string()
    .min(8, 'La contraseña temporal debe tener al menos 8 caracteres.'),
  role: z.nativeEnum(OrganizationRole, {
    errorMap: () => ({ message: 'Selecciona un rol válido.' }),
  }),
});

export type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;


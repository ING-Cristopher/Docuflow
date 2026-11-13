import { apiClient } from '@/services/apiClient';
import type {
  AuthResponse,
  InviteMemberRequest,
  LoginRequest,
  RegisterOrganizationRequest,
  UserMembershipDto,
} from '@/types/api';

export const authService = {
  async register(payload: RegisterOrganizationRequest): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/register', payload);
    return data;
  },

  async login(payload: LoginRequest): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/login', payload);
    return data;
  },

  async getMyMemberships(): Promise<UserMembershipDto[]> {
    const { data } = await apiClient.get<UserMembershipDto[]>('/api/auth/memberships');
    return data;
  },

  async switchOrganization(organizationId: string): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/switch-organization', {
      organizationId,
    });
    return data;
  },

  async inviteMember(payload: InviteMemberRequest): Promise<UserMembershipDto> {
    const { data } = await apiClient.post<UserMembershipDto>('/api/auth/members', payload);
    return data;
  },
};


import { expect, test } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:5029';
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:5174';

function createValidPdfBuffer(label: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% DocuFlow E2E ${label}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`,
    'utf-8',
  );
}

test.describe('DocuFlow AI — Real Stack E2E (API + Worker + SQL Server + Azurite + Frontend HTTP)', () => {
  test('Frontend is reachable and API /health reports SQL Server connected', async ({ request }) => {
    const feRes = await request.get(FRONTEND_URL);
    expect(feRes.status()).toBe(200);
    const html = await feRes.text();
    expect(html).toContain('DocuFlow AI');

    const healthRes = await request.get(`${API_URL}/health`);
    expect(healthRes.status()).toBe(200);
    const health = (await healthRes.json()) as { status: string; database: string };
    expect(health).toEqual({ status: 'healthy', database: 'connected' });
  });

  test('Full functional & security flows against real API, Worker, SQL Server and Azurite', async ({
    request,
  }) => {
    const ts = Date.now();
    const ownerEmail = `e2e-owner-${ts}@docuflow.local`;
    const password = 'E2E_Password_123!';

    // 1. Register Organization A
    const regA = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        organizationName: `E2E Org A ${ts}`,
        organizationSlug: `e2e-a-${ts}`,
        fullName: 'E2E Owner',
        email: ownerEmail,
        password,
      },
    });
    expect(regA.status()).toBe(201);

    // 2. Login
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: ownerEmail, password },
    });
    expect(loginRes.status()).toBe(200);
    const authA = (await loginRes.json()) as { accessToken: string; organizationId: string };

    // 3. Upload valid PDF -> Queued
    const upload1 = await request.post(`${API_URL}/api/documents`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
      multipart: {
        title: `Factura E2E Approve ${ts}`,
        documentType: '1',
        file: {
          name: 'e2e-approve.pdf',
          mimeType: 'application/pdf',
          buffer: createValidPdfBuffer('Approve'),
        },
      },
    });
    expect(upload1.status()).toBe(201);
    const doc1 = (await upload1.json()) as { id: string; status: number };

    // 4. Download from real Azurite & verify PDF header
    const dlRes = await request.get(`${API_URL}/api/documents/${doc1.id}/download`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
    });
    expect(dlRes.status()).toBe(200);
    const dlBody = await dlRes.body();
    expect(dlBody.toString('utf-8')).toContain('%PDF-1.4');

    // 5. Wait for real Worker to process document -> PendingReview (5) with ExtractedFields
    let detail1: {
      status: number;
      extractedFields: Array<{ id: string; fieldName: string; correctedValue: string | null }>;
    } | null = null;
    await expect(async () => {
      const res = await request.get(`${API_URL}/api/documents/${doc1.id}`, {
        headers: { Authorization: `Bearer ${authA.accessToken}` },
      });
      expect(res.status()).toBe(200);
      detail1 = (await res.json()) as typeof detail1;
      expect(detail1?.status).toBe(5); // PendingReview
      expect(detail1?.extractedFields.length).toBeGreaterThan(0);
    }).toPass({ timeout: 35_000, intervals: [1_500] });

    // 6. Correct an extracted field
    const firstFieldId = detail1!.extractedFields[0]!.id;
    const patchRes = await request.patch(
      `${API_URL}/api/documents/${doc1.id}/fields/${firstFieldId}`,
      {
        headers: { Authorization: `Bearer ${authA.accessToken}` },
        data: { correctedValue: '1234.56' },
      },
    );
    expect(patchRes.status()).toBe(200);
    const patchedField = (await patchRes.json()) as { correctedValue: string; isValidated: boolean };
    expect(patchedField.correctedValue).toBe('1234.56');
    expect(patchedField.isValidated).toBe(true);

    // 7. Approve document -> Approved (6)
    const approveRes = await request.post(`${API_URL}/api/documents/${doc1.id}/approve`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
      data: { notes: 'Aprobado en prueba E2E real' },
    });
    expect(approveRes.status()).toBe(204);

    // 8. Upload second PDF, wait for Worker, and Reject -> Rejected (7)
    const upload2 = await request.post(`${API_URL}/api/documents`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
      multipart: {
        title: `Factura E2E Reject ${ts}`,
        documentType: '1',
        file: {
          name: 'e2e-reject.pdf',
          mimeType: 'application/pdf',
          buffer: createValidPdfBuffer('Reject'),
        },
      },
    });
    expect(upload2.status()).toBe(201);
    const doc2Id = ((await upload2.json()) as { id: string }).id;

    await expect(async () => {
      const res = await request.get(`${API_URL}/api/documents/${doc2Id}`, {
        headers: { Authorization: `Bearer ${authA.accessToken}` },
      });
      const body = (await res.json()) as { status: number };
      expect(body.status).toBe(5);
    }).toPass({ timeout: 35_000, intervals: [1_500] });

    const rejectRes = await request.post(`${API_URL}/api/documents/${doc2Id}/reject`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
      data: { reason: 'Importe inconsistente en prueba E2E' },
    });
    expect(rejectRes.status()).toBe(204);

    // 9. Audit logs
    const auditRes = await request.get(`${API_URL}/api/audit-logs?action=DocumentApproved`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
    });
    expect(auditRes.status()).toBe(200);
    const auditPage = (await auditRes.json()) as { totalCount: number; items: Array<{ action: string }> };
    expect(auditPage.totalCount).toBeGreaterThan(0);
    expect(auditPage.items[0]?.action).toBe('DocumentApproved');

    // 10. Switch organization + Cross-tenant isolation
    const regB = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        organizationName: `E2E Org B ${ts}`,
        organizationSlug: `e2e-b-${ts}`,
        fullName: 'E2E Org B Owner',
        email: `e2e-b-${ts}@docuflow.local`,
        password,
      },
    });
    expect(regB.status()).toBe(201);
    const authB = (await regB.json()) as { accessToken: string; organizationId: string };

    await request.post(`${API_URL}/api/auth/members`, {
      headers: { Authorization: `Bearer ${authB.accessToken}` },
      data: { email: ownerEmail, fullName: 'E2E Owner', temporaryPassword: password, role: 1 },
    });

    const switchRes = await request.post(`${API_URL}/api/auth/switch-organization`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
      data: { organizationId: authB.organizationId },
    });
    expect(switchRes.status()).toBe(200);
    const switchedAuth = (await switchRes.json()) as { accessToken: string; organizationId: string };
    expect(switchedAuth.organizationId).toBe(authB.organizationId);

    // Cross-tenant isolation: switched to Org B cannot read or download Org A's doc
    const crossGet = await request.get(`${API_URL}/api/documents/${doc1.id}`, {
      headers: { Authorization: `Bearer ${switchedAuth.accessToken}` },
    });
    expect(crossGet.status()).toBe(404);

    const crossDl = await request.get(`${API_URL}/api/documents/${doc1.id}/download`, {
      headers: { Authorization: `Bearer ${switchedAuth.accessToken}` },
    });
    expect(crossDl.status()).toBe(404);

    // 11. Security: unauthenticated 401, tampered ID 404, Reviewer RBAC 403
    const unauthDl = await request.get(`${API_URL}/api/documents/${doc1.id}/download`);
    expect(unauthDl.status()).toBe(401);

    const tamperedGet = await request.get(
      `${API_URL}/api/documents/00000000-0000-0000-0000-000000000999`,
      { headers: { Authorization: `Bearer ${authA.accessToken}` } },
    );
    expect(tamperedGet.status()).toBe(404);

    const reviewerEmail = `e2e-reviewer-${ts}@docuflow.local`;
    const inviteReviewer = await request.post(`${API_URL}/api/auth/members`, {
      headers: { Authorization: `Bearer ${authA.accessToken}` },
      data: { email: reviewerEmail, fullName: 'E2E Reviewer', temporaryPassword: password, role: 2 },
    });
    expect(inviteReviewer.status()).toBe(201);

    const reviewerLogin = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: reviewerEmail, password },
    });
    expect(reviewerLogin.status()).toBe(200);
    const reviewerToken = ((await reviewerLogin.json()) as { accessToken: string }).accessToken;

    const forbiddenAudit = await request.get(`${API_URL}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });
    expect(forbiddenAudit.status()).toBe(403);
  });
});

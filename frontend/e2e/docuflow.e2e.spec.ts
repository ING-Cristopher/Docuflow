import { expect, test } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:5029';

function createValidPdfBuffer(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% DocuFlow E2E ${label}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`, 'utf-8');
}

test.describe('DocuFlow AI — E2E Real Full-Stack Validation', () => {
  test('1-12. Full functional workflow: auth, dashboard, upload PDF, Worker AI processing, field correction, approve/reject, audit, org switch & logout', async ({
    page,
    request,
  }) => {
    const uniqueSuffix = Date.now();
    const orgASlug = `e2e-org-a-${uniqueSuffix}`;
    const orgBSlug = `e2e-org-b-${uniqueSuffix}`;
    const ownerEmail = `owner-${uniqueSuffix}@e2e.local`;
    const password = 'E2E_Password_123!';

    // 1. Register Organization A via UI
    await page.goto('/register');
    await page.getByLabel(/nombre de la empresa/i).fill(`Empresa E2E A ${uniqueSuffix}`);
    await page.getByLabel(/slug de organización/i).fill(orgASlug);
    await page.getByLabel(/nombre completo/i).fill('Laura E2E');
    await page.getByLabel(/correo electrónico corporativo/i).fill(ownerEmail);
    await page.getByLabel(/^contraseña$/i).fill(password);
    await page.getByRole('button', { name: /crear organización y entrar/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/API:\s*Conectada/i)).toBeVisible();

    // 2. Logout and Login again via UI
    await page.getByRole('button', { name: /cerrar sesión/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel(/correo electrónico/i).fill(ownerEmail);
    await page.getByLabel(/contraseña/i).fill(password);
    await page.getByRole('button', { name: /entrar a docuflow ai/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // 3-5. Navigate to Documents & Upload a valid PDF
    await page.getByRole('link', { name: /documentos/i }).click();
    await expect(page).toHaveURL(/\/documents$/);

    await page.getByRole('button', { name: /cargar documento/i }).click();
    const doc1Title = `Factura E2E Aprobada ${uniqueSuffix}`;
    await page.getByLabel(/título del documento/i).fill(doc1Title);
    await page.getByLabel(/archivo/i).setInputFiles({
      name: 'factura-e2e-1.pdf',
      mimeType: 'application/pdf',
      buffer: createValidPdfBuffer('ApproveFlow'),
    });
    await page.getByRole('button', { name: /subir y encolar/i }).click();

    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/i);
    const doc1Url = page.url();
    const doc1Id = doc1Url.split('/').pop()!;
    await expect(page.getByRole('heading', { name: doc1Title })).toBeVisible();

    // 6. Verify real Azurite storage via authorized download
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /descargar archivo/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('factura-e2e-1.pdf');

    // 7-8. Wait for real Worker to process queued PDF -> PendingReview with ExtractedFields
    await expect(async () => {
      await page.reload();
      await expect(page.getByText('Pendiente de revisión')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 35_000, intervals: [2_000] });

    await expect(page.getByText('Campos extraídos por IA')).toBeVisible();
    await expect(page.getByRole('button', { name: /corregir/i }).first()).toBeVisible();

    // 9. Correct an extracted field
    await page.getByRole('button', { name: /corregir/i }).first().click();
    const correctedInput = page.getByLabel(/valor corregido/i);
    await correctedInput.fill('999.99');
    await page.getByRole('button', { name: /guardar corrección/i }).click();
    await expect(page.getByText(/campo corregido y marcado como validado/i)).toBeVisible();
    await expect(page.getByText('999.99')).toBeVisible();

    // 10a. Approve document
    await page.getByRole('button', { name: /^aprobar$/i }).click();
    await page.getByLabel(/notas de aprobación/i).fill('Aprobado en prueba E2E');
    await page.getByRole('button', { name: /confirmar aprobación/i }).click();
    await expect(page.getByText(/documento aprobado correctamente/i)).toBeVisible();
    await expect(page.getByText('Aprobado', { exact: true }).first()).toBeVisible();

    // 10b. Upload a second PDF, wait for Worker, and Reject with reason
    await page.getByRole('link', { name: /documentos/i }).click();
    await page.getByRole('button', { name: /cargar documento/i }).click();
    const doc2Title = `Factura E2E Rechazada ${uniqueSuffix}`;
    await page.getByLabel(/título del documento/i).fill(doc2Title);
    await page.getByLabel(/archivo/i).setInputFiles({
      name: 'factura-e2e-2.pdf',
      mimeType: 'application/pdf',
      buffer: createValidPdfBuffer('RejectFlow'),
    });
    await page.getByRole('button', { name: /subir y encolar/i }).click();
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/i);

    await expect(async () => {
      await page.reload();
      await expect(page.getByText('Pendiente de revisión')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 35_000, intervals: [2_000] });

    await page.getByRole('button', { name: /^rechazar$/i }).click();
    await page.getByLabel(/motivo del rechazo/i).fill('Importe no coincide con orden de compra E2E.');
    await page.getByRole('button', { name: /confirmar rechazo/i }).click();
    await expect(page.getByText(/documento rechazado correctamente/i)).toBeVisible();
    await expect(page.getByText('Rechazado', { exact: true }).first()).toBeVisible();

    // 11. Audit logs verification
    await page.getByRole('link', { name: /auditoría/i }).click();
    await expect(page).toHaveURL(/\/audit$/);
    await page.getByLabel(/filtrar por acción/i).fill('DocumentApproved');
    await page.getByRole('button', { name: /filtrar/i }).click();
    await expect(page.getByText('DocumentApproved').first()).toBeVisible();

    // 12. Switch organization (create Org B with same ownerEmail via API, then switch in UI)
    const orgBRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        organizationName: `Empresa E2E B ${uniqueSuffix}`,
        organizationSlug: orgBSlug,
        fullName: 'Laura E2E',
        email: `other-${uniqueSuffix}@e2e.local`,
        password,
      },
    });
    expect(orgBRes.status()).toBe(201);
    const orgBAuth = (await orgBRes.json()) as { accessToken: string; organizationId: string };

    // Invite ownerEmail into Org B as Viewer
    const inviteRes = await request.post(`${API_URL}/api/auth/members`, {
      headers: { Authorization: `Bearer ${orgBAuth.accessToken}` },
      data: {
        email: ownerEmail,
        fullName: 'Laura E2E',
        temporaryPassword: password,
        role: 1, // Viewer
      },
    });
    expect(inviteRes.status()).toBe(201);

    await page.getByRole('link', { name: /organización/i }).click();
    await expect(page).toHaveURL(/\/organization$/);
    await expect(page.getByText(orgBSlug)).toBeVisible();
    await page.getByRole('button', { name: /cambiar organización/i }).first().click();
    await expect(page.getByText(orgBSlug).first()).toBeVisible();

    // Cross-tenant UI/API check: Org B cannot see Org A's document
    await page.goto(`/documents/${doc1Id}`);
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('Security: private routes, RBAC 403, tampered IDs 404, cross-tenant isolation, 401 session expiration, unauthorized download URLs', async ({
    page,
    request,
  }) => {
    // 1. Unauthenticated route redirect
    await page.goto('/documents');
    await expect(page).toHaveURL(/\/login$/);

    // 2. Unauthorized direct download URL without token -> 401
    const unauthDownload = await request.get(
      `${API_URL}/api/documents/00000000-0000-0000-0000-000000000001/download`,
    );
    expect(unauthDownload.status()).toBe(401);

    // 3. Register a fresh org and invite a Reviewer to check RBAC 403 on admin endpoints
    const rbacTs = Date.now();
    const rbacOwnerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        organizationName: `RBAC Org ${rbacTs}`,
        organizationSlug: `rbac-org-${rbacTs}`,
        fullName: 'RBAC Owner',
        email: `rbac-owner-${rbacTs}@e2e.local`,
        password: 'E2E_Password_123!',
      },
    });
    expect(rbacOwnerRes.status()).toBe(201);
    const rbacOwnerToken = ((await rbacOwnerRes.json()) as { accessToken: string }).accessToken;

    const rbacReviewerEmail = `rbac-reviewer-${rbacTs}@e2e.local`;
    const inviteRev = await request.post(`${API_URL}/api/auth/members`, {
      headers: { Authorization: `Bearer ${rbacOwnerToken}` },
      data: {
        email: rbacReviewerEmail,
        fullName: 'RBAC Reviewer',
        temporaryPassword: 'E2E_Password_123!',
        role: 2,
      },
    });
    expect(inviteRev.status()).toBe(201);

    const reviewerLogin = await request.post(`${API_URL}/api/auth/login`, {
      data: {
        email: rbacReviewerEmail,
        password: 'E2E_Password_123!',
      },
    });
    expect(reviewerLogin.status()).toBe(200);
    const reviewerAuth = (await reviewerLogin.json()) as { accessToken: string };

    const forbiddenAudit = await request.get(`${API_URL}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${reviewerAuth.accessToken}` },
    });
    expect(forbiddenAudit.status()).toBe(403);

    // 4. Tampered/non-existent document ID -> 404
    const notFoundDoc = await request.get(
      `${API_URL}/api/documents/00000000-0000-0000-0000-000000000999`,
      {
        headers: { Authorization: `Bearer ${reviewerAuth.accessToken}` },
      },
    );
    expect(notFoundDoc.status()).toBe(404);

    // 5. Cross-tenant isolation between two newly registered orgs
    const ts = Date.now();
    const org1Res = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        organizationName: `Sec Org 1 ${ts}`,
        organizationSlug: `sec-org-1-${ts}`,
        fullName: 'Sec User 1',
        email: `sec1-${ts}@e2e.local`,
        password: 'E2E_Password_123!',
      },
    });
    expect(org1Res.status()).toBe(201);
    const org1Token = ((await org1Res.json()) as { accessToken: string }).accessToken;

    const uploadRes = await request.post(`${API_URL}/api/documents`, {
      headers: { Authorization: `Bearer ${org1Token}` },
      multipart: {
        title: 'Documento Secreto Org 1',
        documentType: '1',
        file: {
          name: 'secret.pdf',
          mimeType: 'application/pdf',
          buffer: createValidPdfBuffer('Tenant1Secret'),
        },
      },
    });
    expect(uploadRes.status()).toBe(201);
    const org1DocId = ((await uploadRes.json()) as { id: string }).id;

    const org2Res = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        organizationName: `Sec Org 2 ${ts}`,
        organizationSlug: `sec-org-2-${ts}`,
        fullName: 'Sec User 2',
        email: `sec2-${ts}@e2e.local`,
        password: 'E2E_Password_123!',
      },
    });
    expect(org2Res.status()).toBe(201);
    const org2Token = ((await org2Res.json()) as { accessToken: string }).accessToken;

    const crossRead = await request.get(`${API_URL}/api/documents/${org1DocId}`, {
      headers: { Authorization: `Bearer ${org2Token}` },
    });
    expect(crossRead.status()).toBe(404);

    const crossDownload = await request.get(`${API_URL}/api/documents/${org1DocId}/download`, {
      headers: { Authorization: `Bearer ${org2Token}` },
    });
    expect(crossDownload.status()).toBe(404);

    // 6. Session expiration handling in browser (tampered/expired token -> 401 -> redirected to /login)
    await page.goto('/login');
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        'docuflow.session',
        JSON.stringify({
          accessToken: 'invalid.expired.jwt',
          userId: '11111111-1111-1111-1111-111111111111',
          email: 'expired@e2e.local',
          fullName: 'Expired User',
          organizationId: '22222222-2222-2222-2222-222222222222',
          organizationSlug: 'expired-org',
          role: 5,
        }),
      );
    });
    await page.goto('/documents');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/sesión expiró/i)).toBeVisible();
  });
});


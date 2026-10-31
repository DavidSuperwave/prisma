import { expect, test } from '@playwright/test'

test('intake form renders and submits', async ({ page }) => {
  await page.route('**/api/intake', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intakeId: 'intk_test_123',
        status: 'new',
        leadScore: 3,
      }),
    })
  })

  await page.goto('/intake')
  await page.getByLabel('Nombre completo').fill('Ana Perez')
  await page.getByLabel('¿Que negocio tienes?').fill('Studio Azul')
  await page.getByLabel('Sitio web (opcional)').fill('https://studioazul.mx')
  await page.getByLabel('Ubicacion del negocio').fill('Monterrey')
  await page.getByLabel('¿Por que quieres actualizar o crear tu sitio web?').fill('Queremos actualizar nuestro sitio actual')
  await page.getByLabel('Email').fill('ana@studioazul.mx')
  await page.getByLabel('Logo').check()
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()

  await expect(page.getByText('Solicitud enviada. Te contactaremos pronto')).toBeVisible()
})

test('admin root redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForURL('**/admin/login**')
  await expect(page).toHaveURL(/\/admin\/login/)
})

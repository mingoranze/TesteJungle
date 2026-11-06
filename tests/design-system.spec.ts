import { expect, test } from '@playwright/test';

const viewports = [
  { width: 390, height: 844, mobileNavigation: true },
  { width: 768, height: 1024, mobileNavigation: false },
  { width: 1440, height: 900, mobileNavigation: false },
];

test('shell permanece utilizável sem overflow nos viewports definidos', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of ['/', '/foundation']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      const desktopNavigation = page.getByRole('navigation', { name: 'Navegação principal' });

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalOverflow, `overflow em ${viewport.width}px na rota ${path}`).toBe(false);

      const mobileNavigation = page.getByRole('navigation', { name: 'Navegação móvel' });
      if (viewport.mobileNavigation) {
        await expect(mobileNavigation).toBeVisible();
        await expect(desktopNavigation).toBeHidden();
        if (path === '/') {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForFunction(
            () =>
              window.scrollY + window.innerHeight >=
              document.documentElement.scrollHeight - 1,
          );

          const footerText = await page
            .getByTestId('site-footer')
            .getByText('Ambiente de demonstração')
            .boundingBox();
          const navigationBox = await mobileNavigation.boundingBox();

          expect(footerText).not.toBeNull();
          expect(navigationBox).not.toBeNull();
          if (footerText && navigationBox) {
            expect(footerText.y + footerText.height).toBeLessThanOrEqual(navigationBox.y);
          }
        }
      } else {
        await expect(mobileNavigation).toBeHidden();
        await expect(desktopNavigation).toBeVisible();
      }
    }
  }
});

test('skip link e controles principais podem ser acessados pelo teclado', async ({ page }) => {
  await page.goto('/');
  const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.getByRole('link', { name: 'KURIO — início' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Início', exact: true })).toBeFocused();
});

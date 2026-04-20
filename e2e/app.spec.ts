import { expect, test } from '@playwright/test';

test('renders the review deck and opens image/video media modals', async ({ page }) => {
  await page.addInitScript((fixedIso) => {
    const fixedNow = new Date(fixedIso).valueOf();
    const RealDate = Date;

    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(fixedNow);
          return;
        }

        super(...args);
      }

      static now() {
        return fixedNow;
      }
    }

    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    Object.setPrototypeOf(MockDate, RealDate);
    globalThis.Date = MockDate as DateConstructor;
  }, '2026-04-17T12:00:00.000Z');

  await page.route('**/api/state', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        bootstrapped: true,
        authenticated: true,
        hasImmichConnection: true,
        setupTokenRequired: false,
        csrfToken: 'csrf',
        settings: {
          yearsBack: 10,
          timezone: 'UTC'
        },
        adminEmail: 'admin@example.com',
        connectionMode: 'apiKey'
      })
    });
  });

  await page.route('**/api/review/queue?*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        queueId: '2026-04-17:test',
        forDate: '2026-04-17',
        yearsBack: 10,
        timezone: 'UTC',
        totalCount: 2,
        completedCount: 0,
        items: [
          {
            id: 'image-1',
            type: 'IMAGE',
            originalFileName: 'image.jpg',
            fileCreatedAt: '2025-04-17T12:00:00.000Z',
            localDateTime: '2025-04-17T12:00:00.000Z',
            originalMimeType: 'image/jpeg',
            duration: null,
            width: 100,
            height: 100,
            thumbhash: null,
            isFavorite: false,
            isArchived: false
          },
          {
            id: 'video-1',
            type: 'VIDEO',
            originalFileName: 'video.mp4',
            fileCreatedAt: '2024-04-17T12:00:00.000Z',
            localDateTime: '2024-04-17T12:00:00.000Z',
            originalMimeType: 'video/mp4',
            duration: '00:00:03.000',
            width: 100,
            height: 100,
            thumbhash: null,
            isFavorite: false,
            isArchived: false
          }
        ],
        failedActions: []
      })
    });
  });

  await page.route('**/api/review/actions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'keep' })
    });
  });

  await page.route('**/api/media/**', async (route) => {
    const url = route.request().url();
    const isVideo = url.includes('/original') && url.includes('video-1');
    await route.fulfill({
      contentType: isVideo ? 'video/mp4' : 'image/png',
      body: isVideo ? Buffer.from('0000') : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WwWSn0AAAAASUVORK5CYII=', 'base64')
    });
  });

  await page.goto('/');

  await expect(page.getByText('April 17, 2026')).toBeVisible();
  await expect(page.getByText('2016–2025')).toBeVisible();
  await expect(page.getByText('2 left')).toBeVisible();

  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByText('video.mp4').first()).toBeVisible();
  await page.getByRole('button', { name: 'Play video' }).click();
  await expect(page.locator('video')).toBeVisible();
});

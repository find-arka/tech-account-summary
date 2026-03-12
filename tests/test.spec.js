const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const STORAGE_KEY = 'solo_tech_review_draft';

function resolveAppHtml() {
  if (process.env.APP_HTML && fs.existsSync(process.env.APP_HTML)) {
    return process.env.APP_HTML;
  }

  return path.resolve(process.cwd(), 'index.html');
}

function getAppUrl() {
  const appHtml = resolveAppHtml();
  if (!fs.existsSync(appHtml)) {
    throw new Error(
      `Cannot find index.html. Set APP_HTML=/absolute/path/to/index.html. Tried: ${appHtml}`,
    );
  }
  return pathToFileURL(appHtml).href;
}

async function gotoApp(page) {
  await page.goto(getAppUrl());
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Environment Review E2E critical regressions', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  });

  test('1) Storage limit is handled gracefully without persisting base64 file payloads', async ({ page }) => {
    const bigPayload = Buffer.alloc(2.5 * 1024 * 1024, 'a'); // 2.5 MB each => 7.5+ MB total uploaded
    const fileInputs = page.locator('.file-upload-zone input[type="file"]');

    await fileInputs.nth(0).setInputFiles({
      name: 'arch-e2e-large-1.pdf',
      mimeType: 'application/pdf',
      buffer: bigPayload,
    });
    await fileInputs.nth(1).setInputFiles({
      name: 'arch-e2e-large-2.pdf',
      mimeType: 'application/pdf',
      buffer: bigPayload,
    });
    await fileInputs.nth(2).setInputFiles({
      name: 'arch-e2e-large-3.pdf',
      mimeType: 'application/pdf',
      buffer: bigPayload,
    });

    await expect(page.locator('.non-image-file')).toHaveCount(3);

    const typedText = 'autosave text should persist even with large uploads';
    await page.locator('textarea[data-field="goals_primary"]').fill(typedText);

    // autoSave() debounce is 1000ms; wait 2s per requirement
    await page.waitForTimeout(2000);

    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(saved).toBeTruthy();

    const parsed = JSON.parse(saved);
    expect(parsed.fields.goals_primary).toBe(typedText);
    expect(parsed.files).toBeUndefined();

    // Ensure huge base64 payloads are not serialized into localStorage draft
    expect(saved).not.toContain('data:application/pdf;base64');
    expect(saved).not.toContain('arch-e2e-large-1.pdf');
    expect(saved).not.toContain('arch-e2e-large-2.pdf');
    expect(saved).not.toContain('arch-e2e-large-3.pdf');
  });

  test('2) Print-to-PDF hydrates markdown preview before print is fired', async ({ page }) => {
    const field = 'goals_pain_points';
    const markdown = '**bold text**';

    await page.locator(`textarea[data-field="${field}"]`).fill(markdown);

    // Intercept print call and capture md-preview state at the exact print trigger moment
    await page.evaluate((targetField) => {
      const ta = document.querySelector(`textarea[data-field="${targetField}"]`);
      const preview = ta.closest('.md-wrapper').querySelector('.md-preview');
      window.__printCapture = null;

      window.print = () => {
        window.__printCapture = {
          previewHtml: preview.innerHTML,
          previewInlineDisplay: preview.style.display,
          previewComputedDisplay: getComputedStyle(preview).display,
          textareaInlineDisplay: ta.style.display,
          textareaComputedDisplay: getComputedStyle(ta).display,
        };
      };
    }, field);

    await page.getByRole('button', { name: 'Print to PDF' }).click();
    await page.waitForFunction(() => window.__printCapture !== null);

    const capture = await page.evaluate(() => window.__printCapture);

    expect(capture.previewHtml).toContain('<strong>bold text</strong>');
    expect(capture.previewComputedDisplay).not.toBe('none');
    expect(capture.textareaComputedDisplay).toBe('none');
  });

  test('3) Mobile viewport keeps TOC compact and form content immediately visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoApp(page);

    const metrics = await page.evaluate(() => {
      const nav = document.querySelector('.nav-toc');
      const container = document.querySelector('.container');
      const navRect = nav.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      return {
        navHeight: navRect.height,
        containerTop: containerRect.top,
        viewportHeight: window.innerHeight,
        scrollY: window.scrollY,
      };
    });

    expect(metrics.navHeight).toBeLessThan(150);
    expect(metrics.scrollY).toBe(0);
    expect(metrics.containerTop).toBeLessThan(metrics.viewportHeight);
  });

  test('4) beforeunload persists final keystrokes without waiting for debounce', async ({ page }) => {
    const typedText = 'final unsaved keystrokes should be flushed on beforeunload';
    await page.locator('textarea[data-field="goals_success"]').fill(typedText);

    // Handle native beforeunload dialog if surfaced by browser
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'beforeunload') {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });

    // Trigger navigation immediately (before 1s debounce timer)
    await page.reload({ waitUntil: 'domcontentloaded' });

    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(saved).toBeTruthy();

    const parsed = JSON.parse(saved);
    expect(parsed.fields.goals_success).toBe(typedText);
  });

  test('5) Env table + radio state restore correctly from saved draft JSON', async ({ page }) => {
    const tableValues = {
      env_prod_platform: 'EKS',
      env_prod_clusters: '3',
      env_prod_nodes: '24',
      env_prod_services: '120',
      env_preprod_platform: 'AKS',
      env_preprod_clusters: '2',
      env_preprod_nodes: '10',
      env_preprod_services: '45',
      env_dev_platform: 'GKE',
      env_dev_clusters: '4',
      env_dev_nodes: '8',
      env_dev_services: '32',
    };

    for (const [field, value] of Object.entries(tableValues)) {
      await page.locator(`.env-table input[data-field="${field}"]`).fill(value);
    }

    // Select a non-default radio option
    await page.locator('input[type="radio"][name="mesh_mode"][value="ambient"]').check();

    // Force save now
    await page.evaluate(() => window.autoSave());

    const savedJson = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(savedJson).toBeTruthy();

    // Clear form + localStorage to simulate clean state
    await page.evaluate((key) => {
      document.querySelectorAll('.env-table input[data-field]').forEach((el) => {
        el.value = '';
      });
      document.querySelectorAll('input[type="radio"]').forEach((el) => {
        el.checked = false;
      });
      localStorage.removeItem(key);
    }, STORAGE_KEY);

    await page.reload({ waitUntil: 'domcontentloaded' });

    // Simulate loading saved JSON draft
    await page.evaluate((json) => {
      const parsed = JSON.parse(json);
      window.restoreFormData(parsed);
    }, savedJson);

    for (const [field, value] of Object.entries(tableValues)) {
      await expect(page.locator(`.env-table input[data-field="${field}"]`)).toHaveValue(value);
    }

    await expect(
      page.locator('input[type="radio"][name="mesh_mode"][value="ambient"]'),
    ).toBeChecked();
  });
});

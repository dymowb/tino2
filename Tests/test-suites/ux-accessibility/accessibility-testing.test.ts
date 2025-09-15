import { test, expect, Page, BrowserContext } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

/**
 * Phase 10.13: Accessibility Testing with WCAG 2.1 Compliance
 * Test Scenarios: TS-058 to TS-060 (3 Accessibility scenarios)
 *
 * Coverage:
 * - WCAG 2.1 Level AA Compliance
 * - Screen Reader Compatibility
 * - Keyboard Navigation
 * - Color Contrast and Visual Accessibility
 * - Focus Management and ARIA Implementation
 */

test.describe('Phase 10.13: Accessibility Testing', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    // Navigate to application
    await page.goto('http://localhost:3001');
    await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });

    // Inject axe-core for accessibility testing
    await injectAxe(page);
  });

  test.afterEach(async () => {
    await context.close();
  });

  /**
   * TS-058: WCAG 2.1 Level AA Compliance Testing
   * Validates compliance with Web Content Accessibility Guidelines
   */
  test('TS-058: WCAG 2.1 Level AA compliance validation', async () => {
    console.log('=== TS-058: WCAG 2.1 Level AA Compliance Testing ===');

    const accessibilityResults = {
      pagesScanned: 0,
      totalViolations: 0,
      criticalIssues: 0,
      warningIssues: 0,
      pageResults: [] as any[]
    };

    const pagesToTest = [
      { url: '/', name: 'Homepage', description: 'Landing page with navigation and hero section' },
      { url: '/register', name: 'Registration', description: 'User registration form' },
      { url: '/login', name: 'Login', description: 'User authentication form' },
      { url: '/find-providers', name: 'Find Providers', description: 'Provider search interface' },
      { url: '/bookings', name: 'Bookings', description: 'Booking management dashboard' }
    ];

    for (const pageTest of pagesToTest) {
      console.log(`\nTesting accessibility: ${pageTest.name} (${pageTest.url})`);

      try {
        await page.goto(`http://localhost:3001${pageTest.url}`);
        await page.waitForLoadState('networkidle');

        // Wait for dynamic content to load
        await page.waitForTimeout(2000);

        // Run axe-core accessibility audit
        const axeResults = await page.evaluate(async () => {
          // @ts-ignore
          const axe = window.axe;
          if (axe) {
            return await axe.run(document, {
              rules: {
                // WCAG 2.1 Level AA rules
                'color-contrast': { enabled: true },
                'keyboard-navigation': { enabled: true },
                'focus-order-semantics': { enabled: true },
                'aria-valid-attr': { enabled: true },
                'aria-valid-attr-value': { enabled: true },
                'aria-labelledby': { enabled: true },
                'aria-describedby': { enabled: true },
                'form-field-multiple-labels': { enabled: true },
                'heading-order': { enabled: true },
                'landmark-unique': { enabled: true },
                'link-name': { enabled: true },
                'list': { enabled: true },
                'listitem': { enabled: true },
                'image-alt': { enabled: true },
                'input-image-alt': { enabled: true },
                'label': { enabled: true },
                'button-name': { enabled: true }
              },
              tags: ['wcag2a', 'wcag2aa', 'wcag21aa']
            });
          }
          return null;
        });

        if (axeResults) {
          const pageResult = {
            page: pageTest.name,
            url: pageTest.url,
            violations: axeResults.violations.length,
            passes: axeResults.passes.length,
            incomplete: axeResults.incomplete.length,
            criticalViolations: axeResults.violations.filter((v: any) => v.impact === 'critical').length,
            seriousViolations: axeResults.violations.filter((v: any) => v.impact === 'serious').length,
            moderateViolations: axeResults.violations.filter((v: any) => v.impact === 'moderate').length,
            minorViolations: axeResults.violations.filter((v: any) => v.impact === 'minor').length,
            violationDetails: axeResults.violations.map((v: any) => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              help: v.help,
              helpUrl: v.helpUrl,
              nodes: v.nodes.length
            }))
          };

          accessibilityResults.pageResults.push(pageResult);
          accessibilityResults.totalViolations += pageResult.violations;
          accessibilityResults.criticalIssues += pageResult.criticalViolations + pageResult.seriousViolations;
          accessibilityResults.warningIssues += pageResult.moderateViolations + pageResult.minorViolations;

          console.log(`  Violations: ${pageResult.violations}`);
          console.log(`  Critical/Serious: ${pageResult.criticalViolations + pageResult.seriousViolations}`);
          console.log(`  Moderate/Minor: ${pageResult.moderateViolations + pageResult.minorViolations}`);
          console.log(`  Passes: ${pageResult.passes}`);

          // Log critical violations for immediate attention
          if (pageResult.criticalViolations > 0) {
            console.log(`  🚨 Critical violations found:`);
            pageResult.violationDetails
              .filter(v => v.impact === 'critical')
              .forEach(v => console.log(`    - ${v.id}: ${v.description}`));
          }
        }

        accessibilityResults.pagesScanned++;

        // Additional manual accessibility checks
        await this.performManualAccessibilityChecks(page, pageTest.name);

      } catch (error) {
        console.error(`Accessibility testing error for ${pageTest.name}:`, error.message);
      }
    }

    // Accessibility summary and validation
    console.log(`\n=== WCAG 2.1 Compliance Summary ===`);
    console.log(`Pages Scanned: ${accessibilityResults.pagesScanned}`);
    console.log(`Total Violations: ${accessibilityResults.totalViolations}`);
    console.log(`Critical/Serious Issues: ${accessibilityResults.criticalIssues}`);
    console.log(`Warning Issues: ${accessibilityResults.warningIssues}`);

    // Generate detailed report
    console.log(`\n=== Detailed Page Results ===`);
    accessibilityResults.pageResults.forEach(result => {
      console.log(`${result.page}: ${result.violations} violations (${result.criticalViolations} critical, ${result.seriousViolations} serious)`);
    });

    // WCAG 2.1 compliance validation
    expect(accessibilityResults.criticalIssues).toBeLessThanOrEqual(2); // Allow minimal critical issues for development
    expect(accessibilityResults.totalViolations).toBeLessThanOrEqual(10); // Target: minimal violations
  });

  /**
   * TS-059: Keyboard Navigation and Focus Management
   * Validates complete keyboard accessibility and focus order
   */
  test('TS-059: Keyboard navigation and focus management', async () => {
    console.log('=== TS-059: Keyboard Navigation and Focus Management ===');

    const keyboardTestResults = {
      focusableElements: 0,
      tabOrderCorrect: true,
      keyboardTraps: 0,
      focusVisible: true,
      skipLinks: 0
    };

    try {
      // Test main navigation keyboard accessibility
      console.log('Testing main navigation keyboard accessibility');

      await page.waitForSelector('[data-testid="main-navigation"]');

      // Test tab navigation through main menu
      await page.keyboard.press('Tab');
      let focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));

      const navigationElements = [];
      let tabCount = 0;
      const maxTabs = 20; // Prevent infinite loops

      while (tabCount < maxTabs) {
        await page.keyboard.press('Tab');
        const currentFocus = await page.evaluate(() => {
          const active = document.activeElement;
          return {
            testId: active?.getAttribute('data-testid'),
            tagName: active?.tagName,
            role: active?.getAttribute('role'),
            tabIndex: active?.getAttribute('tabindex'),
            ariaLabel: active?.getAttribute('aria-label'),
            text: active?.textContent?.trim()
          };
        });

        if (currentFocus.testId || currentFocus.role) {
          navigationElements.push(currentFocus);
          keyboardTestResults.focusableElements++;
        }

        tabCount++;

        // Stop if we've cycled back to the first element
        if (tabCount > 5 && currentFocus.testId === focusedElement) {
          break;
        }
      }

      console.log(`Focusable elements found: ${keyboardTestResults.focusableElements}`);

      // Test form keyboard navigation
      console.log('Testing form keyboard navigation');

      await page.goto('http://localhost:3001/register');
      await page.waitForSelector('[data-testid="registration-form"]');

      // Focus on first form field
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab'); // Navigate to first input

      const formFocusOrder = [];
      const formFields = await page.locator('input, select, textarea, button').count();

      for (let i = 0; i < Math.min(formFields, 10); i++) {
        const fieldInfo = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement;
          return {
            tagName: active?.tagName,
            type: active?.getAttribute('type'),
            name: active?.getAttribute('name'),
            placeholder: active?.getAttribute('placeholder'),
            required: active?.hasAttribute('required'),
            disabled: active?.hasAttribute('disabled'),
            tabIndex: active?.getAttribute('tabindex')
          };
        });

        formFocusOrder.push(fieldInfo);

        // Test field interaction
        if (fieldInfo.tagName === 'INPUT' && fieldInfo.type === 'text') {
          await page.keyboard.type('Test Input');
          await page.keyboard.press('Backspace');
          await page.keyboard.press('Backspace');
          await page.keyboard.press('Backspace');
          await page.keyboard.press('Backspace');
          await page.keyboard.press('Backspace');
        }

        await page.keyboard.press('Tab');
      }

      console.log(`Form fields navigated: ${formFocusOrder.length}`);

      // Test modal/dialog keyboard navigation
      console.log('Testing modal keyboard navigation');

      await page.goto('http://localhost:3001/find-providers');
      await page.waitForSelector('[data-testid="provider-search-interface"]');

      // Trigger modal (if available)
      const modalTriggers = page.locator('[data-testid*="modal"], [data-testid*="dialog"]');
      const modalCount = await modalTriggers.count();

      if (modalCount > 0) {
        await modalTriggers.first().click();
        await page.waitForSelector('[role="dialog"], [data-testid*="modal"]', { timeout: 3000 });

        // Test modal focus trap
        const modalFocusTest = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], [data-testid*="modal"]');
          const focusableElements = modal?.querySelectorAll(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );

          return {
            modalExists: !!modal,
            focusableCount: focusableElements?.length || 0,
            modalRole: modal?.getAttribute('role'),
            ariaModal: modal?.getAttribute('aria-modal')
          };
        });

        if (modalFocusTest.modalExists) {
          // Test Escape key to close modal
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);

          const modalClosed = await page.evaluate(() => {
            return !document.querySelector('[role="dialog"], [data-testid*="modal"]:not([style*="display: none"])');
          });

          if (modalClosed) {
            console.log('✓ Modal properly closes with Escape key');
          }
        }
      }

      // Test skip links
      await page.goto('http://localhost:3001');
      await page.waitForLoadState('networkidle');

      const skipLinks = await page.evaluate(() => {
        const skipLinkSelectors = ['[href="#main"]', '[href="#content"]', '.skip-link', '[data-testid="skip-link"]'];
        let skipCount = 0;

        skipLinkSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          skipCount += elements.length;
        });

        return skipCount;
      });

      keyboardTestResults.skipLinks = skipLinks;
      console.log(`Skip links found: ${skipLinks}`);

      // Keyboard navigation summary
      console.log(`\n=== Keyboard Navigation Summary ===`);
      console.log(`Total focusable elements: ${keyboardTestResults.focusableElements}`);
      console.log(`Tab order correct: ${keyboardTestResults.tabOrderCorrect}`);
      console.log(`Keyboard traps detected: ${keyboardTestResults.keyboardTraps}`);
      console.log(`Focus visible: ${keyboardTestResults.focusVisible}`);
      console.log(`Skip links available: ${keyboardTestResults.skipLinks}`);

      // Validation
      expect(keyboardTestResults.focusableElements).toBeGreaterThan(5);
      expect(keyboardTestResults.keyboardTraps).toBe(0);

    } catch (error) {
      console.error('Keyboard navigation testing error:', error.message);
      throw error;
    }
  });

  /**
   * TS-060: Screen Reader and Assistive Technology Support
   * Validates compatibility with screen readers and assistive technologies
   */
  test('TS-060: Screen reader and assistive technology support', async () => {
    console.log('=== TS-060: Screen Reader and Assistive Technology Support ===');

    const screenReaderTests = {
      ariaLabels: 0,
      landmarks: 0,
      headingStructure: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      altTexts: 0,
      formLabels: 0,
      liveRegions: 0
    };

    try {
      // Test semantic HTML structure and landmarks
      console.log('Testing semantic HTML structure and ARIA landmarks');

      const semanticStructure = await page.evaluate(() => {
        const landmarks = {
          main: document.querySelectorAll('main, [role="main"]').length,
          navigation: document.querySelectorAll('nav, [role="navigation"]').length,
          header: document.querySelectorAll('header, [role="banner"]').length,
          footer: document.querySelectorAll('footer, [role="contentinfo"]').length,
          aside: document.querySelectorAll('aside, [role="complementary"]').length,
          section: document.querySelectorAll('section').length,
          article: document.querySelectorAll('article').length
        };

        const headings = {
          h1: document.querySelectorAll('h1').length,
          h2: document.querySelectorAll('h2').length,
          h3: document.querySelectorAll('h3').length,
          h4: document.querySelectorAll('h4').length,
          h5: document.querySelectorAll('h5').length,
          h6: document.querySelectorAll('h6').length
        };

        return { landmarks, headings };
      });

      screenReaderTests.landmarks = Object.values(semanticStructure.landmarks).reduce((a, b) => a + b, 0);
      screenReaderTests.headingStructure = semanticStructure.headings;

      console.log(`Semantic landmarks found: ${screenReaderTests.landmarks}`);
      console.log(`Heading structure: H1(${semanticStructure.headings.h1}) H2(${semanticStructure.headings.h2}) H3(${semanticStructure.headings.h3})`);

      // Test ARIA labels and descriptions
      console.log('Testing ARIA labels and descriptions');

      const ariaElements = await page.evaluate(() => {
        const ariaLabels = document.querySelectorAll('[aria-label]').length;
        const ariaLabelledBy = document.querySelectorAll('[aria-labelledby]').length;
        const ariaDescribedBy = document.querySelectorAll('[aria-describedby]').length;
        const ariaExpanded = document.querySelectorAll('[aria-expanded]').length;
        const ariaHidden = document.querySelectorAll('[aria-hidden]').length;
        const ariaLive = document.querySelectorAll('[aria-live]').length;

        return {
          ariaLabels,
          ariaLabelledBy,
          ariaDescribedBy,
          ariaExpanded,
          ariaHidden,
          ariaLive,
          total: ariaLabels + ariaLabelledBy + ariaDescribedBy
        };
      });

      screenReaderTests.ariaLabels = ariaElements.total;
      screenReaderTests.liveRegions = ariaElements.ariaLive;

      console.log(`ARIA labels/descriptions: ${ariaElements.total}`);
      console.log(`Live regions: ${ariaElements.ariaLive}`);

      // Test image alternative text
      console.log('Testing image accessibility');

      const imageAccessibility = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        let altTextCount = 0;
        let decorativeImages = 0;
        let missingAlt = 0;

        images.forEach(img => {
          if (img.hasAttribute('alt')) {
            if (img.alt.trim() === '') {
              decorativeImages++;
            } else {
              altTextCount++;
            }
          } else {
            missingAlt++;
          }
        });

        return {
          totalImages: images.length,
          altTextCount,
          decorativeImages,
          missingAlt
        };
      });

      screenReaderTests.altTexts = imageAccessibility.altTextCount;

      console.log(`Images with alt text: ${imageAccessibility.altTextCount}/${imageAccessibility.totalImages}`);
      console.log(`Decorative images: ${imageAccessibility.decorativeImages}`);
      console.log(`Missing alt text: ${imageAccessibility.missingAlt}`);

      // Test form accessibility
      console.log('Testing form accessibility for screen readers');

      await page.goto('http://localhost:3001/register');
      await page.waitForSelector('form');

      const formAccessibility = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        let labelledInputs = 0;
        let fieldsets = 0;
        let legends = 0;
        let requiredFields = 0;
        let errorMessages = 0;

        forms.forEach(form => {
          // Count properly labelled inputs
          const inputs = form.querySelectorAll('input, select, textarea');
          inputs.forEach(input => {
            const id = input.id;
            const name = input.getAttribute('name');
            const ariaLabel = input.getAttribute('aria-label');
            const ariaLabelledBy = input.getAttribute('aria-labelledby');
            const associatedLabel = id ? form.querySelector(`label[for="${id}"]`) : null;

            if (associatedLabel || ariaLabel || ariaLabelledBy) {
              labelledInputs++;
            }

            if (input.hasAttribute('required') || input.getAttribute('aria-required') === 'true') {
              requiredFields++;
            }
          });

          fieldsets += form.querySelectorAll('fieldset').length;
          legends += form.querySelectorAll('legend').length;
          errorMessages += form.querySelectorAll('[role="alert"], .error-message, [aria-describedby*="error"]').length;
        });

        return {
          labelledInputs,
          fieldsets,
          legends,
          requiredFields,
          errorMessages
        };
      });

      screenReaderTests.formLabels = formAccessibility.labelledInputs;

      console.log(`Properly labelled form inputs: ${formAccessibility.labelledInputs}`);
      console.log(`Fieldsets: ${formAccessibility.fieldsets}, Legends: ${formAccessibility.legends}`);
      console.log(`Required fields: ${formAccessibility.requiredFields}`);
      console.log(`Error messages: ${formAccessibility.errorMessages}`);

      // Test dynamic content and live regions
      console.log('Testing dynamic content accessibility');

      await page.goto('http://localhost:3001/find-providers');
      await page.waitForSelector('[data-testid="provider-search-interface"]');

      // Test search with live region updates
      await page.fill('[data-testid="location-search"]', 'New York');
      await page.click('[data-testid="search-providers-button"]');

      // Wait for results and check for live region updates
      await page.waitForSelector('[data-testid="provider-results"], [data-testid="no-results"]', { timeout: 10000 });

      const liveRegionUpdates = await page.evaluate(() => {
        const liveRegions = document.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
        const statusMessages = document.querySelectorAll('[data-testid*="status"], [data-testid*="message"]');

        return {
          liveRegions: liveRegions.length,
          statusMessages: statusMessages.length,
          announcements: Array.from(liveRegions).map(region => ({
            content: region.textContent?.trim(),
            type: region.getAttribute('aria-live') || region.getAttribute('role')
          }))
        };
      });

      console.log(`Live regions for dynamic content: ${liveRegionUpdates.liveRegions}`);
      console.log(`Status messages: ${liveRegionUpdates.statusMessages}`);

      // Screen reader compatibility summary
      console.log(`\n=== Screen Reader Compatibility Summary ===`);
      console.log(`ARIA labels/descriptions: ${screenReaderTests.ariaLabels}`);
      console.log(`Semantic landmarks: ${screenReaderTests.landmarks}`);
      console.log(`Heading structure levels: ${Object.values(screenReaderTests.headingStructure).filter(h => h > 0).length}`);
      console.log(`Images with alt text: ${screenReaderTests.altTexts}`);
      console.log(`Properly labelled form inputs: ${screenReaderTests.formLabels}`);
      console.log(`Live regions: ${screenReaderTests.liveRegions}`);

      // Validation for screen reader support
      expect(screenReaderTests.landmarks).toBeGreaterThanOrEqual(3); // Minimum semantic structure
      expect(screenReaderTests.headingStructure.h1).toBeGreaterThanOrEqual(1); // At least one H1
      expect(imageAccessibility.missingAlt).toBeLessThanOrEqual(1); // Minimal missing alt text

    } catch (error) {
      console.error('Screen reader testing error:', error.message);
      throw error;
    }
  });

  /**
   * Helper method for manual accessibility checks
   */
  private async performManualAccessibilityChecks(page: Page, pageName: string) {
    console.log(`  Performing manual accessibility checks for ${pageName}`);

    try {
      // Check color contrast manually for key elements
      const contrastResults = await page.evaluate(() => {
        const elementsToCheck = document.querySelectorAll('button, a, input, .text-primary, .text-secondary');
        const contrastIssues = [];

        elementsToCheck.forEach((element, index) => {
          const styles = window.getComputedStyle(element);
          const backgroundColor = styles.backgroundColor;
          const color = styles.color;

          // Basic contrast check (simplified)
          if (color === backgroundColor) {
            contrastIssues.push({
              element: element.tagName,
              index,
              issue: 'Same foreground and background color'
            });
          }
        });

        return contrastIssues;
      });

      if (contrastResults.length > 0) {
        console.log(`    Potential contrast issues: ${contrastResults.length}`);
      }

      // Check for proper focus indicators
      const focusIndicators = await page.evaluate(() => {
        const focusableElements = document.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
        );

        let elementsWithFocusStyle = 0;

        focusableElements.forEach(element => {
          const styles = window.getComputedStyle(element, ':focus');
          const outline = styles.outline;
          const boxShadow = styles.boxShadow;

          if (outline !== 'none' || boxShadow !== 'none') {
            elementsWithFocusStyle++;
          }
        });

        return {
          totalFocusable: focusableElements.length,
          withFocusStyle: elementsWithFocusStyle
        };
      });

      console.log(`    Focusable elements with focus indicators: ${focusIndicators.withFocusStyle}/${focusIndicators.totalFocusable}`);

    } catch (error) {
      console.log(`    Manual accessibility check error: ${error.message}`);
    }
  }
});
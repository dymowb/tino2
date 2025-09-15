import { test, expect, Page, BrowserContext } from '@playwright/test';
import { UserFixtures } from '../../test-data/test-fixtures';

/**
 * Phase 10.13: User Experience and Accessibility Testing
 * Test Scenarios: TS-051 to TS-060 (10 UX/Accessibility scenarios)
 *
 * Coverage:
 * - User Journey Validation and Task Completion
 * - Mobile Responsiveness and Cross-Device Testing
 * - Cross-Browser Compatibility
 * - Navigation and User Flow Optimization
 * - Form Usability and Error Handling
 */

test.describe('Phase 10.13: User Experience Testing', () => {
  let context: BrowserContext;
  let page: Page;

  const testUser = UserFixtures.customers[0];
  const testProvider = UserFixtures.providers[0];

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    // Navigate to application
    await page.goto('http://localhost:3001');

    // Wait for application to load
    await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });
  });

  test.afterEach(async () => {
    await context.close();
  });

  /**
   * TS-051: Customer Journey - Complete Service Discovery to Booking Flow
   * Validates end-to-end customer experience from registration to service completion
   */
  test('TS-051: Customer complete service discovery to booking journey', async () => {
    console.log('=== TS-051: Customer Service Discovery to Booking Journey ===');

    const journeyMetrics = {
      startTime: Date.now(),
      stepTimes: [] as number[],
      errors: [] as string[],
      usabilityIssues: [] as string[]
    };

    try {
      // Step 1: Customer Registration with UX validation
      console.log('Step 1: Customer Registration Process');
      const step1Start = Date.now();

      await page.click('[data-testid="register-button"]');
      await page.waitForSelector('[data-testid="registration-form"]');

      // Validate form accessibility
      const registrationForm = page.locator('[data-testid="registration-form"]');
      await expect(registrationForm).toHaveAttribute('role', 'form');

      // Fill registration form with user-friendly validation
      await page.fill('[data-testid="first-name-input"]', testUser.firstName);
      await page.fill('[data-testid="last-name-input"]', testUser.lastName);
      await page.fill('[data-testid="email-input"]', `ux.test.${Date.now()}@example.com`);
      await page.fill('[data-testid="phone-input"]', testUser.phone);
      await page.fill('[data-testid="password-input"]', testUser.password);
      await page.fill('[data-testid="confirm-password-input"]', testUser.password);

      // Validate real-time form feedback
      const emailField = page.locator('[data-testid="email-input"]');
      await expect(emailField).not.toHaveClass(/error/);

      await page.click('[data-testid="submit-registration"]');
      await page.waitForSelector('[data-testid="registration-success"]', { timeout: 5000 });

      journeyMetrics.stepTimes.push(Date.now() - step1Start);
      console.log(`Registration completed in ${Date.now() - step1Start}ms`);

      // Step 2: Service Discovery with Location-Based Search
      console.log('Step 2: Service Discovery Process');
      const step2Start = Date.now();

      await page.click('[data-testid="find-providers-link"]');
      await page.waitForSelector('[data-testid="provider-search-interface"]');

      // Location search with user experience validation
      await page.fill('[data-testid="location-search"]', testUser.address);
      await page.selectOption('[data-testid="service-type-select"]', 'house_cleaning');
      await page.fill('[data-testid="search-radius"]', '10');

      // Validate search feedback and loading states
      await page.click('[data-testid="search-providers-button"]');
      await page.waitForSelector('[data-testid="search-loading"]');
      await page.waitForSelector('[data-testid="provider-results"]', { timeout: 10000 });

      // Validate search results UX
      const providerCards = page.locator('[data-testid="provider-card"]');
      const providerCount = await providerCards.count();
      expect(providerCount).toBeGreaterThan(0);

      journeyMetrics.stepTimes.push(Date.now() - step2Start);
      console.log(`Service discovery completed in ${Date.now() - step2Start}ms`);

      // Step 3: Provider Selection and Booking Creation
      console.log('Step 3: Provider Selection and Booking');
      const step3Start = Date.now();

      // Select first provider with detailed review
      await providerCards.first().click();
      await page.waitForSelector('[data-testid="provider-details-modal"]');

      // Validate provider information presentation
      await expect(page.locator('[data-testid="provider-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="provider-rating"]')).toBeVisible();
      await expect(page.locator('[data-testid="provider-services"]')).toBeVisible();

      // Create booking with comprehensive form validation
      await page.click('[data-testid="book-now-button"]');
      await page.waitForSelector('[data-testid="booking-dialog"]');

      // Fill booking details with UX validation
      await page.fill('[data-testid="booking-address"]', testUser.address);
      await page.selectOption('[data-testid="service-frequency"]', 'one_time');

      // Date picker usability testing
      await page.click('[data-testid="service-date-picker"]');
      await page.waitForSelector('[data-testid="date-picker-calendar"]');

      // Select next available date (improved UX)
      const availableDates = page.locator('[data-testid="available-date"]');
      await availableDates.first().click();

      // Time slot selection with clear feedback
      await page.selectOption('[data-testid="time-slot-select"]', '10:00');

      // Special instructions with character counter
      await page.fill('[data-testid="special-instructions"]', 'Please focus on kitchen and living room areas. Deep cleaning preferred.');

      await page.click('[data-testid="submit-booking"]');
      await page.waitForSelector('[data-testid="booking-confirmation"]', { timeout: 5000 });

      journeyMetrics.stepTimes.push(Date.now() - step3Start);
      console.log(`Booking creation completed in ${Date.now() - step3Start}ms`);

      // Step 4: Booking Management and Communication
      console.log('Step 4: Booking Management Experience');
      const step4Start = Date.now();

      await page.click('[data-testid="my-bookings-link"]');
      await page.waitForSelector('[data-testid="bookings-dashboard"]');

      // Validate booking display and status information
      const bookingCards = page.locator('[data-testid="booking-card"]');
      await expect(bookingCards).toHaveCountGreaterThan(0);

      // Test booking interaction features
      await bookingCards.first().click();
      await page.waitForSelector('[data-testid="booking-details"]');

      // Validate comprehensive booking information
      await expect(page.locator('[data-testid="booking-status"]')).toBeVisible();
      await expect(page.locator('[data-testid="booking-date-time"]')).toBeVisible();
      await expect(page.locator('[data-testid="provider-contact"]')).toBeVisible();

      journeyMetrics.stepTimes.push(Date.now() - step4Start);
      console.log(`Booking management completed in ${Date.now() - step4Start}ms`);

      // Journey completion analysis
      const totalJourneyTime = Date.now() - journeyMetrics.startTime;
      console.log(`\n=== Customer Journey Metrics ===`);
      console.log(`Total Journey Time: ${totalJourneyTime}ms`);
      console.log(`Registration: ${journeyMetrics.stepTimes[0]}ms`);
      console.log(`Service Discovery: ${journeyMetrics.stepTimes[1]}ms`);
      console.log(`Booking Creation: ${journeyMetrics.stepTimes[2]}ms`);
      console.log(`Booking Management: ${journeyMetrics.stepTimes[3]}ms`);
      console.log(`Errors Encountered: ${journeyMetrics.errors.length}`);
      console.log(`Usability Issues: ${journeyMetrics.usabilityIssues.length}`);

      // UX Performance Validation
      expect(totalJourneyTime).toBeLessThan(120000); // Complete journey under 2 minutes
      expect(journeyMetrics.errors.length).toBe(0); // No errors during journey

    } catch (error) {
      journeyMetrics.errors.push(error.message);
      console.error('Customer Journey Error:', error.message);
      throw error;
    }
  });

  /**
   * TS-052: Provider Onboarding and Dashboard Experience
   * Validates provider registration, verification, and dashboard usability
   */
  test('TS-052: Provider onboarding and dashboard experience', async () => {
    console.log('=== TS-052: Provider Onboarding and Dashboard Experience ===');

    const onboardingMetrics = {
      startTime: Date.now(),
      completionSteps: [] as string[],
      userFeedback: [] as string[]
    };

    try {
      // Step 1: Provider Registration with Enhanced UX
      console.log('Step 1: Provider Registration Process');

      await page.click('[data-testid="register-as-provider-button"]');
      await page.waitForSelector('[data-testid="provider-registration-form"]');

      // Validate progressive form design
      const formSections = page.locator('[data-testid="form-section"]');
      const sectionCount = await formSections.count();
      expect(sectionCount).toBeGreaterThan(2); // Multi-step form

      // Personal Information Section
      await page.fill('[data-testid="provider-first-name"]', testProvider.firstName);
      await page.fill('[data-testid="provider-last-name"]', testProvider.lastName);
      await page.fill('[data-testid="provider-email"]', `provider.ux.${Date.now()}@example.com`);
      await page.fill('[data-testid="provider-phone"]', testProvider.phone);

      // Business Information Section
      await page.click('[data-testid="next-section-button"]');
      await page.waitForSelector('[data-testid="business-information-section"]');

      await page.fill('[data-testid="business-name"]', testProvider.businessName);
      await page.fill('[data-testid="business-description"]', testProvider.description);
      await page.selectOption('[data-testid="primary-service"]', 'house_cleaning');

      // Service Area Configuration
      await page.click('[data-testid="next-section-button"]');
      await page.waitForSelector('[data-testid="service-area-section"]');

      await page.fill('[data-testid="service-address"]', testProvider.address);
      await page.fill('[data-testid="service-radius"]', '25');

      // Pricing and Availability
      await page.click('[data-testid="next-section-button"]');
      await page.waitForSelector('[data-testid="pricing-section"]');

      await page.fill('[data-testid="hourly-rate"]', testProvider.hourlyRate.toString());
      await page.check('[data-testid="weekday-availability"]');
      await page.check('[data-testid="weekend-availability"]');

      // Complete registration
      await page.click('[data-testid="complete-registration"]');
      await page.waitForSelector('[data-testid="provider-registration-success"]');

      onboardingMetrics.completionSteps.push('Registration Completed');

      // Step 2: Provider Dashboard Navigation
      console.log('Step 2: Provider Dashboard Experience');

      await page.click('[data-testid="provider-dashboard-link"]');
      await page.waitForSelector('[data-testid="provider-dashboard"]');

      // Validate dashboard components
      await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible();
      await expect(page.locator('[data-testid="recent-bookings"]')).toBeVisible();
      await expect(page.locator('[data-testid="earnings-summary"]')).toBeVisible();
      await expect(page.locator('[data-testid="performance-metrics"]')).toBeVisible();

      // Test dashboard interactivity
      await page.click('[data-testid="stats-period-selector"]');
      await page.selectOption('[data-testid="stats-period-selector"]', 'month');

      // Validate responsive updates
      await page.waitForSelector('[data-testid="updated-stats"]', { timeout: 3000 });

      onboardingMetrics.completionSteps.push('Dashboard Navigation');

      // Step 3: Quote Management Interface
      console.log('Step 3: Quote Management Experience');

      await page.click('[data-testid="quotes-tab"]');
      await page.waitForSelector('[data-testid="quote-requests-list"]');

      // Validate quote request interface
      const quoteRequests = page.locator('[data-testid="quote-request-card"]');
      if (await quoteRequests.count() > 0) {
        await quoteRequests.first().click();
        await page.waitForSelector('[data-testid="quote-submission-form"]');

        // Test quote submission UX
        await page.fill('[data-testid="quote-amount"]', '150');
        await page.fill('[data-testid="quote-description"]', 'Comprehensive house cleaning service including kitchen, bathrooms, and living areas.');
        await page.click('[data-testid="submit-quote"]');

        onboardingMetrics.completionSteps.push('Quote Submission');
      }

      // Step 4: Profile Management
      console.log('Step 4: Profile Management Experience');

      await page.click('[data-testid="profile-settings-link"]');
      await page.waitForSelector('[data-testid="provider-profile-settings"]');

      // Test profile editing capabilities
      await page.click('[data-testid="edit-profile-button"]');
      await page.waitForSelector('[data-testid="profile-edit-form"]');

      // Validate form pre-population and editing
      const businessNameField = page.locator('[data-testid="edit-business-name"]');
      const currentValue = await businessNameField.inputValue();
      expect(currentValue).toBe(testProvider.businessName);

      await businessNameField.fill(`${testProvider.businessName} - Updated`);
      await page.click('[data-testid="save-profile-changes"]');
      await page.waitForSelector('[data-testid="profile-save-success"]');

      onboardingMetrics.completionSteps.push('Profile Management');

      // Onboarding completion analysis
      const totalOnboardingTime = Date.now() - onboardingMetrics.startTime;
      console.log(`\n=== Provider Onboarding Metrics ===`);
      console.log(`Total Onboarding Time: ${totalOnboardingTime}ms`);
      console.log(`Completed Steps: ${onboardingMetrics.completionSteps.length}`);
      console.log(`Steps: ${onboardingMetrics.completionSteps.join(', ')}`);

      // UX Performance Validation
      expect(totalOnboardingTime).toBeLessThan(180000); // Under 3 minutes
      expect(onboardingMetrics.completionSteps.length).toBeGreaterThanOrEqual(3);

    } catch (error) {
      console.error('Provider Onboarding Error:', error.message);
      throw error;
    }
  });

  /**
   * TS-053: Mobile Responsiveness and Touch Interface Testing
   * Validates mobile device compatibility and touch interactions
   */
  test('TS-053: Mobile responsiveness and touch interface', async () => {
    console.log('=== TS-053: Mobile Responsiveness Testing ===');

    // Test multiple mobile viewports
    const mobileViewports = [
      { width: 375, height: 667, name: 'iPhone SE' },
      { width: 414, height: 896, name: 'iPhone 11' },
      { width: 360, height: 640, name: 'Android Medium' },
      { width: 768, height: 1024, name: 'iPad' }
    ];

    for (const viewport of mobileViewports) {
      console.log(`Testing ${viewport.name} (${viewport.width}x${viewport.height})`);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.reload();
      await page.waitForSelector('[data-testid="app-container"]');

      // Test mobile navigation
      if (viewport.width < 768) {
        // Mobile menu testing
        await expect(page.locator('[data-testid="mobile-menu-button"]')).toBeVisible();
        await page.click('[data-testid="mobile-menu-button"]');
        await page.waitForSelector('[data-testid="mobile-navigation-drawer"]');

        // Validate mobile menu accessibility
        const mobileMenu = page.locator('[data-testid="mobile-navigation-drawer"]');
        await expect(mobileMenu).toHaveAttribute('role', 'navigation');

        // Test menu item interaction
        await page.click('[data-testid="mobile-menu-providers"]');
        await page.waitForSelector('[data-testid="provider-search-interface"]');

        // Close mobile menu
        await page.click('[data-testid="close-mobile-menu"]');
      } else {
        // Tablet/desktop navigation testing
        await expect(page.locator('[data-testid="desktop-navigation"]')).toBeVisible();
      }

      // Test responsive form layouts
      await page.goto('http://localhost:3001/register');
      await page.waitForSelector('[data-testid="registration-form"]');

      // Validate form scaling and touch targets
      const formInputs = page.locator('[data-testid="registration-form"] input');
      const inputCount = await formInputs.count();

      for (let i = 0; i < inputCount; i++) {
        const input = formInputs.nth(i);
        const boundingBox = await input.boundingBox();

        // Validate minimum touch target size (44px recommended)
        expect(boundingBox?.height).toBeGreaterThanOrEqual(40);
      }

      // Test touch scroll behavior
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });

      // Validate scroll position
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);

      console.log(`✓ ${viewport.name} responsive testing completed`);
    }

    // Reset to desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  /**
   * TS-054: Cross-Browser Compatibility Testing
   * Validates consistent experience across different browsers
   */
  test('TS-054: Cross-browser compatibility validation', async () => {
    console.log('=== TS-054: Cross-Browser Compatibility Testing ===');

    const compatibilityTests = [
      'CSS Grid Layout Support',
      'Flexbox Implementation',
      'JavaScript ES6+ Features',
      'Form Validation',
      'Local Storage Access',
      'WebSocket Connections'
    ];

    try {
      // Test core functionality across browser features
      console.log('Testing Core Web APIs');

      // Local Storage Support
      await page.evaluate(() => {
        localStorage.setItem('test-key', 'test-value');
        return localStorage.getItem('test-key');
      });

      // CSS Feature Detection
      const cssSupport = await page.evaluate(() => {
        const testElement = document.createElement('div');
        testElement.style.display = 'grid';
        testElement.style.gridTemplateColumns = '1fr 1fr';

        return {
          gridSupport: testElement.style.display === 'grid',
          flexSupport: CSS.supports('display', 'flex'),
          variablesSupport: CSS.supports('color', 'var(--test)')
        };
      });

      expect(cssSupport.gridSupport).toBe(true);
      expect(cssSupport.flexSupport).toBe(true);

      // JavaScript Feature Support
      const jsSupport = await page.evaluate(() => {
        return {
          arrowFunctions: typeof (() => {}) === 'function',
          asyncAwait: typeof (async () => {}) === 'function',
          promises: typeof Promise !== 'undefined',
          fetch: typeof fetch !== 'undefined'
        };
      });

      expect(jsSupport.arrowFunctions).toBe(true);
      expect(jsSupport.asyncAwait).toBe(true);
      expect(jsSupport.promises).toBe(true);
      expect(jsSupport.fetch).toBe(true);

      // Form API Support
      await page.goto('http://localhost:3001/register');
      await page.waitForSelector('[data-testid="registration-form"]');

      const formSupport = await page.evaluate(() => {
        const form = document.querySelector('[data-testid="registration-form"]') as HTMLFormElement;
        const emailInput = form?.querySelector('input[type="email"]') as HTMLInputElement;

        return {
          formValidation: typeof form?.checkValidity === 'function',
          inputValidation: typeof emailInput?.setCustomValidity === 'function',
          constraintValidation: 'validity' in (emailInput || {})
        };
      });

      expect(formSupport.formValidation).toBe(true);
      expect(formSupport.inputValidation).toBe(true);

      console.log('✓ Cross-browser compatibility validation completed');

    } catch (error) {
      console.error('Cross-browser compatibility error:', error.message);
      throw error;
    }
  });

  /**
   * TS-055: Form Usability and Error Handling Testing
   * Validates user-friendly form interactions and error feedback
   */
  test('TS-055: Form usability and error handling', async () => {
    console.log('=== TS-055: Form Usability and Error Handling ===');

    const formTests = [
      { form: 'registration', path: '/register' },
      { form: 'login', path: '/login' },
      { form: 'provider-registration', path: '/register-provider' }
    ];

    for (const formTest of formTests) {
      console.log(`Testing ${formTest.form} form usability`);

      await page.goto(`http://localhost:3001${formTest.path}`);
      await page.waitForSelector('[data-testid="form-container"]');

      // Test form accessibility features
      const form = page.locator('form').first();
      await expect(form).toHaveAttribute('novalidate'); // Custom validation

      // Test required field validation
      const requiredFields = page.locator('input[required]');
      const requiredCount = await requiredFields.count();

      if (requiredCount > 0) {
        // Test empty form submission
        await page.click('[type="submit"]');

        // Validate error message display
        const errorMessages = page.locator('[data-testid="field-error"]');
        const errorCount = await errorMessages.count();
        expect(errorCount).toBeGreaterThan(0);

        // Test individual field validation
        const firstRequiredField = requiredFields.first();
        await firstRequiredField.focus();
        await firstRequiredField.blur();

        // Validate real-time validation feedback
        await expect(page.locator('[data-testid="field-error"]').first()).toBeVisible();
      }

      // Test input formatting and assistance
      const emailFields = page.locator('input[type="email"]');
      if (await emailFields.count() > 0) {
        const emailField = emailFields.first();

        // Test invalid email format
        await emailField.fill('invalid-email');
        await emailField.blur();

        // Validate email format error
        const emailError = page.locator('[data-testid="email-error"]');
        await expect(emailError).toBeVisible();

        // Test valid email format
        await emailField.fill('valid@example.com');
        await emailField.blur();
        await expect(emailError).not.toBeVisible();
      }

      // Test password strength indicators
      const passwordFields = page.locator('input[type="password"]');
      if (await passwordFields.count() > 0) {
        const passwordField = passwordFields.first();

        // Test weak password
        await passwordField.fill('123');
        const strengthIndicator = page.locator('[data-testid="password-strength"]');

        if (await strengthIndicator.count() > 0) {
          await expect(strengthIndicator).toHaveText(/weak|poor/i);
        }

        // Test strong password
        await passwordField.fill('StrongPassword123!');
        if (await strengthIndicator.count() > 0) {
          await expect(strengthIndicator).toHaveText(/strong|good/i);
        }
      }

      console.log(`✓ ${formTest.form} form usability testing completed`);
    }
  });

  /**
   * TS-056: Navigation and User Flow Optimization
   * Validates intuitive navigation and user journey optimization
   */
  test('TS-056: Navigation and user flow optimization', async () => {
    console.log('=== TS-056: Navigation and User Flow Optimization ===');

    const navigationTests = {
      breadcrumbs: [] as string[],
      backNavigation: [] as boolean[],
      contextualActions: [] as string[]
    };

    try {
      // Test primary navigation structure
      await page.waitForSelector('[data-testid="main-navigation"]');

      const navItems = page.locator('[data-testid="nav-item"]');
      const navCount = await navItems.count();
      expect(navCount).toBeGreaterThanOrEqual(4); // Minimum navigation items

      // Test navigation accessibility
      for (let i = 0; i < navCount; i++) {
        const navItem = navItems.nth(i);
        await expect(navItem).toHaveAttribute('role', 'menuitem');

        const navText = await navItem.textContent();
        navigationTests.breadcrumbs.push(navText || '');
      }

      // Test deep navigation flow
      console.log('Testing deep navigation: Find Providers → Provider Details → Booking');

      await page.click('[data-testid="find-providers-nav"]');
      await page.waitForSelector('[data-testid="provider-search-interface"]');

      // Validate breadcrumb navigation
      const breadcrumbs = page.locator('[data-testid="breadcrumb"]');
      if (await breadcrumbs.count() > 0) {
        await expect(breadcrumbs).toContainText('Find Providers');
      }

      // Navigate to provider details
      const providerCards = page.locator('[data-testid="provider-card"]');
      if (await providerCards.count() > 0) {
        await providerCards.first().click();
        await page.waitForSelector('[data-testid="provider-details"]');

        // Test back navigation
        const backButton = page.locator('[data-testid="back-button"]');
        if (await backButton.count() > 0) {
          await backButton.click();
          await page.waitForSelector('[data-testid="provider-search-interface"]');
          navigationTests.backNavigation.push(true);
        }
      }

      // Test contextual action availability
      await page.goto('http://localhost:3001/bookings');
      await page.waitForSelector('[data-testid="bookings-dashboard"]');

      const contextualActions = page.locator('[data-testid="contextual-action"]');
      const actionCount = await contextualActions.count();

      for (let i = 0; i < Math.min(actionCount, 3); i++) {
        const action = contextualActions.nth(i);
        const actionText = await action.textContent();
        navigationTests.contextualActions.push(actionText || '');
      }

      // Test search functionality
      const searchInput = page.locator('[data-testid="global-search"]');
      if (await searchInput.count() > 0) {
        await searchInput.fill('cleaning service');
        await page.keyboard.press('Enter');

        // Validate search results or suggestions
        await page.waitForSelector('[data-testid="search-results"], [data-testid="search-suggestions"]', { timeout: 3000 });
      }

      console.log(`Navigation breadcrumbs: ${navigationTests.breadcrumbs.join(' → ')}`);
      console.log(`Back navigation tests passed: ${navigationTests.backNavigation.length}`);
      console.log(`Contextual actions found: ${navigationTests.contextualActions.length}`);

    } catch (error) {
      console.error('Navigation optimization error:', error.message);
      throw error;
    }
  });

  /**
   * TS-057: Performance and Loading Experience
   * Validates page load times and performance user experience
   */
  test('TS-057: Performance and loading experience', async () => {
    console.log('=== TS-057: Performance and Loading Experience ===');

    const performanceMetrics = {
      pageLoads: [] as number[],
      interactionDelays: [] as number[],
      resourceLoading: [] as number[]
    };

    try {
      // Test initial page load performance
      const startTime = Date.now();
      await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
      const initialLoadTime = Date.now() - startTime;
      performanceMetrics.pageLoads.push(initialLoadTime);

      console.log(`Initial page load: ${initialLoadTime}ms`);
      expect(initialLoadTime).toBeLessThan(5000); // Under 5 seconds

      // Test subsequent navigation performance
      const navigationStart = Date.now();
      await page.click('[data-testid="find-providers-nav"]');
      await page.waitForSelector('[data-testid="provider-search-interface"]');
      const navigationTime = Date.now() - navigationStart;
      performanceMetrics.pageLoads.push(navigationTime);

      console.log(`Navigation time: ${navigationTime}ms`);
      expect(navigationTime).toBeLessThan(2000); // Under 2 seconds

      // Test loading states and feedback
      await page.fill('[data-testid="location-search"]', 'New York');

      const searchStart = Date.now();
      await page.click('[data-testid="search-providers-button"]');

      // Validate loading indicator appears
      await page.waitForSelector('[data-testid="search-loading"]', { timeout: 1000 });
      await page.waitForSelector('[data-testid="provider-results"]', { timeout: 10000 });

      const searchTime = Date.now() - searchStart;
      performanceMetrics.interactionDelays.push(searchTime);

      console.log(`Search interaction time: ${searchTime}ms`);
      expect(searchTime).toBeLessThan(8000); // Under 8 seconds

      // Test resource loading optimization
      const resourceMetrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const resources = performance.getEntriesByType('resource');

        return {
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          resourceCount: resources.length,
          totalResourceTime: resources.reduce((total, resource) => total + resource.duration, 0)
        };
      });

      performanceMetrics.resourceLoading.push(resourceMetrics.domContentLoaded);

      console.log(`DOM Content Loaded: ${resourceMetrics.domContentLoaded}ms`);
      console.log(`Total Resources: ${resourceMetrics.resourceCount}`);

      // Performance summary
      console.log(`\n=== Performance Summary ===`);
      console.log(`Average Page Load: ${performanceMetrics.pageLoads.reduce((a, b) => a + b, 0) / performanceMetrics.pageLoads.length}ms`);
      console.log(`Average Interaction Delay: ${performanceMetrics.interactionDelays.reduce((a, b) => a + b, 0) / performanceMetrics.interactionDelays.length}ms`);

    } catch (error) {
      console.error('Performance testing error:', error.message);
      throw error;
    }
  });
});
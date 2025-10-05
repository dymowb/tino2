# Manual Customer Registration Testing Script

## Prerequisites
- Frontend running on http://localhost:3001
- Backend running on http://localhost:3000
- Firefox browser (as specified in requirements)

## Test Steps

### Step 1: Homepage Navigation
1. Open Firefox and navigate to `http://localhost:3001`
2. Verify page loads with "Welcome to Tino 2" header
3. Look for "Get Started" button (should be prominent)
4. Screenshot: `01-homepage.png`

### Step 2: Registration Form Access
1. Click "Get Started" button
2. Verify navigation to `/register` route
3. Check form displays with all required fields:
   - Account Type (Customer/Provider dropdown)
   - First Name
   - Last Name
   - Email Address
   - Phone Number (Optional)
   - Password
   - Confirm Password
4. Screenshot: `02-registration-form.png`

### Step 3: Form Validation Testing
1. Try submitting empty form - check for validation errors
2. Enter invalid email (e.g., "invalid-email") - check email validation
3. Enter short password (e.g., "123") - check password requirements
4. Enter mismatched passwords - check confirmation validation
5. Screenshot: `03-validation-errors.png`

### Step 4: Successful Registration
1. Fill form with valid data:
   - Account Type: Customer
   - First Name: John
   - Last Name: Customer
   - Email: john.testuser@example.com
   - Phone: +1234567890
   - Password: TestPassword123!
   - Confirm Password: TestPassword123!
2. Click "Create Account" button
3. Verify successful registration (redirect or success message)
4. Screenshot: `04-registration-success.png`

### Step 5: Post-Registration Experience
1. Check if redirected to homepage or dashboard
2. Verify user is logged in (check navigation menu)
3. Look for customer-specific navigation items:
   - Find Providers
   - My Bookings
   - Messages
   - Payments
   - My Reviews
4. Check user avatar/profile in navigation
5. Screenshot: `05-logged-in-state.png`

### Step 6: Customer Navigation Testing
1. Click "Find Providers" - verify access to provider listings
2. Click "My Bookings" - verify access to bookings page
3. Click user avatar - verify dropdown menu with Profile/Logout
4. Screenshot: `06-customer-navigation.png`

## Expected Results
- All navigation flows work smoothly
- Form validation prevents invalid submissions
- Successful registration creates authenticated session
- Customer role has access to appropriate features
- No JavaScript errors in browser console
- Responsive design works on different screen sizes

## Test Data
Use different email addresses for each test run to avoid duplicate email errors:
- john.test1@example.com
- john.test2@example.com
- etc.

## Browser Console Check
Monitor browser console for:
- No JavaScript errors
- Successful API calls
- Proper token storage in localStorage
// Test data fixtures for consistent testing across all test suites

export const TestUsers = {
  customer: {
    email: 'customer@test.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'Customer',
    phone: '+1234567890',
    userType: 'customer'
  },
  provider: {
    email: 'provider@test.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'Provider',
    phone: '+1987654321',
    userType: 'provider'
  },
  admin: {
    email: 'admin@test.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'Admin',
    phone: '+1555666777',
    userType: 'admin'
  }
};

export const TestProvider = {
  businessName: 'Test Cleaning Services',
  description: 'Professional cleaning services for homes and offices',
  services: ['House Cleaning', 'Office Cleaning', 'Deep Cleaning'],
  location: {
    address: '456 Provider Street, Test City, TC 12345',
    latitude: 40.7580,
    longitude: -73.9855
  },
  serviceRadius: 25,
  pricing: {
    'House Cleaning': { rate: 30, unit: 'hour' },
    'Office Cleaning': { rate: 35, unit: 'hour' },
    'Deep Cleaning': { rate: 50, unit: 'hour' }
  },
  availability: {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: { start: '09:00', end: '17:00' },
    thursday: { start: '09:00', end: '17:00' },
    friday: { start: '09:00', end: '17:00' },
    saturday: { start: '10:00', end: '15:00' },
    sunday: { closed: true }
  },
  certifications: ['Licensed', 'Insured', 'Background Checked'],
  portfolio: [
    'https://via.placeholder.com/300x200?text=Cleaning+Before',
    'https://via.placeholder.com/300x200?text=Cleaning+After'
  ]
};

export const TestBooking = {
  serviceType: 'House Cleaning',
  description: 'Regular house cleaning service for 3-bedroom apartment',
  location: {
    address: '123 Test Street, Test City, TC 12345',
    latitude: 40.7128,
    longitude: -74.0060
  },
  scheduledDate: () => {
    // Always return a date 7 days from now at 10:00 AM
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setHours(10, 0, 0, 0);
    return date.toISOString();
  },
  estimatedDuration: 3,
  estimatedCost: 90.00,
  specialInstructions: 'Please use eco-friendly cleaning products. Key is under the doormat.',
  status: 'pending'
};

export const TestQuoteRequest = {
  title: 'House Cleaning Quote Request',
  serviceType: 'House Cleaning',
  description: 'Need weekly house cleaning for a 2-bedroom apartment. Includes kitchen, bathrooms, living room, and bedrooms.',
  location: {
    address: '789 Quote Street, Test City, TC 12345',
    latitude: 40.7489,
    longitude: -73.9857
  },
  preferredDate: () => {
    // Always return a date 10 days from now
    const date = new Date();
    date.setDate(date.getDate() + 10);
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  },
  budgetRange: {
    min: 50,
    max: 100
  },
  urgency: 'medium',
  requirements: [
    'Eco-friendly products only',
    'Pet-safe cleaning solutions',
    'Flexible scheduling'
  ],
  images: [
    'https://via.placeholder.com/400x300?text=Living+Room',
    'https://via.placeholder.com/400x300?text=Kitchen'
  ]
};

export const TestQuote = {
  title: 'Weekly House Cleaning Service',
  description: 'Comprehensive cleaning service including all rooms, kitchen deep clean, and bathroom sanitization.',
  totalAmount: 85.00,
  breakdown: {
    labor: 60.00,
    materials: 15.00,
    equipment: 5.00,
    tax: 5.00
  },
  validUntil: () => {
    // Valid for 7 days from now
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString();
  },
  estimatedDuration: 3,
  termsAndConditions: [
    'Payment due upon completion',
    'Cancellation with 24-hour notice',
    'Additional services may incur extra charges'
  ],
  notes: 'We will bring all necessary equipment and eco-friendly supplies.'
};

export const TestMessage = {
  conversation: {
    type: 'direct',
    participants: ['customer@test.com', 'provider@test.com'],
    subject: 'House Cleaning Service Discussion'
  },
  messages: [
    {
      sender: 'customer@test.com',
      content: 'Hi, I saw your cleaning service profile and I\'m interested in weekly cleaning.',
      type: 'text',
      timestamp: () => new Date(Date.now() - 60000) // 1 minute ago
    },
    {
      sender: 'provider@test.com',
      content: 'Thank you for your interest! I\'d be happy to help. What size is your home?',
      type: 'text',
      timestamp: () => new Date(Date.now() - 30000) // 30 seconds ago
    }
  ]
};

export const TestPayment = {
  amount: 90.00,
  currency: 'usd',
  description: 'House cleaning service payment',
  paymentMethodId: 'pm_test_visa', // Stripe test payment method
  escrow: true,
  platformFeeRate: 0.10, // 10%
  metadata: {
    bookingId: 'test-booking-123',
    serviceType: 'House Cleaning',
    customerId: 'test-customer-id',
    providerId: 'test-provider-id'
  }
};

export const TestReview = {
  rating: 5,
  title: 'Excellent cleaning service!',
  comment: 'The cleaning was thorough and professional. Very satisfied with the quality of work.',
  criteria: {
    quality: 5,
    timeliness: 5,
    communication: 4,
    professionalism: 5,
    value: 4
  },
  anonymous: false,
  photos: [
    'https://via.placeholder.com/300x200?text=Clean+Kitchen',
    'https://via.placeholder.com/300x200?text=Clean+Bathroom'
  ],
  wouldRecommend: true
};

export const TestNotification = {
  type: 'booking',
  title: 'Booking Confirmed',
  message: 'Your booking for house cleaning service has been confirmed.',
  priority: 'high',
  data: {
    bookingId: 'test-booking-123',
    scheduledDate: TestBooking.scheduledDate(),
    providerName: 'Test Cleaning Services'
  },
  channels: ['email', 'push'],
  read: false
};

export const TestSearchFilters = {
  location: {
    address: '123 Test Street, Test City, TC 12345',
    latitude: 40.7128,
    longitude: -74.0060,
    radius: 10 // miles
  },
  serviceTypes: ['House Cleaning', 'Office Cleaning'],
  priceRange: {
    min: 20,
    max: 50
  },
  rating: 4.0,
  availability: {
    date: () => {
      const date = new Date();
      date.setDate(date.getDate() + 3);
      return date.toISOString().split('T')[0];
    },
    time: 'morning'
  },
  features: ['Licensed', 'Insured', 'Background Checked'],
  sortBy: 'distance'
};

export const PerformanceThresholds = {
  pageLoadTime: 3000, // 3 seconds
  apiResponseTime: 200, // 200ms
  searchResponseTime: 500, // 500ms
  messageDeliveryTime: 100, // 100ms for real-time messages
  paymentProcessingTime: 5000, // 5 seconds for payment confirmation
  fileUploadTime: 10000 // 10 seconds for image uploads
};

export const AccessibilityRequirements = {
  colorContrast: 4.5, // WCAG AA standard
  focusIndicatorWidth: 2, // 2px minimum
  touchTargetSize: 44, // 44px minimum
  headingHierarchy: true, // Proper h1 -> h2 -> h3 structure
  altTextRequired: true, // All images must have alt text
  keyboardNavigation: true // All interactive elements must be keyboard accessible
};
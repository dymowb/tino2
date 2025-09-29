import 'reflect-metadata';
import { AppDataSource } from '@/config/database';
import { mongoClient } from '@/config/mongodb';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Review } from '@/models/Review';
import { passwordService } from '@/utils/password';
import logger from '@/config/logger';

const SERVICES = [
  'House Cleaning', 'Deep Cleaning', 'Move-in/Move-out Cleaning', 'Post-Construction Cleaning',
  'Office Cleaning', 'Carpet Cleaning', 'Upholstery Cleaning', 'Window Cleaning',
  'Plumbing Repair', 'Drain Cleaning', 'Pipe Installation', 'Water Heater Repair',
  'Leak Detection', 'Bathroom Plumbing', 'Kitchen Plumbing', 'Emergency Plumbing',
  'Electrical Repair', 'Wiring Installation', 'Lighting Installation', 'Ceiling Fan Installation',
  'Outlet Installation', 'Circuit Breaker Repair', 'Electrical Inspection', 'Smart Home Setup',
  'Lawn Mowing', 'Garden Design', 'Tree Trimming', 'Hedge Trimming',
  'Irrigation Installation', 'Landscaping', 'Pest Control', 'Fertilization',
  'Interior Painting', 'Exterior Painting', 'Cabinet Painting', 'Pressure Washing',
  'Wallpaper Removal', 'Drywall Repair', 'Trim Work', 'Color Consultation',
  'Appliance Repair', 'Refrigerator Repair', 'Dishwasher Repair', 'Washer/Dryer Repair',
  'Oven Repair', 'Microwave Repair', 'HVAC Repair', 'Air Conditioning Service',
  'Furniture Assembly', 'TV Mounting', 'Shelf Installation', 'Door Installation',
  'Cabinet Installation', 'Tile Installation', 'Flooring Installation', 'Deck Building',
  'Roofing Repair', 'Gutter Cleaning', 'Fence Installation', 'Pool Maintenance',
  'Hot Tub Service', 'Garage Door Repair', 'Locksmith Services', 'Security System Installation',
  'Home Inspection', 'Mold Remediation', 'Water Damage Restoration', 'Fire Damage Restoration',
  'Moving Services', 'Junk Removal', 'Storage Solutions', 'Packing Services',
  'Pet Sitting', 'Dog Walking', 'Pet Grooming', 'Aquarium Maintenance',
  'Personal Training', 'Yoga Instruction', 'Massage Therapy', 'Nutrition Consulting',
  'Tutoring Services', 'Music Lessons', 'Language Lessons', 'Computer Repair',
  'Photography', 'Videography', 'Event Planning', 'Catering Services',
  'Auto Detailing', 'Car Wash', 'Oil Change', 'Tire Service',
  'Snow Removal', 'Driveway Sealing', 'Sidewalk Repair', 'Chimney Cleaning',
  'Solar Panel Installation', 'Energy Audit', 'Insulation Installation', 'Storm Door Installation'
];

const LOCATIONS = [
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.006 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.074 },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
  { city: 'San Antonio', state: 'TX', lat: 29.4241, lng: -98.4936 },
  { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611 },
  { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
  { city: 'San Jose', state: 'CA', lat: 37.3382, lng: -121.8863 },
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  { city: 'Jacksonville', state: 'FL', lat: 30.3322, lng: -81.6557 },
  { city: 'Fort Worth', state: 'TX', lat: 32.7555, lng: -97.3308 },
  { city: 'Columbus', state: 'OH', lat: 39.9612, lng: -82.9988 },
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  { city: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431 },
  { city: 'Indianapolis', state: 'IN', lat: 39.7684, lng: -86.158 },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 }
];

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Helen', 'Mark', 'Sandra', 'Donald', 'Donna',
  'Steven', 'Carol', 'Paul', 'Ruth', 'Andrew', 'Sharon', 'Joshua', 'Michelle',
  'Kenneth', 'Laura', 'Kevin', 'Sarah', 'Brian', 'Kimberly', 'George', 'Deborah',
  'Timothy', 'Dorothy', 'Ronald', 'Lisa', 'Jason', 'Nancy', 'Edward', 'Karen'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzales', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell'
];

const REVIEW_TEMPLATES = {
  5: [
    'Exceptional service! {firstName} exceeded all expectations. The {service} was completed perfectly and on time. Highly recommend!',
    'Outstanding work from {firstName}! Professional, courteous, and delivered exactly what was promised. Will definitely book again.',
    'Absolutely amazing! {firstName} was punctual, thorough, and the quality of {service} was top-notch. 5 stars well deserved!',
    'Perfect experience from start to finish! {firstName} was professional and the {service} results were fantastic.',
    'Couldn\'t be happier! {firstName} did an incredible job with {service}. Clean, efficient, and reasonably priced.'
  ],
  4: [
    'Great service from {firstName}! The {service} was done well, minor issues but overall very satisfied.',
    'Good job overall. {firstName} was professional and the {service} met our expectations. Would recommend.',
    'Very pleased with the work. {firstName} was on time and did quality {service}. Small room for improvement but good experience.',
    'Solid work from {firstName}. The {service} was completed as requested with good attention to detail.',
    'Happy with the service. {firstName} was reliable and the {service} quality was good. Worth the price.'
  ],
  3: [
    'Decent service. {firstName} completed the {service} adequately but nothing exceptional. Average experience.',
    'Okay job with {service}. {firstName} was punctual but the work quality was just satisfactory.',
    'Fair service from {firstName}. The {service} was completed but had some minor issues that needed attention.',
    'Average experience. {firstName} did the {service} as requested but could have been more thorough.',
    'Acceptable work. {firstName} was professional but the {service} quality was just okay for the price.'
  ],
  2: [
    'Below expectations. {firstName} completed {service} but quality was poor and took longer than expected.',
    'Disappointing service. {firstName} was late and the {service} had several issues that needed fixing.',
    'Not satisfied with the work. {firstName} rushed through {service} and left several areas incomplete.',
    'Poor communication from {firstName}. The {service} was eventually completed but with multiple problems.',
    'Subpar experience. {firstName} did not follow instructions properly and {service} quality was lacking.'
  ],
  1: [
    'Terrible experience! {firstName} was unprofessional and the {service} was completely unsatisfactory.',
    'Worst service ever. {firstName} caused damage and did not complete {service} properly. Avoid at all costs!',
    'Completely disappointed. {firstName} was late, rude, and the {service} was poorly executed.',
    'Unacceptable work from {firstName}. The {service} was left unfinished and created more problems.',
    'Do not recommend! {firstName} was unreliable and the {service} quality was absolutely terrible.'
  ]
};

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function getRandomDate(daysBack: number, daysForward: number = 0): Date {
  const now = new Date();
  const start = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
  const end = new Date(now.getTime() + (daysForward * 24 * 60 * 60 * 1000));
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getWeightedRating(): number {
  // Weighted distribution: more 4-5 star reviews, fewer 1-2 star
  const weights = [0.05, 0.10, 0.15, 0.35, 0.35]; // 1,2,3,4,5 stars
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (random <= cumulative) {
      return i + 1;
    }
  }
  return 5;
}

function generateReviewComment(rating: number, providerName: string, service: string): string {
  const templates = REVIEW_TEMPLATES[rating as keyof typeof REVIEW_TEMPLATES];
  const template = getRandomItem(templates);
  return template
    .replace('{firstName}', providerName)
    .replace('{service}', service.toLowerCase());
}

class DatabaseSeeder {
  private users: User[] = [];
  private providers: Provider[] = [];
  private bookings: Booking[] = [];

  async seed(): Promise<void> {
    logger.info('Starting database seeding...');

    try {
      await this.clearDatabase();
      await this.seedUsers();
      await this.seedBookings();
      await this.seedReviews();
      logger.info('Database seeding completed successfully!');
    } catch (error) {
      logger.error('Database seeding failed:', error);
      throw error;
    }
  }

  private async clearDatabase(): Promise<void> {
    logger.info('Clearing existing data...');

    // Temporarily disable foreign key constraints for SQLite
    await AppDataSource.query('PRAGMA foreign_keys = OFF');

    try {
      const userRepository = AppDataSource.getRepository(User);
      const providerRepository = AppDataSource.getRepository(Provider);
      const bookingRepository = AppDataSource.getRepository(Booking);
      const reviewRepository = AppDataSource.getRepository(Review);

      // Clear all tables
      await reviewRepository.clear();
      await bookingRepository.clear();
      await providerRepository.clear();
      await userRepository.clear();

      logger.info('Database cleared successfully');
    } finally {
      // Re-enable foreign key constraints
      await AppDataSource.query('PRAGMA foreign_keys = ON');
    }
  }

  private async seedUsers(): Promise<void> {
    logger.info('Seeding 50 users (25 customers + 25 providers)...');

    const userRepository = AppDataSource.getRepository(User);
    const providerRepository = AppDataSource.getRepository(Provider);
    const hashedPassword = await passwordService.hash('Demo123!');

    // Create demo accounts first
    const demoUsers = [
      {
        email: 'customer@demo.com',
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'Customer',
        phone: '+15551234567',
        userType: UserType.CUSTOMER,
        isVerified: true,
      },
      {
        email: 'provider@demo.com',
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'Provider',
        phone: '+15559876543',
        userType: UserType.PROVIDER,
        isVerified: true,
      },
    ];

    // Generate 48 additional users (24 customers + 24 providers)
    for (let i = 0; i < 48; i++) {
      const firstName = getRandomItem(FIRST_NAMES);
      const lastName = getRandomItem(LAST_NAMES);
      const userType = i < 24 ? UserType.CUSTOMER : UserType.PROVIDER;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@test.com`;
      const phone = `+1555${String(Math.floor(Math.random() * 9000000) + 1000000)}`;

      demoUsers.push({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        userType,
        isVerified: true,
      });
    }

    // Create users
    for (const userData of demoUsers) {
      const user = userRepository.create({
        ...userData,
        settings: {
          notifications: { email: true, sms: true, push: true },
          privacy: { showProfile: true, showLocation: true },
        },
      });

      const savedUser = await userRepository.save(user);
      this.users.push(savedUser);

      if (userData.userType === UserType.PROVIDER) {
        const location = getRandomItem(LOCATIONS);
        // Each provider offers 8-15 services (average ~12)
        const serviceCount = Math.floor(Math.random() * 8) + 8;
        const services = getRandomItems(SERVICES, serviceCount);

        const provider = providerRepository.create({
          userId: savedUser.id,
          businessName: `${savedUser.firstName} ${savedUser.lastName} Services`,
          description: `Professional ${services.slice(0, 3).join(', ')} and more. Serving ${location.city} area with quality workmanship.`,
          services,
          location: {
            latitude: location.lat + (Math.random() - 0.5) * 0.1, // Add slight variation
            longitude: location.lng + (Math.random() - 0.5) * 0.1,
            address: `${Math.floor(Math.random() * 9999) + 1} ${getRandomItem(['Main', 'Oak', 'Pine', 'Elm', 'Maple'])} Street`,
            city: location.city,
            state: location.state,
            zipCode: String(Math.floor(Math.random() * 90000) + 10000),
            country: 'USA',
          },
          serviceRadius: Math.floor(Math.random() * 30) + 15, // 15-45 miles
          rating: Math.round((Math.random() * 2 + 3) * 10) / 10, // 3.0-5.0
          totalReviews: Math.floor(Math.random() * 100) + 5, // 5-105 reviews
          portfolioImages: [],
          isBackgroundChecked: Math.random() > 0.2, // 80% background checked
          isInsured: Math.random() > 0.3, // 70% insured
          isActive: Math.random() > 0.1, // 90% active
          availableHours: {
            monday: { start: '08:00', end: '18:00', available: Math.random() > 0.1 },
            tuesday: { start: '08:00', end: '18:00', available: Math.random() > 0.1 },
            wednesday: { start: '08:00', end: '18:00', available: Math.random() > 0.1 },
            thursday: { start: '08:00', end: '18:00', available: Math.random() > 0.1 },
            friday: { start: '08:00', end: '18:00', available: Math.random() > 0.1 },
            saturday: { start: '09:00', end: '16:00', available: Math.random() > 0.3 },
            sunday: { start: '10:00', end: '15:00', available: Math.random() > 0.6 },
          },
          pricing: {
            baseRate: Math.floor(Math.random() * 100) + 50, // $50-150/hour
            currency: 'USD',
            rateType: Math.random() > 0.7 ? 'fixed' : 'hourly',
          },
          completedJobs: Math.floor(Math.random() * 200) + 10, // 10-210 jobs
          responseRate: Math.floor(Math.random() * 30) + 70, // 70-100%
          averageResponseTime: Math.floor(Math.random() * 120) + 15, // 15-135 minutes
        });

        const savedProvider = await providerRepository.save(provider);
        this.providers.push(savedProvider);
      }
    }

    logger.info(`Created ${this.users.length} users (${this.users.filter(u => u.userType === UserType.CUSTOMER).length} customers, ${this.users.filter(u => u.userType === UserType.PROVIDER).length} providers)`);
  }

  private async seedBookings(): Promise<void> {
    logger.info('Seeding bookings...');

    const bookingRepository = AppDataSource.getRepository(Booking);
    const customers = this.users.filter(u => u.userType === UserType.CUSTOMER);

    // Create 150-200 bookings with varied statuses
    const bookingCount = Math.floor(Math.random() * 51) + 150;

    for (let i = 0; i < bookingCount; i++) {
      const customer = getRandomItem(customers);
      const provider = getRandomItem(this.providers);
      const service = getRandomItem(provider.services);
      const location = getRandomItem(LOCATIONS);

      // Weighted status distribution: more completed bookings for reviews
      const statusWeights = [
        { status: BookingStatus.COMPLETED, weight: 0.6 },
        { status: BookingStatus.CONFIRMED, weight: 0.15 },
        { status: BookingStatus.IN_PROGRESS, weight: 0.10 },
        { status: BookingStatus.PENDING, weight: 0.10 },
        { status: BookingStatus.CANCELLED, weight: 0.05 },
      ];

      let random = Math.random();
      let status = BookingStatus.COMPLETED;
      for (const sw of statusWeights) {
        if (random <= sw.weight) {
          status = sw.status;
          break;
        }
        random -= sw.weight;
      }

      const scheduledDate = getRandomDate(90, 30); // 90 days back to 30 days forward
      const completedDate = status === BookingStatus.COMPLETED ?
        new Date(scheduledDate.getTime() + Math.random() * 4 * 60 * 60 * 1000) : // Complete within 4 hours
        null;

      const booking = bookingRepository.create({
        customerId: customer.id,
        providerId: provider.id,
        serviceType: service,
        description: `Professional ${service.toLowerCase()} service requested for ${location.city} area.`,
        location: {
          latitude: location.lat + (Math.random() - 0.5) * 0.02,
          longitude: location.lng + (Math.random() - 0.5) * 0.02,
          address: `${Math.floor(Math.random() * 9999) + 1} ${getRandomItem(['Main', 'Oak', 'Pine', 'Elm', 'Maple'])} Street`,
          city: location.city,
          state: location.state,
          zipCode: String(Math.floor(Math.random() * 90000) + 10000),
        },
        scheduledDate,
        estimatedDuration: Math.floor(Math.random() * 180) + 60, // 1-4 hours
        status,
        totalAmount: Math.floor(Math.random() * 300) + 50, // $50-350
        paymentStatus: status === BookingStatus.COMPLETED ? PaymentStatus.PAID :
                      status === BookingStatus.CANCELLED ? PaymentStatus.REFUNDED :
                      PaymentStatus.PENDING,
        completedAt: completedDate,
        confirmedAt: status !== BookingStatus.PENDING ? scheduledDate : null,
        startedAt: status === BookingStatus.COMPLETED || status === BookingStatus.IN_PROGRESS ?
                   scheduledDate : null,
      });

      const savedBooking = await bookingRepository.save(booking);
      this.bookings.push(savedBooking);
    }

    logger.info(`Created ${this.bookings.length} bookings`);

    // Create additional bookings for demo customer to test pagination and data interaction
    logger.info('Adding extra bookings for demo customer for UX testing...');
    const demoCustomer = this.users.find(u => u.email === 'customer@demo.com');
    if (demoCustomer) {
      for (let i = 0; i < 47; i++) { // Add 47 more bookings (total ~50)
        const provider = getRandomItem(this.providers);
        const service = getRandomItem(provider.services);
        const location = getRandomItem(LOCATIONS);

        // Mostly completed bookings for review testing
        const statusWeights = [
          { status: BookingStatus.COMPLETED, weight: 0.8 },
          { status: BookingStatus.CONFIRMED, weight: 0.1 },
          { status: BookingStatus.IN_PROGRESS, weight: 0.05 },
          { status: BookingStatus.PENDING, weight: 0.05 },
        ];

        let random = Math.random();
        let status = BookingStatus.COMPLETED;
        for (const sw of statusWeights) {
          if (random <= sw.weight) {
            status = sw.status;
            break;
          }
          random -= sw.weight;
        }

        const booking = bookingRepository.create({
          customerId: demoCustomer.id,
          providerId: provider.id,
          serviceType: service,
          description: `Professional ${service.toLowerCase()} service requested for ${location.city} area.`,
          location: {
            latitude: location.lat + (Math.random() - 0.5) * 0.1,
            longitude: location.lng + (Math.random() - 0.5) * 0.1,
            address: `${Math.floor(Math.random() * 9999) + 1000} ${getRandomItem(['Main Street', 'Oak Street', 'Elm Street', 'Maple Street'])}`,
            city: location.city,
            state: location.state,
            zipCode: String(Math.floor(Math.random() * 90000) + 10000),
          },
          scheduledDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random past dates
          estimatedDuration: Math.floor(Math.random() * 300) + 60,
          status,
          totalAmount: Math.floor(Math.random() * 400) + 100,
          paymentStatus: status === BookingStatus.COMPLETED ? PaymentStatus.PAID : PaymentStatus.PENDING,
          confirmedAt: status !== BookingStatus.PENDING ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null,
          startedAt: status === BookingStatus.COMPLETED || status === BookingStatus.IN_PROGRESS ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null,
          completedAt: status === BookingStatus.COMPLETED ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null,
        });

        const savedBooking = await bookingRepository.save(booking);
        this.bookings.push(savedBooking);
      }
      logger.info(`Added ${47} additional bookings for demo customer`);
    }

    // Also create additional bookings for demo provider to test provider views
    const demoProvider = this.providers.find(p => p.user && p.user.email === 'provider@demo.com');
    if (demoProvider) {
      const customers = this.users.filter(u => u.userType === UserType.CUSTOMER);
      for (let i = 0; i < 35; i++) { // Add 35 bookings for provider testing
        const customer = getRandomItem(customers);
        const service = getRandomItem(demoProvider.services);
        const location = getRandomItem(LOCATIONS);

        // Mix of statuses for provider dashboard testing
        const statusWeights = [
          { status: BookingStatus.COMPLETED, weight: 0.6 },
          { status: BookingStatus.CONFIRMED, weight: 0.2 },
          { status: BookingStatus.IN_PROGRESS, weight: 0.1 },
          { status: BookingStatus.PENDING, weight: 0.1 },
        ];

        let random = Math.random();
        let status = BookingStatus.COMPLETED;
        for (const sw of statusWeights) {
          if (random <= sw.weight) {
            status = sw.status;
            break;
          }
          random -= sw.weight;
        }

        const booking = bookingRepository.create({
          customerId: customer.id,
          providerId: demoProvider.id,
          serviceType: service,
          description: `Professional ${service.toLowerCase()} service requested for ${location.city} area.`,
          location: {
            latitude: location.lat + (Math.random() - 0.5) * 0.1,
            longitude: location.lng + (Math.random() - 0.5) * 0.1,
            address: `${Math.floor(Math.random() * 9999) + 1000} ${getRandomItem(['Main Street', 'Oak Street', 'Elm Street', 'Maple Street'])}`,
            city: location.city,
            state: location.state,
            zipCode: String(Math.floor(Math.random() * 90000) + 10000),
          },
          scheduledDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
          estimatedDuration: Math.floor(Math.random() * 300) + 60,
          status,
          totalAmount: Math.floor(Math.random() * 400) + 100,
          paymentStatus: status === BookingStatus.COMPLETED ? PaymentStatus.PAID : PaymentStatus.PENDING,
          confirmedAt: status !== BookingStatus.PENDING ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null,
          startedAt: status === BookingStatus.COMPLETED || status === BookingStatus.IN_PROGRESS ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null,
          completedAt: status === BookingStatus.COMPLETED ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null,
        });

        const savedBooking = await bookingRepository.save(booking);
        this.bookings.push(savedBooking);
      }
      logger.info(`Added ${35} additional bookings for demo provider`);
    }
  }

  private async seedReviews(): Promise<void> {
    logger.info('Seeding reviews with diverse ratings...');

    const reviewRepository = AppDataSource.getRepository(Review);
    const completedBookings = this.bookings.filter(b => b.status === BookingStatus.COMPLETED);

    // Create reviews for 70-85% of completed bookings
    const reviewPercentage = 0.7 + Math.random() * 0.15;
    const reviewCount = Math.floor(completedBookings.length * reviewPercentage);
    const bookingsToReview = getRandomItems(completedBookings, reviewCount);

    for (const booking of bookingsToReview) {
      const provider = this.providers.find(p => p.id === booking.providerId);
      const customer = this.users.find(u => u.id === booking.customerId);

      if (!provider || !customer) continue;

      const rating = getWeightedRating();
      const comment = generateReviewComment(rating, provider.businessName, booking.serviceType);

      // Generate criteria ratings that correlate with overall rating
      const variance = 0.5; // Allow some variation in criteria
      const criteria = {
        quality: Math.max(1, Math.min(5, rating + (Math.random() - 0.5) * variance)),
        timeliness: Math.max(1, Math.min(5, rating + (Math.random() - 0.5) * variance)),
        communication: Math.max(1, Math.min(5, rating + (Math.random() - 0.5) * variance)),
        professionalism: Math.max(1, Math.min(5, rating + (Math.random() - 0.5) * variance)),
        valueForMoney: Math.max(1, Math.min(5, rating + (Math.random() - 0.5) * variance)),
      };

      // Round criteria to 1 decimal place
      Object.keys(criteria).forEach(key => {
        criteria[key as keyof typeof criteria] = Math.round(criteria[key as keyof typeof criteria] * 10) / 10;
      });

      const review = reviewRepository.create({
        bookingId: booking.id,
        customerId: customer.id,
        providerId: provider.id,
        rating: Math.round(rating * 10) / 10,
        comment,
        criteria,
        isVerified: Math.random() > 0.1, // 90% verified
        createdAt: new Date(booking.completedAt!.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000), // Within a week
      });

      await reviewRepository.save(review);
    }

    logger.info(`Created ${reviewCount} diverse reviews (ratings 1-5 stars with realistic distribution)`);
  }
}

async function runSeeder(): Promise<void> {
  try {
    await AppDataSource.initialize();

    // Try to connect to MongoDB, but don't fail if it's not available
    try {
      await mongoClient.connect();
      logger.info('MongoDB connected successfully');
    } catch (mongoError: any) {
      logger.warn('MongoDB not available - continuing with PostgreSQL-only seeding:', mongoError.message);
    }

    const seeder = new DatabaseSeeder();
    await seeder.seed();

    logger.info('Database seeding completed! 🎉');
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    try {
      await mongoClient.disconnect();
    } catch (mongoError: any) {
      // Ignore disconnect errors if MongoDB was never connected
    }

    process.exit(0);
  }
}

if (require.main === module) {
  runSeeder();
}

export default DatabaseSeeder;

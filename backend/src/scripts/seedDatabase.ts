import 'reflect-metadata';
import { AppDataSource } from '@/config/database';
import { mongoClient } from '@/config/mongodb';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Review } from '@/models/Review';
import { Conversation, ConversationType } from '@/models/Conversation';
import { Message, MessageType } from '@/models/Message';
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

const MESSAGE_TEMPLATES = {
  customerInitial: [
    "Hi! I'm interested in your {service} service. Could you provide a quote?",
    "Hello, I saw your profile and would like to schedule {service}. Are you available this week?",
    "Good morning! I need {service} done. What's your availability and pricing?",
    "Hi there! Could you help me with {service}? I'd like to discuss the details.",
    "Hello! I'm looking for someone to do {service}. Can we discuss timing and cost?",
    "Hi! I need {service} service urgently. Are you available tomorrow?",
    "Good afternoon! Could you provide an estimate for {service}?",
    "Hello! I found your profile and need {service}. What's your rate?",
    "Hi! Could you help me with {service}? When would be a good time to discuss?",
    "Good morning! I'm interested in booking {service}. What information do you need?"
  ],
  providerResponse: [
    "Hello! I'd be happy to help with {service}. Could you tell me more about the scope of work?",
    "Hi there! Thanks for reaching out. I'm available for {service}. What's your timeline?",
    "Good to hear from you! I specialize in {service}. Could you share more details about your needs?",
    "Hello! I can definitely help with {service}. What's the size of the area/project?",
    "Hi! I'd love to work on your {service} project. When would you like to schedule it?",
    "Thank you for contacting me! I have experience with {service}. What's your budget range?",
    "Hello! I'm available for {service}. Could you send me some photos of the space?",
    "Hi! {service} is one of my specialties. What date works best for you?",
    "Good to meet you! I can provide {service}. Would you like to schedule a consultation?",
    "Hello! I'd be happy to quote your {service} project. What are the specific requirements?"
  ],
  customerDetails: [
    "The area is about 1200 sq ft. I'm flexible with timing, preferably weekends.",
    "It's a 2-bedroom apartment. I can be available weekday evenings or weekends.",
    "Medium-sized project, roughly 800 sq ft. I'd like it done within the next two weeks.",
    "It's a standard 3-bedroom house. Budget is around $200-400. Is that reasonable?",
    "Small to medium job, probably 2-3 hours of work. Morning times work best for me.",
    "The space is about 1000 sq ft. I need it done before next Friday if possible.",
    "It's a one-bedroom condo. I'm looking for quality work, budget is flexible.",
    "Average sized home, 1500 sq ft. I can work around your schedule.",
    "It's urgent - needed within 3 days. The area is approximately 600 sq ft.",
    "Standard residential project. I'm available most days after 3 PM."
  ],
  providerQuote: [
    "Based on your description, I can do this for $250. Includes all materials and cleanup.",
    "For a job this size, my rate would be $180. I can start this weekend if that works.",
    "I'd quote $320 for this project, which includes a 1-year warranty on the work.",
    "My estimate is $150 for this. I'm available Tuesday or Wednesday this week.",
    "I can do this for $275. That covers everything - materials, labor, and cleanup.",
    "For your project, I'd charge $200. I can schedule it for next Monday.",
    "My quote is $160. I use high-quality materials and guarantee satisfaction.",
    "I'd estimate $290 for this job. Includes preparation, work, and final inspection.",
    "For this size project, $220 seems fair. I can fit you in this Thursday.",
    "My rate for this would be $195. I'm flexible on timing to work around your schedule."
  ],
  customerAcceptance: [
    "That sounds perfect! When can we schedule it?",
    "Great price! I'd like to book you. What's the next step?",
    "Excellent! I accept your quote. How do we proceed?",
    "That works for me! Can we set up a time?",
    "Perfect! I'm ready to move forward. What do you need from me?",
    "Sounds good! When is your earliest availability?",
    "I'm happy with that quote. Let's schedule the work.",
    "Great! I'd like to book this service. What's your process?",
    "That's reasonable! Can we arrange a start date?",
    "Wonderful! I accept. How soon can you begin?"
  ],
  scheduling: [
    "I can start Monday at 9 AM. Does that work for you?",
    "How about Wednesday morning? I typically start around 8:30 AM.",
    "I have availability Friday afternoon. Would 2 PM be good?",
    "This Thursday at 10 AM works for me. Is that convenient?",
    "I can fit you in Tuesday morning. Shall we say 9:30 AM?",
    "Monday works perfectly! 9 AM it is. I'll be there promptly.",
    "Wednesday at 2 PM is perfect. I'll plan for about 3 hours of work.",
    "Friday morning works great! I'll arrive at 9 AM with all the equipment.",
    "Tuesday at 10 AM sounds good. I'll send you a confirmation text.",
    "Thursday is perfect! I'll be there at 2 PM sharp. Looking forward to it!"
  ],
  workUpdates: [
    "Just arrived and getting set up. Everything looks good!",
    "About 50% complete. So far everything is going smoothly.",
    "Work is progressing well. Should be finished within the estimated time.",
    "Almost done! Just doing final touches. You'll love the results.",
    "Completed! Everything looks great. Ready for your inspection.",
    "Starting the prep work now. Weather conditions are perfect.",
    "Taking a short break. Work is on schedule and looking excellent.",
    "Halfway through! The quality is turning out even better than expected.",
    "Just finished the main work. Now doing cleanup and final details.",
    "All set! Work is complete and area is cleaned up. Please take a look!"
  ],
  completion: [
    "Work is all done! Very pleased with how it turned out. Thank you!",
    "Looks fantastic! Thank you for the excellent service.",
    "Perfect! Exactly what I was hoping for. Will definitely recommend you.",
    "Amazing work! So happy with the results. Worth every penny.",
    "Excellent job! Thank you for being professional and thorough.",
    "Wonderful! You exceeded my expectations. Will hire you again.",
    "Thank you for the great work! The quality is outstanding.",
    "Perfect! Thanks for completing it on time and on budget.",
    "Fantastic results! I'm very satisfied with your service.",
    "Excellent work! Thank you for your attention to detail."
  ]
};

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
  private conversations: Conversation[] = [];

  async seed(): Promise<void> {
    logger.info('Starting database seeding...');

    try {
      await this.clearDatabase();
      await this.seedUsers();
      await this.seedBookings();
      await this.seedConversations();
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
      const messageRepository = AppDataSource.getRepository(Message);
      const conversationRepository = AppDataSource.getRepository(Conversation);

      // Clear all tables (order matters due to foreign keys)
      await reviewRepository.clear();
      await messageRepository.clear();
      await conversationRepository.clear();
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

  private async seedConversations(): Promise<void> {
    logger.info('Seeding conversations and messages for demo customer...');

    const conversationRepository = AppDataSource.getRepository(Conversation);
    const messageRepository = AppDataSource.getRepository(Message);

    // Get demo customer
    const demoCustomer = this.users.find(u => u.email === 'customer@demo.com');
    if (!demoCustomer) {
      logger.error('Demo customer not found');
      return;
    }

    // Get providers to create conversations with (use first 25 providers)
    const providersToMessage = this.providers.slice(0, 25);

    // Create conversations - target 55+ total conversations for robust testing
    let conversationCount = 0;

    // Create conversations with each provider (25 conversations)
    for (const provider of providersToMessage) {
      const providerUser = this.users.find(u => u.id === provider.userId);
      if (!providerUser) continue;

      await this.createConversationWithMessages(
        conversationRepository,
        messageRepository,
        demoCustomer,
        providerUser,
        provider.services[0] || 'general service'
      );
      conversationCount++;
    }

    // Create additional conversations for variety (30 more conversations)
    for (let i = 0; i < 30; i++) {
      const randomProvider = getRandomItem(this.providers);
      const providerUser = this.users.find(u => u.id === randomProvider.userId);
      if (!providerUser) continue;

      const randomService = getRandomItem(randomProvider.services);
      await this.createConversationWithMessages(
        conversationRepository,
        messageRepository,
        demoCustomer,
        providerUser,
        randomService
      );
      conversationCount++;
    }

    logger.info(`Created ${conversationCount} conversations with realistic message histories`);
  }

  private async createConversationWithMessages(
    conversationRepository: any,
    messageRepository: any,
    customer: User,
    provider: User,
    service: string
  ): Promise<void> {
    // Create conversation
    const conversation = conversationRepository.create({
      type: ConversationType.DIRECT,
      title: `${service} Service Discussion`,
      participants: [customer, provider],
      isActive: true,
      metadata: {
        serviceType: service,
        customerName: `${customer.firstName} ${customer.lastName}`,
        providerName: `${provider.firstName} ${provider.lastName}`
      }
    });

    const savedConversation = await conversationRepository.save(conversation);
    this.conversations.push(savedConversation);

    // Generate conversation flow with 3-12 messages
    const messageCount = Math.floor(Math.random() * 10) + 3;
    const messages: any[] = [];

    // Message 1: Customer initiates
    let messageContent = getRandomItem(MESSAGE_TEMPLATES.customerInitial).replace('{service}', service);
    let message = messageRepository.create({
      conversationId: savedConversation.id,
      senderId: customer.id,
      receiverId: provider.id,
      message: messageContent,
      messageType: MessageType.TEXT,
      isRead: true,
      isDelivered: true
    });
    messages.push(message);

    // Message 2: Provider responds
    messageContent = getRandomItem(MESSAGE_TEMPLATES.providerResponse).replace('{service}', service);
    message = messageRepository.create({
      conversationId: savedConversation.id,
      senderId: provider.id,
      receiverId: customer.id,
      message: messageContent,
      messageType: MessageType.TEXT,
      isRead: true,
      isDelivered: true
    });
    messages.push(message);

    // Continue conversation based on message count
    for (let i = 2; i < messageCount; i++) {
      let sender, receiver, templates;

      if (i % 2 === 0) { // Customer's turn (even numbers after first two)
        sender = customer;
        receiver = provider;
        templates = this.getCustomerTemplates(i, messageCount);
      } else { // Provider's turn (odd numbers after first two)
        sender = provider;
        receiver = customer;
        templates = this.getProviderTemplates(i, messageCount);
      }

      messageContent = (getRandomItem(templates) as string).replace('{service}', service);

      message = messageRepository.create({
        conversationId: savedConversation.id,
        senderId: sender.id,
        receiverId: receiver.id,
        message: messageContent,
        messageType: MessageType.TEXT,
        isRead: Math.random() > 0.2, // 80% read
        isDelivered: true
      });
      messages.push(message);
    }

    // Save all messages
    await messageRepository.save(messages);

    // Update conversation with last message info
    const lastMessage = messages[messages.length - 1];
    savedConversation.lastMessageId = lastMessage.id;
    savedConversation.lastMessageAt = new Date();
    await conversationRepository.save(savedConversation);
  }

  private getCustomerTemplates(messageIndex: number, totalMessages: number): string[] {
    if (messageIndex === 2) return MESSAGE_TEMPLATES.customerDetails;
    if (messageIndex === 4) return MESSAGE_TEMPLATES.customerAcceptance;
    if (messageIndex === totalMessages - 1 && Math.random() > 0.3) return MESSAGE_TEMPLATES.completion;
    return [...MESSAGE_TEMPLATES.customerDetails, ...MESSAGE_TEMPLATES.customerAcceptance];
  }

  private getProviderTemplates(messageIndex: number, totalMessages: number): string[] {
    if (messageIndex === 3) return MESSAGE_TEMPLATES.providerQuote;
    if (messageIndex === 5) return MESSAGE_TEMPLATES.scheduling;
    if (messageIndex > 5 && messageIndex < totalMessages - 1) return MESSAGE_TEMPLATES.workUpdates;
    return [...MESSAGE_TEMPLATES.providerQuote, ...MESSAGE_TEMPLATES.scheduling];
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

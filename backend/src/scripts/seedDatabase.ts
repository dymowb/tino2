import 'reflect-metadata';
import { AppDataSource } from '@/config/database';
import { mongoClient } from '@/config/mongodb';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { passwordService } from '@/utils/password';
import logger from '@/config/logger';

const SERVICES = [
  'House Cleaning', 'Plumbing', 'Electrical Work', 'Gardening', 'Handyman',
  'Painting', 'Appliance Repair', 'Carpet Cleaning', 'Window Cleaning',
];

const LOCATIONS = [
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
];

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

class DatabaseSeeder {
  private users: User[] = [];

  async seed(): Promise<void> {
    logger.info('Starting database seeding...');

    try {
      await this.clearDatabase();
      await this.seedUsers();
      logger.info('Database seeding completed successfully!');
    } catch (error) {
      logger.error('Database seeding failed:', error);
      throw error;
    }
  }

  private async clearDatabase(): Promise<void> {
    logger.info('Clearing existing data...');

    const userRepository = AppDataSource.getRepository(User);
    const providerRepository = AppDataSource.getRepository(Provider);

    await providerRepository.clear();
    await userRepository.clear();

    logger.info('Database cleared successfully');
  }

  private async seedUsers(): Promise<void> {
    logger.info('Seeding users...');
    
    const userRepository = AppDataSource.getRepository(User);
    const providerRepository = AppDataSource.getRepository(Provider);
    const hashedPassword = await passwordService.hash('Demo123!');

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
        const services = getRandomItems(SERVICES, 3);
        
        const provider = providerRepository.create({
          userId: savedUser.id,
          businessName: `${savedUser.firstName} ${savedUser.lastName} Services`,
          description: `Professional ${services.join(', ')} services.`,
          services,
          location: {
            latitude: location.lat,
            longitude: location.lng,
            address: '123 Demo Street',
            city: location.city,
            state: location.state,
            zipCode: '12345',
            country: 'USA',
          },
          serviceRadius: 25,
          rating: 4.5,
          totalReviews: 10,
          portfolioImages: [],
          isBackgroundChecked: true,
          isInsured: true,
          isActive: true,
          availableHours: {
            monday: { start: '08:00', end: '18:00', available: true },
            tuesday: { start: '08:00', end: '18:00', available: true },
            wednesday: { start: '08:00', end: '18:00', available: true },
            thursday: { start: '08:00', end: '18:00', available: true },
            friday: { start: '08:00', end: '18:00', available: true },
            saturday: { start: '09:00', end: '16:00', available: true },
            sunday: { start: '10:00', end: '15:00', available: false },
          },
          pricing: {
            baseRate: 75,
            currency: 'USD',
            rateType: 'hourly',
          },
          completedJobs: 25,
          responseRate: 95,
          averageResponseTime: 30,
        });

        await providerRepository.save(provider);
      }
    }

    logger.info(`Created ${this.users.length} users`);
  }
}

async function runSeeder(): Promise<void> {
  try {
    await AppDataSource.initialize();
    await mongoClient.connect();
    
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
    await mongoClient.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  runSeeder();
}

export default DatabaseSeeder;
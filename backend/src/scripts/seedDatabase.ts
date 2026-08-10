import 'reflect-metadata';
import '@/config/environment'; // must be first — loads dotenv before any DataSource is constructed
import { AppDataSource } from '@/config/database';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus, PaymentStatus as BookingPaymentStatus } from '@/models/Booking';
import { Review } from '@/models/Review';
import { Conversation, ConversationType } from '@/models/Conversation';
import { Message, MessageType } from '@/models/Message';
import { Payment, PaymentStatus, PaymentMethod } from '@/models/Payment';
import { AppSettings } from '@/models/AppSettings';
import { Notification, NotificationType, NotificationPriority } from '@/models/Notification';
import { passwordService } from '@/utils/password';
import logger from '@/config/logger';

const SERVICES = [
  'Limpeza Residencial',
  'Limpeza Profunda',
  'Limpeza Pós-Obra',
  'Limpeza Pós-Mudança',
  'Limpeza Comercial',
  'Limpeza de Estofados',
  'Limpeza de Vidros',
  'Higienização de Colchão',
  'Conserto Hidráulico',
  'Desentupimento',
  'Instalação de Canos',
  'Conserto de Chuveiro Elétrico',
  'Detecção de Vazamento',
  'Encanamento de Banheiro',
  'Encanamento de Cozinha',
  'Emergência Hidráulica',
  'Conserto Elétrico',
  'Instalação de Fiação',
  'Instalação de Iluminação',
  'Instalação de Ventilador de Teto',
  'Instalação de Tomadas',
  'Conserto de Quadro de Luz',
  'Vistoria Elétrica',
  'Automação Residencial',
  'Corte de Grama',
  'Paisagismo',
  'Poda de Árvores',
  'Poda de Cerca Viva',
  'Instalação de Irrigação',
  'Jardinagem',
  'Controle de Pragas',
  'Adubação',
  'Pintura Interna',
  'Pintura Externa',
  'Pintura de Móveis',
  'Lavagem a Pressão',
  'Remoção de Papel de Parede',
  'Conserto de Drywall',
  'Acabamento',
  'Consultoria de Cores',
  'Conserto de Eletrodomésticos',
  'Conserto de Geladeira',
  'Conserto de Máquina de Lavar',
  'Conserto de Fogão',
  'Conserto de Micro-ondas',
  'Conserto de Ar-Condicionado',
  'Instalação de Ar-Condicionado',
  'Manutenção de Ar-Condicionado',
  'Montagem de Móveis',
  'Instalação de TV na Parede',
  'Instalação de Prateleiras',
  'Instalação de Portas',
  'Instalação de Armários',
  'Assentamento de Porcelanato',
  'Instalação de Piso',
  'Construção de Deck',
  'Conserto de Telhado',
  'Impermeabilização',
  'Instalação de Grades',
  'Manutenção de Piscina',
  'Conserto de Portão',
  'Serviços de Chaveiro',
  'Instalação de Câmeras de Segurança',
  'Alarme Residencial',
  'Vistoria Imobiliária',
  'Tratamento de Mofo',
  'Restauração por Danos de Água',
  'Dedetização',
  'Serviços de Mudança',
  'Recolha de Entulho',
  'Guarda-Móveis',
  'Embalagem para Mudança',
  'Cuidado de Animais',
  'Passeio com Cães',
  'Banho e Tosa',
  'Manutenção de Aquário',
  'Personal Trainer',
  'Aulas de Yoga',
  'Massagem Terapêutica',
  'Consultoria Nutricional',
  'Aulas Particulares',
  'Aulas de Música',
  'Aulas de Idiomas',
  'Conserto de Computador',
  'Fotografia',
  'Filmagem',
  'Organização de Eventos',
  'Serviços de Buffet',
  'Polimento de Veículos',
  'Lavagem de Carro',
  'Troca de Óleo',
  'Serviço de Pneus',
  'Instalação de Energia Solar',
  'Auditoria Energética',
  'Isolamento Térmico',
  'Instalação de Telas',
];

const LOCATIONS = [
  { city: 'Centro', state: 'SC', lat: -27.5954, lng: -48.548 },
  { city: 'Trindade', state: 'SC', lat: -27.5998, lng: -48.5243 },
  { city: 'Lagoa da Conceição', state: 'SC', lat: -27.6013, lng: -48.4599 },
  { city: 'Ingleses', state: 'SC', lat: -27.437, lng: -48.396 },
  { city: 'Jurerê Internacional', state: 'SC', lat: -27.4333, lng: -48.5001 },
  { city: 'Canasvieiras', state: 'SC', lat: -27.4287, lng: -48.468 },
  { city: 'Campeche', state: 'SC', lat: -27.683, lng: -48.478 },
  { city: 'Ribeirão da Ilha', state: 'SC', lat: -27.7636, lng: -48.5442 },
  { city: 'Santo Antônio de Lisboa', state: 'SC', lat: -27.5108, lng: -48.5257 },
  { city: 'Pantanal', state: 'SC', lat: -27.6127, lng: -48.5163 },
  { city: 'Córrego Grande', state: 'SC', lat: -27.6054, lng: -48.5085 },
  { city: 'Itacorubi', state: 'SC', lat: -27.5826, lng: -48.5042 },
  { city: 'Agronômica', state: 'SC', lat: -27.589, lng: -48.5327 },
  { city: 'Saco dos Limões', state: 'SC', lat: -27.6201, lng: -48.5406 },
  { city: 'Coqueiros', state: 'SC', lat: -27.5862, lng: -48.5718 },
  { city: 'Estreito', state: 'SC', lat: -27.5807, lng: -48.5825 },
  { city: 'Balneário', state: 'SC', lat: -27.5747, lng: -48.5712 },
  { city: 'Cachoeira do Bom Jesus', state: 'SC', lat: -27.4553, lng: -48.4577 },
  { city: 'Pântano do Sul', state: 'SC', lat: -27.783, lng: -48.511 },
  { city: 'Ratones', state: 'SC', lat: -27.4894, lng: -48.501 },
];

const FIRST_NAMES = [
  'João',
  'Maria',
  'Pedro',
  'Ana',
  'Carlos',
  'Juliana',
  'Lucas',
  'Fernanda',
  'Rafael',
  'Camila',
  'Gustavo',
  'Beatriz',
  'Felipe',
  'Larissa',
  'Rodrigo',
  'Mariana',
  'Bruno',
  'Gabriela',
  'Thiago',
  'Amanda',
  'Diego',
  'Natalia',
  'Henrique',
  'Leticia',
  'Mateus',
  'Renata',
  'Alexandre',
  'Vanessa',
  'Eduardo',
  'Priscila',
  'André',
  'Aline',
  'Leonardo',
  'Patrícia',
  'Fábio',
  'Claudia',
  'Vinícius',
  'Tatiane',
  'Marcelo',
  'Simone',
  'Paulo',
  'Sandra',
  'Ricardo',
  'Elaine',
  'Daniel',
  'Carina',
  'Leandro',
  'Mônica',
  'Sérgio',
  'Roberta',
  'Márcio',
  'Cristiane',
  'Tiago',
  'Débora',
  'Flávio',
  'Silvana',
];

const LAST_NAMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Lima',
  'Pereira',
  'Costa',
  'Ferreira',
  'Rodrigues',
  'Almeida',
  'Nascimento',
  'Carvalho',
  'Araújo',
  'Fernandes',
  'Gomes',
  'Martins',
  'Rocha',
  'Ribeiro',
  'Machado',
  'Barbosa',
  'Freitas',
  'Cardoso',
  'Correia',
  'Mendes',
  'Castro',
  'Moreira',
  'Moraes',
  'Teixeira',
  'Nunes',
  'Dias',
  'Vieira',
  'Pinto',
  'Cunha',
  'Medeiros',
  'Azevedo',
  'Cavalcante',
  'Andrade',
  'Lopes',
  'Rezende',
  'Borges',
  'Ramos',
  'Neves',
  'Miranda',
  'Magalhães',
  'Brito',
  'Campos',
  'Duarte',
  'Monteiro',
];

const MESSAGE_TEMPLATES = {
  customerInitial: [
    'Olá! Tenho interesse no seu serviço de {service}. Poderia me passar um orçamento?',
    'Oi, vi seu perfil e gostaria de agendar {service}. Tem disponibilidade essa semana?',
    'Bom dia! Preciso de {service}. Qual sua disponibilidade e valores?',
    'Olá! Poderia me ajudar com {service}? Gostaria de conversar sobre os detalhes.',
    'Oi! Estou procurando alguém para fazer {service}. Podemos combinar prazo e valor?',
    'Olá! Preciso de {service} com urgência. Tem disponibilidade amanhã?',
    'Boa tarde! Poderia me passar um orçamento para {service}?',
    'Olá! Encontrei seu perfil e preciso de {service}. Qual o seu valor?',
    'Oi! Poderia me ajudar com {service}? Quando seria um bom momento para conversarmos?',
    'Bom dia! Tenho interesse em contratar {service}. Que informações você precisa?',
  ],
  providerResponse: [
    'Olá! Ficaria feliz em ajudar com {service}. Poderia me contar mais sobre o escopo do trabalho?',
    'Oi! Obrigado pelo contato. Tenho disponibilidade para {service}. Qual é o seu prazo?',
    'Que bom que entrou em contato! Sou especialista em {service}. Pode me passar mais detalhes?',
    'Olá! Consigo ajudar com {service}. Qual é o tamanho do espaço ou projeto?',
    'Oi! Adoraria trabalhar no seu projeto de {service}. Quando gostaria de agendar?',
    'Obrigado pelo contato! Tenho experiência em {service}. Qual é o seu orçamento?',
    'Olá! Tenho disponibilidade para {service}. Poderia me mandar algumas fotos do local?',
    'Oi! {service} é uma das minhas especialidades. Qual data funciona melhor para você?',
    'Olá! Posso fazer {service}. Gostaria de agendar uma visita para orçamento?',
    'Olá! Ficaria feliz em orçar seu projeto de {service}. Quais são os requisitos específicos?',
  ],
  customerDetails: [
    'O espaço tem cerca de 80 m². Tenho flexibilidade de horário, prefiro fins de semana.',
    'É um apartamento de 2 quartos. Posso receber à noite durante a semana ou no fim de semana.',
    'Projeto de tamanho médio, cerca de 60 m². Gostaria que fosse feito nas próximas duas semanas.',
    'É uma casa de 3 quartos. Orçamento em torno de R$ 400-800. Isso é razoável?',
    'Serviço pequeno a médio, uns 2-3 horas de trabalho. Manhã é melhor para mim.',
    'O espaço tem cerca de 70 m². Preciso que seja feito antes de sexta-feira se possível.',
    'É um apartamento de 1 quarto. Busco qualidade no trabalho, orçamento flexível.',
    'Casa de tamanho médio, 100 m². Posso me adaptar ao seu horário.',
    'É urgente — preciso em até 3 dias. A área é de aproximadamente 50 m².',
    'Projeto residencial padrão. Estou disponível na maioria dos dias após as 15h.',
  ],
  providerQuote: [
    'Com base na sua descrição, consigo fazer por R$ 350. Inclui materiais e limpeza.',
    'Para um trabalho desse porte, meu valor seria R$ 280. Posso começar no fim de semana.',
    'Orçamento de R$ 480 para este projeto, incluindo garantia de 1 ano no serviço.',
    'Minha estimativa é R$ 220. Tenho disponibilidade terça ou quarta desta semana.',
    'Consigo fazer por R$ 400. Isso cobre tudo — materiais, mão de obra e limpeza.',
    'Para o seu projeto, cobrarei R$ 320. Posso agendar para segunda-feira.',
    'Meu orçamento é R$ 260. Uso materiais de qualidade e garanto satisfação.',
    'Estimo R$ 440 para este serviço. Inclui preparação, execução e vistoria final.',
    'Para um projeto desse tamanho, R$ 360 parece justo. Consigo encaixar na quinta.',
    'Meu valor seria R$ 300. Sou flexível com horários para se adequar à sua rotina.',
  ],
  customerAcceptance: [
    'Perfeito! Quando podemos agendar?',
    'Ótimo valor! Gostaria de fechar com você. Qual é o próximo passo?',
    'Excelente! Aceito o orçamento. Como prosseguimos?',
    'Ficou bom para mim! Podemos combinar um horário?',
    'Perfeito! Estou pronto para avançar. O que você precisa de mim?',
    'Tá bom! Qual é a sua disponibilidade mais próxima?',
    'Estou satisfeito com o orçamento. Vamos agendar o serviço.',
    'Ótimo! Gostaria de contratar esse serviço. Como funciona?',
    'Combinado! Podemos marcar uma data de início?',
    'Maravilha! Aceito. Quando você pode começar?',
  ],
  scheduling: [
    'Posso começar segunda-feira às 9h. Fica bom para você?',
    'Que tal quarta-feira de manhã? Costumo começar por volta das 8h30.',
    'Tenho disponibilidade sexta-feira à tarde. As 14h seria bom?',
    'Quinta-feira às 10h me funciona. Seria conveniente para você?',
    'Consigo encaixar na terça de manhã. Combinamos às 9h30?',
    'Segunda-feira está ótimo! 9h confirmado. Estarei lá pontualmente.',
    'Quarta às 14h perfeito. Planejo cerca de 3 horas de trabalho.',
    'Sexta de manhã funciona! Chego às 9h com todo o equipamento.',
    'Terça às 10h ótimo. Vou te mandar uma confirmação por mensagem.',
    'Quinta perfeito! Estarei lá às 14h em ponto. Estou animado para começar!',
  ],
  workUpdates: [
    'Acabei de chegar e estou me organizando. Tudo está bem!',
    'Cerca de 50% concluído. Está tudo indo tranquilamente.',
    'O trabalho está progredindo bem. Devo terminar dentro do prazo estimado.',
    'Quase pronto! Só os retoques finais. Vai ficar lindo.',
    'Concluído! Ficou muito bom. Pode vir vistoriar.',
    'Iniciando a preparação agora. Condições perfeitas para trabalhar.',
    'Pausa rápida. O serviço está no prazo e com ótima qualidade.',
    'Metade feita! A qualidade está ficando ainda melhor do que esperado.',
    'Acabei a parte principal. Agora estou fazendo limpeza e detalhes finais.',
    'Tudo certo! Serviço concluído e local limpo. Dá uma olhada!',
  ],
  completion: [
    'Serviço concluído! Muito satisfeito com o resultado. Obrigado!',
    'Ficou fantástico! Obrigado pelo excelente trabalho.',
    'Perfeito! Exatamente o que eu esperava. Com certeza vou recomendar.',
    'Trabalho incrível! Muito feliz com o resultado. Valeu cada centavo.',
    'Excelente serviço! Obrigado por ser profissional e cuidadoso.',
    'Maravilhoso! Superou minhas expectativas. Vou contratar novamente.',
    'Obrigado pelo ótimo trabalho! A qualidade é excepcional.',
    'Perfeito! Obrigado por concluir no prazo e dentro do orçamento.',
    'Resultado fantástico! Estou muito satisfeito com o serviço.',
    'Excelente trabalho! Obrigado pela atenção aos detalhes.',
  ],
};

const REVIEW_TEMPLATES = {
  5: [
    'Serviço excepcional! {firstName} superou todas as expectativas. O serviço de {service} foi concluído com perfeição e no prazo. Super recomendo!',
    'Trabalho incrível de {firstName}! Profissional, atencioso e entregou exatamente o prometido. Com certeza vou contratar novamente.',
    'Simplesmente fantástico! {firstName} foi pontual, cuidadoso e a qualidade do {service} foi impecável. 5 estrelas mais do que merecidas!',
    'Experiência perfeita do início ao fim! {firstName} foi muito profissional e o resultado do {service} ficou excelente.',
    'Não poderia estar mais feliz! {firstName} fez um trabalho incrível com {service}. Caprichado, eficiente e bom preço.',
  ],
  4: [
    'Ótimo serviço de {firstName}! O {service} foi bem feito, pequenos detalhes mas no geral muito satisfeito.',
    'Bom trabalho no geral. {firstName} foi profissional e o {service} atendeu nossas expectativas. Recomendo.',
    'Muito satisfeito com o trabalho. {firstName} foi pontual e fez um {service} de qualidade. Pequena margem de melhora mas boa experiência.',
    'Trabalho sólido de {firstName}. O {service} foi concluído conforme solicitado com bom nível de atenção.',
    'Satisfeito com o serviço. {firstName} foi confiável e a qualidade do {service} foi boa. Valeu o investimento.',
  ],
  3: [
    'Serviço razoável. {firstName} concluiu o {service} adequadamente mas sem nada excepcional. Experiência mediana.',
    'Trabalho OK com {service}. {firstName} foi pontual mas a qualidade ficou apenas satisfatória.',
    'Serviço regular de {firstName}. O {service} foi concluído mas com alguns pontos que precisaram de atenção.',
    'Experiência mediana. {firstName} fez o {service} conforme pedido mas poderia ter sido mais cuidadoso.',
    'Trabalho aceitável. {firstName} foi profissional mas a qualidade do {service} ficou apenas razoável pelo valor.',
  ],
  2: [
    'Abaixo do esperado. {firstName} concluiu {service} mas a qualidade foi ruim e demorou mais que o previsto.',
    'Serviço decepcionante. {firstName} atrasou e o {service} teve vários problemas que precisaram de correção.',
    'Não fiquei satisfeito com o trabalho. {firstName} correu no {service} e deixou várias áreas incompletas.',
    'Comunicação fraca de {firstName}. O {service} foi concluído eventualmente mas com múltiplos problemas.',
    'Experiência abaixo da média. {firstName} não seguiu as instruções direito e a qualidade do {service} deixou a desejar.',
  ],
  1: [
    'Experiência péssima! {firstName} foi pouco profissional e o {service} foi completamente insatisfatório.',
    'O pior serviço que já contratei. {firstName} causou danos e não concluiu {service} direito. Evite!',
    'Totalmente decepcionado. {firstName} atrasou, foi grosseiro e o {service} foi mal executado.',
    'Trabalho inaceitável de {firstName}. O {service} ficou inacabado e gerou mais problemas.',
    'Não recomendo! {firstName} foi irresponsável e a qualidade do {service} foi absolutamente horrível.',
  ],
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
  const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getWeightedRating(): number {
  // Weighted distribution: more 4-5 star reviews, fewer 1-2 star
  const weights = [0.05, 0.1, 0.15, 0.35, 0.35]; // 1,2,3,4,5 stars
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
  return template.replace('{firstName}', providerName).replace('{service}', service.toLowerCase());
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
      await this.seedPayments();
      await this.seedConversations();
      await this.seedReviews();
      await this.seedNotifications();
      logger.info('Database seeding completed successfully!');
    } catch (error) {
      logger.error('Database seeding failed:', error);
      throw error;
    }
  }

  private async clearDatabase(): Promise<void> {
    logger.info('Clearing existing data...');
    // Single statement with CASCADE handles FK ordering automatically.
    // session_replication_role approach fails because SET applies to the
    // session that issues it, but TypeORM pool may use a different connection.
    await AppDataSource.query(
      `TRUNCATE TABLE notifications, reviews, messages, conversations, payments, bookings, providers, users CASCADE`
    );
    logger.info('Database cleared successfully');
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
        phone: '+5548991234567',
        userType: UserType.CUSTOMER,
        isVerified: true,
      },
      {
        email: 'provider@demo.com',
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'Provider',
        phone: '+5548999876543',
        userType: UserType.PROVIDER,
        isVerified: true,
      },
      {
        email: 'admin@demo.com',
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'Admin',
        phone: '+5548990000000',
        userType: UserType.ADMIN,
        isVerified: true,
      },
    ];

    // Generate 48 additional users (24 customers + 24 providers)
    for (let i = 0; i < 48; i++) {
      const firstName = getRandomItem(FIRST_NAMES);
      const lastName = getRandomItem(LAST_NAMES);
      const userType = i < 24 ? UserType.CUSTOMER : UserType.PROVIDER;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@test.com`;
      const phone = `+5548${String(Math.floor(Math.random() * 900000000) + 900000000)}`;

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
          businessName: `${savedUser.firstName} ${savedUser.lastName} Serviços`,
          description: `Profissional especializado em ${services.slice(0, 3).join(', ')} e muito mais. Atendendo ${location.city} e região com qualidade e dedicação.`,
          services,
          location: {
            latitude: location.lat + (Math.random() - 0.5) * 0.1,
            longitude: location.lng + (Math.random() - 0.5) * 0.1,
            address: `Rua ${getRandomItem(['das Flores', 'dos Açores', 'Principal', 'do Comércio', 'das Acácias'])}, ${Math.floor(Math.random() * 999) + 1}`,
            city: location.city,
            state: location.state,
            zipCode: `880${String(Math.floor(Math.random() * 90) + 10).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`,
            country: 'Brasil',
          },
          serviceRadius: Math.floor(Math.random() * 20) + 5, // 5-25 km
          rating: Math.round((Math.random() * 2 + 3) * 10) / 10,
          totalReviews: Math.floor(Math.random() * 100) + 5,
          portfolioImages: [],
          isBackgroundChecked: Math.random() > 0.2,
          isInsured: Math.random() > 0.3,
          isActive: userData.email === 'provider@demo.com' || Math.random() > 0.1,
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
            baseRate: Math.floor(Math.random() * 150) + 80, // R$80-230/hour
            currency: 'BRL',
            rateType: Math.random() > 0.7 ? 'fixed' : 'hourly',
          },
          completedJobs: Math.floor(Math.random() * 200) + 10,
          responseRate: Math.floor(Math.random() * 30) + 70,
          averageResponseTime: Math.floor(Math.random() * 120) + 15,
        });

        const savedProvider = await providerRepository.save(provider);
        this.providers.push(savedProvider);
      }
    }

    logger.info(
      `Created ${this.users.length} users (${this.users.filter((u) => u.userType === UserType.CUSTOMER).length} customers, ${this.users.filter((u) => u.userType === UserType.PROVIDER).length} providers)`
    );
  }

  private async seedBookings(): Promise<void> {
    logger.info('Seeding bookings...');

    const bookingRepository = AppDataSource.getRepository(Booking);
    const customers = this.users.filter((u) => u.userType === UserType.CUSTOMER);

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
        { status: BookingStatus.IN_PROGRESS, weight: 0.1 },
        { status: BookingStatus.PENDING, weight: 0.1 },
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
      const completedDate =
        status === BookingStatus.COMPLETED
          ? new Date(scheduledDate.getTime() + Math.random() * 4 * 60 * 60 * 1000) // Complete within 4 hours
          : null;

      const booking = bookingRepository.create({
        customerId: customer.id,
        providerId: provider.id,
        serviceType: service,
        description: `Serviço de ${service.toLowerCase()} solicitado para a região de ${location.city}.`,
        location: {
          latitude: location.lat + (Math.random() - 0.5) * 0.02,
          longitude: location.lng + (Math.random() - 0.5) * 0.02,
          address: `Rua ${getRandomItem(['das Flores', 'dos Açores', 'Principal', 'do Comércio', 'das Acácias'])}, ${Math.floor(Math.random() * 999) + 1}`,
          city: location.city,
          state: location.state,
          zipCode: `880${String(Math.floor(Math.random() * 90) + 10).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`,
        },
        scheduledDate,
        estimatedDuration: Math.floor(Math.random() * 180) + 60,
        status,
        totalAmount: Math.floor(Math.random() * 600) + 150, // R$150-750
        paymentStatus:
          status === BookingStatus.COMPLETED
            ? BookingPaymentStatus.PAID
            : status === BookingStatus.CANCELLED
              ? BookingPaymentStatus.REFUNDED
              : BookingPaymentStatus.PENDING,
        completedAt: completedDate,
        confirmedAt: status !== BookingStatus.PENDING ? scheduledDate : null,
        startedAt:
          status === BookingStatus.COMPLETED || status === BookingStatus.IN_PROGRESS
            ? scheduledDate
            : null,
      });

      const savedBooking = await bookingRepository.save(booking);
      this.bookings.push(savedBooking);
    }

    logger.info(`Created ${this.bookings.length} bookings`);

    // Create additional bookings for demo customer to test pagination and data interaction
    logger.info('Adding extra bookings for demo customer for UX testing...');
    const demoCustomer = this.users.find((u) => u.email === 'customer@demo.com');
    if (demoCustomer) {
      const activeProviders = this.providers.filter((provider) => provider.isActive);
      for (let i = 0; i < 47; i++) {
        // Add 47 more bookings (total ~50)
        const provider = getRandomItem(activeProviders);
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

        // Keep the demo account deterministic for the cancelled-bookings product test.
        if (i === 0) status = BookingStatus.CANCELLED;

        const booking = bookingRepository.create({
          customerId: demoCustomer.id,
          providerId: provider.id,
          serviceType: service,
          description: `Serviço de ${service.toLowerCase()} solicitado para a região de ${location.city}.`,
          location: {
            latitude: location.lat + (Math.random() - 0.5) * 0.1,
            longitude: location.lng + (Math.random() - 0.5) * 0.1,
            address: `Rua ${getRandomItem(['das Flores', 'dos Açores', 'Principal', 'do Comércio', 'das Acácias'])}, ${Math.floor(Math.random() * 999) + 1}`,
            city: location.city,
            state: location.state,
            zipCode: `880${String(Math.floor(Math.random() * 90) + 10).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`,
          },
          scheduledDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
          estimatedDuration: Math.floor(Math.random() * 300) + 60,
          status,
          totalAmount: Math.floor(Math.random() * 700) + 150, // R$150-850
          paymentStatus:
            status === BookingStatus.COMPLETED
              ? BookingPaymentStatus.PAID
              : status === BookingStatus.CANCELLED
                ? BookingPaymentStatus.REFUNDED
                : BookingPaymentStatus.PENDING,
          confirmedAt:
            status !== BookingStatus.PENDING
              ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
              : null,
          startedAt:
            status === BookingStatus.COMPLETED || status === BookingStatus.IN_PROGRESS
              ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
              : null,
          completedAt:
            status === BookingStatus.COMPLETED
              ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
              : null,
        });

        const savedBooking = await bookingRepository.save(booking);
        this.bookings.push(savedBooking);
      }
      logger.info(`Added ${47} additional bookings for demo customer`);
    }

    // Also create additional bookings for demo provider to test provider views
    const demoProvider = this.providers.find((p) => p.user && p.user.email === 'provider@demo.com');
    if (demoProvider) {
      const customers = this.users.filter((u) => u.userType === UserType.CUSTOMER);
      for (let i = 0; i < 35; i++) {
        // Add 35 bookings for provider testing
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
          description: `Serviço de ${service.toLowerCase()} solicitado para a região de ${location.city}.`,
          location: {
            latitude: location.lat + (Math.random() - 0.5) * 0.1,
            longitude: location.lng + (Math.random() - 0.5) * 0.1,
            address: `Rua ${getRandomItem(['das Flores', 'dos Açores', 'Principal', 'do Comércio', 'das Acácias'])}, ${Math.floor(Math.random() * 999) + 1}`,
            city: location.city,
            state: location.state,
            zipCode: `880${String(Math.floor(Math.random() * 90) + 10).padStart(2, '0')}-${String(Math.floor(Math.random() * 900) + 100)}`,
          },
          scheduledDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
          estimatedDuration: Math.floor(Math.random() * 300) + 60,
          status,
          totalAmount: Math.floor(Math.random() * 700) + 150, // R$150-850
          paymentStatus:
            status === BookingStatus.COMPLETED
              ? BookingPaymentStatus.PAID
              : BookingPaymentStatus.PENDING,
          confirmedAt:
            status !== BookingStatus.PENDING
              ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
              : null,
          startedAt:
            status === BookingStatus.COMPLETED || status === BookingStatus.IN_PROGRESS
              ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
              : null,
          completedAt:
            status === BookingStatus.COMPLETED
              ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
              : null,
        });

        const savedBooking = await bookingRepository.save(booking);
        this.bookings.push(savedBooking);
      }
      logger.info(`Added ${35} additional bookings for demo provider`);
    }
  }

  private async seedPayments(): Promise<void> {
    logger.info('Seeding payments for bookings...');

    const paymentRepository = AppDataSource.getRepository(Payment);
    const paymentMethods = [
      PaymentMethod.CREDIT_CARD,
      PaymentMethod.DEBIT_CARD,
      PaymentMethod.PAYPAL,
      PaymentMethod.APPLE_PAY,
      PaymentMethod.GOOGLE_PAY,
    ];
    const cardBrands = ['Visa', 'Mastercard', 'American Express', 'Discover'];

    // Create payments for all bookings except cancelled ones
    const bookingsWithPayments = this.bookings.filter((b) => b.status !== BookingStatus.CANCELLED);
    let paymentCount = 0;

    for (const booking of bookingsWithPayments) {
      const paymentMethod = getRandomItem(paymentMethods);
      const platformFeeRate = 0.15; // 15% platform fee
      const processingFeeRate = 0.029; // 2.9% + $0.30 processing fee

      const amount = booking.totalAmount;
      const platformFee = Math.round(amount * platformFeeRate * 100) / 100;
      const processingFee = Math.round((amount * processingFeeRate + 0.3) * 100) / 100;
      const providerAmount = Math.round((amount - platformFee - processingFee) * 100) / 100;

      // Determine payment status based on booking status
      let paymentStatus: PaymentStatus;
      let paidAt: Date | null = null;
      let completedAt: Date | null = null;
      let failedAt: Date | null = null;
      let refundedAt: Date | null = null;
      let refundAmount = 0;

      if (
        booking.status === BookingStatus.COMPLETED &&
        booking.paymentStatus === BookingPaymentStatus.PAID
      ) {
        paymentStatus = PaymentStatus.SUCCEEDED;
        paidAt = booking.confirmedAt || booking.createdAt;
        completedAt = booking.completedAt || paidAt;
      } else if (
        booking.status === BookingStatus.COMPLETED &&
        booking.paymentStatus === BookingPaymentStatus.REFUNDED
      ) {
        paymentStatus = PaymentStatus.REFUNDED;
        paidAt = booking.confirmedAt || booking.createdAt;
        refundedAt = booking.completedAt || paidAt;
        refundAmount = amount;
      } else if (booking.status === BookingStatus.IN_PROGRESS) {
        paymentStatus = PaymentStatus.PROCESSING;
        paidAt = booking.startedAt || booking.confirmedAt || booking.createdAt;
      } else if (booking.status === BookingStatus.CONFIRMED) {
        paymentStatus = Math.random() > 0.8 ? PaymentStatus.SUCCEEDED : PaymentStatus.PROCESSING;
        if (paymentStatus === PaymentStatus.SUCCEEDED) {
          paidAt = booking.confirmedAt || booking.createdAt;
        }
      } else if (booking.status === BookingStatus.PENDING) {
        paymentStatus = PaymentStatus.PENDING;
      } else {
        paymentStatus = PaymentStatus.FAILED;
        failedAt = booking.createdAt;
      }

      // Build metadata
      const metadata: any = {
        escrowHold:
          paymentStatus !== PaymentStatus.SUCCEEDED && paymentStatus !== PaymentStatus.REFUNDED,
      };

      if (
        paymentMethod === PaymentMethod.CREDIT_CARD ||
        paymentMethod === PaymentMethod.DEBIT_CARD
      ) {
        metadata.last4 = String(Math.floor(Math.random() * 9000) + 1000);
        metadata.cardBrand = getRandomItem(cardBrands);
      }

      if (paymentStatus === PaymentStatus.SUCCEEDED) {
        metadata.receipt_url = `https://stripe.com/receipts/${Math.random().toString(36).substring(7)}`;
      }

      if (paymentStatus === PaymentStatus.FAILED) {
        const failureReasons = [
          'insufficient_funds',
          'card_declined',
          'expired_card',
          'incorrect_cvc',
        ];
        metadata.failure_reason = getRandomItem(failureReasons);
      }

      if (paymentStatus === PaymentStatus.REFUNDED) {
        const refundReasons = [
          'customer_request',
          'duplicate_charge',
          'fraudulent',
          'service_not_delivered',
        ];
        metadata.refund_reason = getRandomItem(refundReasons);
      }

      const payment = paymentRepository.create({
        bookingId: booking.id,
        customerId: booking.customerId,
        providerId: booking.providerId,
        amount,
        platformFee,
        processingFee,
        providerAmount,
        currency: 'BRL',
        paymentMethod,
        stripePaymentIntentId: `pi_${Math.random().toString(36).substring(2, 15)}`,
        stripeChargeId:
          paymentStatus === PaymentStatus.SUCCEEDED
            ? `ch_${Math.random().toString(36).substring(2, 15)}`
            : null,
        paypalTransactionId:
          paymentMethod === PaymentMethod.PAYPAL
            ? `PAY-${Math.random().toString(36).substring(2, 15).toUpperCase()}`
            : null,
        stripeRefundId:
          paymentStatus === PaymentStatus.REFUNDED
            ? `re_${Math.random().toString(36).substring(2, 15)}`
            : null,
        status: paymentStatus,
        metadata,
        paidAt,
        completedAt,
        failedAt,
        refundedAt,
        refundAmount,
        notes: paymentStatus === PaymentStatus.FAILED ? 'Payment failed - customer notified' : null,
      });

      await paymentRepository.save(payment);
      paymentCount++;
    }

    logger.info(
      `Created ${paymentCount} payments with varied statuses (pending, processing, succeeded, failed, refunded)`
    );
  }

  private async seedReviews(): Promise<void> {
    logger.info('Seeding reviews with diverse ratings...');

    const reviewRepository = AppDataSource.getRepository(Review);
    const completedBookings = this.bookings.filter((b) => b.status === BookingStatus.COMPLETED);

    // Create reviews for 70-85% of completed bookings
    const reviewPercentage = 0.7 + Math.random() * 0.15;
    const reviewCount = Math.floor(completedBookings.length * reviewPercentage);
    const bookingsToReview = getRandomItems(completedBookings, reviewCount);

    for (const booking of bookingsToReview) {
      const provider = this.providers.find((p) => p.id === booking.providerId);
      const customer = this.users.find((u) => u.id === booking.customerId);

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
      Object.keys(criteria).forEach((key) => {
        criteria[key as keyof typeof criteria] =
          Math.round(criteria[key as keyof typeof criteria] * 10) / 10;
      });

      const review = reviewRepository.create({
        bookingId: booking.id,
        customerId: customer.id,
        providerId: provider.id,
        rating: Math.round(rating * 10) / 10,
        comment,
        criteria,
        isVerified: Math.random() > 0.1, // 90% verified
        createdAt: new Date(
          booking.completedAt!.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000
        ), // Within a week
      });

      await reviewRepository.save(review);
    }

    logger.info(
      `Created ${reviewCount} diverse reviews (ratings 1-5 stars with realistic distribution)`
    );
  }

  private async seedConversations(): Promise<void> {
    logger.info('Seeding conversations and messages for demo customer...');

    const conversationRepository = AppDataSource.getRepository(Conversation);
    const messageRepository = AppDataSource.getRepository(Message);

    // Get demo customer
    const demoCustomer = this.users.find((u) => u.email === 'customer@demo.com');
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
      const providerUser = this.users.find((u) => u.id === provider.userId);
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
      const providerUser = this.users.find((u) => u.id === randomProvider.userId);
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
        providerName: `${provider.firstName} ${provider.lastName}`,
      },
    });

    const savedConversation = await conversationRepository.save(conversation);
    this.conversations.push(savedConversation);

    // Generate conversation flow with 3-12 messages
    const messageCount = Math.floor(Math.random() * 10) + 3;
    const messages: any[] = [];

    // Message 1: Customer initiates
    let messageContent = getRandomItem(MESSAGE_TEMPLATES.customerInitial).replace(
      '{service}',
      service
    );
    let message = messageRepository.create({
      conversationId: savedConversation.id,
      senderId: customer.id,
      receiverId: provider.id,
      message: messageContent,
      messageType: MessageType.TEXT,
      isRead: true,
      isDelivered: true,
    });
    messages.push(message);

    // Message 2: Provider responds
    messageContent = getRandomItem(MESSAGE_TEMPLATES.providerResponse).replace(
      '{service}',
      service
    );
    message = messageRepository.create({
      conversationId: savedConversation.id,
      senderId: provider.id,
      receiverId: customer.id,
      message: messageContent,
      messageType: MessageType.TEXT,
      isRead: true,
      isDelivered: true,
    });
    messages.push(message);

    // Continue conversation based on message count
    for (let i = 2; i < messageCount; i++) {
      let sender, receiver, templates;

      if (i % 2 === 0) {
        // Customer's turn (even numbers after first two)
        sender = customer;
        receiver = provider;
        templates = this.getCustomerTemplates(i, messageCount);
      } else {
        // Provider's turn (odd numbers after first two)
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
        isDelivered: true,
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
    if (messageIndex === totalMessages - 1 && Math.random() > 0.3)
      return MESSAGE_TEMPLATES.completion;
    return [...MESSAGE_TEMPLATES.customerDetails, ...MESSAGE_TEMPLATES.customerAcceptance];
  }

  private getProviderTemplates(messageIndex: number, totalMessages: number): string[] {
    if (messageIndex === 3) return MESSAGE_TEMPLATES.providerQuote;
    if (messageIndex === 5) return MESSAGE_TEMPLATES.scheduling;
    if (messageIndex > 5 && messageIndex < totalMessages - 1) return MESSAGE_TEMPLATES.workUpdates;
    return [...MESSAGE_TEMPLATES.providerQuote, ...MESSAGE_TEMPLATES.scheduling];
  }

  private async seedNotifications(): Promise<void> {
    logger.info('Seeding notifications...');
    const notificationRepo = AppDataSource.getRepository(Notification);

    const customer = this.users.find((u) => u.email === 'customer@demo.com');
    const providerUser = this.users.find((u) => u.email === 'provider@demo.com');
    const adminUser = this.users.find((u) => u.email === 'admin@demo.com');

    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d;
    };

    const notifs: Partial<Notification>[] = [];

    if (customer) {
      notifs.push(
        {
          userId: customer.id,
          type: NotificationType.BOOKING,
          title: 'Reserva Confirmada',
          message: 'Sua reserva de Limpeza Residencial foi confirmada pelo prestador.',
          isRead: true,
          priority: NotificationPriority.HIGH,
          actionUrl: '/bookings',
          createdAt: daysAgo(6),
        },
        {
          userId: customer.id,
          type: NotificationType.BOOKING,
          title: 'Serviço Concluído',
          message:
            'Seu serviço de Encanamento foi marcado como concluído. Confirme para liberar o pagamento.',
          isRead: true,
          priority: NotificationPriority.HIGH,
          actionUrl: '/bookings',
          createdAt: daysAgo(5),
        },
        {
          userId: customer.id,
          type: NotificationType.PAYMENT,
          title: 'Pagamento Processado',
          message: 'O pagamento de R$280,00 para Limpeza Residencial foi processado com sucesso.',
          isRead: true,
          priority: NotificationPriority.MEDIUM,
          actionUrl: '/payments',
          createdAt: daysAgo(5),
        },
        {
          userId: customer.id,
          type: NotificationType.MESSAGE,
          title: 'Nova Mensagem',
          message: 'Carina Pereira Serviços enviou uma mensagem sobre sua reserva.',
          isRead: true,
          priority: NotificationPriority.MEDIUM,
          actionUrl: '/messages',
          createdAt: daysAgo(4),
        },
        {
          userId: customer.id,
          type: NotificationType.BOOKING,
          title: 'Reserva Cancelada',
          message: 'A reserva de Jardinagem foi cancelada pelo prestador.',
          isRead: false,
          priority: NotificationPriority.HIGH,
          actionUrl: '/bookings',
          createdAt: daysAgo(3),
        },
        {
          userId: customer.id,
          type: NotificationType.BOOKING,
          title: 'Nova Reserva Pendente',
          message:
            'Sua solicitação de Alarme Residencial foi enviada e aguarda confirmação do prestador.',
          isRead: false,
          priority: NotificationPriority.MEDIUM,
          actionUrl: '/bookings',
          createdAt: daysAgo(1),
        },
        {
          userId: customer.id,
          type: NotificationType.SYSTEM,
          title: 'Bem-vindo ao Tino 2',
          message:
            'Sua conta foi verificada. Comece a buscar prestadores de serviços em Florianópolis!',
          isRead: true,
          priority: NotificationPriority.LOW,
          actionUrl: '/providers',
          createdAt: daysAgo(30),
        }
      );
    }

    if (providerUser) {
      notifs.push(
        {
          userId: providerUser.id,
          type: NotificationType.BOOKING,
          title: 'Nova Solicitação de Reserva',
          message: 'Demo Customer solicitou Limpeza Residencial para 15 de junho.',
          isRead: true,
          priority: NotificationPriority.HIGH,
          actionUrl: '/bookings',
          createdAt: daysAgo(6),
        },
        {
          userId: providerUser.id,
          type: NotificationType.REVIEW,
          title: 'Nova Avaliação Recebida',
          message: 'Demo Customer avaliou seu serviço com 5 estrelas: "Excelente trabalho!"',
          isRead: true,
          priority: NotificationPriority.MEDIUM,
          actionUrl: '/reviews',
          createdAt: daysAgo(4),
        },
        {
          userId: providerUser.id,
          type: NotificationType.PAYMENT,
          title: 'Pagamento Recebido',
          message:
            'Você recebeu R$252,00 pelo serviço de Limpeza Residencial (após taxa da plataforma).',
          isRead: false,
          priority: NotificationPriority.HIGH,
          actionUrl: '/payments',
          createdAt: daysAgo(5),
        },
        {
          userId: providerUser.id,
          type: NotificationType.MESSAGE,
          title: 'Nova Mensagem',
          message: 'Demo Customer enviou uma mensagem sobre a reserva de amanhã.',
          isRead: false,
          priority: NotificationPriority.MEDIUM,
          actionUrl: '/messages',
          createdAt: daysAgo(1),
        },
        {
          userId: providerUser.id,
          type: NotificationType.BOOKING,
          title: 'Conclusão Confirmada',
          message: 'Demo Customer confirmou a conclusão do serviço. O pagamento foi liberado.',
          isRead: false,
          priority: NotificationPriority.HIGH,
          actionUrl: '/bookings',
          createdAt: daysAgo(2),
        },
        {
          userId: providerUser.id,
          type: NotificationType.SYSTEM,
          title: 'Perfil Verificado',
          message:
            'Seu perfil foi verificado com sucesso. Você agora aparece nas buscas dos clientes.',
          isRead: true,
          priority: NotificationPriority.LOW,
          createdAt: daysAgo(20),
        }
      );
    }

    if (adminUser) {
      notifs.push(
        {
          userId: adminUser.id,
          type: NotificationType.BOOKING,
          title: 'Disputa Aberta',
          message: 'Um cliente abriu uma disputa para a reserva #8d7f3a. Revisão necessária.',
          isRead: false,
          priority: NotificationPriority.HIGH,
          actionUrl: '/admin/disputes',
          createdAt: daysAgo(2),
        },
        {
          userId: adminUser.id,
          type: NotificationType.SYSTEM,
          title: 'Novo Prestador Cadastrado',
          message: '3 novos prestadores se cadastraram esta semana e aguardam aprovação.',
          isRead: true,
          priority: NotificationPriority.MEDIUM,
          actionUrl: '/admin/providers',
          createdAt: daysAgo(3),
        },
        {
          userId: adminUser.id,
          type: NotificationType.PAYMENT,
          title: 'Relatório Semanal',
          message:
            'O relatório de pagamentos da semana está disponível. Total: R$12.450,00 em transações.',
          isRead: true,
          priority: NotificationPriority.LOW,
          actionUrl: '/admin',
          createdAt: daysAgo(7),
        }
      );
    }

    for (const n of notifs) {
      const notif = notificationRepo.create(n);
      await notificationRepo.save(notif);
    }

    logger.info(`Seeded ${notifs.length} notifications`);
  }
}

async function runSeeder(): Promise<void> {
  try {
    await AppDataSource.initialize();

    const seeder = new DatabaseSeeder();
    await seeder.seed();

    // Seed default app settings
    const settingsRepo = AppDataSource.getRepository(AppSettings);
    await settingsRepo.upsert(
      {
        key: 'auto_capture_days',
        value: '3',
        description: 'Days before auto-capturing payment after provider marks service complete',
      },
      ['key']
    );
    await settingsRepo.upsert(
      {
        key: 'quote_staleness_days',
        value: '7',
        description: 'Days before a quote request expires and is no longer open to providers',
      },
      ['key']
    );
    await settingsRepo.upsert(
      {
        key: 'max_providers_per_quote',
        value: '5',
        description:
          'Max providers a customer can select to request quotes from in one AI-assisted search',
      },
      ['key']
    );
    logger.info('App settings seeded');

    logger.info('Database seeding completed! 🎉');
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    process.exit(0);
  }
}

if (require.main === module) {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--seed')) {
    console.error(
      'ERROR: Refusing to seed in production without --seed flag. Run: npm run seed -- --seed'
    );
    process.exit(1);
  }
  runSeeder();
}

export default DatabaseSeeder;

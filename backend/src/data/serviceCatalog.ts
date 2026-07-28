/**
 * Canonical service taxonomy — the single source that seeds the `service_categories`
 * DB table (migration + seedDatabase). At runtime the catalog is loaded FROM the DB
 * (see ServiceCategoryService), so app logic never depends on this constant directly;
 * it only provides the initial data.
 *
 * `services` lists the specific provider services that belong to each category (these
 * mirror the seed SERVICES vocabulary). `aliases` are lowercased substrings used to
 * fuzzy-resolve a free-form request `serviceType` (PT/EN, partial) to a category.
 */
export interface ServiceCategorySeed {
  category: string; // canonical key, e.g. 'plumbing'
  labelPt: string;
  labelEn: string;
  aliases: string[]; // lowercased match tokens (besides the labels + member services)
  services: string[]; // specific services in this category
}

export const SERVICE_CATEGORIES: ServiceCategorySeed[] = [
  {
    category: 'cleaning',
    labelPt: 'Limpeza',
    labelEn: 'Cleaning',
    aliases: ['limpeza', 'faxina', 'cleaning', 'higienização', 'higienizacao', 'diarista'],
    services: [
      'Limpeza Residencial',
      'Limpeza Profunda',
      'Limpeza Pós-Obra',
      'Limpeza Pós-Mudança',
      'Limpeza Comercial',
      'Limpeza de Estofados',
      'Limpeza de Vidros',
      'Higienização de Colchão',
    ],
  },
  {
    category: 'plumbing',
    labelPt: 'Hidráulica',
    labelEn: 'Plumbing',
    aliases: [
      'encanamento',
      'hidráulica',
      'hidraulica',
      'plumbing',
      'plumber',
      'desentupimento',
      'vazamento',
      'cano',
      'chuveiro',
      'esgoto',
    ],
    services: [
      'Conserto Hidráulico',
      'Desentupimento',
      'Instalação de Canos',
      'Conserto de Chuveiro Elétrico',
      'Detecção de Vazamento',
      'Encanamento de Banheiro',
      'Encanamento de Cozinha',
      'Emergência Hidráulica',
    ],
  },
  {
    category: 'electrical',
    labelPt: 'Elétrica',
    labelEn: 'Electrical',
    aliases: [
      'elétrica',
      'eletrica',
      'electrical',
      'electrician',
      'fiação',
      'fiacao',
      'iluminação',
      'iluminacao',
      'tomada',
      'quadro de luz',
      'automação',
      'automacao',
    ],
    services: [
      'Conserto Elétrico',
      'Instalação de Fiação',
      'Instalação de Iluminação',
      'Instalação de Ventilador de Teto',
      'Instalação de Tomadas',
      'Conserto de Quadro de Luz',
      'Vistoria Elétrica',
      'Automação Residencial',
    ],
  },
  {
    category: 'gardening',
    labelPt: 'Jardinagem',
    labelEn: 'Gardening',
    aliases: [
      'jardinagem',
      'jardim',
      'gardening',
      'grama',
      'poda',
      'paisagismo',
      'irrigação',
      'irrigacao',
      'adubação',
      'adubacao',
      'pragas',
      'landscaping',
    ],
    services: [
      'Corte de Grama',
      'Paisagismo',
      'Poda de Árvores',
      'Poda de Cerca Viva',
      'Instalação de Irrigação',
      'Jardinagem',
      'Controle de Pragas',
      'Adubação',
    ],
  },
  {
    category: 'painting',
    labelPt: 'Pintura',
    labelEn: 'Painting',
    aliases: [
      'pintura',
      'painting',
      'pintor',
      'lavagem a pressão',
      'papel de parede',
      'drywall',
      'acabamento',
    ],
    services: [
      'Pintura Interna',
      'Pintura Externa',
      'Pintura de Móveis',
      'Lavagem a Pressão',
      'Remoção de Papel de Parede',
      'Conserto de Drywall',
      'Acabamento',
      'Consultoria de Cores',
    ],
  },
  {
    category: 'appliances',
    labelPt: 'Eletrodomésticos',
    labelEn: 'Appliances',
    aliases: [
      'eletrodoméstico',
      'eletrodomestico',
      'appliance',
      'geladeira',
      'fogão',
      'fogao',
      'micro-ondas',
      'microondas',
      'máquina de lavar',
      'maquina de lavar',
      'ar-condicionado',
      'ar condicionado',
    ],
    services: [
      'Conserto de Eletrodomésticos',
      'Conserto de Geladeira',
      'Conserto de Máquina de Lavar',
      'Conserto de Fogão',
      'Conserto de Micro-ondas',
      'Conserto de Ar-Condicionado',
      'Instalação de Ar-Condicionado',
      'Manutenção de Ar-Condicionado',
    ],
  },
  {
    category: 'furniture_install',
    labelPt: 'Montagem & Instalação',
    labelEn: 'Furniture & Installation',
    aliases: [
      'montagem',
      'móveis',
      'moveis',
      'furniture',
      'carpentry',
      'carpinteiro',
      'marcenaria',
      'prateleira',
      'porcelanato',
      'piso',
      'deck',
      'armário',
      'armario',
    ],
    services: [
      'Montagem de Móveis',
      'Instalação de TV na Parede',
      'Instalação de Prateleiras',
      'Instalação de Portas',
      'Instalação de Armários',
      'Assentamento de Porcelanato',
      'Instalação de Piso',
      'Construção de Deck',
    ],
  },
  {
    category: 'structural',
    labelPt: 'Reformas & Exterior',
    labelEn: 'Structural & Exterior',
    aliases: [
      'telhado',
      'roof',
      'impermeabilização',
      'impermeabilizacao',
      'piscina',
      'pool',
      'reforma',
    ],
    services: ['Conserto de Telhado', 'Impermeabilização', 'Manutenção de Piscina'],
  },
  {
    category: 'security',
    labelPt: 'Segurança',
    labelEn: 'Security',
    aliases: [
      'segurança',
      'seguranca',
      'security',
      'chaveiro',
      'locksmith',
      'câmera',
      'camera',
      'alarme',
      'alarm',
      'grade',
      'portão',
      'portao',
    ],
    services: [
      'Instalação de Grades',
      'Conserto de Portão',
      'Serviços de Chaveiro',
      'Instalação de Câmeras de Segurança',
      'Alarme Residencial',
    ],
  },
  {
    category: 'inspection',
    labelPt: 'Vistoria & Tratamento',
    labelEn: 'Inspection & Treatment',
    aliases: [
      'vistoria',
      'inspeção',
      'inspecao',
      'inspection',
      'mofo',
      'dedetização',
      'dedetizacao',
      'danos de água',
      'restauração',
    ],
    services: [
      'Vistoria Imobiliária',
      'Tratamento de Mofo',
      'Restauração por Danos de Água',
      'Dedetização',
    ],
  },
  {
    category: 'moving',
    labelPt: 'Mudança',
    labelEn: 'Moving',
    aliases: [
      'mudança',
      'mudanca',
      'moving',
      'entulho',
      'guarda-móveis',
      'guarda-moveis',
      'embalagem',
      'frete',
    ],
    services: [
      'Serviços de Mudança',
      'Recolha de Entulho',
      'Guarda-Móveis',
      'Embalagem para Mudança',
    ],
  },
  {
    category: 'pets',
    labelPt: 'Pets',
    labelEn: 'Pets',
    aliases: ['pet', 'animais', 'cães', 'caes', 'cachorro', 'tosa', 'aquário', 'aquario'],
    services: ['Cuidado de Animais', 'Passeio com Cães', 'Banho e Tosa', 'Manutenção de Aquário'],
  },
  {
    category: 'wellness',
    labelPt: 'Bem-estar',
    labelEn: 'Wellness',
    aliases: [
      'bem-estar',
      'wellness',
      'yoga',
      'massagem',
      'massage',
      'nutricional',
      'personal trainer',
    ],
    services: [
      'Personal Trainer',
      'Aulas de Yoga',
      'Massagem Terapêutica',
      'Consultoria Nutricional',
    ],
  },
  {
    category: 'lessons',
    labelPt: 'Aulas & Tecnologia',
    labelEn: 'Lessons & Tech',
    aliases: [
      'aulas',
      'aula',
      'lessons',
      'música',
      'musica',
      'idiomas',
      'computador',
      'computer',
      'tech',
    ],
    services: [
      'Aulas Particulares',
      'Aulas de Música',
      'Aulas de Idiomas',
      'Conserto de Computador',
    ],
  },
  {
    category: 'events_media',
    labelPt: 'Eventos & Mídia',
    labelEn: 'Events & Media',
    aliases: [
      'eventos',
      'evento',
      'mídia',
      'midia',
      'fotografia',
      'foto',
      'photography',
      'filmagem',
      'buffet',
    ],
    services: ['Fotografia', 'Filmagem', 'Organização de Eventos', 'Serviços de Buffet'],
  },
  {
    category: 'automotive',
    labelPt: 'Automotivo',
    labelEn: 'Automotive',
    aliases: [
      'automotivo',
      'automotive',
      'carro',
      'car',
      'veículo',
      'veiculo',
      'óleo',
      'oleo',
      'pneus',
      'pneu',
    ],
    services: ['Polimento de Veículos', 'Lavagem de Carro', 'Troca de Óleo', 'Serviço de Pneus'],
  },
  {
    category: 'energy',
    labelPt: 'Energia',
    labelEn: 'Energy',
    aliases: ['energia', 'energy', 'solar', 'isolamento', 'auditoria energética', 'telas'],
    services: [
      'Instalação de Energia Solar',
      'Auditoria Energética',
      'Isolamento Térmico',
      'Instalação de Telas',
    ],
  },
];

const norm = (s: string) => (s || '').toLowerCase().trim();

/**
 * Resolve a free-form request `serviceType` to a canonical category, or null if
 * unrecognisable (caller falls back to broadcast-all). Priority: exact service →
 * category label (PT/EN) → alias/service substring. Pure (works over any catalog
 * rows) so the migration backfill and the runtime service share one implementation.
 */
export function categorizeServiceType(
  serviceType: string,
  cats: Array<
    Pick<ServiceCategorySeed, 'category' | 'labelPt' | 'labelEn' | 'aliases' | 'services'>
  > = SERVICE_CATEGORIES
): string | null {
  const q = norm(serviceType);
  if (!q) return null;

  // 1. exact specific-service match
  for (const c of cats) {
    if (c.services.some((s) => norm(s) === q)) return c.category;
  }
  // 2. exact category label match (PT or EN)
  for (const c of cats) {
    if (norm(c.labelPt) === q || norm(c.labelEn) === q) return c.category;
  }
  // 3. substring on aliases / member services (handles "Encanamento - Desentupimento",
  //    "Plumbing", "Limpeza", etc.)
  for (const c of cats) {
    const tokens = [
      ...c.aliases.map(norm),
      ...c.services.map(norm),
      norm(c.labelPt),
      norm(c.labelEn),
    ];
    if (tokens.some((tok) => tok && (q.includes(tok) || tok.includes(q)))) return c.category;
  }
  return null;
}

/** The set of categories a provider covers, from their specific services. */
export function categoriesForServices(
  services: string[],
  cats: Array<Pick<ServiceCategorySeed, 'category' | 'services'>> = SERVICE_CATEGORIES
): Set<string> {
  const covered = new Set<string>();
  const svc = (services || []).map(norm);
  for (const c of cats) {
    if (c.services.some((s) => svc.includes(norm(s)))) covered.add(c.category);
  }
  return covered;
}

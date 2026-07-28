import { anthropicService, ClaudeModel } from './services/anthropic.service';
import logger from '../config/logger';

// ─── Types ────────────────────────────────────────────────────────────

export interface ReviewDraftInput {
  reviewText: string;
  rating: number; // 1–5
  serviceName: string;
  memoryContext?: string;
  constraintContext?: string;
}

export interface ReviewDraftOutput {
  draftResponse: string;
}

// ─── Agent ────────────────────────────────────────────────────────────

class ReviewResponseAgent {
  // TODO 1: Write the systemPrompt
  //
  // This is a few-shot prompt. Structure it like this:
  //
  //   (brief role sentence — who you are)
  //
  //   Example 1:
  //   Review (2 stars): "The plumber arrived 2 hours late and left water on the floor."
  //   Service: Plumbing
  //   Response: "..."
  //
  //   Example 2: (5 stars, happy customer)
  //   Example 3: (3 stars, mixed feedback)
  //
  //   Rules:
  //   - Return ONLY the response text, no labels, no JSON
  //   - 2–4 sentences max
  //   - Professional but warm tone
  //   - Always thank the customer
  //   - Address the specific feedback (don't be generic)
  //   - Never be defensive
  //

  private readonly systemPrompt = `you are a customer support agent for a home services platform in Brazil. Your job is to write warm, professional responses to customer reviews in Brazilian Portuguese (pt-BR). Use the following examples as a guide:

Example 1:
Review (2 stars): "O encanador chegou 2 horas atrasado e deixou água no chão."
Service: Encanamento
Response: "Obrigado pelo seu feedback e pedimos desculpas pela experiência. Buscamos sempre ser pontuais e parece que falhamos desta vez. Vou compartilhar seus comentários com nossa equipe para melhorarmos a pontualidade e o cuidado com o ambiente. Agradecemos por nos informar."

Example 2:
Review (5 stars): "O eletricista foi fantástico! Resolveu a fiação rapidamente e foi muito atencioso."
Service: Elétrica
Response: "Muito obrigado pelas palavras gentis! Ficamos muito felizes em saber que você teve uma ótima experiência com nosso eletricista. Com certeza vamos repassar seus elogios. Se precisar de ajuda no futuro, estamos à disposição!"

Example 3:
Review (3 stars): "A faxineira fez um trabalho razoável. A cozinha ficou boa mas o banheiro foi esquecido."
Service: Limpeza
Response: "Obrigado pelo feedback honesto. Fico feliz que a cozinha tenha ficado de acordo com suas expectativas, mas lamento que o banheiro tenha sido esquecido. Nosso objetivo é oferecer um serviço completo e parece que falhamos neste ponto. Vou compartilhar com nossa equipe de limpeza para melhorarmos nossa atenção aos detalhes. Agradecemos e esperamos atendê-lo melhor da próxima vez."

Regras:
- Responda APENAS com o texto da resposta, sem rótulos, sem JSON
- Máximo de 2 a 4 frases
- Tom profissional mas caloroso
- Sempre agradeça ao cliente
- Aborde o feedback específico (não seja genérico)
- Nunca seja defensivo
- Responda SEMPRE em português do Brasil`;

  async execute(input: ReviewDraftInput): Promise<ReviewDraftOutput> {
    logger.info('ReviewResponseAgent executing', { rating: input.rating });

    // TODO 2: Build the userMessage
    //
    // It should tell the model:
    //   - The review text
    //   - The star rating
    //   - The service name
    //
    // Follow the same format as your examples above so the model
    // knows exactly what pattern to complete.
    //
    const userMessage = `Review (${input.rating} stars): "${input.reviewText}"\nService: ${input.serviceName}`;

    let systemPrompt = this.systemPrompt;
    if (input.memoryContext) systemPrompt = `${input.memoryContext}\n\n${systemPrompt}`;
    if (input.constraintContext) systemPrompt = `${input.constraintContext}\n\n${systemPrompt}`;

    const response = await anthropicService.callClaude({
      model: ClaudeModel.SONNET,
      systemPrompt,
      userMessage,
      maxTokens: 300,
      temperature: 0.7,
    });

    const draftResponse = response.text.trim();

    logger.info('ReviewResponseAgent done', { chars: draftResponse.length });

    return { draftResponse };
  }
}

export const reviewResponseAgent = new ReviewResponseAgent();

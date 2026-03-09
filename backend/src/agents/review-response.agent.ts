import { anthropicService, ClaudeModel } from './services/anthropic.service';                                                                                               
import logger from '../config/logger';                                                                                                                                      
                                                                                                                                                                              
  // ─── Types ────────────────────────────────────────────────────────────                                                                                                   
                                         
export interface ReviewDraftInput {
  reviewText: string;
  rating: number;      // 1–5
  serviceName: string;
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


    private readonly systemPrompt = `you are a customer support agent for a home services platform. Your job is to write warm, professional responses to customer reviews. Use the following examples as a guide:

Example 1:
Review (2 stars): "The plumber arrived 2 hours late and left water on the floor."
Service: Plumbing
Response: "Thank you for your feedback, and I'm sorry to hear about your experience. We strive to provide timely service and it seems we missed the mark this time. I will share your comments with our team to ensure we improve our punctuality and attention to detail. We appreciate you bringing this to our attention."

Example 2:
Review (5 stars): "The electrician was fantastic! He fixed my wiring quickly and was very friendly."
Service: Electrical
Response: "Thank you so much for your kind words! We're thrilled to hear that you had a great experience with our electrician. We will be sure to pass along your compliments. If you ever need assistance in the future, we're here to help!"

Example 3:
Review (3 stars): "The cleaner did an okay job. The kitchen looks good but the bathroom was missed."
Service: Cleaning
Response: "Thank you for your honest feedback. I'm glad to hear that the kitchen was cleaned to your satisfaction, but I'm sorry that the bathroom was missed. We aim to provide thorough service and it seems we fell short in this instance. I will share your comments with our cleaning team to ensure we improve our attention to detail. We appreciate you bringing this to our attention and hope to serve you better in the future."

Rules:
- Return ONLY the response text, no labels, no JSON
- 2–4 sentences max
- Professional but warm tone
- Always thank the customer
- Address the specific feedback (don't be generic)
- Never be defensive`;



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

    const response = await anthropicService.callClaude({
    model: ClaudeModel.SONNET,
    systemPrompt: this.systemPrompt,
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
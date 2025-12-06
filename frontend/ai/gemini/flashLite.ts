import { ChatMessage } from "../types";
import { getOpenRouterClient } from "../openrouter/client";
import { getGeminiModel } from "./client";

export const classifyIntent = async (
  messages: ChatMessage[]
): Promise<"TOOL" | "CHAT"> => {
  const lastUserMsg = messages.findLast((m) => m.role === "user")?.content ?? "";
  const lower = lastUserMsg.toLowerCase().trim();
  
  // ============================================
  // STEP 1: EXCLUSIONS - Educational patterns that LOOK like shopping
  // Must check FIRST to prevent false TOOL matches
  // ============================================
  
  // "Show me how to...", "Tell me how...", "Help me understand..."
  if (/\b(show|tell|help|teach) me (how|about|why|what|more|the (difference|way|best way))/i.test(lower)) {
    console.log("[Classifier] Heuristic: CHAT (educational phrase)");
    return "CHAT";
  }
  
  // "Find out why...", "Search for answers about..."
  if (/\b(find out|search for) (why|how|what|answers|information|more)/i.test(lower)) {
    console.log("[Classifier] Heuristic: CHAT (research phrase)");
    return "CHAT";
  }
  
  // ============================================
  // STEP 2: DEFINITE TOOL - High-confidence shopping/database actions
  // ============================================
  
  // Cart & purchase actions (highest confidence)
  if (/\b(add(ed)? to (my )?cart|add (it|this|that)|buy (it|this|that|now)|purchase|checkout|view (my )?cart|remove from (my )?cart|what's in my cart)\b/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (cart/purchase)");
    return "TOOL";
  }
  
  // Stock & price queries
  if (/\b(in stock|out of stock|is .* available|price of|how much (is|does|for|cost)|do you (have|carry|sell|stock))\b/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (stock/price)");
    return "TOOL";
  }
  
  // Profile updates
  if (/\b(save|update|change|edit) (my )?(profile|skin|preferences|settings)/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (profile action)");
    return "TOOL";
  }
  
  // Cart, wishlist, order, profile data queries (requires database access)
  if (/\b(my )?(cart|basket|wishlist|wish list|saved items|orders?|purchase history|profile|skin profile)\b/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (user data query)");
    return "TOOL";
  }
  
  // Shopping Adjectives - "One size fits all" for database queries
  // If the user asks for "trending", "bestseller", "new", "popular", "top rated", "cheap", "expensive"
  // it is ALWAYS a database lookup. No need to check for verbs or product names.
  if (/\b(trending|best\s?sell(ers?|ing)|new(est| arrivals?)?|popular|top\s?rated|viral|hot|cheap(est)?|affordable|expensive|luxury|discount(ed)?|sale)\b/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (shopping adjective)");
    return "TOOL";
  }
  
  // Product search: action verb + product category
  // Product search: action verb + product category
  // Expanded to include UK spellings, variations, and more verbs
  const productCategories = /\b(cleansers?|moisturisers?|moisturizers?|serums?|sunscreens?|sun\s?blocks?|spfs?|toners?|exfoliants?|scrubs?|face\s?wash(es)?|facewash(es)?|masks?|creams?|lotions?|oils?|treatments?|products?|options?|picks?|eye\s?creams?|spot\s?treatments?|gels?|balms?)\b/i;
  const searchVerbs = /\b(show( me)?|find( me)?|search( for)?|get( me)?|looking for|i need|i want|shop for|recommend|suggest|list|what about|do you have|any|give me)\b/i;
  
  if (searchVerbs.test(lower) && productCategories.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (product search)");
    return "TOOL";
  }

  // "More results" pattern
  // Specific pagination phrases (strong signal)
  if (/\b(more options|other options|different (ones|products|options)|more like (this|these)|next (page|set|batch)|show (me )?more|see more)\b/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (pagination phrase)");
    return "TOOL";
  }

  // Generic "more/other" (weak signal - rely on length)
  if (/\b(more|other|others|another|next|anything else)\b/i.test(lower)) {
    // Only if context implies shopping (simple check: if it's short, assume it's a follow-up)
    // Increased limit to 40 chars to catch "can you show me some other ones"
    if (lower.length < 40) {
      console.log("[Classifier] Heuristic: TOOL (short follow-up)");
      return "TOOL";
    }
  }
  
  // Product attribute queries (need database lookup)
  // "Are they oil based?", "Is it fragrance free?", "Does it contain alcohol?", "What ingredients?"
  if (/\b(are (they|these|those)|is (it|this|that)|does (it|this|that) (have|contain)|what('s| is| are) (the |in )?(ingredients?|formul))/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (product attribute query)");
    return "TOOL";
  }
  
  // Personalized recommendations (need profile + product lookup)
  // "best for my skin", "what's good for me", "recommend for my skin type", "suited for my concerns"
  if (/\b(best|good|right|suited|recommend|suggest).*(for my|for me|my skin|my face|my type|my concern)/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (personalized recommendation)");
    return "TOOL";
  }
  
  // Asking about my profile/skin type (need profile lookup)
  // "what's my skin type", "my profile", "what do you know about me"
  if (/\b(what('s| is) my|my (skin )?profile|what.*(know|have).*(about me|on file))/i.test(lower)) {
    console.log("[Classifier] Heuristic: TOOL (profile query)");
    return "TOOL";
  }
  
  // ============================================
  // STEP 3: DEFINITE CHAT - High-confidence educational patterns
  // ============================================
  
  // Informational questions at start (but NOT "what [product] should I...")
  if (/^(what (is|are|does)|why (is|are|do|does)|how (does|do|can|should)|when (should|can)|is it (safe|okay|good|bad))\b/i.test(lower)) {
    // Exclude product recommendation questions like "what cleanser should I use"
    if (!productCategories.test(lower)) {
      console.log("[Classifier] Heuristic: CHAT (informational question)");
      return "CHAT";
    }
  }
  
  // Explanation/comparison requests
  if (/\b(explain|describe|difference between|compare|what's the difference|benefits of|side effects|pros and cons)\b/i.test(lower)) {
    console.log("[Classifier] Heuristic: CHAT (explanation/comparison)");
    return "CHAT";
  }
  
  // Ingredient compatibility questions
  if (/\b(can i (use|mix|combine|layer)|use .* (with|together)|compatible|work.* together)\b/i.test(lower)) {
    console.log("[Classifier] Heuristic: CHAT (ingredient compatibility)");
    return "CHAT";
  }
  
  // Pure greetings/thanks (NOT "okay", "yes" - those need context!)
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|thx)[!.,?\s]*$/i.test(lower)) {
    console.log("[Classifier] Heuristic: CHAT (greeting/thanks)");
    return "CHAT";
  }
  
  // ============================================
  // STEP 4: AMBIGUOUS - Use LLM classifier
  // Examples: "okay", "yes", "that one", "recommend something", "I'm interested"
  // ============================================
  console.log("[Classifier] Using LLM classifier (ambiguous message)");
  // Prepare context for the classifier (last 4 messages)
  // Filter out system messages to avoid confusing the classifier with internal prompts
  const recentMessages = messages
    .filter(m => m.role !== "system")
    .slice(-2);
      
  const truncatedHistory = recentMessages.map((m) => {
    // Aggressively hide tool outputs (product lists, etc.)
    if (m.role === "tool") {
      // Determine if it's a product list or other context
      const hasProducts = m.content.includes('"products"') || m.content.includes('"routine"') || m.content.includes('"steps":') || m.content.includes('"sizes":');
      return { role: m.role, content: hasProducts ? "[[product list]]" : "[[context]]" };
    }

    // If the message looks like a tool result (contains JSON) but wasn't caught by role
    if (m.content.includes('"result":') || m.content.includes('"toolCallId":') || m.content.includes('"steps":') || m.content.includes('"sizes":')) {
      const hasProducts = m.content.includes('"products"') || m.content.includes('"routine"') || m.content.includes('"steps":') || m.content.includes('"sizes":');
      return { role: m.role, content: hasProducts ? "[[product list]]" : "[[context]]" };
    }
    
    if (m.role === "assistant") {
      // For assistant messages, we ONLY need the last part (the question/CTA)
      // to understand what the user is saying "yes" to.
      const lastPart = m.content.slice(-150);
      return { role: m.role, content: `[...prev context...] ${lastPart}` };
    }
    
    return { role: m.role, content: m.content };
  });

  console.log("[Classifier] LLM context:", JSON.stringify(truncatedHistory, null, 2));
  try {
    const client = getOpenRouterClient();
    const response = await client.models.generateContent({
      model: "x-ai/grok-4-fast",
      contents: truncatedHistory.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: {
          parts: [
            {
              text: `Classify the user's intent based on the conversation snippet.
- **TOOL**:
  - Product searches, recommendations, or shopping queries (UNLESS budget is clearly low, see below).
  - Profile updates (saving skin type, meds, health status, cycle info).
  - Check user's budget! If user specifies a budget effectively < 20,000 Naira (e.g. "under 5k", "cheap", "10,000"), classify as **CHAT** so we can politely decline.
  - **Diagnosis/Analysis**: "Why am I breaking out?", "Is this normal?".
  - **Personal Context**: "I'm on my period", "I'm pregnant".
  - **Personalized Advice**: "What should I do?", "For my skin".
  - Routine building or modification.
- **CHAT**:
  - **LOW BUDGET REQUESTS**: Requests for products under #20,000 (e.g. "cleanser for 5000", "cheap moisturizer").
  - General knowledge ("What is retinol?").
  - Greetings/Chit-chat.
Reply ONLY with "TOOL" or "CHAT".`,
            },
          ],
        },
        temperature: 0,
        maxOutputTokens: 10, // Increased slightly to be safe
      },
    });

    const text = (response as any)?.text ?? "";
    const result = text.includes("TOOL") ? "TOOL" : "CHAT";
    console.log(`[Classifier] LLM result: ${result}`);
    return result;
  } catch (error) {
    console.error("[Classifier] LLM failed, defaulting to TOOL:", error);
    return "TOOL"; // Safe fallback
  }
};

export const streamGeminiFlashLite = async ({
  messages,
  systemPrompt,
  onToken,
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  onToken?: (chunk: string) => void | Promise<void>;
}): Promise<string> => {
  try {
    // Use stable Gemini 1.5 Flash (free tier)
    const model = getGeminiModel("gemini-2.0-flash-lite");
    
    // Convert messages to Gemini format
    // Gemini requires: 1) First message must be 'user', 2) Messages must alternate user/model
    let rawHistory = messages.slice(0, -1).map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    }));

    // Ensure history starts with 'user'
    while (rawHistory.length > 0 && rawHistory[0].role !== "user") {
      rawHistory = rawHistory.slice(1);
    }

    // Ensure alternating roles (Gemini doesn't allow consecutive same-role messages)
    const history = [];
    let lastRole = null;
    for (const msg of rawHistory) {
      if (msg.role !== lastRole) {
        history.push(msg);
        lastRole = msg.role;
      }
      // Skip consecutive same-role messages
    }

    const lastMessage = messages[messages.length - 1].content;
    const reinforcedMessage = `${lastMessage}\n\n(Remember to append the 'Suggested actions' header and 3 numbered options)`;

    // Use very low temperature to reduce hallucination
    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0.1, // Very low = deterministic, less creative hallucination
        topP: 0.8,
        topK: 20,
      },
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt + `

=== CRITICAL ESCALATION RULES ===
You do NOT have access to tools, database, or ANY user data.
If the user asks about ANY of these, reply with ONLY: [[ESCALATE]]

USER DATA:
- Their cart, basket, or saved items ("what's in my cart?")
- Their orders or purchase history
- Their wishlist
- Their profile or skin profile ("what's my skin type?")
- Personalized advice ("what works for me?", "for my skin") -> Escalate to check if profile exists!

PRODUCT ACTIONS:
- Product recommendations or suggestions
- Product searches or listings ("show me cleansers")
- Prices, stock, or availability
- Product details or information
- Adding/removing items from cart
- Updating cart quantities

PROFILE ACTIONS:
- Saving or updating their profile
- Starting a skin quiz or survey
- Changing their skin type, concerns, or preferences

ROUTINE ACTIONS:
- Building or creating a skincare routine
- Recommending a regimen

BASICALLY: If it requires database access, account info, or any action beyond conversation → [[ESCALATE]]

=== BUDGET POLICY ===
Our curated range of premium products starts at #20,000.
If a user asks for a routine or products below this price (e.g. "routine under 10k", "cheap stuff"):
1. politely explain that a full, effective routine typically requires a higher budget to be thorough and safe.
2. Advise that it is better to start with ONE quality product (like a cleanser or sunscreen) than a full set of ineffective ones.
3. Offer to recommend just ONE essential item from our premium collection (starting at #20,000) or ask if they'd like to adjust their budget.

You MAY discuss (using your training data):
- General skincare concepts and ingredients
- How ingredients work (e.g., "retinol helps with...")
- Brand philosophy comparisons (e.g., "CeraVe focuses on...")

You MUST NOT:
- List specific products by name UNLESS they are already in the conversation history
- Recommend products from your training data
- Guess or fabricate product names, prices, or availability
- Claim you "can't access" something - just escalate silently
- Recite raw profile data or internal state (e.g., "I see your profile says..."). Just use the knowledge naturally.

If you're tempted to name a product that isn't in the conversation, STOP and reply: [[ESCALATE]]
If the user asks about their personal data (cart, orders, profile), STOP and reply: [[ESCALATE]]

=== RESPONSE FORMAT ===
1. Main Response: Adopt a warm, knowledgeable consultant persona.
2. CTA Rule: ALWAYS place your primary question or offer to help at the very end of the main response (e.g., "Would you like me to find products for this?"). This is CRITICAL for the system to understand user intent.
3. Separator: Output two newlines.
4. Suggestions: Append the EXACT header "Suggested actions" followed by 3 numbered options.

Example Structure:
[Conversational response...]

Suggested actions
1. Recommend a cleanser
2. Show me moisturizers
3. Explain retinol

CRITICAL: You MUST use the exact header "Suggested actions". Do not say "Here are some suggestions" or "Would you like me to" before the list. The list must be plain numbered text.` }]
      },
    });

    const result = await chat.sendMessageStream(reinforcedMessage);
    
    let fullText = "";
    let buffer = "";
    const ESCALATE_TOKEN = "[[ESCALATE]]";

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      buffer += chunkText;

      // Check if the token is fully present in the buffer
      if (buffer.includes(ESCALATE_TOKEN)) {
        // Stop streaming immediately. We found the token.
        // We do NOT stream the token or anything after it.
        // We return the token so the caller knows to escalate.
        return ESCALATE_TOKEN; 
      }

      // Check if the buffer *ends* with a partial token
      // We need to keep enough characters to cover a potential partial match
      // The longest partial match is length - 1
      let partialMatchLength = 0;
      for (let i = 1; i < ESCALATE_TOKEN.length; i++) {
        if (buffer.endsWith(ESCALATE_TOKEN.slice(0, i))) {
          partialMatchLength = i;
        }
      }

      if (partialMatchLength > 0) {
        // We have a potential partial match at the end.
        // Stream everything *before* the partial match.
        const safeToStream = buffer.slice(0, buffer.length - partialMatchLength);
        if (safeToStream.length > 0) {
          if (onToken) await onToken(safeToStream);
          // Keep only the partial match in the buffer
          buffer = buffer.slice(buffer.length - partialMatchLength);
        }
      } else {
        // No partial match at the end. Stream everything.
        if (onToken) await onToken(buffer);
        buffer = "";
      }
    }
    
    // If stream ends and we have leftover buffer (that wasn't the full token), flush it
    if (buffer.length > 0) {
       if (onToken) await onToken(buffer);
    }

    return fullText;
  } catch (error) {
    console.error("Gemini Flash Lite failed:", error);
    return "[[ESCALATE]]"; // Fallback to Grok
  }
};

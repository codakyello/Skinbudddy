import {
  Category,
  ChatMessage,
  Message,
  MessageSummary,
  Product,
  QuizMessage,
  Routine,
  RoutineStep,
  Size,
} from "./types";

export const URL = "https://skinbudddy.vercel.app/api/v1";

export const DEV_URL = "http://localhost:5000/api/v1";

export function catchAsync<T>(fn: (...args: unknown[]) => Promise<T>) {
  return async (...args: unknown[]): Promise<unknown> => {
    return await fn(...args);
  };
}

export function wait(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export function validateEmail(email: string) {
  if (!email) return "Please enter an email address";

  // Simple email regex pattern
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email))
    return "Sorry, that doesn't look like an email address";

  return null;
}

export function validatePassword(
  password: string,
  options?: { signUp?: boolean }
) {
  if (!password) return "You need to fill in this field";

  if (options?.signUp && password.length < 8)
    return "Password must be at least 8 characters";

  return null;
}

export const formatPrice = (price: number | undefined) => {
  const numberFormat = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  });
  const formattedPrice = numberFormat.format(price || 0);

  return formattedPrice;
};

export function validatePhoneNo(
  phone: string,
  options?: { country?: "NG" | "INTL" } // default NG
) {
  if (!phone) return "You need to fill in this field";

  const country = options?.country ?? "NG";
  // Strip spaces, dashes, dots, and parentheses
  const cleaned = phone.trim().replace(/[\s\-().]/g, "");

  if (country === "INTL") {
    // Generic E.164: + followed by 7–15 digits (no leading zero after +)
    const e164 = /^\+[1-9]\d{6,14}$/;
    if (!e164.test(cleaned)) {
      return "Enter a valid phone number (e.g., +2348012345678)";
    }
    return null;
  }

  // NG formats:
  // - Local: 11 digits starting with 0 (e.g., 08012345678)
  // - International: +234 followed by 10 digits (no leading 0)
  // Accept bare 234… as well.
  const ngLocal = /^0\d{10}$/; // 11 digits
  const ngIntl = /^\+234\d{10}$/; // +234XXXXXXXXXX
  const ngBare = /^234\d{10}$/; // 234XXXXXXXXXX

  if (ngLocal.test(cleaned) || ngIntl.test(cleaned) || ngBare.test(cleaned)) {
    return null;
  }

  return "Enter a valid Nigerian phone number (e.g., 08012345678 or +2348012345678)";
}

export function getOrCreateAnonymousId(): string {
  const key = "anon_user_id";
  let id = localStorage.getItem(key);

  if (!id) {
    id = crypto.randomUUID(); // or use nanoid
    localStorage.setItem(key, id);
  }

  return id;
}

export function getTagType(product: Product) {
  if (product.isNew) return "isNew";
  if (product.isBestseller) return "isBestseller";
}

export function formatProductName(name: string) {
  let formattedName = "";
  name.split(" ").forEach((word) => {
    formattedName += word.slice(0, 1).toUpperCase() + word.slice(1) + " ";
  });
  return formattedName.trim();
}

export function getDiscountedType(products?: Size[]) {
  const isDiscount = products?.find((product) => product.discount);

  if (isDiscount) return "isDiscount";
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;

    // Case 1: developer-thrown error (Uncaught Error: ...)
    const uncaughtMatch = msg.match(/Uncaught Error:\s*(.*?)(?:\s+at|\n|$)/);
    if (uncaughtMatch && uncaughtMatch[1]) {
      return uncaughtMatch[1];
    }

    // Case 2: argument validation or other errors → grab first line after "Server Error"
    const serverErrorMatch = msg.split("Server Error")[1]?.trim();
    if (serverErrorMatch) {
      // Take only the first line, so you don't get the whole stack
      return serverErrorMatch.split("\n")[0].trim();
    }

    return "Something went wrong";
  }

  return "An unknown error occurred.";
}

export function hasCategory(products: Product[], categoryName: string) {
  const target = categoryName.toLowerCase();
  return products.some((product) =>
    product?.categories?.some((cat) => {
      // If it's an Id (string at runtime), we can't match by name
      if (!cat || typeof cat === "string") return false;
      const name = cat.name?.toLowerCase();
      return name === target;
    })
  );
}

export function hasRoutineCategory(products: Product[], categoryName: string) {
  const target = categoryName.toLowerCase();
  return products.some((product) =>
    product?.categories?.some((cat) => {
      // If it's an Id (string at runtime), we can't match by name
      if (!cat || typeof cat === "string") return false;
      const name = cat.name?.toLowerCase();
      return name === target && product.canBeInRoutine;
    })
  );
}

export const generateGridTemplateColumns = (columns: string[]) => {
  const cols = columns
    .map((col: string) => col)
    .join(" ")
    .replaceAll(",", "");
  return cols;
};

export const getRandomSuggestions = (count: number, SUGGESTIONS: string[]) => {
  const shuffled = [...SUGGESTIONS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const normalizeHeader = (line: string) =>
  line
    .toLowerCase()
    .replace(/[\*`_~>#:\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// type SuggestedActionOptions = {
//   context?: string;
// };

// const toKeywords = (input: string): Set<string> => {
//   const matches = input.toLowerCase().match(/\b[a-z]{4,}\b/g);
//   return new Set(matches ?? []);
// };

export const extractSuggestedActions = (
  content: string
): { body: string; suggestions: string[] } => {
  if (!content) return { body: "", suggestions: [] };
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeHeader(line);
    return normalized === "suggested actions";
  });

  if (headerIndex === -1) {
    return { body: content, suggestions: [] };
  }

  const body = lines.slice(0, headerIndex).join("\n").trimEnd();
  const sanitizeSuggestion = (line: string) => {
    let sanitized = line.trim();
    sanitized = sanitized.replace(/^[-*•●◦▪]+\s*/, "");
    sanitized = sanitized.replace(/^(\d+)[\).:\-]?\s*/, "");
    sanitized = sanitized.replace(/^[-*•●◦▪]+\s*/, "");
    return sanitized.trim();
  };

  const suggestionLines = lines.slice(headerIndex + 1);
  const suggestions = suggestionLines
    .map(sanitizeSuggestion)
    .filter(
      (line) => line.length > 0 && normalizeHeader(line) !== "suggested actions"
    )
    .slice(0, 3);

  return {
    body: body.trim().length ? body : "",
    suggestions,
  };
};

export const MAX_INPUT_LENGTH = 650;
export const SCROLL_THRESHOLD = 80;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const coerceId = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    if (typeof value.id === "string") return value.id;
    if (typeof value._id === "string") return value._id;
  }
  return value != null ? String(value) : undefined;
};

export const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

export const normalizeSize = (input: unknown): Size | null => {
  if (!isRecord(input)) return null;
  const id = coerceId(input.id ?? input._id ?? input.value);
  if (!id || id === "[object Object]") return null;
  const price = normalizeNumber(input.price) ?? 0;
  const sizeValue = normalizeNumber(input.size) ?? 0;
  const unit = typeof input.unit === "string" ? input.unit : "";
  const stock = normalizeNumber(input.stock);
  const discount = normalizeNumber(input.discount);
  const currency =
    typeof input.currency === "string" ? input.currency : undefined;
  const name =
    typeof input.name === "string"
      ? input.name
      : typeof input.label === "string"
        ? input.label
        : undefined;

  return {
    id,
    price,
    size: sizeValue,
    unit,
    stock,
    discount,
    currency,
    name,
  };
};

export const mapToolProductToProduct = (input: unknown): Product | null => {
  if (!isRecord(input)) return null;
  const source = isRecord(input.product) ? input.product : input;

  if (!isRecord(source)) return null;

  const _id = coerceId(source.id ?? source._id);
  if (!_id || _id === "[object Object]") return null;
  const slug = typeof source.slug === "string" ? source.slug : undefined;
  const name = typeof source.name === "string" ? source.name : undefined;
  const description =
    typeof source.description === "string" ? source.description : undefined;

  const images = Array.isArray(source.images)
    ? source.images.filter((img): img is string => typeof img === "string")
    : undefined;

  const sizes = Array.isArray(source.sizes)
    ? source.sizes
        .map((sizeItem) => normalizeSize(sizeItem))
        .filter((size): size is Size => Boolean(size))
    : undefined;

  const ingredients = Array.isArray(source.ingredients)
    ? source.ingredients.filter(
        (ingredient): ingredient is string => typeof ingredient === "string"
      )
    : undefined;

  const concerns = Array.isArray(source.concerns)
    ? source.concerns
        .map((concern) =>
          typeof concern === "string" ? concern : String(concern ?? "")
        )
        .filter((concern) => concern.length > 0)
    : undefined;

  const categories = Array.isArray(source.categories)
    ? source.categories
        .map((category) => {
          if (!category) return null;
          if (typeof category === "string") {
            return { name: category } as Category;
          }
          if (isRecord(category)) {
            if (typeof category.name === "string") {
              const payload: Category = {
                name: category.name,
              };
              if (typeof category.slug === "string") {
                payload.slug = category.slug;
              }
              return payload;
            }
            return null;
          }
          return null;
        })
        .filter((category): category is Category => Boolean(category))
    : undefined;

  const skinType = Array.isArray(source.skinType)
    ? source.skinType
        .map((type) => (typeof type === "string" ? type : String(type ?? "")))
        .filter((type) => type.length > 0)
    : undefined;

  return {
    _id,
    slug,
    name,
    description,
    images,
    sizes,
    ingredients,
    categories,
    concerns,
    skinType,
  };
};

export const normalizeProductArray = (items: unknown[]): Product[] => {
  const byId = new Map<string, Product>();
  items.forEach((raw, index) => {
    const product = mapToolProductToProduct(raw);
    if (!product) return;
    const key = String(product._id ?? product.slug ?? index);
    if (!key || key === "[object Object]" || byId.has(key)) return;
    byId.set(key, product);
  });
  return Array.from(byId.values());
};

export const normalizeRoutinePayload = (input: unknown): Routine | null => {
  if (!isRecord(input)) return null;
  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  const steps: RoutineStep[] = [];

  rawSteps.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const productSourceRaw = (entry as Record<string, unknown>)["product"];
    const productSource = isRecord(productSourceRaw)
      ? productSourceRaw
      : (productSourceRaw ?? entry);
    const productCandidate = mapToolProductToProduct(productSource);
    if (!productCandidate) return;
    const stepNumber = typeof entry.step === "number" ? entry.step : index + 1;
    const category =
      typeof entry.category === "string" ? entry.category : undefined;
    const title = typeof entry.title === "string" ? entry.title : undefined;
    const description =
      typeof entry.description === "string" ? entry.description : undefined;
    const productId =
      typeof entry.productId === "string"
        ? entry.productId
        : typeof productCandidate._id === "string"
          ? productCandidate._id
          : undefined;

    const alternatives: Array<{
      productId?: string;
      description?: string;
      product: Product;
    }> = [];

    if (Array.isArray(entry.alternatives)) {
      entry.alternatives.forEach((alternative) => {
        if (!isRecord(alternative)) return;
        const altProductSourceRaw = alternative["product"];
        const altProductSource = isRecord(altProductSourceRaw)
          ? altProductSourceRaw
          : (altProductSourceRaw ?? alternative);
        const altProductCandidate = mapToolProductToProduct(altProductSource);
        if (!altProductCandidate) return;
        const altProductId =
          typeof alternative.productId === "string"
            ? alternative.productId
            : typeof altProductCandidate._id === "string"
              ? altProductCandidate._id
              : undefined;
        const altDescription =
          typeof alternative.description === "string"
            ? alternative.description
            : undefined;
        alternatives.push({
          productId: altProductId,
          description: altDescription,
          product: altProductCandidate,
        });
      });
    }

    const normalizedAlternatives = alternatives.length
      ? alternatives
      : undefined;

    steps.push({
      step: stepNumber,
      category,
      title,
      description,
      productId,
      product: productCandidate,
      alternatives: normalizedAlternatives,
    });
  });

  if (!steps.length) return null;

  steps.sort((a, b) => a.step - b.step);

  const notes = typeof input.notes === "string" ? input.notes : undefined;

  return { steps, notes };
};

export const normalizeSummary = (input: unknown): MessageSummary | null => {
  if (!isRecord(input)) return null;
  const rawHeadline =
    typeof input.headline === "string" ? input.headline.trim() : "";
  if (!rawHeadline.length) return null;
  const rawIcon = typeof input.icon === "string" ? input.icon.trim() : "";

  return {
    headline: rawHeadline,
    icon: rawIcon.length ? rawIcon : undefined,
  };
};

export const isQuizMessage = (message: Message): message is QuizMessage => {
  // Quiz messages have unique properties: header, question, options, index
  return "question" in message && "options" in message && "header" in message;
};

export const isChatMessage = (message: Message): message is ChatMessage => {
  // Chat messages have role user/assistant but are NOT quiz messages
  return (
    (message.role === "user" || message.role === "assistant") &&
    !isQuizMessage(message)
  );
};

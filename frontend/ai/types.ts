export type ProductHeadlineInput = {
  productCount: number;
  category?: string;
  audience?: string;
  brand?: string;
  nameQuery?: string;
  ingredients?: string;
  benefits?: string;
};

export type ProductHeadlineResult = {
  headline: string;
  usedAudience: boolean;
  usedBrand: boolean;
  usedIngredients: boolean;
  usedBenefits: boolean;
};

export type ProductCandidate = Record<string, unknown>;

export type SizeSummary = {
  label?: string;
  price?: number;
  currency?: string;
};

export type RoutineProductOption = {
  productId?: string;
  description?: string;
  product: ProductCandidate;
};

export type RoutineStepCandidate = {
  step: number;
  category?: string;
  title?: string;
  description?: string;
  productId?: string;
  product: ProductCandidate;
  alternatives?: RoutineProductOption[];
};

export type RoutineSelection = {
  steps: RoutineStepCandidate[];
  notes?: string;
  recommendations?: unknown[];
};

export type ReplySummary = {
  icon?: string;
  headline: string;
  subheading?: string;
};

export type RoutineSummaryContext = {
  type: "routine";
  stepCount: number;
  skinType?: string;
  concerns?: string[];
  stepHighlights: string[];
  iconSuggestion?: string;
  headlineHint?: string;
  routineDescription?: string;
};

export type ProductSummaryContext = {
  type: "products";
  productCount: number;
  filters: {
    category?: string;
    skinTypes?: string[];
    skinConcerns?: string[];
    ingredientQueries?: string[];
    benefits?: string[];
    brand?: string;
    nameQuery?: string;
  };
  topProducts: Array<{
    name?: string;
    brand?: string;
    category?: string;
  }>;
  notes?: string;
  iconSuggestion?: string;
  headlineHint?: string;
  filterDescription?: string;
};

export type SummaryContext = RoutineSummaryContext | ProductSummaryContext;

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool" | "developer";
  content: string;
  tool_call_id?: string;
  tool_name?: string;
  tool_arguments?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type ToolOutput = {
  name: string;
  arguments: unknown;
  result: unknown;
};

export type UnknownRecord = Record<string, unknown>;

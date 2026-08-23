export interface Suggestion {
  importance: boolean;
  urgency: boolean;
}

export interface SuggestionContent {
  title: string;
  description: string;
}

export interface SuggestionPort {
  suggest(content: SuggestionContent): Promise<Suggestion>;
}

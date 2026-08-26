export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export type SupportedLanguage = 'ar' | 'en';
export type LayoutDirection = 'rtl' | 'ltr';
